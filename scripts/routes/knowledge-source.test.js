'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function baRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-ba-'));
  for (const [id, nama, n] of [['perkapcom', 'Perkap.com', 2], ['karvaid', 'Karva.id', 1]]) {
    const dir = path.join(root, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ nama, toneOfVoice: 'santai' }));
    fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify(
      Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nama: `Produk ${i}`, konteks: '' }))
    ));
  }
  // Folder yang BUKAN business asset — tidak boleh ikut terdaftar.
  fs.mkdirSync(path.join(root, 'bukan-bisnis'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bukan-bisnis', 'catatan.txt'), 'rahasia');
  return root;
}

function setupApp(configObj) {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), JSON.stringify(configObj, null, 2));
  const app = express();
  app.use(express.json());
  require('./knowledge-source')(app, { paths: makePaths(skillDir) });
  return app;
}

async function withServer(configObj, fn) {
  const app = setupApp(configObj);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('daftar bisnis hanya folder yang punya profile.json', async () => {
  const root = baRoot();
  await withServer({}, async (base) => {
    const r = await (await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`)).json();
    const ids = r.businesses.map(b => b.id).sort();
    assert.deepStrictEqual(ids, ['karvaid', 'perkapcom']);
    assert.ok(!ids.includes('bukan-bisnis'));
  });
});

test('daftar bisnis menyertakan nama dan jumlah produk', async () => {
  const root = baRoot();
  await withServer({}, async (base) => {
    const r = await (await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`)).json();
    const p = r.businesses.find(b => b.id === 'perkapcom');
    assert.strictEqual(p.name, 'Perkap.com');
    assert.strictEqual(p.productCount, 2);
  });
});

test('root tidak ada: 200, daftar kosong, pesan menyebut path', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/business-assets?root=${encodeURIComponent('Z:/tidak/ada')}`);
    assert.strictEqual(res.status, 200);
    const r = await res.json();
    assert.deepStrictEqual(r.businesses, []);
    assert.ok(r.error && r.error.includes('tidak/ada'));
  });
});

test('root kosong: 400 dengan pesan, bukan membaca direktori kerja', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/business-assets`);
    assert.strictEqual(res.status, 400);
  });
});

test('daftar bisnis tidak pernah membocorkan isi berkas lain', async () => {
  const root = baRoot();
  await withServer({}, async (base) => {
    const body = await (await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`)).text();
    assert.ok(!body.includes('rahasia'));
  });
});

test('preview melaporkan ringkasan tenant aktif', async () => {
  const root = baRoot();
  await withServer({
    wordpress: { url: 'https://perkap.com' },
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  }, async (base) => {
    const r = await (await fetch(`${base}/api/knowledge-preview`)).json();
    assert.strictEqual(r.source, 'business_asset');
    assert.strictEqual(r.error, null);
    assert.strictEqual(r.summary.products, 2);
    assert.strictEqual(r.summary.tone, 'casual');
  });
});

test('preview mode manual tetap menjawab tanpa error', async () => {
  await withServer({ knowledge_base: { business_name: 'Manual', products: [{ name: 'A' }] } },
    async (base) => {
      const r = await (await fetch(`${base}/api/knowledge-preview`)).json();
      assert.strictEqual(r.source, 'manual');
      assert.strictEqual(r.summary.products, 1);
    });
});
