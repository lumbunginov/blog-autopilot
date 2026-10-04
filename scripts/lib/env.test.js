const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadDotEnv, envKeys, resolveCredentials } = require('./env');

const cfg = () => ({
  wordpress: { url: 'https://example.com', username: 'admin' },
  image_api: { type: 'seedream' }
});

test('nama variabel disanitasi dulu — varian bentuk id memberi variabel yang sama', () => {
  // Regresi: configPath() menyanitasi di dalam, jadi "Example.com" membaca folder
  // "examplecom". Kalau envKeys memakai id mentah, ia mencari EXAMPLE.COM_... yang
  // tak pernah ada dan wpPasswordSet melapor false untuk tenant yang sudah diset.
  const benar = 'EXAMPLECOM_WP_APP_PASSWORD';
  for (const id of ['examplecom', 'Example.com', 'EXAMPLECOM', '  examplecom  ']) {
    assert.strictEqual(envKeys(id).wpPassword, benar, `id ${JSON.stringify(id)}`);
  }
  assert.strictEqual(envKeys('Blog Saya!').wpPassword, 'BLOG_SAYA_WP_APP_PASSWORD');
});

test('resolveCredentials ikut memakai nama tersanitasi', () => {
  const cfg = { wordpress: { url: 'https://x.com', username: 'u' }, image_api: { type: 'none' } };
  const r = resolveCredentials('Example.com', cfg, { EXAMPLECOM_WP_APP_PASSWORD: 'rahasia' });
  assert.strictEqual(r.wordpress.app_password, 'rahasia');
});

test('nama variabel diturunkan dari id tenant', () => {
  assert.deepStrictEqual(envKeys('examplecom'), {
    wpPassword: 'EXAMPLECOM_WP_APP_PASSWORD',
    imageKey: 'EXAMPLECOM_IMAGE_API_KEY',
    textKey: 'EXAMPLECOM_TEXT_API_KEY'
  });
  assert.strictEqual(envKeys('blog-saya').wpPassword, 'BLOG_SAYA_WP_APP_PASSWORD');
});

test('kredensial lengkap tergabung ke config', () => {
  const r = resolveCredentials('examplecom', cfg(), {
    EXAMPLECOM_WP_APP_PASSWORD: 'rahasia',
    EXAMPLECOM_IMAGE_API_KEY: 'kunci'
  });
  assert.strictEqual(r.wordpress.app_password, 'rahasia');
  assert.strictEqual(r.image_api.api_key, 'kunci');
  assert.strictEqual(r.wordpress.username, 'admin');
});

test('password hilang melempar error yang MENYEBUT nama variabelnya', () => {
  assert.throws(() => resolveCredentials('examplecom', cfg(), {}),
    /EXAMPLECOM_WP_APP_PASSWORD/);
});

test('image key hilang tidak melempar kalau tipe none', () => {
  const c = cfg(); c.image_api.type = 'none';
  const r = resolveCredentials('examplecom', c, { EXAMPLECOM_WP_APP_PASSWORD: 'x' });
  assert.strictEqual(r.image_api.api_key, '');
});

test('image key hilang melempar kalau tipe butuh kunci', () => {
  assert.throws(() => resolveCredentials('examplecom', cfg(), { EXAMPLECOM_WP_APP_PASSWORD: 'x' }),
    /EXAMPLECOM_IMAGE_API_KEY/);
});

test('config asli tidak ikut berubah', () => {
  const c = cfg();
  resolveCredentials('examplecom', c, { EXAMPLECOM_WP_APP_PASSWORD: 'x', EXAMPLECOM_IMAGE_API_KEY: 'y' });
  assert.strictEqual(c.wordpress.app_password, undefined);
});

test('loadDotEnv membaca pasangan kunci-nilai dan melewati komentar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-env-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, '# komentar\nFOO_BAR=nilai satu\n\nKOSONG=\n');
  const env = {};
  loadDotEnv(f, env);
  assert.strictEqual(env.FOO_BAR, 'nilai satu');
  assert.strictEqual(env.KOSONG, '');
  assert.strictEqual(env['# komentar'], undefined);
});

test('loadDotEnv tidak menimpa variabel yang sudah ada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-env-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, 'FOO=dari-berkas\n');
  const env = { FOO: 'dari-shell' };
  loadDotEnv(f, env);
  assert.strictEqual(env.FOO, 'dari-shell');
});

test('loadDotEnv diam saja kalau berkas tidak ada', () => {
  const env = {};
  loadDotEnv(path.join(os.tmpdir(), 'tidak-ada-98765.env'), env);
  assert.deepStrictEqual(env, {});
});

test('loadDotEnv melepas tanda kutip ganda pembungkus', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-env-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, 'FOO="bar"\n');
  const env = {};
  loadDotEnv(f, env);
  assert.strictEqual(env.FOO, 'bar');
});

test('loadDotEnv melepas tanda kutip tunggal pembungkus', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-env-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, "FOO='bar'\n");
  const env = {};
  loadDotEnv(f, env);
  assert.strictEqual(env.FOO, 'bar');
});

test('loadDotEnv tidak mengubah kutip yang ada di tengah nilai', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-env-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, 'FOO=pass"word123\n');
  const env = {};
  loadDotEnv(f, env);
  assert.strictEqual(env.FOO, 'pass"word123');
});

test('envKeys memuat kunci teks', () => {
  assert.equal(envKeys('examplecom').textKey, 'EXAMPLECOM_TEXT_API_KEY');
});
