#!/usr/bin/env node
'use strict';
// Terbitkan draft tertua yang menunggu antrean, sejumlah kecil per hari jalan.
//
//   node scripts/publish-drafts.js [--dry-run] [--blog <id>] [--count N] [--force]
//
// Semua keputusan ada di sini, bukan di prosa runbook: hari jalan, berapa
// banyak, mana yang boleh naik. Agent memanggil sekali dan membaca JSON-nya.
// Konfigurasi per tenant di config.json:
//
//   "publish_schedule": {
//     "runDays": [1, 3, 5],   // 0=Minggu … 6=Sabtu
//     "count": 1,             // draft per hari jalan
//     "minDate": "2026-01-01" // draft lebih tua dari ini tidak pernah disentuh
//   }
//
// Kode keluar: 0 = tidak ada yang salah (termasuk "bukan hari jalan" dan
// "tidak ada draft"). 1 = gagal, agent harus melapor.

const fs = require('fs');
const path = require('path');
const { makePaths } = require('./lib/paths');
const { loadDotEnv, resolveCredentials } = require('./lib/env');
const { basicAuth, httpPost } = require('./lib/wp-client');
const cacheLib = require('./lib/articles-cache');

const SKILL_DIR = path.join(__dirname, '..');
const paths = makePaths(SKILL_DIR);

const DEFAULTS = { runDays: [1, 3, 5], count: 1, minDate: '2026-01-01' };

function parseArgs(argv) {
  const out = { dryRun: false, force: false, blog: null, count: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--blog') out.blog = argv[++i];
    else if (a.startsWith('--blog=')) out.blog = a.slice(7);
    else if (a === '--count') out.count = Number(argv[++i]);
    else if (a.startsWith('--count=')) out.count = Number(a.slice(8));
  }
  return out;
}

