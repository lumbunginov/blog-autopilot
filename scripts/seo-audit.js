#!/usr/bin/env node
/**
 * seo-audit.js — Periksa meta SEO seluruh post/page dari HTML tersaji
 *
 * Menjawab pertanyaan yang sebelumnya harus dibuka satu-satu: halaman mana yang
 * meta description-nya kosong, judulnya kepanjangan, canonical-nya salah, atau
 * tak sengaja noindex.
 *
 * Dibaca dari HTML tersaji, bukan wp/v2 — untuk page, wp/v2 melaporkan meta
 * kosong walau nilainya ada (lihat references/seo-standards.md).
 *
 * Usage:
 *   node seo-audit.js                      # semua page + post terbit
 *   node seo-audit.js --pages              # page saja
 *   node seo-audit.js --posts              # post saja
 *   node seo-audit.js --limit 50           # batasi jumlah
 *   node seo-audit.js --orphan             # + daftar post tanpa tautan masuk
 *   node seo-audit.js --json <berkas>      # simpan hasil lengkap
 */
'use strict';
const fs = require('fs');
const blog = require('./lib/blog');
const rm = require('./lib/rankmath');
const { request } = require('./lib/rankmath-http');
const audit = require('./lib/seo-audit');

const w = blog.resolveBlog();
const wp = { baseUrl: w.site, auth: 'Basic ' + w.auth };
const args = w.args;

const opsi = (n) => { const i = args.indexOf('--' + n); return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const bendera = (n) => args.includes('--' + n);

const batas = Number(opsi('limit') || 0) || Infinity;
const jenisDiminta = bendera('pages') ? ['pages'] : bendera('posts') ? ['posts'] : ['pages', 'posts'];

async function daftarKonten(jenis) {
  const out = [];
  for (let hal = 1; hal <= 20; hal++) {
    const res = await request(wp.baseUrl, wp.auth,
      `/wp-json/wp/v2/${jenis}?status=publish&per_page=100&page=${hal}&_fields=id,link,title`, 'GET', null);
    if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) break;
    out.push(...res.body.map(x => ({ id: x.id, url: x.link, jenis: jenis === 'pages' ? 'page' : 'post' })));
    if (res.body.length < 100 || out.length >= batas) break;
  }
  return out.slice(0, batas);
}

// Dibatasi beberapa permintaan sekaligus: mengambil ratusan halaman serentak
// membuat situs orang lain melambat, dan itu situs yang menghasilkan uang.
async function berbatas(daftar, n, kerja) {
  const hasil = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, daftar.length) }, async () => {
    while (i < daftar.length) {
      const k = i++;
      hasil[k] = await kerja(daftar[k], k);
    }
  }));
  return hasil;
}

async function orphan() {
  const res = await request(wp.baseUrl, wp.auth, '/wp-json/rankmath/v1/links/posts-stats', 'GET', null);
  if (res.status !== 200) return null;
  return res.body;
}

(async () => {
  const konten = [];
  for (const j of jenisDiminta) konten.push(...await daftarKonten(j));
  if (konten.length === 0) { console.log('Tidak ada konten terbit.'); return; }

  process.stderr.write(`Memeriksa ${konten.length} halaman...\n`);

  // Konkurensi 2, bukan 5: pada 5 permintaan bersamaan perkap.com mulai
  // membalas 503, dan halaman error itu — yang memang tak punya meta —
  // terbaca sebagai "tanpa meta description". Audit yang membebani situsnya
  // sendiri lalu melaporkan kerusakan buatannya sendiri lebih buruk daripada
  // tidak ada audit.
  // Satu kali coba ulang: halaman berat kadang timeout sekali lalu berhasil.
  // Tanpa ini, tiap audit menghasilkan daftar "tak terbaca" yang berbeda-beda,
  // dan laporan yang tidak bisa diulang tidak bisa dipercaya.
  async function baca(url) {
    try { return await rm.bacaTersaji(wp, url); }
    catch (e) {
      await new Promise(r => setTimeout(r, 1500));
      return rm.bacaTersaji(wp, url);
    }
  }

  const hasil = await berbatas(konten, 2, async (k) => {
    try {
      const t = await baca(k.url);
      // Respons non-200 bukan temuan SEO. Menilainya berarti melaporkan
      // masalah yang tidak ada, dan itu menutupi masalah yang ada.
      if (t.status !== 200) {
        return { ...k, title: null, description: null, gagal: true,
          temuan: [{ aturan: 'tak-terbaca', tingkat: 'ringan', pesan: `Halaman membalas HTTP ${t.status} — tidak dinilai.` }], berat: 0 };
      }
      // Panjang dihitung setelah entitas HTML dipulihkan: "&amp;" tampil
      // sebagai satu karakter di hasil pencarian, bukan lima.
      return audit.nilai({
        ...k,
        title: rm.normal(t.title),
        description: rm.normal(t.description),
        canonical: t.canonical,
        robots: t.robots
      });
    } catch (e) {
      return { ...k, title: null, description: null, gagal: true,
        temuan: [{ aturan: 'tak-terbaca', tingkat: 'ringan', pesan: e.message }], berat: 0 };
    }
  });

  // Halaman yang gagal dibaca dikeluarkan dari hitungan kembar: judul halaman
  // error identik satu sama lain dan akan dilaporkan sebagai meta kembar.
  const kembar = audit.temuanKembar(hasil.filter(h => !h.gagal));
  const r = audit.ringkas(hasil);

  console.log('');
  const gagal = hasil.filter(h => h.gagal).length;
  console.log(`${r.total} halaman diperiksa · ${r.bersih} bersih · ${r.berat} bermasalah berat${gagal ? ` · ${gagal} tak terbaca` : ''}`);
  if (gagal) console.log('Halaman yang tak terbaca tidak dinilai — jalankan ulang untuk memastikan.');
  console.log('');

  const bermasalah = hasil.filter(h => h.temuan.length > 0)
    .sort((a, b) => b.berat - a.berat || b.temuan.length - a.temuan.length);

  for (const h of bermasalah) {
    const tanda = h.berat > 0 ? '✗' : '~';
    console.log(`${tanda} ${h.url}  (${h.jenis} ${h.id})`);
    h.temuan.forEach(t => console.log(`    [${t.tingkat}] ${t.pesan}`));
  }

  if (kembar.length) {
    console.log('');
    console.log('Meta kembar (halaman-halaman ini bersaing satu sama lain):');
    kembar.forEach(k => {
      console.log(`  [${k.aturan}] "${String(k.nilai).slice(0, 70)}${String(k.nilai).length > 70 ? '…' : ''}"`);
      k.urls.forEach(u => console.log(`      ${u}`));
    });
  }

  if (bendera('orphan')) {
    const s = await orphan();
    if (s) {
      console.log('');
      console.log('Tautan internal (dari Rank Math):');
      console.log(`  ${s.orphan_posts} dari ${s.total_posts} post tanpa tautan masuk sama sekali.`);
      console.log(`  ${s.posts_with_internal} punya tautan keluar internal.`);
      console.log('  Post orphan sulit ditemukan mesin pencari maupun pembaca.');
    }
  }

  const berkas = opsi('json');
  if (berkas) {
    fs.writeFileSync(berkas, JSON.stringify({ ringkasan: r, halaman: hasil, kembar }, null, 2), 'utf-8');
    console.log('');
    console.log(`Hasil lengkap: ${berkas}`);
  }

  // Keluar 1 bila ada temuan berat, supaya bisa dipakai sebagai gerbang.
  if (r.berat > 0) process.exit(1);
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
