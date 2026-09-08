#!/usr/bin/env node
/**
 * capture-blueprint.js — Rekam kerangka satu halaman jadi blueprint
 *
 * Blueprint dipakai check-blueprint.js untuk menahan halaman yang bentuknya
 * menyimpang dari saudaranya. Rekam dari halaman yang sudah kamu anggap benar.
 *
 * Usage:
 *   node capture-blueprint.js <slug.json> <nama-blueprint> [--note "keterangan"]
 *
 * Contoh:
 *   node capture-blueprint.js sewa-kabel-aux-to-rca.json produk-sewa \
 *     --note "Halaman produk sewa: hook, spek, galeri, harga, blog list"
 */
'use strict';
const fs = require('fs');
const path = require('path');

const { resolveWorkspaceOffline } = require('./lib/workspace');
const bp = require('../lib/blueprint-store');

const { args, dirs, blogId, paths } = resolveWorkspaceOffline();

if (args.length < 2) {
  console.error('Usage: node capture-blueprint.js <slug.json> <nama-blueprint> [--note "..."]');
  process.exit(1);
}

const slugFile = args[0].endsWith('.json') ? args[0] : args[0] + '.json';
const name = args[1];
const noteIdx = args.indexOf('--note');
const note = noteIdx !== -1 && args[noteIdx + 1] ? args[noteIdx + 1] : '';

const src = path.join(dirs.elementor, slugFile);
if (!fs.existsSync(src)) {
  console.error(`✗ Halaman tidak ditemukan: ${src}`);
  console.error('  Jalankan download-page.js lalu extract-elementor.js dulu.');
  process.exit(1);
}

let data;
try { data = JSON.parse(fs.readFileSync(src, 'utf-8')); }
catch (e) { console.error(`✗ JSON rusak: ${e.message}`); process.exit(1); }

let blueprint;
try { blueprint = bp.capture(data, { name, note, source: slugFile }); }
catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }

const dir = paths.blueprintsDir(blogId);
bp.write(dir, blueprint);

console.log(`✓ Blueprint "${blueprint.name}" direkam dari ${slugFile}`);
console.log(`  ${bp.file(dir, blueprint.name)}`);
console.log('');
blueprint.sections.forEach((s, i) => {
  console.log(`  ${String(i).padStart(2)}. ${s.label || '(tanpa teks)'}`);
  console.log(`      ${s.widgets.join(' · ') || '(tanpa widget)'}`);
});
console.log('');
console.log('Tandai halaman yang memakainya dengan menjalankan:');
console.log(`  node check-blueprint.js <slug> --blueprint ${blueprint.name}`);
