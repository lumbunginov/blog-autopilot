'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLimit, outputPaths, partialBanner, produkSection } = require('./audit-report');

// ------------------------------------------------------------- parseLimit (C2)

test('parseLimit: tanpa --limit -> Infinity (crawl penuh)', () => {
  assert.strictEqual(parseLimit(undefined), Infinity);
});

test('parseLimit: angka valid -> integer', () => {
  assert.strictEqual(parseLimit('50'), 50);
});

test('parseLimit: bukan angka ditolak, bukan diam-diam jadi NaN', () => {
  assert.throws(() => parseLimit('abc'), /bilangan bulat positif/);
});

test('parseLimit: nol dan negatif ditolak', () => {
  assert.throws(() => parseLimit('0'), /bilangan bulat positif/);
  assert.throws(() => parseLimit('-5'), /bilangan bulat positif/);
});

test('parseLimit: desimal ditolak', () => {
  assert.throws(() => parseLimit('3.5'), /bilangan bulat positif/);
});

// ------------------------------------------------------------- outputPaths (C2)

test('outputPaths: crawl penuh pakai nama per-tanggal biasa', () => {
  const p = outputPaths('/tmp/audit', '2026-09-03', Infinity);
  assert.strictEqual(p.partial, false);
  assert.match(p.md, /link-2026-09-03\.md$/);
  assert.match(p.json, /link-2026-09-03\.json$/);
});

test('outputPaths: --limit pakai nama berkas berbeda, tidak pernah bentrok dengan penuh', () => {
  const full = outputPaths('/tmp/audit', '2026-09-03', Infinity);
  const limited = outputPaths('/tmp/audit', '2026-09-03', 2);
  assert.strictEqual(limited.partial, true);
  assert.notStrictEqual(limited.md, full.md);
  assert.notStrictEqual(limited.json, full.json);
  assert.match(limited.md, /link-2026-09-03-limit2\.md$/);
});

// ------------------------------------------------------------- partialBanner (C2)

test('partialBanner: menyebut kata parsial dan limit-nya', () => {
  const banner = partialBanner(2).join('\n');
  assert.match(banner, /PARSIAL/);
  assert.match(banner, /limit 2/);
  assert.match(banner, /TIDAK SAHIH/);
});

// ------------------------------------------------------------- produkSection (C1)

test('produkSection: katalog gagal dibaca -> TIDAK menulis angka 0, menulis galat', () => {
  const result = produkSection({ error: 'ENOENT: business asset tidak ada', knowledge_base: { products: [] } }, new Map());
  assert.strictEqual(result.produkTakTertaut.length, 0);
  const text = result.lines.join('\n');
  // Tidak boleh mengklaim "0 produk tak tertaut" dengan cara yang bisa
  // dibaca sebagai "semua produk sudah tertaut".
  assert.doesNotMatch(text, /Produk tidak pernah ditautkan: \*\*0\*\*/);
  assert.match(text, /tidak diperiksa/);
  assert.match(text, /ENOENT: business asset tidak ada/);
});

test('produkSection: katalog terbaca normal -> hitung produk tak tertaut seperti biasa', () => {
  const products = [
    { name: 'Sewa HT', url: 'https://x.test/sewa-ht/' },
    { name: 'Sewa Molor', url: 'https://x.test/sewa-molor/' }
  ];
  const urlTertaut = new Map([['https://x.test/sewa-ht/', 3]]);
  const result = produkSection({ error: null, knowledge_base: { products } }, urlTertaut);
  assert.strictEqual(result.produkTakTertaut.length, 1);
  assert.strictEqual(result.produkTakTertaut[0].name, 'Sewa Molor');
  assert.match(result.lines.join('\n'), /Produk tidak pernah ditautkan: \*\*1\*\*/);
});

test('produkSection: katalog terbaca dan semua produk tertaut -> angka 0 sah ditulis', () => {
  const products = [{ name: 'Sewa HT', url: 'https://x.test/sewa-ht/' }];
  const urlTertaut = new Map([['https://x.test/sewa-ht/', 1]]);
  const result = produkSection({ error: null, knowledge_base: { products } }, urlTertaut);
  assert.strictEqual(result.produkTakTertaut.length, 0);
  assert.match(result.lines.join('\n'), /Produk tidak pernah ditautkan: \*\*0\*\*/);
});
