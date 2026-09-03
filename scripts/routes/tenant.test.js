'use strict';
// Cek fix-wave review final: tenant yang tidak ada tidak boleh diam-diam
// dibuat (POST /api/config) dan tidak boleh menyebabkan 500 HTML mentah
// (POST /api/plans, POST /api/agent-queue). Juga cek sanitasi id pada
// GET /api/blogs/:id/config (Minor 4).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function setupApp() {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-guard-test-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), '{}');

  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  const deps = { paths, broadcast: () => {} };
  require('./config')(app, deps);
  require('./plans')(app, deps);
  require('./queue')(app, deps);
  require('./blogs')(app, deps);
  return { app, skillDir, paths };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function withServer(fn) {
  const { app, skillDir, paths } = setupApp();
  const server = await listen(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, skillDir, paths); }
  finally {
    server.close();
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

test('POST /api/config dengan tenant yang tidak ada: JSON error bersih, TIDAK membuat direktori tenant', async () => {
  await withServer(async (base, skillDir, paths) => {
    const res = await fetch(`${base}/api/config?blog=hantu`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ foo: 'bar' })
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get('content-type').includes('application/json'), true);
    const body = await res.json();
    assert.match(body.error, /hantu/);
    assert.strictEqual(paths.listBlogs().includes('hantu'), false);
  });
});

test('POST /api/plans dengan tenant yang tidak ada: JSON error bersih, bukan 500 HTML', async () => {
  await withServer(async (base, skillDir, paths) => {
    const res = await fetch(`${base}/api/plans?blog=hantu`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword: 'uji' })
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get('content-type').includes('application/json'), true);
    const body = await res.json();
    assert.match(body.error, /hantu/);
    assert.strictEqual(paths.listBlogs().includes('hantu'), false);
  });
});

test('POST /api/agent-queue dengan tenant yang tidak ada: JSON error bersih, bukan 500 HTML', async () => {
  await withServer(async (base, skillDir, paths) => {
    const res = await fetch(`${base}/api/agent-queue?blog=hantu`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'auto_generate', input: { count: 1 } })
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get('content-type').includes('application/json'), true);
    const body = await res.json();
    assert.match(body.error, /hantu/);
    assert.strictEqual(paths.listBlogs().includes('hantu'), false);
  });
});

test('PATCH /api/agent-queue dengan tenant yang tidak ada: JSON error bersih (404), bukan 500', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/agent-queue?blog=hantu`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'task_1', status: 'done' })
    });
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /hantu/);
  });
});

test('GET /api/plans dan /api/agent-queue tetap toleran (blog aktif, tanpa file plans/queue)', async () => {
  await withServer(async (base) => {
    const plans = await fetch(`${base}/api/plans?blog=testblog`);
    assert.strictEqual(plans.status, 200);
    assert.deepStrictEqual(await plans.json(), { plans: [] });

    const queue = await fetch(`${base}/api/agent-queue?blog=testblog`);
    assert.strictEqual(queue.status, 200);
    assert.deepStrictEqual(await queue.json(), { tasks: [] });
  });
});

test('GET /api/blogs/:id/config dengan id ber-huruf-besar tetap membaca marker kredensial folder yang tersanitasi', async () => {
  await withServer(async (base, skillDir) => {
    const blogDir = path.join(skillDir, 'data', 'blogs', 'perkapcom');
    fs.mkdirSync(blogDir, { recursive: true });
    fs.writeFileSync(path.join(blogDir, 'config.json'), '{}');
    process.env.PERKAPCOM_WP_APP_PASSWORD = 'dummy-not-a-real-secret';
    try {
      const res = await fetch(`${base}/api/blogs/Perkap.com/config`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body._credentials.wpPasswordSet, true);
    } finally {
      delete process.env.PERKAPCOM_WP_APP_PASSWORD;
    }
  });
});