function fail(message, extra = {}) {
  console.log(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
  process.exit(1);
}

function done(payload) {
  console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
  process.exit(0);
}

// Tanggal LOKAL, bukan UTC. toISOString() menggeser tanggal untuk WIB
// (UTC+7) setiap kali dijalankan sebelum jam 07:00 — dan justru itu jam kerja
// heartbeat pagi, sehingga "hari ini" bisa terbaca hari kemarin.
function localToday(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return {
    iso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    dow: d.getDay()
  };
}

function readSchedule(cfg) {
  const s = cfg.publish_schedule || {};
  const runDays = Array.isArray(s.runDays) && s.runDays.length ? s.runDays : DEFAULTS.runDays;
  const count = Number.isInteger(s.count) && s.count > 0 ? s.count : DEFAULTS.count;
  const minDate = typeof s.minDate === 'string' && s.minDate ? s.minDate : DEFAULTS.minDate;
  return { runDays, count, minDate };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadDotEnv(path.join(SKILL_DIR, '.env'));

  const blogId = args.blog || paths.activeBlog();
  if (!blogId) fail('Tidak ada blog terdaftar. Buat dulu lewat dashboard.');
  if (!paths.listBlogs().includes(blogId)) {
    fail(`Blog "${blogId}" tidak ditemukan. Tersedia: ${paths.listBlogs().join(', ') || '(kosong)'}`);
  }

  const configFile = paths.configPath(blogId);
  if (!fs.existsSync(configFile)) fail(`Config blog "${blogId}" tidak ada di ${configFile}`);

  let cfg;
  try {
    cfg = resolveCredentials(blogId, JSON.parse(fs.readFileSync(configFile, 'utf-8')));
  } catch (e) {
    fail(e.message);
  }
  const wp = cfg.wordpress || {};
  if (!wp.url || !wp.username) fail(`WordPress untuk blog "${blogId}" belum dikonfigurasi.`);

  const sched = readSchedule(cfg);
  const count = args.count && args.count > 0 ? args.count : sched.count;
  const { iso: today, dow } = localToday();

  // Bukan hari jalan bukan kegagalan: heartbeat memang menyapa tiap hari.
  if (!args.force && !sched.runDays.includes(dow)) {
    done({
      blog: blogId, date: today, dayOfWeek: dow,
      scheduled: false, published: [],
      message: `Bukan hari jalan (runDays: ${sched.runDays.join(',')}). Tidak ada yang diterbitkan.`
    });
  }

  const cachePath = paths.cachePath(blogId);
  const cache = cacheLib.readArticlesCache(cachePath);
  if (!cache) {
    fail(`Cache artikel belum ada untuk "${blogId}". Buka dashboard sekali agar tersinkron dari WordPress.`);
  }

  const all = Array.isArray(cache.articles) ? cache.articles : [];
  const drafts = all.filter(a => a.status === 'draft');
  // minDate menyaring draft lawas yang ditinggalkan bertahun-tahun; menerbitkannya
  // otomatis berarti menayangkan konten yang tak pernah diperiksa siapa pun.
  const eligible = drafts
    .filter(a => (a.date || '') >= sched.minDate)
    .sort((x, y) => (x.date || '').localeCompare(y.date || '')); // FIFO: tertua dulu

  const skippedOld = drafts.length - eligible.length;

  if (eligible.length === 0) {
    done({
      blog: blogId, date: today, dayOfWeek: dow,
      scheduled: true, published: [],
      draftsTotal: drafts.length, draftsEligible: 0, skippedOlderThanMinDate: skippedOld,
      message: 'Tidak ada draft yang memenuhi syarat. Antrean kosong.'
    });
  }

  const batch = eligible.slice(0, count);

  if (args.dryRun) {
    done({
      blog: blogId, date: today, dayOfWeek: dow, dryRun: true,
      scheduled: true,
      wouldPublish: batch.map(a => ({ id: a.id, date: a.date, title: a.title, url: a.url })),
      draftsTotal: drafts.length, draftsEligible: eligible.length,
      remainingAfter: eligible.length - batch.length,
      skippedOlderThanMinDate: skippedOld
    });
  }

  const auth = basicAuth(wp.username, wp.app_password);
  const base = wp.url.replace(/\/$/, '');
  const published = [];
  const failed = [];

  for (const a of batch) {
    let res;
    try {
      res = await httpPost(`${base}/wp-json/wp/v2/posts/${a.id}`, auth, { status: 'publish' });
    } catch (e) {
      failed.push({ id: a.id, title: a.title, error: e.message });
      continue;
    }
    // WordPress membalas 200 dengan body post; status di body adalah kebenaran,
    // bukan kode HTTP — post yang ditolak plugin tetap balas 200 dengan status lama.
    const post = res.body || {};
    if (post.id && post.status === 'publish') {
      published.push({ id: post.id, title: a.title, url: post.link || a.url, date: a.date });
      const idx = all.findIndex(x => x.id === a.id);
      if (idx !== -1) {
        all[idx] = { ...all[idx], status: 'publish', link: post.link || all[idx].link };
      }
    } else {
      failed.push({
        id: a.id, title: a.title,
        error: `WordPress membalas status "${post.status || res.status}" (bukan publish)`
      });
    }
  }

  if (published.length) {
    cacheLib.writeArticlesCache(cachePath, { ...cache, articles: all });
  }

  const payload = {
    blog: blogId, date: today, dayOfWeek: dow,
    scheduled: true,
    published,
    failed,
    draftsTotal: drafts.length,
    draftsEligible: eligible.length,
    remaining: eligible.length - published.length,
    skippedOlderThanMinDate: skippedOld
  };

  // Sebagian gagal tetap kode 1: agent harus melapor, bukan menganggap beres.
  if (failed.length) {
    console.log(JSON.stringify({ ok: false, error: `${failed.length} draft gagal diterbitkan`, ...payload }, null, 2));
    process.exit(1);
  }
  done(payload);
}

main().catch(e => fail(e && e.message ? e.message : String(e)));
