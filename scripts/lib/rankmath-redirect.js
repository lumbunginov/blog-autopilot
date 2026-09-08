'use strict';
// Redirection Rank Math lewat REST. Dipakai saat slug post/page berubah:
// tanpa redirect, URL lama jadi 404 dan peringkat yang sudah didapat hilang.
//
// Endpointnya /rankmath/v1/updateRedirection, dan bentuk parameternya tidak
// terdokumentasi di mana pun — dipetakan dari perilaku editor Rank Math dan
// diverifikasi di perkap.com 2026-09-08:
//
//   buat  : {objectID, objectType:'post', hasRedirect:true,
//            redirectionSources, redirectionUrl, redirectionType}  → {id, action:'new'}
//   hapus : {objectID, objectType:'post', hasRedirect:false,
//            redirectionID:'<id sebagai STRING>'}                  → {action:'delete'}
//
// Dua jebakan yang ditemukan saat memetakan:
//  - redirectionID harus STRING. Angka ditolak 400 "is not of type string".
//  - objectID wajib walau redirect tidak ada hubungannya dengan post itu;
//    ia cuma penanda asal. Tanpa itu: 400 rest_missing_callback_param.
//
// Penghapusan tampak gagal bila langsung dicek — cache halaman masih menyajikan
// 301 selama beberapa detik. Itu cache, bukan penghapusan yang gagal.

const { request, headerAuth } = require('./rankmath-http');

const KODE = new Set(['301', '302', '307', '410', '451']);

// Rank Math menyimpan pola sumber tanpa domain dan tanpa garis miring awal.
// URL penuh yang lolos apa adanya membuat redirect tak pernah cocok — diterima
// 200, tersimpan, dan diam-diam tidak bekerja.
function polaSumber(sumber) {
  let s = String(sumber || '').trim();
  if (!s) throw new Error('Sumber redirect kosong.');
  // Git Bash di Windows mengubah argumen berawalan "/" jadi path Windows.
  // Pola seperti "C:/Program Files/Git/slug" tersimpan tanpa keluhan dan tidak
  // akan pernah cocok — redirect yang tampak dibuat tapi tak pernah bekerja.
  if (/^[A-Za-z]:[\\/]/.test(s) || /Program Files/i.test(s)) {
    throw new Error(
      `Sumber "${s}" sudah diubah shell menjadi path Windows. ` +
      `Tulis tanpa garis miring awal (slug-lama/) atau pakai URL penuh.`
    );
  }
  try { if (/^https?:\/\//i.test(s)) s = new URL(s).pathname; } catch { /* pakai apa adanya */ }
  return s.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Buat redirect.
 * @param {{baseUrl:string, auth:string}} wp
 * @param {object} opsi
 * @param {string} opsi.dari     slug/path lama (URL penuh juga diterima)
 * @param {string} opsi.ke       URL tujuan
 * @param {number} opsi.objectID post/page penanda asal (wajib oleh endpointnya)
 * @param {string} [opsi.kode]   301 (bawaan) | 302 | 307 | 410 | 451
 */
async function buat(wp, { dari, ke, objectID, kode = '301' }) {
  const pola = polaSumber(dari);
  if (!ke) throw new Error('Tujuan redirect kosong.');
  if (!objectID) throw new Error('objectID wajib — endpoint Rank Math menolak tanpa itu.');
  if (!KODE.has(String(kode))) {
    throw new Error(`Kode redirect "${kode}" tidak dikenal. Pilih: ${[...KODE].join(', ')}.`);
  }
  const res = await request(wp.baseUrl, wp.auth, '/wp-json/rankmath/v1/updateRedirection', 'POST', {
    objectID: Number(objectID),
    objectType: 'post',
    hasRedirect: true,
    redirectionSources: pola,
    redirectionUrl: ke,
    redirectionType: String(kode)
  });
  if (res.status !== 200) {
    throw new Error(`updateRedirection gagal (HTTP ${res.status}): ${res.raw.slice(0, 300)}`);
  }
  return { id: res.body && res.body.id, aksi: res.body && res.body.action, pola, ke, kode: String(kode) };
}

/**
 * Hapus redirect berdasarkan id yang dikembalikan buat().
 * objectID boleh apa saja yang valid — endpointnya tetap mewajibkannya.
 */
async function hapus(wp, { redirectionID, objectID }) {
  if (!redirectionID) throw new Error('redirectionID wajib.');
  if (!objectID) throw new Error('objectID wajib — endpoint Rank Math menolak tanpa itu.');
  const res = await request(wp.baseUrl, wp.auth, '/wp-json/rankmath/v1/updateRedirection', 'POST', {
    objectID: Number(objectID),
    objectType: 'post',
    hasRedirect: false,
    redirectionID: String(redirectionID) // STRING — angka ditolak 400
  });
  if (res.status !== 200) {
    throw new Error(`Hapus redirect gagal (HTTP ${res.status}): ${res.raw.slice(0, 300)}`);
  }
  return { aksi: res.body && res.body.action };
}

/**
 * Cek apa yang benar-benar terjadi saat URL diakses. Satu-satunya bukti bahwa
 * redirect bekerja — respons 200 dari updateRedirection cuma berarti tersimpan,
 * bukan bahwa polanya cocok.
 */
async function periksa(wp, urlPenuh) {
  const u = new URL(urlPenuh);
  const res = await request(wp.baseUrl, wp.auth, u.pathname + u.search, 'GET', null, { ikutiRedirect: false });
  return {
    status: res.status,
    tujuan: res.headers && (res.headers.location || res.headers.Location) || null
  };
}

module.exports = { buat, hapus, periksa, polaSumber, KODE };
