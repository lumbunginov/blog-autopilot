'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function setupApp() {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-route-'));
  fs.mkdirSync(path.join(skillDir, 'data', 'blogs', 'testblog'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'data', 'blogs', '_active'), 'testblog');
  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  require('./templates')(app, { paths });
  return { app, paths, skillDir };
}

function serve(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({
      server,
      url: `http://127.0.0.1:${server.address().port}`
    }));
  });
}

async function panggil(url, jalur, opts = {}) {
  const res = await fetch(url + jalur, opts);
  return { status: res.status, body: await res.json() };
}

test('GET mengembalikan daftar kosong saat file belum ada', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const r = await panggil(url, '/api/templates');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.templates, []);
  server.close();
});

test('POST membuat template dan GET mengembalikannya', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const buat = await panggil(url, '/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Transaksional', article_prompt: 'tulis {keyword}' })
  });
  assert.equal(buat.status, 200);
  assert.equal(buat.body.created, true);
  assert.match(buat.body.id, /^tpl_\d+_[a-z0-9]+$/);

  const daftar = await panggil(url, '/api/templates');
  assert.equal(daftar.body.templates.length, 1);
  assert.equal(daftar.body.templates[0].article_prompt, 'tulis {keyword}');
  server.close();
});

test('POST tanpa nama ditolak 400', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const r = await panggil(url, '/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article_prompt: 'x' })
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /nama/i);
  server.close();
});

test('POST kedua dengan id yang sama mengubah, tidak menggandakan', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const buat = await panggil(url, '/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Awal' })
  });
  const ubah = await panggil(url, '/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buat.body.id, name: 'Ubah' })
  });
  assert.equal(ubah.body.created, false);
  const daftar = await panggil(url, '/api/templates');
  assert.equal(daftar.body.templates.length, 1);
  assert.equal(daftar.body.templates[0].name, 'Ubah');
  server.close();
});

test('DELETE menghapus; id tak dikenal 404', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const buat = await panggil(url, '/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X' })
  });
  const hapus = await panggil(url, '/api/templates', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buat.body.id })
  });
  assert.equal(hapus.status, 200);
  const lagi = await panggil(url, '/api/templates', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buat.body.id })
  });
  assert.equal(lagi.status, 404);
  server.close();
});

test('DELETE tanpa id ditolak 400', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const r = await panggil(url, '/api/templates', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  assert.equal(r.status, 400);
  server.close();
});

test('POST ke blog yang tidak ada ditolak 404, tidak membuat tenant baru', async () => {
  const { app, skillDir } = setupApp();
  const { server, url } = await serve(app);
  const r = await panggil(url, '/api/templates?blog=tidakada', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X' })
  });
  assert.equal(r.status, 404);
  assert.equal(fs.existsSync(path.join(skillDir, 'data', 'blogs', 'tidakada')), false);
  server.close();
});

test('template tersimpan ke file tenant yang benar', async () => {
  const { app, paths } = setupApp();
  const { server, url } = await serve(app);
  await panggil(url, '/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X' })
  });
  const isi = JSON.parse(fs.readFileSync(paths.templatesPath('testblog'), 'utf-8'));
  assert.equal(isi.templates.length, 1);
  server.close();
});
