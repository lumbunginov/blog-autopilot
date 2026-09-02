const test = require('node:test');
const assert = require('node:assert');
const { deepMerge, stripCredentials } = require('./config-merge');

test('deepMerge partial workflow object tidak menghapus field lain', () => {
  const stored = {
    workflow: { auto_publish: true, saved_categories: [{ id: 1 }, { id: 2 }] },
    wordpress: { url: 'https://x.com' }
  };
  const incoming = { workflow: { auto_publish: false } };
  const merged = deepMerge(stored, incoming);
  assert.strictEqual(merged.workflow.auto_publish, false);
  assert.deepStrictEqual(merged.workflow.saved_categories, [{ id: 1 }, { id: 2 }]);
  assert.strictEqual(merged.wordpress.url, 'https://x.com');
});

test('deepMerge field top-level yang tidak disebut body tetap dipertahankan', () => {
  const stored = { a: 1, b: { c: 2, d: 3 } };
  const merged = deepMerge(stored, { b: { c: 99 } });
  assert.strictEqual(merged.a, 1);
  assert.strictEqual(merged.b.c, 99);
  assert.strictEqual(merged.b.d, 3);
});

test('deepMerge array dari incoming menggantikan array stored seutuhnya', () => {
  const stored = { tags: ['a', 'b', 'c'] };
  const merged = deepMerge(stored, { tags: ['x'] });
  assert.deepStrictEqual(merged.tags, ['x']);
});

test('deepMerge stored kosong/tidak ada tetap bekerja', () => {
  const merged = deepMerge(undefined, { a: 1 });
  assert.deepStrictEqual(merged, { a: 1 });
});

test('stripCredentials membuang wordpress.app_password dan image_api.api_key', () => {
  const body = {
    wordpress: { url: 'https://x.com', username: 'u', app_password: 'RAHASIA' },
    image_api: { type: 'seedream', api_key: 'KUNCI' }
  };
  const { clean, ignored } = stripCredentials(body);
  assert.strictEqual(clean.wordpress.app_password, undefined);
  assert.strictEqual(clean.image_api.api_key, undefined);
  assert.strictEqual(clean.wordpress.url, 'https://x.com');
  assert.deepStrictEqual(ignored, ['wordpress.app_password', 'image_api.api_key']);
});

test('stripCredentials tidak melapor apa pun kalau body tidak membawa kredensial', () => {
  const { clean, ignored } = stripCredentials({ wordpress: { url: 'https://x.com' } });
  assert.deepStrictEqual(ignored, []);
  assert.strictEqual(clean.wordpress.url, 'https://x.com');
});

test('stripCredentials tidak memutasi body asli', () => {
  const body = { wordpress: { app_password: 'RAHASIA' } };
  stripCredentials(body);
  assert.strictEqual(body.wordpress.app_password, 'RAHASIA');
});
