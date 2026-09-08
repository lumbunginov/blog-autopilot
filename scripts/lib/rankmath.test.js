#!/usr/bin/env node
'use strict';
// Aturan yang dijaga: kunci salah ketik ditolak SEBELUM dikirim, dan
// perbandingan hasil verifikasi tidak melaporkan beda palsu karena escaping
// HTML. Keduanya berasal dari kegagalan nyata di perkap.com:
//
//  - rank_math_* dikirim ke wp/v2 untuk page → 200, tidak tersimpan, tidak
//    terbaca kembali. Kunci yang salah ketik berperilaku sama persis, jadi
//    satu-satunya cara membedakannya adalah menolaknya di sisi kita.
//  - meta title yang benar berisi "&" tersaji sebagai "&amp;" di HTML;
//    membandingkan mentah membuat meta yang sudah benar dilaporkan gagal.
const assert = require('assert');
const rm = require('./rankmath');

// --- kunci ---
assert.ok(rm.kunciValid('rank_math_title'));
assert.ok(rm.kunciValid('rank_math_description'));
assert.ok(rm.kunciValid('rank_math_schema_Product'), 'schema per tipe harus lolos');
assert.ok(rm.kunciValid('rank_math_schema_BreadcrumbList'));
assert.ok(!rm.kunciValid('rank_math_desc'), 'singkatan yang salah harus ditolak');
assert.ok(!rm.kunciValid('rank_math_schema_'), 'schema tanpa tipe bukan kunci valid');
assert.ok(!rm.kunciValid('_yoast_wpseo_title'), 'kunci plugin lain bukan urusan modul ini');

assert.throws(() => rm.periksaMeta({ rank_math_desc: 'x' }), /tidak dikenal/);
// Pesan galat harus menyebut kunci yang salah — tanpa itu, orang harus menebak
// mana dari sekian kunci yang bermasalah.
assert.throws(() => rm.periksaMeta({ rank_math_title: 'ok', rank_math_salah: 'x' }), /rank_math_salah/);
assert.doesNotThrow(() => rm.periksaMeta({ rank_math_title: 'ok', rank_math_schema_Article: {} }));
assert.doesNotThrow(() => rm.periksaMeta({}), 'meta kosong bukan galat kunci');

// --- normalisasi pembanding ---
assert.strictEqual(rm.normal('Harga &amp; Cara Pesan'), 'Harga & Cara Pesan');
assert.strictEqual(rm.normal('Harga &#38; Cara'), 'Harga & Cara');
assert.strictEqual(rm.normal('a  b\n c'), 'a b c');
assert.strictEqual(rm.normal('&quot;kutip&quot;'), '"kutip"');
assert.strictEqual(rm.normal(null), null);
// Yang penting: judul yang sama dianggap sama walau satu ter-escape.
assert.strictEqual(
  rm.normal('Sewa Webcam Malang 2026: Harga &amp; Cara Pesan | Perkap.com'),
  rm.normal('Sewa Webcam Malang 2026: Harga & Cara Pesan | Perkap.com')
);

// --- tulisMeta menolak sebelum menyentuh jaringan ---
// Kalau ini sampai mengirim permintaan, test akan gagal dengan galat jaringan,
// bukan dengan galat validasi — itu sendiri sinyal bahwa gerbangnya bocor.
assert.rejects(
  () => rm.tulisMeta({ baseUrl: 'https://contoh.invalid', auth: 'x' }, 1, { rank_math_desc: 'x' }),
  /tidak dikenal/
);
assert.rejects(
  () => rm.tulisMeta({ baseUrl: 'https://contoh.invalid', auth: 'x' }, 1, {}),
  /Tidak ada meta/
);

// --- bentuk header Authorization ---
// blog.js mengembalikan base64 telanjang; post-to-wp.js sudah menyimpan header
// lengkap. Yang telanjang, kalau lolos apa adanya, menghasilkan 401
// rest_not_logged_in — pesan yang menuduh kredensial padahal formatnya yang
// salah, dan itu membuang waktu mencari di tempat yang keliru.
const b64 = Buffer.from('user:pass').toString('base64');
assert.strictEqual(rm.headerAuth(b64), 'Basic ' + b64, 'base64 telanjang harus diberi awalan');
assert.strictEqual(rm.headerAuth('Basic ' + b64), 'Basic ' + b64, 'header lengkap tidak boleh digandakan');
assert.strictEqual(rm.headerAuth('basic ' + b64), 'basic ' + b64, 'awalan huruf kecil tetap dihormati');
assert.strictEqual(rm.headerAuth('Bearer tok'), 'Bearer tok', 'skema lain dibiarkan');

console.log('rankmath OK — kunci, normalisasi, header, gerbang pra-kirim');
