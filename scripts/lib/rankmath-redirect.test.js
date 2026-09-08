#!/usr/bin/env node
'use strict';
// Aturan yang dijaga: pola sumber dinormalkan seperti yang Rank Math simpan,
// dan masukan yang sudah dirusak shell ditolak alih-alih tersimpan diam-diam.
const assert = require('assert');
const rd = require('./rankmath-redirect');

// Rank Math menyimpan pola tanpa domain dan tanpa garis miring pembungkus.
// URL penuh yang lolos apa adanya tersimpan tanpa keluhan lalu tak pernah cocok.
assert.strictEqual(rd.polaSumber('/sewa-webcam-lama/'), 'sewa-webcam-lama');
assert.strictEqual(rd.polaSumber('sewa-webcam-lama'), 'sewa-webcam-lama');
assert.strictEqual(rd.polaSumber('https://perkap.com/sewa-webcam-lama/'), 'sewa-webcam-lama');
assert.strictEqual(rd.polaSumber('https://perkap.com/a/b/c/'), 'a/b/c');
assert.strictEqual(rd.polaSumber('  /spasi/  '), 'spasi');

assert.throws(() => rd.polaSumber(''), /kosong/);
assert.throws(() => rd.polaSumber('   '), /kosong/);

// Git Bash di Windows mengubah argumen berawalan "/" menjadi path Windows.
// Tanpa penjagaan ini, redirect "dibuat" atas pola yang tak akan pernah cocok
// dan perintahnya melapor sukses — kegagalan yang menyamar jadi keberhasilan.
assert.throws(() => rd.polaSumber('C:/Program Files/Git/sewa-webcam-lama'), /diubah shell/);
assert.throws(() => rd.polaSumber('D:\\apa\\pun'), /diubah shell/);

// Kode yang tidak dikenal ditolak sebelum dikirim: Rank Math menerima nilai
// aneh lalu memperlakukannya sebagai bawaan, jadi salah ketik jadi tak terlihat.
const wpPalsu = { baseUrl: 'https://contoh.invalid', auth: 'x' };
assert.rejects(() => rd.buat(wpPalsu, { dari: 'a', ke: 'https://x/', objectID: 1, kode: '303' }), /tidak dikenal/);
assert.rejects(() => rd.buat(wpPalsu, { dari: 'a', ke: '', objectID: 1 }), /Tujuan redirect kosong/);
// objectID wajib walau redirect tidak terikat pada konten itu — endpoint
// Rank Math menolak tanpanya dengan 400 yang tidak menjelaskan apa-apa.
assert.rejects(() => rd.buat(wpPalsu, { dari: 'a', ke: 'https://x/' }), /objectID wajib/);
assert.rejects(() => rd.hapus(wpPalsu, { redirectionID: '5' }), /objectID wajib/);
assert.rejects(() => rd.hapus(wpPalsu, { objectID: 1 }), /redirectionID wajib/);

assert.ok(rd.KODE.has('301') && rd.KODE.has('410'));

console.log('rankmath-redirect OK — pola, penjagaan shell, gerbang pra-kirim');
