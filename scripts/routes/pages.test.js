'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

// resolveCredentials mengambil app password dari env, bukan dari config.json.
process.env.TESTBLOG_WP_APP_PASSWORD = 'rahasia';

function setupApp({ withCache }) {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-test-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), JSON.stringify({
    wordpress: { url: 'https://x.test', username: 'u' }
  }));
  if (withCache) {
    fs.writeFileSync(path.join(blogDir, 'pages-cache.json'), JSON.stringify({
      lastSync: '2026-01-01T00:00:00.000Z',
      totalCount: 1,
      articles: [{ id: 9, title: 'Tentang Kami', slug: 'tentang', status: 'publish' }]
    }));
  }

  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  const state = { syncState: { done: true }, pagesSyncState: { done: true, updated: 0, lastSync: null } };
  require('./pages')(app, { paths, state, broadcast: () => {} });
  return { app, skillDir };
}

async function withServer(opts, fn) {
  const { app, skillDir } = setupApp(opts);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally {
    server.close();
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

test('cache pages kosong: balas daftar kosong dan tandai sedang sinkron', async () => {
  await withServer({ withCache: false }, async (base) => {
    const body = await (await fetch(`${base}/api/pages?blog=testblog`)).json();
    assert.deepStrictEqual(body.articles, []);
    assert.strictEqual(body.totalCount, 0);
    assert.strictEqual(body.syncing, true);
  });
});

test('nosync=true: baca cache pages tanpa memanggil WordPress', async () => {
  await withServer({ withCache: true }, async (base) => {
    const body = await (await fetch(`${base}/api/pages?blog=testblog&nosync=true`)).json();
    assert.strictEqual(body.syncing, false);
    assert.strictEqual(body.totalCount, 1);
    assert.strictEqual(body.articles[0].title, 'Tentang Kami');
  });
});

test('pages memakai cache sendiri, bukan cache artikel', async () => {
  await withServer({ withCache: true }, async (base) => {
    const body = await (await fetch(`${base}/api/pages?blog=testblog&nosync=true`)).json();
    assert.strictEqual(body.articles[0].id, 9);
  });
});
