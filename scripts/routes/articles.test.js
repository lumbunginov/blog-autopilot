'use strict';
// Kuota HARIAN pada /api/articles/toggle — jalur terbit KEEMPAT.
//
// Perbaikan kuota sebelumnya menghitung tiga jalur (antrean draft, `post-to-wp.js --status publish`,
// `--schedule-date`) dan berhenti di skrip CLI. Tombol "publish" di dashboard menaikkan post
// ke situs yang SAMA lewat endpoint yang sama, dan tidak pernah ikut terhitung. Kuota diukur
// di tujuan, jadi satu klik di sini memakan kuota yang sama dengan satu post dari antrean.
//
// Sama seperti test publish-drafts dan post-to-wp: kedua tepi jaringan dipalsukan, dan
// wordpress.url diarahkan ke port tertutup. Karena itu test bisa membedakan TIDAK MENCOBA
// (409 dari penjaga) dari MENCOBA LALU GAGAL (500 "WP connection failed").
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

process.env.TESTBLOG_WP_APP_PASSWORD = 'rahasia';

const DEAD_WP = 'http://127.0.0.1:9';   // port discard, selalu menolak koneksi

function setupApp(cfgExtra) {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'articles-test-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), JSON.stringify({
    wordpress: { url: DEAD_WP, username: 'u' },
    ...cfgExtra
  }));
  fs.writeFileSync(path.join(blogDir, 'articles-cache.json'), JSON.stringify({
    lastSync: '2026-01-01T00:00:00.000Z', totalCount: 1,
    articles: [{ id: 9, title: 'Artikel Uji', slug: 'artikel-uji', status: 'draft' }]
  }));

  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  const state = { syncState: { done: true } };
  require('./articles')(app, { paths, state, broadcast: () => {} });
  return { app, skillDir };
}

async function withServer(cfgExtra, fn) {
  const { app, skillDir } = setupApp(cfgExtra);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally {
    server.close();
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

function withSiteCount(stub, fn) {
  const f = path.join(os.tmpdir(), `art-sc-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify(stub));
  const prev = process.env.PUBLISH_GUARD_SITE_COUNT;
  process.env.PUBLISH_GUARD_SITE_COUNT = f;
  return (async () => {
    try { return await fn(); }
    finally {
      if (prev === undefined) delete process.env.PUBLISH_GUARD_SITE_COUNT;
      else process.env.PUBLISH_GUARD_SITE_COUNT = prev;
      fs.rmSync(f, { force: true });
    }
  })();
}

const toggle = (base, body) => fetch(`${base}/api/articles/toggle?blog=testblog`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const QUOTA1 = { publish_schedule: { count: 1 } };

test('KUOTA: publish dari dashboard ditolak 409 saat kuota situs habis', async () => {
  await withSiteCount({ count: 1 }, () => withServer(QUOTA1, async (base) => {
    const res = await toggle(base, { id: 9, status: 'publish' });
    const body = await res.json();
    assert.strictEqual(res.status, 409, JSON.stringify(body));
    assert.strictEqual(body.guard, 'site_quota_reached', JSON.stringify(body));
    assert.strictEqual(body.siteCount, 1);
    assert.strictEqual(body.quota, 1);
    // 409, bukan 500: berhenti SEBELUM menyentuh port mati.
    assert.ok(!/connection failed/i.test(body.error || ''), JSON.stringify(body));
  }));
});

test('KUOTA: hitungan situs tidak terukur -> tetap menolak, bukan lanjut', async () => {
  await withSiteCount({ error: 'HTTP 503' }, () => withServer(QUOTA1, async (base) => {
    const res = await toggle(base, { id: 9, status: 'publish' });
    const body = await res.json();
    assert.strictEqual(res.status, 409, JSON.stringify(body));
    assert.strictEqual(body.guard, 'site_count_unavailable', JSON.stringify(body));
    assert.match(body.error, /HTTP 503/);
  }));
});

test('DRAFT: menurunkan post tidak pernah tertahan penjaga', async () => {
  // Arah 'draft' mengurangi jumlah post tayang. Menahannya berarti post yang salah terbit
  // tidak bisa ditarik lagi justru pada saat kuota sedang habis.
  await withSiteCount({ count: 1 }, () => withServer(QUOTA1, async (base) => {
    const res = await toggle(base, { id: 9, status: 'draft' });
    const body = await res.json();
    assert.strictEqual(res.status, 500, JSON.stringify(body));
    assert.match(body.error, /connection failed/i, 'harus sampai ke tahap POST: ' + JSON.stringify(body));
  }));
});

test('LOLOS: kuota masih ada -> publish benar-benar dicoba', async () => {
  await withSiteCount({ count: 0 }, () => withServer(QUOTA1, async (base) => {
    const res = await toggle(base, { id: 9, status: 'publish' });
    const body = await res.json();
    assert.strictEqual(res.status, 500, JSON.stringify(body));
    assert.match(body.error, /connection failed/i, 'penjaga memblokir padahal kuota kosong');
  }));
});

test('status yang tidak sah tetap ditolak 400 sebelum penjaga', async () => {
  await withSiteCount({ count: 1 }, () => withServer(QUOTA1, async (base) => {
    const res = await toggle(base, { id: 9, status: 'future' });
    const body = await res.json();
    assert.strictEqual(res.status, 400, JSON.stringify(body));
    assert.strictEqual(body.guard, undefined);
  }));
});
