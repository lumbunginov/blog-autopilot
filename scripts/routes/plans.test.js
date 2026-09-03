'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function setupApp() {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plans-test-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), '{}');
  fs.writeFileSync(path.join(blogDir, 'articles-cache.json'), JSON.stringify({
    articles: [
      { id: 1, title: 'Artikel Lama', slug: 'taken-slug', url: 'https://x.test/a/', status: 'publish' }
    ]
  }));

  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  require('./plans')(app, { paths, broadcast: () => {} });
  return { app, skillDir, paths };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function withServer(fn) {
  const { app, skillDir } = setupApp();
  const server = await listen(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); }
  finally {
    server.close();
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

function post(base, body) {
  return fetch(`${base}/api/plans?blog=testblog`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}

test('allow_duplicate string "false" tidak melewati guard (harus tetap 409)', async () => {
  await withServer(async (base) => {
    const res = await post(base, { id: 'p1', keyword: 'uji', slug: 'taken-slug', allow_duplicate: 'false' });
    assert.strictEqual(res.status, 409);
  });
});

test('allow_duplicate angka 1 tidak melewati guard (harus tetap 409)', async () => {
  await withServer(async (base) => {
    const res = await post(base, { id: 'p1', keyword: 'uji', slug: 'taken-slug', allow_duplicate: 1 });
    assert.strictEqual(res.status, 409);
  });
});

test('allow_duplicate boolean true melewati guard (200)', async () => {
  await withServer(async (base) => {
    const res = await post(base, { id: 'p1', keyword: 'uji', slug: 'taken-slug', allow_duplicate: true });
    assert.strictEqual(res.status, 200);
  });
});

test('update plan minimal tidak menghapus field yang tidak disebut (merge, bukan replace)', async () => {
  await withServer(async (base) => {
    const create = await post(base, {
      id: 'p2', keyword: 'uji', slug: 'slug-baru-p2', title: 'Judul Asli', notes: 'catatan penting'
    });
    assert.strictEqual(create.status, 200);

    const update = await post(base, { id: 'p2', keyword: 'uji', slug: 'slug-baru-p2' });
    assert.strictEqual(update.status, 200);

    const list = await (await fetch(`${base}/api/plans?blog=testblog`)).json();
    const saved = list.plans.find(p => p.id === 'p2');
    assert.strictEqual(saved.title, 'Judul Asli');
    assert.strictEqual(saved.notes, 'catatan penting');
  });
});

test('update plan yang tetap memakai slug miliknya sendiri tidak 409', async () => {
  await withServer(async (base) => {
    // plan ini "memiliki" slug yang sudah ada di cache (mis. artikelnya sudah terbit dari plan ini)
    const create = await post(base, { id: 'p3', keyword: 'uji', slug: 'taken-slug', allow_duplicate: true });
    assert.strictEqual(create.status, 200);

    const update = await post(base, { id: 'p3', keyword: 'uji', slug: 'taken-slug', status: 'published' });
    assert.strictEqual(update.status, 200);
  });
});

test('plan baru dengan slug yang sudah dipakai tetap 409', async () => {
  await withServer(async (base) => {
    const res = await post(base, { id: 'p4-baru', keyword: 'uji', slug: 'taken-slug' });
    assert.strictEqual(res.status, 409);
  });
});
