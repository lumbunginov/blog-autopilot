'use strict';
// Blueprint halaman mengikuti page builder aktif: situs tanpa builder (atau
// builder tanpa modul blueprint) tidak boleh membaca folder builder lain.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

const SECTION = [{ id: 'a1', elType: 'section', settings: {}, elements: [
  { id: 'b1', elType: 'column', settings: {}, elements: [
    { id: 'c1', elType: 'widget', widgetType: 'heading', settings: { title: 'Halo' }, elements: [] }
  ] }
] }];

async function withServer(pageBuilder, fn) {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-bp-test-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(path.join(blogDir, 'elementor', 'elementor'), { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), JSON.stringify({ page_builder: { type: pageBuilder } }));
  fs.writeFileSync(path.join(blogDir, 'elementor', 'elementor', 'contoh.json'), JSON.stringify(SECTION));

  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  require('./page-blueprints')(app, { paths, broadcast: () => {} });
  require('./config')(app, { paths, broadcast: () => {} });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); }
  finally { server.close(); fs.rmSync(skillDir, { recursive: true, force: true }); }
}

test('tanpa page builder: GET supported:false, rekam ditolak 400', async () => {
  await withServer('none', async (base) => {
    const g = await fetch(`${base}/api/page-blueprints?blog=testblog`).then(r => r.json());
    assert.strictEqual(g.supported, false);
    assert.deepStrictEqual(g.pages, []);
    const p = await fetch(`${base}/api/page-blueprints?blog=testblog`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'contoh.json', name: 'produk' })
    });
    assert.strictEqual(p.status, 400);
  });
});

test('elementor: halaman terbaca dari folder builder, rekam lalu periksa sesuai', async () => {
  await withServer('elementor', async (base) => {
    const g = await fetch(`${base}/api/page-blueprints?blog=testblog`).then(r => r.json());
    assert.strictEqual(g.supported, true);
    assert.strictEqual(g.builder.id, 'elementor');
    assert.deepStrictEqual(g.pages.map(p => p.file), ['contoh.json']);

    const rekam = await fetch(`${base}/api/page-blueprints?blog=testblog`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'contoh.json', name: 'produk' })
    }).then(r => r.json());
    assert.strictEqual(rekam.success, true);

    const cek = await fetch(`${base}/api/page-blueprints/check?blog=testblog`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(r => r.json());
    assert.strictEqual(cek.hasil[0].status, 'sesuai');
  });
});

test('GET /api/page-builders memuat elementor dari foldernya', async () => {
  await withServer('none', async (base) => {
    const list = await fetch(`${base}/api/page-builders`).then(r => r.json());
    assert.ok(list.some(b => b.id === 'elementor' && b.blueprint === true));
  });
});
