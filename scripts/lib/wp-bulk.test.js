'use strict';
// Cek wp-bulk tanpa menyentuh WordPress: httpGet/httpPost diganti tiruan
// lewat require.cache, jadi yang diuji adalah keputusannya — paging, mode
// kering, cadangan, dan penolakan hasil yang belum bersih.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const clientPath = require.resolve('./wp-client');

// Pasang tiruan SEBELUM wp-bulk dimuat, supaya ia menutup atas tiruan itu.
async function withFakeWp(handlers, fn) {
  const real = require.cache[clientPath];
  const calls = { get: [], post: [] };
  require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
      basicAuth: () => 'auth',
      httpGet: async (url) => { calls.get.push(url); return handlers.get(url); },
      httpPost: async (url, auth, body) => { calls.post.push({ url, body }); return handlers.post(url, body); }
    }
  };
  delete require.cache[require.resolve('./wp-bulk')];
  const bulk = require('./wp-bulk');
  try {
    return await fn(bulk, calls);
  } finally {
    if (real) require.cache[clientPath] = real; else delete require.cache[clientPath];
    delete require.cache[require.resolve('./wp-bulk')];
  }
}

function post(id, raw, status = 'publish') {
  return { id, status, date: '2026-01-01', slug: 's' + id, link: 'u/' + id, title: { raw: 'T' + id }, content: { raw } };
}

const API = 'https://x.test/wp-json/wp/v2';

// "per_page=100" juga mengandung "page=1", jadi includes() membuat setiap
// halaman terbaca sebagai halaman 1 dan paging tidak pernah berhenti.
const pageOf = (url) => Number((url.match(/[?&]page=(\d+)/) || [])[1]);

test('scanPosts hanya mengembalikan post yang cocok, dan menghitung yang dipindai', async () => {
  await withFakeWp({
    get: (url) => {
      if (url.includes('status=publish') && pageOf(url) === 1) {
        return { statusCode: 200, body: [post(1, 'ada TARGET di sini'), post(2, 'tidak ada')] };
      }
      return { statusCode: 200, body: [] };
    },
    post: async () => ({ statusCode: 200, body: {} })
  }, async (bulk) => {
    const r = await bulk.scanPosts({ api: API, auth: 'a', statuses: ['publish'], match: (raw) => /TARGET/.test(raw) });
    assert.strictEqual(r.scanned, 2);
    assert.strictEqual(r.hits.length, 1);
    assert.strictEqual(r.hits[0].id, 1);
  });
});

test('paging berhenti pada 400 (halaman lewat batas), bukan dianggap gagal', async () => {
  await withFakeWp({
    get: (url) => {
      if (pageOf(url) === 1) return { statusCode: 200, body: [post(1, 'X')] };
      return { statusCode: 400, body: { code: 'rest_post_invalid_page_number' } };
    },
    post: async () => ({ statusCode: 200, body: {} })
  }, async (bulk) => {
    const r = await bulk.scanPosts({ api: API, auth: 'a', statuses: ['publish'], match: () => true });
    assert.strictEqual(r.scanned, 1);
  });
});

test('scan memakai context=edit — content.rendered tidak bisa ditulis balik', async () => {
  await withFakeWp({
    get: () => ({ statusCode: 200, body: [] }),
    post: async () => ({ statusCode: 200, body: {} })
  }, async (bulk, calls) => {
    await bulk.scanPosts({ api: API, auth: 'a', statuses: ['publish'], match: () => true });
    assert.ok(calls.get[0].includes('context=edit'), 'URL scan wajib context=edit');
  });
});

test('mode kering melapor tanpa menulis apa pun', async () => {
  await withFakeWp({
    get: () => ({ statusCode: 200, body: [] }),
    post: async () => ({ statusCode: 200, body: { id: 1 } })
  }, async (bulk, calls) => {
    const r = await bulk.transformPosts({
      api: API, auth: 'a',
      posts: [{ id: 1, title: 'T', raw: 'aaa' }],
      transform: (raw) => ({ out: raw.replace('aaa', 'bbb'), notes: ['x'] }),
      apply: false
    });
    assert.strictEqual(r.changed, 1);
    assert.strictEqual(r.written, 0);
    assert.strictEqual(calls.post.length, 0, 'mode kering tidak boleh POST');
  });
});

