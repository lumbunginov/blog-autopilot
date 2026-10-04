#!/usr/bin/env node
'use strict';
// Aturan yang dijaga: yang dilaporkan berat memang berat, dan yang wajar tidak
// ikut dilaporkan. Audit yang berisik sama tak bergunanya dengan audit yang
// diam — orang berhenti membacanya.
const assert = require('assert');
const a = require('./seo-audit');
const rm = require('./rankmath');

const baik = {
  url: 'https://example.com/sewa-webcam-logitech-c920-bandung/',
  title: 'Sewa Webcam Logitech C920 Bandung 75rb/hari | Example.com',
  description: 'Sewa webcam Logitech C920 Bandung 75rb per hari. Full HD 1080p, autofocus, mikrofon built-in, plug and play USB untuk Zoom, Meet, dan Teams. Cek di sini!',
  canonical: 'https://example.com/sewa-webcam-logitech-c920-bandung/',
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
cek({ canonical: 'https://example.com/halaman-lain/' }, 'canonical-beda', 'berat');
cek({ canonical: '' }, 'canonical-kosong', 'sedang');
cek({ title: 'Sewa Webcam Logitech C920 Bandung Full HD 1080p Autofocus Mikrofon Plug and Play | Example.com' }, 'title-panjang', 'sedang');
cek({ description: 'Sewa webcam Bandung.' }, 'desc-pendek', 'ringan');

// Canonical dengan/tanpa garis miring akhir dan beda skema adalah URL yang
// SAMA. Melaporkannya sebagai beda membuat hampir semua halaman tampak rusak.
assert.ok(a.samaUrl('https://example.com/x/', 'https://example.com/x'), 'garis miring akhir tidak membedakan');
assert.ok(a.samaUrl('http://example.com/x', 'https://example.com/x'), 'skema tidak membedakan');
assert.ok(!a.samaUrl('https://example.com/x', 'https://example.com/y'));
assert.deepStrictEqual(a.nilai({ ...baik, canonical: 'https://example.com/sewa-webcam-logitech-c920-bandung' }).temuan, [],
  'canonical tanpa garis miring akhir bukan temuan');

// Panjang dihitung dari teks yang sudah dipulihkan entitasnya: "&amp;" tampil
// sebagai satu karakter di hasil pencarian, bukan lima. Menghitung mentah
// membuat judul yang pas dilaporkan kepanjangan.
const judulAmp = 'Sewa Webcam &amp; Tripod Bandung 2026: Harga &amp; Cara | Example';
assert.ok(a.panjang(judulAmp) > 60, 'mentah memang melebihi ambang');
assert.ok(a.panjang(rm.normal(judulAmp)) <= 60, 'setelah dinormalkan harus masuk ambang');
assert.deepStrictEqual(a.nilai({ ...baik, title: rm.normal(judulAmp) }).temuan, [],
  'judul ber-& yang pas tidak boleh dilaporkan kepanjangan');

// Kembar hanya terlihat saat semua halaman dilihat bersama.
const kembar = a.temuanKembar([
  { url: 'https://example.com/a/', title: 'Judul Sama', description: 'Beda A' },
  { url: 'https://example.com/b/', title: 'Judul Sama', description: 'Beda B' },
  { url: 'https://example.com/c/', title: 'Judul Lain', description: 'Beda C' }
]);
assert.strictEqual(kembar.length, 1, 'satu judul kembar');
assert.strictEqual(kembar[0].aturan, 'title-kembar');
assert.deepStrictEqual(kembar[0].urls, ['https://example.com/a/', 'https://example.com/b/']);

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
