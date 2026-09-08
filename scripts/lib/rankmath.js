'use strict';
// Satu-satunya jalur tulis/baca meta Rank Math.
//
// KENAPA TIDAK LEWAT wp/v2: Rank Math mendaftarkan meta `rank_math_*` ke REST
// hanya untuk sebagian post type. Di WordPress dengan tema/plugin lazim, `post`
// terdaftar tapi `page` TIDAK — dan bedanya tidak terlihat dari respons:
//
//   POST /wp/v2/pages/<id> {meta:{rank_math_title:'X'}}  → 200, meta:{} , TIDAK tersimpan
//   GET  /wp/v2/pages/<id>?context=edit                  → meta tanpa rank_math_*,
//                                                          PADAHAL nilainya ada di DB
//
// Jadi wp/v2 untuk page gagal dua kali: gagal menulis DAN gagal membaca. Yang
// kedua lebih berbahaya — ia membuat pembacaan balik terlihat seperti bukti
// bahwa penulisan gagal, padahal metanya mungkin sudah benar.
//
// `rankmath/v1/updateMeta` menulis lewat plugin-nya sendiri dan bekerja untuk
// post maupun page. objectType-nya 'post' untuk KEDUANYA (itu tipe objek WP,
// bukan post type) — 'page' ditolak diam-diam.
//
// Diverifikasi di perkap.com 2026-09-08 pada halaman draft sekali pakai.

// HTTP dan normalisasi header ada di rankmath-http.js supaya modul redirect
// memakai jalur yang sama persis, bukan salinan yang bisa berbeda diam-diam.
const { request, headerAuth } = require('./rankmath-http');

// Kunci yang boleh ditulis. Daftar tertutup supaya salah ketik (mis.
// rank_math_desc) tertangkap di sini, bukan diterima 200 lalu hilang.
const KUNCI = new Set([
  'rank_math_title',
  'rank_math_description',
  'rank_math_focus_keyword',
  'rank_math_canonical_url',
  'rank_math_robots',
  'rank_math_advanced_robots',
  'rank_math_facebook_title',
  'rank_math_facebook_description',
  'rank_math_twitter_title',
  'rank_math_twitter_description',
  'rank_math_breadcrumb_title',
  'rank_math_pillar_content'
]);

// Schema disimpan dengan kunci berawalan rank_math_schema_<Tipe>, mis.
// rank_math_schema_Product. updateSchemas ADA tapi no-op untuk kasus ini
// (balas 200 [] tanpa menyimpan); updateMeta yang benar-benar menulis.
function kunciValid(k) {
  return KUNCI.has(k) || /^rank_math_schema_[A-Za-z][A-Za-z0-9]*$/.test(k);
}

function periksaMeta(meta) {
  const salah = Object.keys(meta || {}).filter(k => !kunciValid(k));
  if (salah.length) {
    throw new Error(
      `Kunci Rank Math tidak dikenal: ${salah.join(', ')}. ` +
      `Kunci yang salah ketik diterima server dengan status 200 lalu hilang tanpa jejak, ` +
      `jadi ditolak di sini. Schema: rank_math_schema_<Tipe>, mis. rank_math_schema_Product.`
    );
  }
}

/**
 * Tulis meta Rank Math ke satu post ATAU page.
 * @param {{baseUrl:string, auth:string}} wp
 * @param {number} id  ID post/page
 * @param {object} meta  {rank_math_title, rank_math_description, ...}
 */
async function tulisMeta(wp, id, meta) {
  periksaMeta(meta);
  if (!meta || Object.keys(meta).length === 0) {
    throw new Error('Tidak ada meta untuk ditulis.');
  }
  // objectType 'post' untuk post MAUPUN page — lihat catatan di atas berkas.
  const res = await request(wp.baseUrl, wp.auth, '/wp-json/rankmath/v1/updateMeta', 'POST', {
    objectID: id, objectType: 'post', meta
  });
  if (res.status !== 200) {
    throw new Error(`updateMeta gagal (HTTP ${res.status}): ${res.raw.slice(0, 300)}`);
  }
  return res.body;
}

/**
 * Baca meta Rank Math yang BENAR-BENAR tersaji.
 *
 * Untuk page, wp/v2 melaporkan meta kosong walau nilainya ada, jadi pembacaan
 * lewat REST tidak bisa dipercaya sebagai verifikasi. Yang jujur cuma HTML yang
 * dilayani ke pengunjung — itu juga yang dilihat mesin pencari.
 */
async function bacaTersaji(wp, url) {
  const u = new URL(url);
  const res = await request(wp.baseUrl, wp.auth, u.pathname + `?_nocache=${Date.now()}`, 'GET', null);
  const html = res.raw;
  const ambil = (re) => { const m = html.match(re); return m ? m[1].trim() : null; };
  return {
    status: res.status,
    title: ambil(/<title[^>]*>([\s\S]*?)<\/title>/i),
    description: ambil(/<meta\s+name="description"\s+content="([^"]*)"/i),
    canonical: ambil(/<link\s+rel="canonical"\s+href="([^"]*)"/i),
    robots: ambil(/<meta\s+name="robots"\s+content="([^"]*)"/i),
    ogTitle: ambil(/<meta\s+property="og:title"\s+content="([^"]*)"/i),
    // Skema ditulis Rank Math sebagai satu blok JSON-LD bertanda kelasnya.
    schemaTypes: [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map(m => m[1])
  };
}

/**
 * Tulis lalu verifikasi dari HTML tersaji. Ini yang dipakai pemanggil biasa:
 * menulis tanpa memverifikasi adalah cara meta hilang tanpa ada yang tahu.
 */
async function tulisDanVerifikasi(wp, id, url, meta) {
  await tulisMeta(wp, id, meta);
  const tersaji = await bacaTersaji(wp, url);
  const beda = [];
  // Hanya field yang benar-benar tampak di HTML yang bisa diverifikasi. Focus
  // keyword tidak pernah tersaji — itu untuk analyzer, bukan untuk pengunjung.
  const cek = { rank_math_title: 'title', rank_math_description: 'description', rank_math_canonical_url: 'canonical' };
  for (const [kunci, medan] of Object.entries(cek)) {
    if (!(kunci in meta)) continue;
    const mau = normal(meta[kunci]);
    const ada = normal(tersaji[medan]);
    if (mau !== ada) beda.push({ field: medan, diminta: meta[kunci], tersaji: tersaji[medan] });
  }
  return { ok: beda.length === 0, beda, tersaji };
}

// HTML meng-escape & jadi &amp; dan memakai spasi yang berbeda. Membandingkan
// mentah-mentah akan melaporkan beda pada meta yang sebenarnya sudah benar.
function normal(s) {
  if (s == null) return null;
  return String(s)
    .replace(/&amp;/g, '&').replace(/&#0?38;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

module.exports = { tulisMeta, bacaTersaji, tulisDanVerifikasi, kunciValid, periksaMeta, normal, headerAuth, KUNCI };
