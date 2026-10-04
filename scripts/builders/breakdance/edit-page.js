#!/usr/bin/env node
'use strict';
/**
 * Sunting elemen halaman Breakdance yang sudah ada lewat edit-post: ubah teks,
 * ganti gambar/tautan, set properti, pindah, duplikat, hapus.
 *
 * Usage:
 *   node edit-page.js <slug|pageId> <operasi.json> [--dry-run] [--blog <id>]
 *
 * operasi.json = array operasi edit-post, mis.
 *   [{"op":"update","payload":{"element_id":101,"properties":{"content":{"content":{"text":"Baru"}}}}}]
 *
 * Script ini selalu (1) mengambil pohon terbaru dan menyimpan cadangannya,
 * (2) memeriksa semua rujukan id terhadap pohon itu, dan baru (3) mengirim.
 * --dry-run berhenti setelah (2). edit-post atomik: batch yang gagal tidak
 * mengubah apa pun, jadi cadangan dipakai untuk membandingkan/mengembalikan
 * isi setelah suntingan yang BERHASIL tapi keliru.
 */
const fs = require('fs');
const path = require('path');
const { resolveWorkspace, resolvePage, backupTree, saveTree, parseFlags, readText } = require('./lib/workspace');
const { outline, validateOps } = require('./lib/tree');

async function main() {
  const w = resolveWorkspace();
  const { flags, rest } = parseFlags(w.args, ['dry-run']);
  const [target, file] = rest;
  if (!target || !file) {
    console.error('Usage: node edit-page.js <slug|pageId> <operasi.json> [--dry-run] [--blog <id>]');
    process.exit(1);
  }
  let operations;
  try { operations = JSON.parse(readText(file)); }
  catch (e) { throw new Error(`${file}: bukan JSON yang sah (${e.message})`); }
  if (operations && !Array.isArray(operations) && Array.isArray(operations.operations)) operations = operations.operations;

  const page = await resolvePage(w, target);
  const backup = await backupTree(w, page);
  const errors = validateOps(backup.data.tree, operations);
  if (errors.length) {
    console.error(`✗ ${errors.length} operasi ditolak sebelum dikirim (tidak ada yang diterapkan):`);
    errors.forEach(e => console.error(`  ${e}`));
    fs.unlinkSync(backup.file); // tidak ada perubahan, cadangan tidak perlu
    process.exit(1);
  }
  if (flags['dry-run']) {
    fs.unlinkSync(backup.file);
    console.log(`✓ ${operations.length} operasi lolos pemeriksaan (dry-run, tidak dikirim)`);
    return;
  }

  try {
    const res = await w.bd('edit-post', { post_id: page.id, operations });
    console.log(`✓ ${res.results.length} operasi diterapkan: ${res.results.map(r => `${r.op}→${r.element_id}`).join(', ')}`);
  } catch (e) {
    console.error(`✗ edit-post gagal, tidak ada yang diubah: ${e.message}`);
    fs.unlinkSync(backup.file);
    process.exit(2);
  }

  const { data } = await saveTree(w, page);
  console.log(`✓ Cadangan sebelum suntingan → ${path.relative(process.cwd(), backup.file)}`);
  console.log(outline(data.tree));
}

main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
