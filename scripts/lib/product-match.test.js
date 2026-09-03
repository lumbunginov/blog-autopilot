'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { matchProduct } = require('./product-match');

const PRODUK = [
  { id: 'bel-cerdas-cermat-custom', name: 'Bel Cerdas Cermat Custom' },
  { id: 'mixer-ashley-smr6', name: 'Mixer Audio Ashley SMR 6' },
  { id: 'mixer-yamaha-dx06', name: 'Mixer Audio Yamaha DX06' },
  { id: 'sewa-ht', name: 'Sewa HT' }
];

test('nama produk eksplisit cocok persis dengan id', () => {
  const r = matchProduct(PRODUK, { productName: 'bel-cerdas-cermat-custom' });
  assert.equal(r.product.id, 'bel-cerdas-cermat-custom');
  assert.equal(r.reason, 'nama-eksplisit');
});

test('nama produk eksplisit cocok persis dengan nama, beda huruf besar-kecil tidak masalah', () => {
  assert.equal(matchProduct(PRODUK, { productName: 'bel cerdas cermat custom' }).product.id, 'bel-cerdas-cermat-custom');
});

test('judul artikel memuat nama produk', () => {
  const r = matchProduct(PRODUK, { title: 'Tips Menyewa Bel Cerdas Cermat Custom untuk Lomba Sekolah' });
  assert.equal(r.product.id, 'bel-cerdas-cermat-custom');
  assert.equal(r.reason, 'judul');
});

test('kata kunci fokus memuat nama produk', () => {
  assert.equal(matchProduct(PRODUK, { keyword: 'sewa bel cerdas cermat custom malang' }).product.id, 'bel-cerdas-cermat-custom');
});

test('DUA produk berbagi kata umum: TIDAK MENEBAK, kembalikan null', () => {
  // "Mixer Audio Ashley SMR 6" dan "Mixer Audio Yamaha DX06" berbagi
  // "mixer" dan "audio". Menebak salah satunya berarti artikel Yamaha
  // memakai foto Ashley — salah yang tidak terlihat salah.
  assert.equal(matchProduct(PRODUK, { title: 'Panduan Memilih Mixer Audio untuk Acara' }), null);
});

test('satu produk menang telak lewat kata: diterima', () => {
  const r = matchProduct(PRODUK, { title: 'Review Mixer Audio Yamaha DX06 untuk Band' });
  assert.equal(r.product.id, 'mixer-yamaha-dx06');
});

test('satu kata umum saja tidak cukup', () => {
  assert.equal(matchProduct(PRODUK, { title: 'Cara Merawat Audio Rumahan' }), null);
});

test('artikel yang tidak menyebut produk mana pun memberi null', () => {
  assert.equal(matchProduct(PRODUK, { title: 'Tips Mengatur Anggaran Acara Kantor' }), null);
});

test('masukan kosong atau rusak tidak melempar', () => {
  assert.equal(matchProduct([], { title: 'apa saja' }), null);
  assert.equal(matchProduct(null, { title: 'apa saja' }), null);
  assert.equal(matchProduct(PRODUK, {}), null);
  assert.equal(matchProduct(PRODUK, null), null);
});

test('elemen null/undefined dalam array produk dilewati, tidak melempar', () => {
  const r1 = matchProduct([null, { id: 'a', name: 'Produk A' }], { title: 'Produk A bagus' });
  assert.equal(r1.product.id, 'a');

  const r2 = matchProduct([undefined, { id: 'a', name: 'Produk A' }], { productName: 'a' });
  assert.equal(r2.product.id, 'a');

  assert.equal(
    matchProduct([{ id: 'a', name: 'Produk A' }, null], { title: 'judul yang tidak cocok apa pun' }),
    null
  );
});

test('elemen bukan objek dalam array produk dilewati, tidak melempar', () => {
  assert.equal(matchProduct(['teks', 42, true], { title: 'apa saja' }), null);
});

test('field name yang bukan string tidak melempar', () => {
  assert.equal(matchProduct([{ id: 'a', name: 42 }], { title: 'apa saja' }), null);
});

test('produk bernama sangat pendek tidak menyapu segalanya', () => {
  // "Sewa HT" — "ht" hanya 2 huruf, di bawah ambang kata bermakna.
  assert.equal(matchProduct(PRODUK, { title: 'Tips Sewa Peralatan Acara' }), null);
});

test('nama produk eksplisit yang tidak dikenal memberi null, bukan tebakan', () => {
  assert.equal(matchProduct(PRODUK, { productName: 'Produk Yang Tidak Ada' }), null);
});
