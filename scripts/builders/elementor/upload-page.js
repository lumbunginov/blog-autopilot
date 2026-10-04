#!/usr/bin/env node
'use strict';
/**
 * Upload compress/{slug}.json ke WordPress, lalu buktikan halaman publik sudah berubah.
 *
 * Usage:
 *   node upload-page.js <slug> [--blog <id>] [--page-id <id>] [--no-verify]
 *   node upload-page.js <slug> --verify-only     # cek ulang tanpa upload (mis. setelah clear cache)
 *
 * Page id diambil dari pages/{slug}.json; --page-id memaksa target lain
 * (mis. menguji ke halaman staging sebelum menyentuh yang asli).
 *
 * Verifikasi: menulis `_elementor_data` lewat REST tidak memicu hook simpan
 * Elementor, jadi cache elemen Elementor bisa terus menyajikan render lama pada
 * halaman yang sudah pernah tampil. Setelah upload, HTML publik diambil dan
 * dibandingkan dengan perubahan antara pages/{slug}.json (versi sebelum) dan
 * data baru — lihat lib/render-check.js.
 *
 * Kode keluar: 0 = terunggah dan tampil (atau tidak bisa diverifikasi: draft/
 * --no-verify); 1 = gagal upload; 3 = terunggah tapi halaman publik BELUM berubah.
 */
const fs = require('fs');
const path = require('path');
const { resolveWorkspace } = require('./lib/workspace');
const { basicAuth, httpGet, httpPost } = require('../../lib/wp-client');
const { checkRender } = require('./lib/render-check');

const EXIT_STALE = 3;

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

// Versi sebelum-edit dari pages/{slug}.json, hanya kalau memang milik halaman
// yang sama. Tanpa itu verifikasi tetap jalan, tapi memeriksa seluruh isi
// halaman baru alih-alih hanya yang berubah.
function readPrevious(dir, slug, pageId) {
  const file = path.join(dir, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const page = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (String(page.id) !== String(pageId)) return null;
    const raw = page.meta && page.meta._elementor_data;
    if (!raw) return null;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function parseFlags(args) {
  const rest = [];
  let pageId = null, noVerify = false, verifyOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--page-id') { pageId = args[++i]; continue; }
    if (args[i].startsWith('--page-id=')) { pageId = args[i].slice(10); continue; }
    if (args[i] === '--no-verify') { noVerify = true; continue; }
    if (args[i] === '--verify-only') { verifyOnly = true; continue; }
    rest.push(args[i]);
  }
  return { pageId, rest, noVerify, verifyOnly };
}

function liveUrl(link, stamp = Date.now()) {
  return `${link}${link.includes('?') ? '&' : '?'}render_check=${stamp}`;
}

async function verifyLive({ slug, link, status, prev, next }) {
  if (status !== 'publish') {
    console.log(`  − Tampilan tidak diverifikasi: halaman berstatus "${status}" (tidak terlihat publik).`);
    return 0;
  }
  // Beri waktu cache server menerima purge dari penyimpanan barusan.
  await new Promise(r => setTimeout(r, 1500));
  let html;
  try {
    const res = await fetch(liveUrl(link), { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'BlogAutopilot/1.0' } });
    html = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.warn(`  ⚠ Tampilan tidak bisa diverifikasi (${e.message}). Buka ${link} dan periksa manual.`);
    return 0;
  }
  const r = checkRender(prev, next, html);
  if (!r.checked) {
    console.log('  − Tidak ada perubahan yang terlihat sebagai teks/gambar/elemen untuk diverifikasi.');
    return 0;
  }
  if (!r.stale) {
    console.log(`  ✓ Halaman publik sudah menampilkan perubahan (${r.checked} penanda diperiksa).`);
    return 0;
  }
  console.error(`  ✗ Halaman publik BELUM berubah: ${r.missing.length} isi baru tidak tampil, ${r.lingering.length} isi lama masih tampil.`);
  // Contoh teks & gambar lebih bermakna bagi pembaca daripada id elemen.
  const urut = xs => [...xs].sort((a, b) => (a.startsWith('id:') ? 1 : 0) - (b.startsWith('id:') ? 1 : 0));
  [...urut(r.missing).slice(0, 3).map(m => `belum tampil  ${m}`), ...urut(r.lingering).slice(0, 3).map(m => `masih tampil  ${m}`)]
    .forEach(s => console.error(`      ${s}`));
  console.error('');
  console.error('  Datanya sudah tersimpan; yang tampil adalah render lama dari cache. Penyebab paling umum:');
  console.error('  cache elemen Elementor (tidak dibersihkan oleh simpan lewat REST). Bersihkan dengan salah satu:');
  console.error('    - WP Admin → Elementor → Tools → Clear Files & Data');
  console.error('    - buka halaman di editor Elementor lalu klik Update');
  console.error('  lalu purge cache plugin/CDN kalau ada. Cek ulang tanpa upload:');
  console.error(`    node upload-page.js ${slug} --verify-only`);
  return EXIT_STALE;
}

async function main() {
  const { blogId, cfg, args, dirs } = resolveWorkspace();
  const { pageId: forcedId, rest, noVerify, verifyOnly } = parseFlags(args);
  const slug = (rest[0] || '').replace(/\.json$/, '');
  if (!slug) {
    console.error('Usage: node upload-page.js <slug> [--blog <id>] [--page-id <id>] [--no-verify | --verify-only]');
    process.exit(1);
  }

  const data = readCompressed(dirs.compress, slug);
  const pageId = forcedId || readPageId(dirs.pages, slug);
  const prev = readPrevious(dirs.pages, slug, pageId);
  const base = cfg.wordpress.url.replace(/\/$/, '');
  const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
  const endpoint = `${base}/wp-json/wp/v2/pages/${pageId}`;

  let page;
  if (verifyOnly) {
    const { statusCode, body } = await httpGet(`${endpoint}?_fields=id,status,link`, auth);
    if (statusCode !== 200) throw new Error(`Halaman ${pageId} tidak terbaca (HTTP ${statusCode}).`);
    page = body;
    console.log(`Blog: ${blogId} → verifikasi tampilan page ${pageId}`);
  } else {
    console.log(`Blog: ${blogId} → ${endpoint}`);
    const { statusCode, body } = await httpPost(
      endpoint, auth,
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
    page = body;
  }

  if (noVerify) {
    console.log('  − Verifikasi tampilan dilewati (--no-verify).');
    return 0;
  }
  return verifyLive({ slug, link: page.link, status: page.status, prev, next: JSON.parse(data) });
}

if (require.main === module) {
  main().then(code => process.exit(code || 0))
    .catch(e => { console.error('Error:', e.message); process.exit(1); });
}
module.exports = { readCompressed, readPageId, readPrevious, parseFlags, liveUrl, EXIT_STALE };
