const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { assertOutPath } = require('./outpath');

// Regresi: path tujuan yang backslash-nya dimakan escape JS.
// Literal di bawah ini ditulis dengan backslash TUNGGAL yang sungguhan, persis
// seperti path Windows yang disubstitusi ke template `node -e`. JS-lah yang
// memakannya saat parse - itu bug-nya. Jangan "perbaiki" jadi backslash ganda:
// test pertama mengunci hasil pemipihan itu.
const CORRUPTED = 'C:\Users\demo\site\images\harga-sewa.png';

test('string rusak memang dipipihkan oleh escape JS', () => {
  assert.strictEqual(CORRUPTED, 'C:Usersdemositeimagesharga-sewa.png');
});

// Sebagian huruf JUSTRU escape yang sah (\f \n \t \b \v \r \0), jadi backslash-nya
// tidak cuma hilang - ia menyisipkan karakter kontrol ke dalam nama berkas.
test('segmen yang diawali huruf escape sah menyisipkan karakter kontrol', () => {
  const s = 'C:\site\images\foto.png';
  assert.ok(s.includes('\f'), 'harusnya ada form feed dari \\f');
  assert.throws(() => assertOutPath(s), /drive-relative/);
});

test('path drive-relative ditolak', () => {
  assert.throws(() => assertOutPath(CORRUPTED), /drive-relative/);
});

test('path tanpa separator ditolak', () => {
  assert.throws(() => assertOutPath('imagesfoo.png'), /separator/);
});

test('placeholder yang belum disubstitusi ditolak', () => {
  assert.throws(() => assertOutPath('{OUTPUT_PATH}'), /placeholder/);
});

test('kosong ditolak', () => {
  assert.throws(() => assertOutPath(''), /kosong/);
  assert.throws(() => assertOutPath(null), /kosong/);
  assert.throws(() => assertOutPath('   '), /kosong/);
});

test('path absolut forward-slash diterima dan di-resolve', () => {
  const out = assertOutPath('C:/Users/demo/site/images/a.png');
  assert.strictEqual(out, path.resolve('C:/Users/demo/site/images/a.png'));
});

test('path absolut backslash yang utuh diterima', () => {
  assert.doesNotThrow(() => assertOutPath('C:\\site\\images\\a.png'));
});

test('path relatif dengan separator diterima', () => {
  assert.strictEqual(assertOutPath('./images/a.png'), path.resolve('./images/a.png'));
});

test('label ikut di pesan error', () => {
  assert.throws(() => assertOutPath('', 'reference path'), /reference path kosong/);
});
