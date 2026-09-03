'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveKnowledgeBase, sourceType } = require('./knowledge');

const MANUAL_KB = {
  business_name: 'Manual Inc',
  business_description: 'Ditulis tangan',
  products: [{ name: 'Produk A', url: '' }],
  target_audience: 'siapa saja',
  tone: 'professional',
  prohibited_topics: ['judi'],
  internal_links: [{ url: 'https://x.test/a/', anchor: 'a' }],
  custom_entries: [{ title: 'catatan', body: 'isi' }]
};

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kn-test-'));
  const dir = path.join(root, 'perkapcom');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({
    nama: 'Perkap.com', tagline: 'Sewa Alat Panitia', jenisUsaha: 'Jasa Rental',
    kota: 'Malang', deskripsi: '', targetMarket: 'Panitia acara',
    toneOfVoice: 'santai', kataHindari: ['Termurah']
  }));
  fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify([
    { id: 'ht', nama: 'Sewa HT', harga: 'Rp 35.000', targetMarket: 'Panitia',
      konteks: 'Detail di https://perkap.com/sewa-ht/', faq: '### Berapa lama?\nSehari.' }
  ]));
  return root;
}

function baConfig(root) {
  return {
    wordpress: { url: 'https://perkap.com', username: 'u' },
    knowledge_base: MANUAL_KB,
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  };
}

test('config tanpa knowledge_source dianggap manual', () => {
  assert.strictEqual(sourceType({ knowledge_base: MANUAL_KB }), 'manual');
  assert.strictEqual(sourceType({}), 'manual');
  assert.strictEqual(sourceType(null), 'manual');
});

test('type tak dikenal jatuh ke manual, bukan melempar', () => {
  assert.strictEqual(sourceType({ knowledge_source: { type: 'entah' } }), 'manual');
});

test('mode manual mengembalikan knowledge_base tersimpan apa adanya', () => {
  const r = resolveKnowledgeBase({ knowledge_base: MANUAL_KB });
  assert.strictEqual(r.source, 'manual');
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.knowledge_base.business_name, 'Manual Inc');
  assert.deepStrictEqual(r.knowledge_base.prohibited_topics, ['judi']);
});

test('mode manual selalu memberi avoid_words berupa array', () => {
  const r = resolveKnowledgeBase({ knowledge_base: MANUAL_KB });
  assert.deepStrictEqual(r.knowledge_base.avoid_words, []);
});

test('mode manual tanpa knowledge_base sama sekali tetap memberi objek', () => {
  const r = resolveKnowledgeBase({});
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.knowledge_base.products, []);
  assert.deepStrictEqual(r.knowledge_base.avoid_words, []);
});

test('mode business_asset membaca live dari folder', () => {
  const r = resolveKnowledgeBase(baConfig(fixtureRoot()));
  assert.strictEqual(r.source, 'business_asset');
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
  assert.strictEqual(r.knowledge_base.products.length, 1);
  assert.strictEqual(r.knowledge_base.products[0].url, 'https://perkap.com/sewa-ht/');
  assert.deepStrictEqual(r.knowledge_base.avoid_words, ['Termurah']);
});

test('business_asset tidak membocorkan konteks dan faq ke knowledge_base', () => {
  const r = resolveKnowledgeBase(baConfig(fixtureRoot()));
  const p = r.knowledge_base.products[0];
  assert.ok(!('konteks' in p) && !('context' in p));
  assert.ok(!('faq' in p));
});

test('business_asset mengabaikan knowledge_base manual tersimpan', () => {
  const r = resolveKnowledgeBase(baConfig(fixtureRoot()));
  assert.notStrictEqual(r.knowledge_base.business_name, 'Manual Inc');
  assert.deepStrictEqual(r.knowledge_base.prohibited_topics, []);
  assert.deepStrictEqual(r.knowledge_base.custom_entries, []);
});

test('folder salah: mengembalikan error, TIDAK melempar, dan tetap memberi kb kosong', () => {
  const cfg = baConfig(fixtureRoot());
  cfg.knowledge_source.business_asset.business_id = 'tidakada';
  const r = resolveKnowledgeBase(cfg);
  assert.strictEqual(r.source, 'business_asset');
  assert.ok(r.error, 'error harus terisi');
  assert.ok(r.error.includes('tidakada'));
  assert.deepStrictEqual(r.knowledge_base.products, []);
});

test('business_id berbahaya: error, bukan lemparan', () => {
  const cfg = baConfig(fixtureRoot());
  cfg.knowledge_source.business_asset.business_id = '../../rahasia';
  const r = resolveKnowledgeBase(cfg);
  assert.ok(r.error);
  assert.match(r.error, /tidak valid/i);
});

test('business_asset tanpa root: error menyebut root', () => {
  const r = resolveKnowledgeBase({
    knowledge_source: { type: 'business_asset', business_asset: { business_id: 'perkapcom' } }
  });
  assert.ok(r.error);
  assert.match(r.error, /root/i);
});
