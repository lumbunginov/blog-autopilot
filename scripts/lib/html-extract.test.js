const test = require('node:test');
const assert = require('node:assert');
const { extractFromHtml } = require('./html-extract');

test('og:site_name dipakai sebagai nama bisnis', () => {
  const html = `<html><head>
    <meta property="og:site_name" content="Example Sewa Alat">
    <title>Halaman Depan - Example</title>
  </head><body></body></html>`;
  const r = extractFromHtml(html, 'https://example.com');
  assert.strictEqual(r.businessName, 'Example Sewa Alat');
});

test('tanpa og:site_name, judul dipakai dan ekor setelah dash dibuang', () => {
  const html = `<html><head><title>Example - Sewa Alat Event</title></head><body></body></html>`;
  const r = extractFromHtml(html, 'https://example.com');
  assert.strictEqual(r.businessName, 'Example');
});

test('tanpa judul apa pun, hostname jadi cadangan terakhir', () => {
  const r = extractFromHtml('<html><body></body></html>', 'https://example.com/blog');
  assert.strictEqual(r.businessName, 'example.com');
});

test('meta description menang atas paragraf pertama', () => {
  const html = `<html><head>
    <meta name="description" content="Sewa HT, proyektor, dan sound system untuk event di Bandung.">
  </head><body><p>${'x'.repeat(120)}</p></body></html>`;
  const r = extractFromHtml(html, 'https://example.com');
  assert.match(r.description, /^Sewa HT/);
});

test('paragraf boilerplate cookie/privacy dilewati', () => {
  const html = `<html><body>
    <p>Cookie policy kami menjelaskan bagaimana situs ini menyimpan data Anda selama sesi berlangsung.</p>
    <p>Example menyewakan alat event di Bandung dengan harga terjangkau dan pengantaran cepat ke lokasi.</p>
  </body></html>`;
  const r = extractFromHtml(html, 'https://example.com');
  assert.match(r.description, /^Example menyewakan/);
});

test('heading navigasi umum tidak dianggap produk', () => {
  const html = `<html><body>
    <h2>Beranda</h2><h2>Tentang Kami</h2><h2>Sewa HT</h2><h3>Sewa Proyektor</h3>
  </body></html>`;
  const r = extractFromHtml(html, 'https://example.com');
  assert.deepStrictEqual(r.products, ['Sewa HT', 'Sewa Proyektor']);
});

test('produk dibatasi maksimal 8 entri', () => {
  const html = '<html><body>' +
    Array.from({ length: 12 }, (_, i) => `<h2>Sewa Alat ${i}</h2>`).join('') +
    '</body></html>';
  const r = extractFromHtml(html, 'https://example.com');
  assert.strictEqual(r.products.length, 8);
});

test('tagline kosong kalau og:title sama dengan nama bisnis', () => {
  const html = `<html><head>
    <meta property="og:site_name" content="Example">
    <meta property="og:title" content="Example">
  </head><body></body></html>`;
  const r = extractFromHtml(html, 'https://example.com');
  assert.strictEqual(r.tagline, '');
});
