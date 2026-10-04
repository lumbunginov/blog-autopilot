const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeId, makePaths } = require('./paths');

function tmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ab-paths-')); }

test('id dibersihkan jadi aman untuk nama folder', () => {
  assert.strictEqual(sanitizeId('Example.com'), 'examplecom');
  assert.strictEqual(sanitizeId('Blog Saya!'), 'blog-saya');
  assert.strictEqual(sanitizeId('  spasi  '), 'spasi');
});

test('id yang mencoba keluar folder ditolak', () => {
  assert.throws(() => sanitizeId('../rahasia'), /tidak valid/i);
  assert.throws(() => sanitizeId(''), /tidak valid/i);
  assert.throws(() => sanitizeId('...'), /tidak valid/i);
});

test('path tenant tersusun di bawah data/blogs', () => {
  const p = makePaths(tmpRoot());
  assert.ok(p.configPath('examplecom').endsWith(path.join('data', 'blogs', 'examplecom', 'config.json')));
  assert.ok(p.cachePath('examplecom').endsWith('articles-cache.json'));
});

test('listBlogs kosong kalau folder belum ada', () => {
  const p = makePaths(tmpRoot());
  assert.deepStrictEqual(p.listBlogs(), []);
});

test('listBlogs hanya memuat direktori, mengabaikan berkas _active', () => {
  const root = tmpRoot();
  const p = makePaths(root);
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'examplecom'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'blogs', '_active'), 'examplecom');
  assert.deepStrictEqual(p.listBlogs(), ['examplecom']);
});

test('activeBlog memilih tenant pertama kalau _active belum ada', () => {
  const root = tmpRoot();
  const p = makePaths(root);
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'examplecom'), { recursive: true });
  assert.strictEqual(p.activeBlog(), 'examplecom');
  assert.strictEqual(fs.readFileSync(path.join(root, 'data', 'blogs', '_active'), 'utf-8').trim(), 'examplecom');
});

test('activeBlog null kalau belum ada tenant sama sekali', () => {
  assert.strictEqual(makePaths(tmpRoot()).activeBlog(), null);
});

test('setActiveBlog menolak tenant yang tidak ada', () => {
  const p = makePaths(tmpRoot());
  assert.throws(() => p.setActiveBlog('tidakada'), /tidak ditemukan/i);
});

test('setActiveBlog mengubah tenant aktif', () => {
  const root = tmpRoot();
  const p = makePaths(root);
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'satu'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'dua'), { recursive: true });
  p.setActiveBlog('dua');
  assert.strictEqual(p.activeBlog(), 'dua');
});

test('_active yang menunjuk tenant terhapus jatuh ke tenant tersisa', () => {
  const root = tmpRoot();
  const p = makePaths(root);
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'satu'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'blogs', '_active'), 'sudah-dihapus');
  assert.strictEqual(p.activeBlog(), 'satu');
});
