#!/usr/bin/env node
/**
 * seo-redirect.js — Buat/hapus/periksa redirect Rank Math
 *
 * Dipakai saat slug berubah: tanpa redirect, URL lama jadi 404 dan peringkat
 * yang sudah didapat hilang bersamanya.
 *
 * Usage:
 *   node seo-redirect.js add <dari> <ke> --object-id <id> [--code 301]
 *   node seo-redirect.js check <url>
 *   node seo-redirect.js remove <redirectionID> --object-id <id>
 *
 * Contoh:
 *   node seo-redirect.js add /sewa-webcam-lama/ https://perkap.com/sewa-webcam-logitech-c920-malang/ --object-id 11955
 *   node seo-redirect.js check https://perkap.com/sewa-webcam-lama/
 *
 * --object-id adalah post/page penanda asal. Endpoint Rank Math mewajibkannya
 * walau redirect-nya sendiri tidak terikat pada konten itu; pakai id halaman
 * tujuan supaya jejaknya masuk akal saat dibaca orang lain nanti.
 */
'use strict';
const blog = require('./lib/blog');
const rd = require('./lib/rankmath-redirect');

const w = blog.resolveBlog();
const wp = { baseUrl: w.site, auth: 'Basic ' + w.auth };
const args = w.args;
const perintah = args[0];

const opsi = (n) => { const i = args.indexOf('--' + n); return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };

function pakai(kode) {
  console.error('Usage:');
  console.error('  node seo-redirect.js add <dari> <ke> --object-id <id> [--code 301]');
  console.error('  node seo-redirect.js check <url>');
  console.error('  node seo-redirect.js remove <redirectionID> --object-id <id>');
  process.exit(kode);
}

// URL relatif dilengkapi dengan situs blog aktif, supaya `check /slug/` bekerja.
//
// Git Bash di Windows menerjemahkan argumen berawalan "/" menjadi path Windows:
// "/sewa-webcam/" sampai ke sini sebagai "C:/Program Files/Git/sewa-webcam/".
// Tanpa penjagaan, perintahnya tetap jalan dan melapor sukses atas URL yang
// sama sekali bukan yang dimaksud — kegagalan yang tampak seperti keberhasilan.
function penuh(u) {
  const s = String(u);
  if (/^[A-Za-z]:[\\/]/.test(s) || /Program Files/i.test(s)) {
    throw new Error(
      `Argumen "${s}" sudah diubah shell menjadi path Windows.\n` +
      `  Git Bash menerjemahkan argumen berawalan "/". Tulis tanpa garis miring awal\n` +
      `  (sewa-webcam/) atau pakai URL penuh (https://...).`
    );
  }
  return /^https?:\/\//i.test(s) ? s : w.site.replace(/\/+$/, '') + '/' + s.replace(/^\/+/, '');
}

(async () => {
  if (!perintah) pakai(1);

  if (perintah === 'check') {
    if (!args[1]) pakai(1);
    const url = penuh(args[1]);
    const h = await rd.periksa(wp, url);
    console.log(`${url}`);
    console.log(`  status : ${h.status}`);
    console.log(`  tujuan : ${h.tujuan || '—'}`);
    if (h.status >= 300 && h.status < 400 && h.tujuan) console.log('\n✓ Redirect aktif.');
    else if (h.status === 404) console.log('\n404 — tidak ada redirect untuk URL ini.');
    else if (h.status === 200) console.log('\n200 — halaman ini ada sendiri, bukan redirect.');
    return;
  }

  if (perintah === 'add') {
    const [, dari, ke] = args;
    const objectID = opsi('object-id');
    if (!dari || !ke || !objectID) pakai(1);

    const hasil = await rd.buat(wp, { dari, ke, objectID, kode: opsi('code') || '301' });
    console.log(`✓ Redirect dibuat (id ${hasil.id})`);
    console.log(`  ${hasil.pola} → ${hasil.ke}  [${hasil.kode}]`);
    console.log('');

    // Tersimpan bukan berarti bekerja: pola yang tidak cocok tetap dibalas 200.
    const cek = await rd.periksa(wp, penuh(dari));
    if (cek.status >= 300 && cek.status < 400) {
      console.log(`✓ Terverifikasi: ${cek.status} → ${cek.tujuan}`);
    } else {
      console.error(`✗ Belum bekerja: ${penuh(dari)} membalas ${cek.status}.`);
      console.error('  Redirect tersimpan tapi polanya mungkin tidak cocok, atau cache belum bersih.');
      console.error(`  Coba lagi: node seo-redirect.js check ${dari}`);
      process.exit(1);
    }
    return;
  }

  if (perintah === 'remove') {
    const id = args[1];
    const objectID = opsi('object-id');
    if (!id || !objectID) pakai(1);
    const h = await rd.hapus(wp, { redirectionID: id, objectID });
    console.log(`✓ Redirect ${id} dihapus (${h.aksi}).`);
    console.log('  Cache halaman bisa menyajikan 301 lama beberapa detik lagi — itu cache,');
    console.log('  bukan penghapusan yang gagal.');
    return;
  }

  pakai(1);
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
