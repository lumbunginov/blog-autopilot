const test = require('node:test');
const assert = require('node:assert');
const { slugify, checkSlug } = require('./slug-guard');

const cache = { articles: [
  { id: 11282, title: 'Sewa Stand Partitur Bandung', slug: 'sewa-stand-partitur-terdekat-bandung',
    url: 'https://example.com/x/', status: 'publish' },
  { id: 11283, title: 'Sewa HT Semarang', slug: 'sewa-ht-semarang',
    url: 'https://example.com/y/', status: 'draft' }
]};

test('slug yang sudah ada terdeteksi dan artikelnya dikembalikan', () => {
  const r = checkSlug('sewa-ht-semarang', cache);
  assert.strictEqual(r.duplicate, true);
  assert.strictEqual(r.existing.id, 11283);
  assert.strictEqual(r.existing.status, 'draft');
});

test('slug baru lolos', () => {
  const r = checkSlug('sewa-ht-bandung', cache);
  assert.strictEqual(r.duplicate, false);
  assert.strictEqual(r.existing, null);
});

test('perbandingan mengabaikan beda huruf besar-kecil dan garis miring', () => {
  assert.strictEqual(checkSlug('/Sewa-HT-Semarang/', cache).duplicate, true);
});

test('cache kosong atau null selalu lolos', () => {
  assert.strictEqual(checkSlug('apa-saja', null).duplicate, false);
  assert.strictEqual(checkSlug('apa-saja', { articles: [] }).duplicate, false);
});

test('slug kosong dianggap tidak duplikat, bukan melempar', () => {
  assert.strictEqual(checkSlug('', cache).duplicate, false);
});

test('slugify membuat slug dari judul Indonesia', () => {
  assert.strictEqual(slugify('Sewa HT Bandung: Aman, Jernih, & Stabil'), 'sewa-ht-bandung-aman-jernih-stabil');
  assert.strictEqual(slugify('  Spasi   Berlebih  '), 'spasi-berlebih');
});
