#!/usr/bin/env node
'use strict';
// Aturan yang dijaga: yang dilaporkan berat memang berat, dan yang wajar tidak
// ikut dilaporkan. Audit yang berisik sama tak bergunanya dengan audit yang
// diam — orang berhenti membacanya.
const assert = require('assert');
const a = require('./seo-audit');
const rm = require('./rankmath');

const baik = {
  url: 'https://perkap.com/sewa-webcam-logitech-c920-malang/',
  title: 'Sewa Webcam Logitech C920 Malang 75rb/hari | Perkap.com',
  description: 'Sewa webcam Logitech C920 Malang 75rb per hari. Full HD 1080p, autofocus, mikrofon built-in, plug and play USB untuk Zoom, Meet, dan Teams. Cek di sini!',
  canonical: 'https://perkap.com/sewa-webcam-logitech-c920-malang/',
  robots: 'index, follow, max-snippet:-1'
};

// Halaman yang benar tidak boleh menghasilkan temuan apa pun.
assert.deepStrictEqual(a.nilai(baik).temuan, [], 'halaman sehat harus lolos bersih');

// Berat: hal yang membuat halaman tidak muncul atau tidak dikenali.
const cek = (ubah, aturan, tingkat) => {
  const h = a.nilai({ ...baik, ...ubah });
  const t = h.temuan.find(x => x.aturan === aturan);
  assert.ok(t, `harus melaporkan ${aturan}`);
  assert.strictEqual(t.tingkat, tingkat, `${aturan} harus bertingkat ${tingkat}`);
  return h;
};

cek({ description: '' }, 'desc-kosong', 'berat');
cek({ title: '' }, 'title-kosong', 'berat');
cek({ robots: 'noindex, follow' }, 'noindex', 'berat');
cek({ canonical: 'https://perkap.com/halaman-lain/' }, 'canonical-beda', 'berat');
cek({ canonical: '' }, 'canonical-kosong', 'sedang');
cek({ title: 'Sewa Webcam Logitech C920 Malang Full HD 1080p Autofocus Mikrofon Plug and Play | Perkap.com' }, 'title-panjang', 'sedang');
cek({ description: 'Sewa webcam Malang.' }, 'desc-pendek', 'ringan');

// Canonical dengan/tanpa garis miring akhir dan beda skema adalah URL yang
// SAMA. Melaporkannya sebagai beda membuat hampir semua halaman tampak rusak.
assert.ok(a.samaUrl('https://perkap.com/x/', 'https://perkap.com/x'), 'garis miring akhir tidak membedakan');
assert.ok(a.samaUrl('http://perkap.com/x', 'https://perkap.com/x'), 'skema tidak membedakan');
assert.ok(!a.samaUrl('https://perkap.com/x', 'https://perkap.com/y'));
assert.deepStrictEqual(a.nilai({ ...baik, canonical: 'https://perkap.com/sewa-webcam-logitech-c920-malang' }).temuan, [],
  'canonical tanpa garis miring akhir bukan temuan');

// Panjang dihitung dari teks yang sudah dipulihkan entitasnya: "&amp;" tampil
// sebagai satu karakter di hasil pencarian, bukan lima. Menghitung mentah
// membuat judul yang pas dilaporkan kepanjangan.
const judulAmp = 'Sewa Webcam &amp; Tripod Malang 2026: Harga &amp; Cara | Perkap';
assert.ok(a.panjang(judulAmp) > 60, 'mentah memang melebihi ambang');
assert.ok(a.panjang(rm.normal(judulAmp)) <= 60, 'setelah dinormalkan harus masuk ambang');
assert.deepStrictEqual(a.nilai({ ...baik, title: rm.normal(judulAmp) }).temuan, [],
  'judul ber-& yang pas tidak boleh dilaporkan kepanjangan');

// Kembar hanya terlihat saat semua halaman dilihat bersama.
const kembar = a.temuanKembar([
  { url: 'https://perkap.com/a/', title: 'Judul Sama', description: 'Beda A' },
  { url: 'https://perkap.com/b/', title: 'Judul Sama', description: 'Beda B' },
  { url: 'https://perkap.com/c/', title: 'Judul Lain', description: 'Beda C' }
]);
assert.strictEqual(kembar.length, 1, 'satu judul kembar');
assert.strictEqual(kembar[0].aturan, 'title-kembar');
assert.deepStrictEqual(kembar[0].urls, ['https://perkap.com/a/', 'https://perkap.com/b/']);

// Meta kosong TIDAK dihitung kembar — itu sudah dilaporkan sebagai kosong, dan
// menghitungnya dua kali membuat halaman kosong tampak dua masalah.
assert.strictEqual(
  a.temuanKembar([{ url: 'a', title: '' }, { url: 'b', title: '' }]).length, 0,
  'meta kosong bukan temuan kembar'
);

const r = a.ringkas([a.nilai(baik), a.nilai({ ...baik, description: '' })]);
assert.strictEqual(r.total, 2);
assert.strictEqual(r.bersih, 1);
assert.strictEqual(r.berat, 1);

console.log('seo-audit OK — ambang, canonical, entitas, kembar');
