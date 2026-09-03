const test = require('node:test');
const assert = require('node:assert');
const { deepMerge, stripCredentials, stripKnowledgeBase } = require('./config-merge');

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

test('stripCredentials membersihkan config penuh (skenario GET /api/config) tanpa mengubah field lain', () => {
  const storedConfig = {
    wordpress: { url: 'https://x.com', username: 'admin', app_password: 'RAHASIA' },
    image_api: { type: 'seedream', api_key: 'KUNCI' },
    workflow: { language: 'id', saved_categories: [1, 2, 3] }
  };
  const { clean } = stripCredentials(storedConfig);
  assert.strictEqual(clean.wordpress.app_password, undefined);
  assert.strictEqual(clean.image_api.api_key, undefined);
  assert.strictEqual(clean.wordpress.url, 'https://x.com');
  assert.deepStrictEqual(clean.workflow.saved_categories, [1, 2, 3]);
});

test('mode business_asset membuang knowledge_base kiriman browser', () => {
  const body = { wordpress: { url: 'https://x.test' }, knowledge_base: { business_name: 'Palsu' } };
  const { clean, ignored } = stripKnowledgeBase(body, 'business_asset');
  assert.ok(!('knowledge_base' in clean));
  assert.deepStrictEqual(ignored, ['knowledge_base']);
  assert.strictEqual(clean.wordpress.url, 'https://x.test');
});

test('mode manual membiarkan knowledge_base lewat', () => {
  const body = { knowledge_base: { business_name: 'Asli' } };
  const { clean, ignored } = stripKnowledgeBase(body, 'manual');
  assert.strictEqual(clean.knowledge_base.business_name, 'Asli');
  assert.deepStrictEqual(ignored, []);
});

test('business_asset tanpa knowledge_base di body tidak melaporkan apa-apa', () => {
  const { ignored } = stripKnowledgeBase({ workflow: { language: 'id' } }, 'business_asset');
  assert.deepStrictEqual(ignored, []);
});

test('stripKnowledgeBase tidak mengubah objek asal', () => {
  const body = { knowledge_base: { business_name: 'Palsu' } };
  stripKnowledgeBase(body, 'business_asset');
  assert.strictEqual(body.knowledge_base.business_name, 'Palsu');
});

test('knowledge_source di body tetap lewat di kedua mode', () => {
  const body = { knowledge_source: { type: 'manual' }, knowledge_base: { business_name: 'x' } };
  assert.ok(stripKnowledgeBase(body, 'business_asset').clean.knowledge_source);
  assert.ok(stripKnowledgeBase(body, 'manual').clean.knowledge_source);
});
