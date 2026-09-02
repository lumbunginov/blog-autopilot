const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadDotEnv, envKeys, resolveCredentials } = require('./env');

const cfg = () => ({
  wordpress: { url: 'https://perkap.com', username: 'faizallazuar' },
  image_api: { type: 'seedream' }
});

test('nama variabel diturunkan dari id tenant', () => {
  assert.deepStrictEqual(envKeys('perkapcom'), {
    wpPassword: 'PERKAPCOM_WP_APP_PASSWORD',
    imageKey: 'PERKAPCOM_IMAGE_API_KEY'
  });
  assert.strictEqual(envKeys('blog-saya').wpPassword, 'BLOG_SAYA_WP_APP_PASSWORD');
});

test('kredensial lengkap tergabung ke config', () => {
  const r = resolveCredentials('perkapcom', cfg(), {
    PERKAPCOM_WP_APP_PASSWORD: 'rahasia',
    PERKAPCOM_IMAGE_API_KEY: 'kunci'
  });
  assert.strictEqual(r.wordpress.app_password, 'rahasia');
  assert.strictEqual(r.image_api.api_key, 'kunci');
  assert.strictEqual(r.wordpress.username, 'faizallazuar');
});

test('password hilang melempar error yang MENYEBUT nama variabelnya', () => {
  assert.throws(() => resolveCredentials('perkapcom', cfg(), {}),
    /PERKAPCOM_WP_APP_PASSWORD/);
});

test('image key hilang tidak melempar kalau tipe none', () => {
  const c = cfg(); c.image_api.type = 'none';
  const r = resolveCredentials('perkapcom', c, { PERKAPCOM_WP_APP_PASSWORD: 'x' });
  assert.strictEqual(r.image_api.api_key, '');
});

test('image key hilang melempar kalau tipe butuh kunci', () => {
  assert.throws(() => resolveCredentials('perkapcom', cfg(), { PERKAPCOM_WP_APP_PASSWORD: 'x' }),
    /PERKAPCOM_IMAGE_API_KEY/);
});

test('config asli tidak ikut berubah', () => {
  const c = cfg();
  resolveCredentials('perkapcom', c, { PERKAPCOM_WP_APP_PASSWORD: 'x', PERKAPCOM_IMAGE_API_KEY: 'y' });
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
