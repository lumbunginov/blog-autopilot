'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { activeBlogId } = require('./blog');
const { makePaths } = require('./paths');

function skillRoot(active) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-id-'));
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'toko-a'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'toko-b'), { recursive: true });
  if (active) fs.writeFileSync(path.join(root, 'data', 'blogs', '_active'), active);
  return makePaths(root);
}

test('activeBlogId: --blog menang atas blog aktif', () => {
  assert.strictEqual(activeBlogId('toko-b', skillRoot('toko-a')), 'toko-b');
});

test('activeBlogId: tanpa --blog memakai blog aktif pemakai, bukan nama tenant tertentu', () => {
  assert.strictEqual(activeBlogId(undefined, skillRoot('toko-a')), 'toko-a');
  assert.strictEqual(activeBlogId('', skillRoot('toko-b')), 'toko-b');
});

test('activeBlogId: tanpa --blog dan tanpa blog terdaftar → pesan jelas, bukan tebakan', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-id-kosong-'));
  assert.throws(() => activeBlogId(undefined, makePaths(root)), /--blog/);
});

// Penjaga: skrip CLI tidak boleh punya nama tenant sebagai default. Default
// semacam itu diam-diam mengarahkan pemakai lain ke tenant yang bukan miliknya.
test('tidak ada skrip yang memakai id blog ber-hardcode sebagai default', () => {
  const scriptsDir = path.join(__dirname, '..');
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== 'node_modules') walk(p); }
      else if (f.name.endsWith('.js') && !f.name.endsWith('.test.js')) files.push(p);
    }
  })(scriptsDir);
  const pelanggar = files.filter(f =>
    /\bblog\w*\s*\|\|\s*['"][a-z0-9_-]+['"]/i.test(fs.readFileSync(f, 'utf-8')));
  assert.deepStrictEqual(pelanggar.map(f => path.relative(scriptsDir, f)), []);
});
