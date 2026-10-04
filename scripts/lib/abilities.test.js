'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeClient, queryString } = require('./abilities');

// fetch palsu: catat permintaan, balas sesuai peta url → respons.
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opt = {}) => {
    calls.push({ url, method: opt.method || 'GET', body: opt.body, headers: opt.headers });
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find(k => url.startsWith(k));
    const res = key ? routes[key] : { status: 404, body: { code: 'rest_no_route', message: 'No route' } };
    return { status: res.status || 200, text: async () => JSON.stringify(res.body) };
  };
  fn.calls = calls;
  return fn;
}

const SITE = 'https://contoh.test';
const BASE = `${SITE}/wp-json/wp-abilities/v1/abilities`;
const RO = { name: 'b/baca', meta: { annotations: { readonly: true } } };
const RW = { name: 'b/tulis', meta: { annotations: { readonly: false } } };

test('queryString: input kosong tetap dikirim sebagai input=', () => {
  assert.strictEqual(queryString({}), 'input=');
  assert.strictEqual(queryString(undefined), 'input=');
});

test('queryString: objek bersarang & array jadi notasi kurung siku', () => {
  const q = decodeURIComponent(queryString({ post_id: 5, opsi: { a: true }, ids: ['x', 'y'] }));
  assert.strictEqual(q, 'input[post_id]=5&input[opsi][a]=1&input[ids][0]=x&input[ids][1]=y');
});

test('ability baca-saja dijalankan dengan GET, ability tulis dengan POST {input}', async () => {
  const f = fakeFetch({
    [`${BASE}/b/baca/run`]: { body: { ok: 'baca' } },
    [`${BASE}/b/baca`]: { body: RO },
    [`${BASE}/b/tulis/run`]: { body: { ok: 'tulis' } },
    [`${BASE}/b/tulis`]: { body: RW }
  });
  const c = makeClient({ site: SITE, auth: 'abc', fetchImpl: f });
  assert.deepStrictEqual(await c.run('b/baca', { post_id: 3 }), { ok: 'baca' });
  assert.deepStrictEqual(await c.run('b/tulis', { post_id: 3 }), { ok: 'tulis' });
  const runs = f.calls.filter(x => x.url.includes('/run'));
  assert.strictEqual(runs[0].method, 'GET');
  assert.match(runs[0].url, /input%5Bpost_id%5D=3/);
  assert.strictEqual(runs[1].method, 'POST');
  assert.deepStrictEqual(JSON.parse(runs[1].body), { input: { post_id: 3 } });
  assert.strictEqual(runs[1].headers.Authorization, 'Basic abc');
});

test('ability destruktif + idempoten dijalankan dengan DELETE, input di query string', async () => {
  const DEL = { name: 'b/hapus', meta: { annotations: { readonly: null, destructive: true, idempotent: true } } };
  const DESTRUCTIVE_ONLY = { name: 'b/buat', meta: { annotations: { destructive: true } } };
  const f = fakeFetch({
    [`${BASE}/b/hapus/run`]: { body: { ok: 'hapus' } },
    [`${BASE}/b/hapus`]: { body: DEL },
    [`${BASE}/b/buat/run`]: { body: { ok: 'buat' } },
    [`${BASE}/b/buat`]: { body: DESTRUCTIVE_ONLY }
  });
  const c = makeClient({ site: SITE, auth: 'abc', fetchImpl: f });
  assert.deepStrictEqual(await c.run('b/hapus', { post_id: 7, rules: [] }), { ok: 'hapus' });
  assert.deepStrictEqual(await c.run('b/buat', { post_id: 7 }), { ok: 'buat' });
  const runs = f.calls.filter(x => x.url.includes('/run'));
  assert.strictEqual(runs[0].method, 'DELETE');
  assert.match(runs[0].url, /input%5Bpost_id%5D=7/);
  assert.strictEqual(runs[0].body, undefined);
  assert.strictEqual(runs[1].method, 'POST');
});

test('GET membawa pemecah cache yang berbeda tiap panggilan', async () => {
  const f = fakeFetch({ [`${BASE}/b/baca/run`]: { body: {} }, [`${BASE}/b/baca`]: { body: RO } });
  const c = makeClient({ site: SITE, auth: 'abc', fetchImpl: f });
  await c.run('b/baca', { post_id: 1 }); await c.run('b/baca', { post_id: 1 });
  const nc = f.calls.filter(x => x.url.includes('/run')).map(x => new URL(x.url).searchParams.get('_nc'));
  assert.ok(nc[0] && nc[1] && nc[0] !== nc[1]);
});

test('deskripsi ability di-cache: dua run hanya satu describe', async () => {
  const f = fakeFetch({ [`${BASE}/b/baca/run`]: { body: {} }, [`${BASE}/b/baca`]: { body: RO } });
  const c = makeClient({ site: SITE, auth: 'abc', fetchImpl: f });
  await c.run('b/baca'); await c.run('b/baca');
  assert.strictEqual(f.calls.filter(x => !x.url.includes('/run')).length, 1);
});

test('galat ability dilempar dengan kode dan pesan server, bukan JSON mentah', async () => {
  const f = fakeFetch({
    [`${BASE}/b/tulis/run`]: { status: 500, body: { code: 'batch_failed', message: 'Operation 1 failed', data: { failed_index: 1 } } },
    [`${BASE}/b/tulis`]: { body: RW }
  });
  const c = makeClient({ site: SITE, auth: 'abc', fetchImpl: f });
  await assert.rejects(c.run('b/tulis', {}), e => {
    assert.match(e.message, /batch_failed/);
    assert.match(e.message, /Operation 1 failed/);
    assert.strictEqual(e.status, 500);
    assert.deepStrictEqual(e.data, { failed_index: 1 });
    return true;
  });
});

test('list menelusuri halaman dan bisa disaring per namespace', async () => {
  const f = fakeFetch({ [`${BASE}?per_page=100&page=1`]: { body: [{ name: 'b/satu' }, { name: 'lain/dua' }] } });
  const c = makeClient({ site: SITE, auth: 'abc', fetchImpl: f });
  assert.deepStrictEqual((await c.list('b')).map(a => a.name), ['b/satu']);
});

test('situs tanpa ability itu: galat menyebut kode server', async () => {
  const c = makeClient({ site: SITE, auth: 'abc', fetchImpl: fakeFetch({}) });
  await assert.rejects(c.describe('b/baca'), /rest_no_route/);
});
