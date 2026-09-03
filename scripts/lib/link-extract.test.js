'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeLink, extractLinks } = require('./link-extract');
const { produkTanpaTautan } = require('./link-report');

const SITUS = 'https://perkap.com';

test('tautan ke situs lain diabaikan', () => {
  assert.equal(normalizeLink('https://google.com/x', SITUS), null);
  assert.equal(normalizeLink('https://tokopedia.com/perkap', SITUS), null);
});

test('www dan huruf besar dianggap situs yang sama', () => {
  assert.equal(normalizeLink('https://www.perkap.com/x/', SITUS), 'https://perkap.com/x/');
  assert.equal(normalizeLink('https://PERKAP.com/x/', SITUS), 'https://perkap.com/x/');
});

test('path relatif diselesaikan terhadap situs', () => {
  assert.equal(normalizeLink('/sewa-ht/', SITUS), 'https://perkap.com/sewa-ht/');
});

test('http dinaikkan ke https, fragment dibuang', () => {
  assert.equal(normalizeLink('http://perkap.com/x/#bagian', SITUS), 'https://perkap.com/x/');
});

test('skema non-web diabaikan', () => {
  for (const s of ['mailto:a@b.com', 'tel:+62812', 'javascript:void(0)', '#anchor']) {
    assert.equal(normalizeLink(s, SITUS), null, `harus diabaikan: ${s}`);
  }
});

test('artefak REST /wp-json/ diabaikan', () => {
  // Elementor membangun paginasi dari URL permintaan saat itu. Lewat REST,
  // paginasi muncul sebagai /wp-json/... yang tidak bisa dijangkau pengunjung
  // mana pun. Audit pertama melaporkan 55 "tautan mati" seperti ini.
  assert.equal(normalizeLink('https://perkap.com/wp-json/wp/v2/pages/page/2/', SITUS), null);
});

test('extractLinks mengambil url dan teks anchor, membersihkan tag di dalamnya', () => {
  const html = '<p><a href="/sewa-ht/">Sewa <strong>HT</strong></a> dan <a href="https://google.com">luar</a></p>';
  const hasil = extractLinks(html, SITUS);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].url, 'https://perkap.com/sewa-ht/');
  assert.equal(hasil[0].anchor, 'Sewa HT');
});

test('extractLinks tahan terhadap html kosong atau rusak', () => {
  assert.deepEqual(extractLinks('', SITUS), []);
  assert.deepEqual(extractLinks(null, SITUS), []);
  assert.deepEqual(extractLinks('<a href=>rusak</a>', SITUS), []);
});

test('situs kosong berarti tidak ada tautan internal yang bisa dikenali', () => {
  assert.equal(normalizeLink('https://perkap.com/x/', ''), null);
});

test('produk yang tidak pernah ditautkan terdaftar dengan hitungan nol', () => {
  const produk = [
    { name: 'A', url: 'https://s.test/a/' },
    { name: 'B', url: 'https://s.test/b/' },
    { name: 'C', url: '' }
  ];
  const tertaut = new Map([['https://s.test/a/', 5]]);
  const hasil = produkTanpaTautan(produk, tertaut);
  assert.equal(hasil.length, 2);
  assert.deepEqual(hasil.find(x => x.name === 'B'), { name: 'B', url: 'https://s.test/b/', count: 0 });
  assert.equal(hasil.find(x => x.name === 'C').url, '');
});

test('produk tanpa URL dan produk ber-URL-tak-tertaut dibedakan', () => {
  const hasil = produkTanpaTautan([{ name: 'C', url: '' }], new Map());
  assert.equal(hasil[0].count, null, 'tanpa URL: hitungan tidak berlaku, bukan nol');
});

test('perbandingan URL mengabaikan garis miring akhir dan www', () => {
  const produk = [{ name: 'A', url: 'https://www.s.test/a' }];
  const tertaut = new Map([['https://s.test/a/', 3]]);
  assert.equal(produkTanpaTautan(produk, tertaut).length, 0);
});
