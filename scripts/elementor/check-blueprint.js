#!/usr/bin/env node
/**
 * check-blueprint.js — Bandingkan kerangka halaman dengan blueprint-nya
 *
 * Gerbang sebelum compress: validate-elementor.js cuma memastikan JSON-nya
 * sehat, bukan bentuknya konsisten. Halaman bisa lolos validate dengan seksi
 * ekstra atau tertukar, dan baru ketahuan setelah terbit.
 *
 * Pemetaan slug → blueprint disimpan di page-blueprints/_map.json. Sekali
 * ditandai dengan --blueprint, cukup `check-blueprint.js <slug>`.
 *
 * Usage:
 *   node check-blueprint.js <slug.json> [--blueprint <nama>]   # satu halaman
 *   node check-blueprint.js all                                # semua yang bertanda
 *
 * Keluar kode 1 bila ada penyimpangan.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const { resolveWorkspaceOffline } = require('./lib/workspace');
const bp = require('../lib/blueprint-store');

const { args, dirs, blogId, paths } = resolveWorkspaceOffline();
const DIR = paths.blueprintsDir(blogId);

if (args.length < 1) {
  console.error('Usage: node check-blueprint.js <slug.json|all> [--blueprint <nama>]');
  process.exit(1);
}

const bpIdx = args.indexOf('--blueprint');
const bpArg = bpIdx !== -1 ? args[bpIdx + 1] : null;

function periksa(slugFile) {
  const src = path.join(dirs.elementor, slugFile);
  // Berkas hilang dan JSON rusak butuh tindakan yang berbeda — satu perlu
  // download+extract, satu perlu perbaikan berkas. Menyamakan pesannya
  // mengirim orang ke arah yang salah.
  if (!fs.existsSync(src)) {
    console.error(`✗ ${slugFile}: tidak ada di elementor/`);
    console.error(`  Jalankan download-page.js lalu extract-elementor.js dulu.`);
    return false;
  }
  let data;
  try { data = JSON.parse(fs.readFileSync(src, 'utf-8')); }
  catch (e) { console.error(`✗ ${slugFile}: JSON rusak — ${e.message}`); return false; }

  const nama = bpArg || bp.readMap(DIR)[slugFile];
  if (!nama) {
    console.log(`− ${slugFile}: tanpa blueprint, dilewati`);
    console.log(`  Tandai dengan: node check-blueprint.js ${slugFile} --blueprint <nama>`);
    return true;
  }

  const blueprint = bp.read(DIR, nama);
  if (!blueprint) {
    console.error(`✗ ${slugFile}: blueprint "${nama}" tidak ada di ${DIR}`);
    return false;
  }

  let hasil;
  try { hasil = bp.compare(blueprint, data); }
  catch (e) { console.error(`✗ ${slugFile}: ${e.message}`); return false; }

  // Peta ditulis hanya setelah blueprint-nya terbukti ada dan terbaca — menulis
  // lebih dulu berarti nama yang salah ketik ikut tersimpan permanen.
  if (bpArg && bp.readMap(DIR)[slugFile] !== blueprint.name) {
    bp.setMap(DIR, slugFile, blueprint.name);
    console.log(`  ✓ dipetakan ke blueprint "${blueprint.name}"`);
  }

  if (hasil.ok) {
    console.log(`✓ ${slugFile}: sesuai blueprint "${nama}" (${hasil.sectionCount.halaman} seksi)`);
    return true;
  }

  console.error(`✗ ${slugFile}: menyimpang dari blueprint "${nama}"`);
  console.error(`  seksi: blueprint ${hasil.sectionCount.blueprint}, halaman ${hasil.sectionCount.halaman}`);
  hasil.diffs.forEach(d => {
    const teks = d.label ? ` "${d.label}"` : '';
    if (d.kind === 'lebih') console.error(`  + seksi ${d.index}${teks} tidak ada di blueprint — ${d.actual.join(' · ')}`);
    else if (d.kind === 'kurang') console.error(`  - seksi ${d.index}${teks} hilang dari halaman — ${d.expected.join(' · ')}`);
    else {
      console.error(`  ~ seksi ${d.index}${teks} susunannya beda`);
      console.error(`      blueprint: ${d.expected.join(' · ')}`);
      console.error(`      halaman  : ${d.actual.join(' · ')}`);
    }
  });
  return false;
}

let files;
if (args[0] === 'all') {
  files = fs.existsSync(dirs.elementor)
    ? fs.readdirSync(dirs.elementor).filter(f => f.endsWith('.json') && !f.includes('.bak'))
    : [];
  if (files.length === 0) { console.log('Tidak ada halaman di elementor/'); process.exit(0); }
} else {
  files = [args[0].endsWith('.json') ? args[0] : args[0] + '.json'];
}

const gagal = files.filter(f => !periksa(f));
if (gagal.length > 0) {
  console.error('');
  console.error(`${gagal.length} halaman tidak lolos. Perbaiki dulu sebelum compress & upload.`);
  process.exit(1);
}
