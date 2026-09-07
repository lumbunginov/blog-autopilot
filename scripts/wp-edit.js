#!/usr/bin/env node
'use strict';
// Cari-dan-ganti massal di seluruh post WordPress, dengan cadangan.
//
//   node scripts/wp-edit.js scan    --find <regex> [--status publish,draft]
//   node scripts/wp-edit.js replace --find <regex> --replace <teks> [--apply]
//   node scripts/wp-edit.js restore --backup <folder> [--ids 1,2,3]
//
// Tanpa --apply, `replace` hanya melapor (mode kering). Itu default karena
// penyuntingan massal yang salah menyentuh ratusan artikel sekaligus.
//
// Keluaran JSON. Isi post TIDAK ikut dicetak kecuali diminta --show, supaya
// memindai ratusan artikel tidak menyeret seluruh HTML-nya ke layar.

const fs = require('fs');
const path = require('path');
const { resolveBlog } = require('./lib/blog');
const { scanPosts, transformPosts, restoreFromBackup } = require('./lib/wp-bulk');

function out(obj, code = 0) {
  console.log(JSON.stringify(obj, null, 2));
  process.exit(code);
}
function fail(message, extra = {}) {
  out({ ok: false, error: message, ...extra }, 1);
}

function flag(args, name, fallback = null) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

function usage() {
  return [
    'node scripts/wp-edit.js scan    --find <regex> [--status publish,draft] [--flags gi] [--show N]',
    'node scripts/wp-edit.js replace --find <regex> --replace <teks> [--apply] [--status …] [--flags gi]',
    'node scripts/wp-edit.js restore --backup <folder> [--ids 1,2,3]'
  ].join('\n');
}

async function main() {
  let ws;
  try {
    ws = resolveBlog(process.argv.slice(3)); // argv[2] = subperintah
  } catch (e) {
    fail(e.message);
  }
  const { api, auth, blogId, paths } = ws;
  const cmd = process.argv[2];
  const args = ws.args;

  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) out({ ok: true, usage: usage() });

  const statusArg = String(flag(args, '--status', 'publish,draft'));
  const statuses = statusArg.split(',').map(s => s.trim()).filter(Boolean);

  if (cmd === 'restore') {
    const backup = flag(args, '--backup');
    if (!backup || backup === true) fail('Sebutkan --backup <folder>.', { usage: usage() });
    const idsArg = flag(args, '--ids');
    const ids = idsArg && idsArg !== true ? String(idsArg).split(',').map(Number) : null;
    try {
      const r = await restoreFromBackup({ api, auth, backupDir: backup, ids });
      out({ ok: r.failed.length === 0, blog: blogId, ...r }, r.failed.length ? 1 : 0);
    } catch (e) {
      fail(e.message);
    }
  }

  if (!['scan', 'replace'].includes(cmd)) fail(`Subperintah "${cmd}" tidak dikenal.`, { usage: usage() });

  const find = flag(args, '--find');
  if (!find || find === true) fail('Sebutkan --find <regex>.', { usage: usage() });
  const flags = String(flag(args, '--flags', 'g'));
  let re;
  try {
    re = new RegExp(find, flags);
  } catch (e) {
    fail(`Regex tidak valid: ${e.message}`);
  }
  // Regex ber-flag /g menyimpan lastIndex antar pemanggilan .test(); memakai
  // satu objek untuk semua post membuat hasilnya berselang-seling. Tiap
  // pengujian memakai salinan tanpa /g.
  const testRe = new RegExp(find, flags.replace(/g/g, ''));

  let scan;
  try {
    scan = await scanPosts({ api, auth, statuses, match: (raw) => testRe.test(raw) });
  } catch (e) {
    fail(e.message);
  }

  const showArg = flag(args, '--show');
  const show = showArg && showArg !== true ? Number(showArg) : 0;

  if (cmd === 'scan') {
    out({
      ok: true, blog: blogId, statuses,
      scanned: scan.scanned, matched: scan.hits.length,
      posts: scan.hits.map(h => ({ id: h.id, status: h.status, date: h.date, title: h.title, link: h.link })),
      samples: show ? scan.hits.slice(0, show).map(h => ({ id: h.id, raw: h.raw.slice(0, 800) })) : undefined
    });
  }

  // replace
  const replacement = flag(args, '--replace');
  if (replacement === null) fail('Sebutkan --replace <teks> (boleh string kosong "").', { usage: usage() });
  const rep = replacement === true ? '' : String(replacement);
  const apply = args.includes('--apply');

  if (scan.hits.length === 0) {
    out({ ok: true, blog: blogId, scanned: scan.scanned, matched: 0, message: 'Tidak ada post yang cocok.' });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(paths.blogDir(blogId), 'backups', `wp-edit-${stamp}`);

  let result;
  try {
    result = await transformPosts({
      api, auth,
      posts: scan.hits,
      transform: (raw) => ({ out: raw.replace(new RegExp(find, flags), rep), notes: [] }),
      apply,
      backupDir: apply ? backupDir : null,
      // Pola yang masih tersisa setelah penggantian berarti regex tidak
      // mengenai seluruh kemunculannya — post itu dilewati, bukan ditulis
      // separuh jalan.
      verify: (o) => !new RegExp(find, flags.replace(/g/g, '')).test(o)
    });
  } catch (e) {
    fail(e.message);
  }

  out({
    ok: result.failed === 0 && result.errors === 0,
    blog: blogId, statuses, applied: apply,
    scanned: scan.scanned, matched: scan.hits.length,
    changed: result.changed, written: result.written,
    skippedLeftover: result.leftover, failed: result.failed, errors: result.errors,
    backupDir: apply ? backupDir : null,
    posts: result.report.map(r => ({
      id: r.id, title: r.title, changed: r.changed,
      ...(r.leftover ? { skipped: 'pola masih tersisa setelah penggantian' } : {}),
      ...(r.error ? { error: r.error } : {})
    })),
    ...(apply ? {} : { hint: 'Mode kering. Tambahkan --apply untuk benar-benar menulis.' })
  }, result.failed || result.errors ? 1 : 0);
}

main().catch(e => fail(e && e.message ? e.message : String(e)));
