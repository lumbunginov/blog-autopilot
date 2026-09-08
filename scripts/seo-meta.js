#!/usr/bin/env node
/**
 * seo-meta.js — Baca/tulis meta Rank Math untuk post MAUPUN page
 *
 * Dipakai karena wp/v2 tidak bisa dipercaya untuk page: ia menerima meta
 * rank_math_* dengan status 200 tanpa menyimpannya, dan melaporkan meta kosong
 * saat dibaca walau nilainya ada. Rinciannya di scripts/lib/rankmath.js.
 *
 * Usage:
 *   node seo-meta.js get <id|url>
 *   node seo-meta.js set <id> --title "..." --desc "..." [--keyword "..."]
 *                            [--canonical "..."] [--robots "index,follow"]
 *   node seo-meta.js set <id> --json '{"rank_math_title":"..."}'
 *
 * `set` selalu memverifikasi dari HTML yang tersaji, dan keluar kode 1 bila
 * yang tersaji tidak sama dengan yang diminta.
 */
'use strict';
const blog = require('./lib/blog');
const rm = require('./lib/rankmath');

const w = blog.resolveBlog();
// blog.js mengembalikan base64 telanjang, tanpa awalan skema — pemanggil lama
// menambahkan "Basic " sendiri. Menaruhnya apa adanya ke header Authorization
// menghasilkan 401 rest_not_logged_in yang terbaca seperti masalah kredensial,
// bukan masalah format.
const wp = { baseUrl: w.site, auth: 'Basic ' + w.auth };
const args = w.args;
const perintah = args[0];

function ambilOpsi(nama) {
  const i = args.indexOf('--' + nama);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

function pakai(kode) {
  console.error('Usage:');
  console.error('  node seo-meta.js get <id|url>');
  console.error('  node seo-meta.js set <id> --title "..." --desc "..." [--keyword "..."]');
  console.error('                           [--canonical "..."] [--robots "index,follow"]');
  console.error('  node seo-meta.js set <id> --json \'{"rank_math_title":"..."}\'');
  process.exit(kode);
}

// URL halaman dari id. Untuk page, wp/v2 tetap bisa dipakai membaca `link` —
// yang tidak bisa dipercaya hanya field `meta`-nya.
async function urlDari(id) {
  const https = require('https');
  const http = require('http');
  const u = new URL(w.site);
  const lib = u.protocol === 'http:' ? http : https;
  for (const jenis of ['posts', 'pages']) {
    const hasil = await new Promise(res => {
      lib.get({
        hostname: u.hostname, port: u.port || undefined,
        path: `/wp-json/wp/v2/${jenis}/${id}`,
        headers: { Authorization: w.auth }
      }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ s: r.statusCode, b })); })
        .on('error', () => res({ s: 0, b: '' }));
    });
    if (hasil.s === 200) {
      try {
        const j = JSON.parse(hasil.b);
        if (j.link) return { url: j.link, jenis: jenis === 'posts' ? 'post' : 'page' };
      } catch { /* lanjut coba jenis berikutnya */ }
    }
  }
  throw new Error(`ID ${id} tidak ditemukan sebagai post maupun page.`);
}

(async () => {
  if (!perintah || !args[1]) pakai(1);

  if (perintah === 'get') {
    const target = args[1];
    const { url, jenis } = /^\d+$/.test(target) ? await urlDari(target) : { url: target, jenis: '?' };
    const t = await rm.bacaTersaji(wp, url);
    console.log(`Tersaji di ${url}${jenis !== '?' ? ` (${jenis})` : ''}`);
    console.log('');
    console.log(`  title       : ${t.title || '—'}`);
    console.log(`  description : ${t.description || '—'}`);
    console.log(`  canonical   : ${t.canonical || '—'}`);
    console.log(`  robots      : ${t.robots || '—'}`);
    console.log(`  og:title    : ${t.ogTitle || '—'}`);
    const skema = [...new Set(t.schemaTypes)];
    console.log(`  schema      : ${skema.join(', ') || '—'}`);
    console.log('');
    console.log('Dibaca dari HTML tersaji, bukan wp/v2 — untuk page, wp/v2 melaporkan');
    console.log('meta kosong walau nilainya ada.');
    return;
  }

  if (perintah === 'set') {
    const id = args[1];
    if (!/^\d+$/.test(id)) { console.error('set butuh ID angka.'); pakai(1); }

    let meta = {};
    const json = ambilOpsi('json');
    if (json) {
      try { meta = JSON.parse(json); }
      catch (e) { console.error(`--json bukan JSON valid: ${e.message}`); process.exit(1); }
    }
    const peta = {
      title: 'rank_math_title', desc: 'rank_math_description',
      keyword: 'rank_math_focus_keyword', canonical: 'rank_math_canonical_url'
    };
    for (const [opsi, kunci] of Object.entries(peta)) {
      const v = ambilOpsi(opsi);
      if (v != null) meta[kunci] = v;
    }
    const robots = ambilOpsi('robots');
    // rank_math_robots disimpan sebagai array, bukan string; string diterima
    // 200 lalu diabaikan saat render.
    if (robots) meta.rank_math_robots = robots.split(',').map(s => s.trim()).filter(Boolean);

    if (Object.keys(meta).length === 0) { console.error('Tidak ada yang diubah.'); pakai(1); }

    const { url, jenis } = await urlDari(id);
    const hasil = await rm.tulisDanVerifikasi(wp, Number(id), url, meta);

    console.log(`${jenis} ${id} → ${url}`);
    Object.entries(meta).forEach(([k, v]) =>
      console.log(`  ${k} = ${Array.isArray(v) ? v.join(',') : v}`));
    console.log('');

    if (hasil.ok) {
      console.log('✓ Terverifikasi di HTML tersaji.');
      return;
    }
    console.error('✗ Yang tersaji tidak sama dengan yang diminta:');
    hasil.beda.forEach(b => {
      console.error(`  ${b.field}`);
      console.error(`    diminta : ${b.diminta}`);
      console.error(`    tersaji : ${b.tersaji || '(kosong)'}`);
    });
    console.error('');
    console.error('Kemungkinan: cache halaman belum bersih, atau tema menimpa tag itu.');
    console.error('Coba muat ulang halamannya, lalu `seo-meta.js get ' + id + '`.');
    process.exit(1);
  }

  pakai(1);
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
