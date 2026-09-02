const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readArticlesCache, writeArticlesCache, decodeWpEntities, mapPost } = require('./articles-cache');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ab-')), 'articles-cache.json');
}

test('entity WordPress ter-decode jadi karakter asli', () => {
  assert.strictEqual(decodeWpEntities('Sewa HT &amp; Proyektor'), 'Sewa HT & Proyektor');
  assert.strictEqual(decodeWpEntities('Harga &#8211; Murah'), 'Harga – Murah');
  assert.strictEqual(decodeWpEntities('&#8220;Kutipan&#8221;'), '"Kutipan"');
});

test('tag HTML di judul dibuang', () => {
  assert.strictEqual(decodeWpEntities('Sewa <em>HT</em> Malang'), 'Sewa HT Malang');
});

test('mapPost menghasilkan tepat 8 field', () => {
  const post = {
    id: 11282,
    title: { rendered: 'Sewa Stand Partitur &amp; Mic' },
    status: 'publish',
    date: '2026-04-13T06:00:00',
    modified: '2026-04-14T08:30:00',
    categories: [846],
    slug: 'sewa-stand-partitur-terdekat-malang',
    link: 'https://perkap.com/2026/04/13/sewa-stand-partitur-terdekat-malang/'
  };
  const r = mapPost(post, { 846: 'Sewa Stand Partitur' });
  assert.deepStrictEqual(Object.keys(r).sort(),
    ['category', 'date', 'id', 'modified', 'slug', 'status', 'title', 'url']);
  assert.strictEqual(r.title, 'Sewa Stand Partitur & Mic');
  assert.strictEqual(r.date, '2026-04-13');
  assert.strictEqual(r.modified, '2026-04-14');
  assert.strictEqual(r.category, 'Sewa Stand Partitur');
});

test('kategori tak dikenal jadi Uncategorized', () => {
  const r = mapPost({ id: 1, title: { rendered: 'X' }, status: 'draft', categories: [999], slug: 'x', link: 'u' }, {});
  assert.strictEqual(r.category, 'Uncategorized');
});

test('post tanpa tanggal tidak melempar error', () => {
  const r = mapPost({ id: 2, title: {}, status: 'draft', categories: [], slug: 'y', link: 'u' }, {});
  assert.strictEqual(r.date, '');
  assert.strictEqual(r.modified, '');
  assert.strictEqual(r.title, '');
});

test('tulis lalu baca menghasilkan objek yang sama', () => {
  const p = tmpFile();
  const data = { lastSync: '2026-09-03T00:00:00.000Z', totalCount: 1, articles: [{ id: 1 }] };
  writeArticlesCache(p, data);
  assert.deepStrictEqual(readArticlesCache(p), data);
});

test('cache yang belum ada mengembalikan null, bukan melempar', () => {
  assert.strictEqual(readArticlesCache(path.join(os.tmpdir(), 'tidak-ada-12345.json')), null);
});

test('cache rusak mengembalikan null, bukan melempar', () => {
  const p = tmpFile();
  fs.writeFileSync(p, '{bukan json');
  assert.strictEqual(readArticlesCache(p), null);
});

test('direktori induk dibuat otomatis saat menulis', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-'));
  const p = path.join(dir, 'blogs', 'perkapcom', 'articles-cache.json');
  writeArticlesCache(p, { articles: [] });
  assert.ok(fs.existsSync(p));
});
