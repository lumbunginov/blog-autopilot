#!/usr/bin/env node
/**
 * check-clone.js — Cari isi halaman sumber yang tertinggal di halaman hasil clone
 *
 * Gerbang setelah clone-template.js: validate-elementor.js memastikan JSON
 * sehat, check-blueprint.js memastikan susunan seksi sama — keduanya meloloskan
 * halaman baru yang masih memuat harga, spesifikasi, foto, atau kategori
 * artikel terkait milik halaman sumber.
 *
 * Yang dilaporkan:
 *   teks   — teks widget yang identik dengan sumber, atau paragraf yang
 *            sebagian besar katanya sama (pola --replace yang cuma mengganti
 *            nama produk; ditandai "mirip NN%"). Label pendek tanpa angka
 *            ("Harga sewa", "Spesifikasi.") dianggap memang sama dan dilewati.
 *   gambar — gambar (url atau id media) yang sama dengan sumber, termasuk
 *            galeri dan background. Alt yang diganti tidak dihitung: yang
 *            tampil adalah gambarnya.
 *   kueri  — daftar id kueri (mis. kategori widget posts) yang sama.
 *
 * Usage:
 *   node check-clone.js <sumber.json> <hasil.json> [--keep "teks"]...
 *
 * Berkas dicari di elementor/ (atau path yang ada di disk). --keep (tanpa beda
 * huruf besar; potongan teks, url, atau id kueri) untuk isi yang memang sengaja
 * sama, mis. --keep "Area layanan" untuk teks cakupan yang sama di semua halaman.
 *
 * Keluar kode 1 bila ada sisa.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const { resolveWorkspaceOffline } = require('./lib/workspace');
const { findLeftovers } = require('../lib/clone-leftovers');

const { args, dirs } = resolveWorkspaceOffline();

const keep = [];
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--keep' && i + 1 < args.length) { keep.push(args[++i]); continue; }
  pos.push(args[i]);
}

if (pos.length !== 2) {
  console.error('Usage: node check-clone.js <sumber.json> <hasil.json> [--keep "teks"]...');
  process.exit(1);
}

function load(arg) {
  const name = arg.endsWith('.json') ? arg : arg + '.json';
  const p = fs.existsSync(arg) ? arg : path.join(dirs.elementor, name);
  if (!fs.existsSync(p)) {
    console.error(`✗ ${arg}: tidak ada di elementor/`);
    console.error('  Sumber: download-page.js lalu extract-elementor.js dulu.');
    process.exit(1);
  }
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { console.error(`✗ ${arg}: JSON rusak — ${e.message}`); process.exit(1); }
}

const [srcArg, hasilArg] = pos;
let sisa;
try { sisa = findLeftovers(load(srcArg), load(hasilArg), { keep }); }
catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }

if (sisa.length === 0) {
  console.log(`✓ ${hasilArg}: tidak ada isi ${srcArg} yang tertinggal`);
  process.exit(0);
}

const potong = s => (s.length > 90 ? s.slice(0, 87) + '...' : s);
console.error(`✗ ${hasilArg}: ${sisa.length} isi masih sama dengan ${srcArg}`);
for (const j of ['teks', 'gambar', 'kueri']) {
  const xs = sisa.filter(x => x.jenis === j);
  if (!xs.length) continue;
  console.error(`  ${j}:`);
  xs.forEach(x => {
    const tanda = x.mirip ? ` (mirip ${Math.round(x.mirip * 100)}%)` : '';
    console.error(`    - [${x.widget}.${x.key}]${tanda} ${potong(x.nilai)}`);
  });
}
console.error('');
console.error('Ganti isinya untuk halaman ini. Kalau memang sengaja sama, tambahkan --keep "<potongan>".');
process.exit(1);
