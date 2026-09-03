'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function baRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgroute-ba-'));
  const dir = path.join(root, 'perkapcom');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({
    nama: 'Perkap.com', deskripsi: 'Sewa alat panitia.', targetMarket: 'Panitia',
    toneOfVoice: 'santai', kataHindari: ['Termurah']
  }));
  fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify([
    { id: 'ht', nama: 'Sewa HT', harga: 'Rp 35.000',
      konteks: 'Detail https://perkap.com/sewa-ht/', faq: 'tanya jawab' }
  ]));
  return root;
}

function setupApp(configObj) {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgroute-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), JSON.stringify(configObj, null, 2));
  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  require('./config')(app, { paths });
  require('./blogs')(app, { paths });
  return { app, configFile: path.join(blogDir, 'config.json') };
}

async function withServer(configObj, fn) {
  const { app, configFile } = setupApp(configObj);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, configFile); } finally { server.close(); }
}

const MANUAL = {
  wordpress: { url: 'https://x.test', username: 'u' },
  knowledge_base: { business_name: 'Manual Inc', products: [{ name: 'A', url: '' }] }
};

function baConfig(root) {
  return {
    wordpress: { url: 'https://perkap.com', username: 'u' },
    knowledge_base: { business_name: 'Manual Inc', products: [{ name: 'A', url: '' }] },
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  };
}

test('GET /api/config mode manual tidak berubah perilakunya', async () => {
  await withServer(MANUAL, async (base) => {
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Manual Inc');
    assert.strictEqual(r._knowledge.source, 'manual');
    assert.strictEqual(r._knowledge.error, null);
  });
});

test('GET /api/config mode business_asset mengembalikan data live', async () => {
  await withServer(baConfig(baRoot()), async (base) => {
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
    assert.strictEqual(r.knowledge_base.products.length, 1);
    assert.strictEqual(r.knowledge_base.products[0].url, 'https://perkap.com/sewa-ht/');
    assert.strictEqual(r._knowledge.source, 'business_asset');
  });
});

test('GET /api/config tidak pernah mengirim konteks atau faq produk', async () => {
  await withServer(baConfig(baRoot()), async (base) => {
    const body = await (await fetch(`${base}/api/config`)).text();
    assert.ok(!body.includes('tanya jawab'), 'faq tidak boleh ikut');
    assert.ok(!body.includes('konteks'));
  });
});

test('POST /api/config mode business_asset TIDAK menulis knowledge_base ke disk', async () => {
  await withServer(baConfig(baRoot()), async (base, configFile) => {
    const res = await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: { business_name: 'DISUSUPI' }, workflow: { language: 'en' } })
    });
    const out = await res.json();
    assert.strictEqual(out.success, true);
    assert.ok(out.warning && out.warning.includes('knowledge_base'));
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_base.business_name, 'Manual Inc', 'cadangan manual harus utuh');
    assert.strictEqual(saved.workflow.language, 'en', 'field lain tetap tersimpan');
  });
});

test('POST /api/config mode manual tetap menyimpan knowledge_base', async () => {
  await withServer(MANUAL, async (base, configFile) => {
    await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: { business_name: 'Diubah' } })
    });
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_base.business_name, 'Diubah');
  });
});

test('POST /api/config bisa mengganti knowledge_source ke business_asset', async () => {
  const root = baRoot();
  await withServer(MANUAL, async (base, configFile) => {
    await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
      })
    });
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_source.type, 'business_asset');
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
  });
});

test('mode business_asset dengan folder salah: GET tetap 200 dan menyebut errornya', async () => {
  const cfg = baConfig(baRoot());
  cfg.knowledge_source.business_asset.business_id = 'tidakada';
  await withServer(cfg, async (base) => {
    const res = await fetch(`${base}/api/config`);
    assert.strictEqual(res.status, 200);
    const r = await res.json();
    assert.ok(r._knowledge.error.includes('tidakada'));
  });
});

test('GET /api/blogs/:id/config ikut memakai resolver', async () => {
  await withServer(baConfig(baRoot()), async (base) => {
    const r = await (await fetch(`${base}/api/blogs/testblog/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
    assert.strictEqual(r._knowledge.source, 'business_asset');
  });
});

test('PUT /api/blogs/:id/config juga menolak knowledge_base di mode business_asset', async () => {
  await withServer(baConfig(baRoot()), async (base, configFile) => {
    const out = await (await fetch(`${base}/api/blogs/testblog/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: { business_name: 'DISUSUPI' } })
    })).json();
    assert.ok(out.warning && out.warning.includes('knowledge_base'));
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_base.business_name, 'Manual Inc');
  });
});
