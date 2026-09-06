#!/usr/bin/env node
'use strict';
/**
 * Upload compress/{slug}.json ke WordPress.
 *
 * Usage:
 *   node upload-page.js <slug> [--blog <id>] [--page-id <id>]
 *
 * Page id diambil dari pages/{slug}.json; --page-id memaksa target lain
 * (mis. menguji ke halaman staging sebelum menyentuh yang asli).
 */
const fs = require('fs');
const path = require('path');
const { resolveWorkspace } = require('./lib/workspace');
const { basicAuth, httpPost } = require('../lib/wp-client');

function readCompressed(dir, slug) {
  const file = path.join(dir, `${slug}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`compress/${slug}.json belum ada. Jalankan compress-elementor.js ${slug}.json dulu.`);
  }
  const raw = fs.readFileSync(file, 'utf-8');
  // File compress adalah SATU string JSON-of-array. Kalau isinya array biasa,
  // WordPress akan menyimpan meta yang tak bisa dibaca Elementor — jadi
  // dihentikan di sini, bukan setelah halaman rusak.
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error(`compress/${slug}.json bukan JSON valid: ${e.message}`); }
  if (!Array.isArray(parsed)) {
    throw new Error(`compress/${slug}.json harus berisi array section Elementor.`);
  }
  return JSON.stringify(parsed);
}

function readPageId(dir, slug) {
  const file = path.join(dir, `${slug}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`pages/${slug}.json tidak ada — download dulu, atau sebutkan --page-id <id>.`);
  }
  const id = JSON.parse(fs.readFileSync(file, 'utf-8')).id;
  if (!id) throw new Error(`pages/${slug}.json tidak punya field "id".`);
  return id;
}

function parseFlags(args) {
  const rest = [];
  let pageId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--page-id') { pageId = args[++i]; continue; }
    if (args[i].startsWith('--page-id=')) { pageId = args[i].slice(10); continue; }
    rest.push(args[i]);
  }
  return { pageId, rest };
}

async function main() {
  const { blogId, cfg, args, dirs } = resolveWorkspace();
  const { pageId: forcedId, rest } = parseFlags(args);
  const slug = (rest[0] || '').replace(/\.json$/, '');
  if (!slug) {
    console.error('Usage: node upload-page.js <slug> [--blog <id>] [--page-id <id>]');
    process.exit(1);
  }

  const data = readCompressed(dirs.compress, slug);
  const pageId = forcedId || readPageId(dirs.pages, slug);
  const base = cfg.wordpress.url.replace(/\/$/, '');
  const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);

  console.log(`Blog: ${blogId} → ${base}/wp-json/wp/v2/pages/${pageId}`);
  const { statusCode, body } = await httpPost(
    `${base}/wp-json/wp/v2/pages/${pageId}`, auth,
    // _elementor_edit_mode ikut dikirim: halaman yang belum pernah dibuka di
    // Elementor akan mengabaikan _elementor_data tanpa penanda ini.
    { meta: { _elementor_data: data, _elementor_edit_mode: 'builder' } }
  );

  if (statusCode !== 200) {
    throw new Error(`WordPress menolak (HTTP ${statusCode}): ${body?.message || JSON.stringify(body).slice(0, 200)}`);
  }
  const saved = body?.meta?._elementor_data;
  if (saved !== undefined && saved !== data) {
    console.warn('⚠ Data tersimpan berbeda dari yang dikirim — periksa halaman di Elementor.');
  }
  console.log(`✓ Page ${pageId} diperbarui (${(data.length / 1024).toFixed(1)} KB)`);
  console.log(`  Bersihkan cache Elementor bila tampilan belum berubah: ${body.link || ''}`);
}

if (require.main === module) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
module.exports = { readCompressed, readPageId, parseFlags };
