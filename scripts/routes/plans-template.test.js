'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function setupApp() {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-tpl-'));
  fs.mkdirSync(path.join(skillDir, 'data', 'blogs', 'testblog'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'data', 'blogs', '_active'), 'testblog');
  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  require('./plans')(app, { paths, broadcast: () => {} });
  return { app, paths };
}

function serve(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('template_id tersimpan dan terbaca kembali', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  await fetch(url + '/api/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'plan_x', keyword: 'sewa ht', template_id: 'tpl_123' })
  });
  const r = await (await fetch(url + '/api/plans')).json();
  assert.equal(r.plans[0].template_id, 'tpl_123');
  server.close();
});

test('rencana tanpa template_id tetap tersimpan tanpa field itu', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  await fetch(url + '/api/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'plan_y', keyword: 'sewa proyektor' })
  });
  const r = await (await fetch(url + '/api/plans')).json();
  assert.equal(r.plans[0].template_id, undefined);
  server.close();
});

test('template_id bukan string dinormalkan jadi string kosong', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  await fetch(url + '/api/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'plan_z', keyword: 'k', template_id: { jahat: true } })
  });
  const r = await (await fetch(url + '/api/plans')).json();
  assert.equal(r.plans[0].template_id, '');
  server.close();
});

test('mengosongkan template_id pada rencana yang sudah punya berhasil', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const kirim = (body) => fetch(url + '/api/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  await kirim({ id: 'plan_a', keyword: 'k', template_id: 'tpl_1' });
  await kirim({ id: 'plan_a', keyword: 'k', template_id: '' });
  const r = await (await fetch(url + '/api/plans')).json();
  assert.equal(r.plans[0].template_id, '');
  server.close();
});