test('apply menulis dan meninggalkan cadangan berisi markup SEBELUM edit', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpbulk-'));
  try {
    await withFakeWp({
      get: () => ({ statusCode: 200, body: [] }),
      post: async () => ({ statusCode: 200, body: { id: 1 } })
    }, async (bulk, calls) => {
      const r = await bulk.transformPosts({
        api: API, auth: 'a',
        posts: [{ id: 1, title: 'T', raw: 'lama' }],
        transform: (raw) => ({ out: raw.replace('lama', 'baru'), notes: [] }),
        apply: true, backupDir: dir
      });
      assert.strictEqual(r.written, 1);
      assert.strictEqual(calls.post[0].body.content, 'baru');
      assert.strictEqual(fs.readFileSync(path.join(dir, '1.html'), 'utf-8'), 'lama');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('apply tanpa backupDir ditolak — kesalahan massal harus punya jalan pulang', async () => {
  await withFakeWp({
    get: () => ({ statusCode: 200, body: [] }),
    post: async () => ({ statusCode: 200, body: { id: 1 } })
  }, async (bulk) => {
    await assert.rejects(
      () => bulk.transformPosts({ api: API, auth: 'a', posts: [], transform: (r) => r, apply: true }),
      /backupDir wajib/
    );
  });
});

test('verify gagal: post dilewati, tidak ditulis separuh jalan', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpbulk-'));
  try {
    await withFakeWp({
      get: () => ({ statusCode: 200, body: [] }),
      post: async () => ({ statusCode: 200, body: { id: 1 } })
    }, async (bulk, calls) => {
      const r = await bulk.transformPosts({
        api: API, auth: 'a',
        posts: [{ id: 1, title: 'T', raw: 'TARGET dan TARGET' }],
        transform: (raw) => ({ out: raw.replace('TARGET', ''), notes: [] }), // sisa satu
        apply: true, backupDir: dir,
        verify: (o) => !/TARGET/.test(o)
      });
      assert.strictEqual(r.leftover, 1);
      assert.strictEqual(r.written, 0);
      assert.strictEqual(calls.post.length, 0);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('transform yang melempar dicatat sebagai error, post lain tetap diproses', async () => {
  await withFakeWp({
    get: () => ({ statusCode: 200, body: [] }),
    post: async () => ({ statusCode: 200, body: { id: 2 } })
  }, async (bulk) => {
    const r = await bulk.transformPosts({
      api: API, auth: 'a',
      posts: [{ id: 1, title: 'A', raw: 'x' }, { id: 2, title: 'B', raw: 'x' }],
      transform: (raw, p) => { if (p.id === 1) throw new Error('regex rusak'); return { out: 'y', notes: [] }; },
      apply: false
    });
    assert.strictEqual(r.errors, 1);
    assert.strictEqual(r.changed, 1, 'post kedua tetap diproses');
  });
});

test('WordPress menolak tulisan: dicatat failed, bukan dianggap sukses', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpbulk-'));
  try {
    await withFakeWp({
      get: () => ({ statusCode: 200, body: [] }),
      post: async () => ({ statusCode: 403, body: { code: 'rest_cannot_edit' } })
    }, async (bulk) => {
      const r = await bulk.transformPosts({
        api: API, auth: 'a',
        posts: [{ id: 1, title: 'T', raw: 'lama' }],
        transform: (raw) => ({ out: 'baru', notes: [] }),
        apply: true, backupDir: dir
      });
      assert.strictEqual(r.failed, 1);
      assert.strictEqual(r.written, 0);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restoreFromBackup mengirim balik isi berkas cadangan', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpbulk-'));
  try {
    fs.writeFileSync(path.join(dir, '7.html'), 'isi lama');
    await withFakeWp({
      get: () => ({ statusCode: 200, body: [] }),
      post: async () => ({ statusCode: 200, body: { id: 7 } })
    }, async (bulk, calls) => {
      const r = await bulk.restoreFromBackup({ api: API, auth: 'a', backupDir: dir });
      assert.deepStrictEqual(r.restored, [7]);
      assert.strictEqual(calls.post[0].body.content, 'isi lama');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
