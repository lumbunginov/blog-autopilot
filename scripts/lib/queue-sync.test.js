'use strict';
// Keputusan queue-sync tanpa menyentuh jaringan: tepi HTTP disuntikkan.
// Yang diuji adalah apa yang DILAKUKAN modul, bukan bahwa ia mengembalikan objek.
const test = require('node:test');
const assert = require('node:assert');
const { refreshDraftQueue, fetchLiveDrafts, mergeDrafts, draftListUrl, siteAuth } =
  require('./queue-sync');

const CFG = { wordpress: { url: 'https://x.test/', username: 'u', app_password: 'p' } };

function post(id, date, status = 'draft') {
  return {
    id, date: `${date}T00:00:00`, modified: `${date}T00:00:00`, status,
    title: { rendered: `Judul ${id}` }, slug: `s-${id}`, link: `https://x.test/${id}`, categories: []
  };
}
function cacheOf(articles, lastSync = '2026-09-08T12:00:00.000Z') {
  return { lastSync, totalCount: articles.length, articles };
}
function art(id, date, status = 'draft') {
  return { id, title: `Judul ${id}`, status, date, modified: date, slug: `s-${id}`, url: `https://x.test/${id}` };
}
// Tepi palsu. `calls` merekam apa yang benar-benar dikirim.
function fakeGet(res, calls = []) {
  return async (url, auth, timeout) => {
    calls.push({ url, auth, timeout });
    if (res instanceof Error) throw res;
    return res;
  };
}

// ---- URL & auth ----

test('URL meminta HANYA draft, halaman penuh, terurut', () => {
  const u = draftListUrl('https://x.test/');
  assert.ok(u.includes('status=draft'), 'harus menyaring status=draft');
  assert.ok(u.includes('per_page=100'));
  assert.ok(u.startsWith('https://x.test/wp-json/wp/v2/posts?'), u);
  assert.ok(!u.includes('//wp-json'), 'slash ganda: ' + u);
});

test('URL membawa field yang dibutuhkan mapPost', () => {
  const u = draftListUrl('https://x.test');
  for (const f of ['id', 'title', 'status', 'date', 'modified', 'slug', 'link', 'categories']) {
    assert.ok(u.includes(f), `field ${f} hilang dari _fields`);
  }
});

test('auth kosong kalau kredensial belum ada, bukan "Basic undefined"', () => {
  assert.strictEqual(siteAuth({ wordpress: { url: 'https://x.test' } }), '');
  assert.strictEqual(siteAuth({}), '');
  assert.strictEqual(siteAuth(CFG), Buffer.from('u:p').toString('base64'));
});

test('refreshDraftQueue benar-benar MENGIRIM auth dari config', async () => {
  const calls = [];
  await refreshDraftQueue(CFG, cacheOf([]), {
    httpGet: fakeGet({ statusCode: 200, body: [], totalPages: 1 }, calls)
  });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].auth, Buffer.from('u:p').toString('base64'));
});

// ---- kegagalan harus terbaca sebagai kegagalan, bukan "kosong" ----

test('HTTP 401 adalah error, BUKAN daftar draft kosong', async () => {
  const r = await fetchLiveDrafts('https://x.test', {
    httpGet: fakeGet({ statusCode: 401, body: { code: 'rest_forbidden' }, totalPages: 1 })
  });
  assert.strictEqual(r.drafts, undefined);
  assert.match(r.error, /401/);
});

test('badan bukan array adalah error, bukan nol draft', async () => {
  const r = await fetchLiveDrafts('https://x.test', {
    httpGet: fakeGet({ statusCode: 200, body: { code: 'oops' }, totalPages: 1 })
  });
  assert.match(r.error, /bukan array/);
});

test('lebih dari satu halaman adalah "tidak terukur", bukan daftar separuh', async () => {
  const r = await fetchLiveDrafts('https://x.test', {
    httpGet: fakeGet({ statusCode: 200, body: [post(1, '2026-09-01')], totalPages: 3 })
  });
  assert.strictEqual(r.drafts, undefined);
  assert.match(r.error, /tidak terukur/);
});

test('jaringan melempar: dilaporkan sebagai error, tidak ikut melempar', async () => {
  const r = await fetchLiveDrafts('https://x.test', { httpGet: fakeGet(new Error('ECONNRESET')) });
  assert.match(r.error, /ECONNRESET/);
});

test('wordpress.url tidak ada: error, dan tidak ada request yang ditembakkan', async () => {
  const calls = [];
  const r = await fetchLiveDrafts('', { httpGet: fakeGet({ statusCode: 200, body: [] }, calls) });
  assert.match(r.error, /wordpress/);
  assert.strictEqual(calls.length, 0);
});

test('refreshDraftQueue meneruskan kegagalan sebagai ok:false, cache tidak disentuh', async () => {
  const r = await refreshDraftQueue(CFG, cacheOf([art(1, '2026-07-01')]), {
    httpGet: fakeGet({ statusCode: 500, body: {}, totalPages: 1 })
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.cache, undefined, 'kegagalan tidak boleh mengembalikan cache baru');
  assert.match(r.error, /500/);
});

// ---- merge: inilah kebocoran yang jadi alasan modul ini ada ----

test('draft yang ada di situs tapi absen dari cache DITAMBAHKAN', () => {
  // Persis bentuk kejadian 2026-09-21: cache entri lama, situs punya satu draft baru.
  const r = mergeDrafts(cacheOf([art(1, '2026-07-01'), art(9, '2026-08-01', 'publish')]),
    [post(1, '2026-07-01'), post(11995, '2026-09-19')]);
  assert.deepStrictEqual(r.added, [11995]);
  const added = r.cache.articles.find(a => a.id === 11995);
  assert.strictEqual(added.status, 'draft');
  assert.strictEqual(added.date, '2026-09-19');
  assert.strictEqual(added.title, 'Judul 11995');
});

test('entri yang sudah ada TIDAK ditimpa (kategori hasil full-sync tidak hilang)', () => {
  const existing = { ...art(1, '2026-07-01'), category: 'Sewa Mic' };
  const r = mergeDrafts(cacheOf([existing]), [post(1, '2026-07-01')]);
  assert.deepStrictEqual(r.added, []);
  assert.strictEqual(r.cache.articles.find(a => a.id === 1).category, 'Sewa Mic');
});

test('cache bilang draft tapi situs tidak: jadi ghost, dan TIDAK dihapus dari cache', () => {
  const r = mergeDrafts(cacheOf([art(1, '2026-07-01'), art(2, '2026-07-02')]),
    [post(2, '2026-07-02')]);
  assert.deepStrictEqual(r.ghosts, [1]);
  assert.ok(r.cache.articles.some(a => a.id === 1), 'ghost tetap ada di cache');
});

test('post publish di cache bukan ghost meski tidak muncul di daftar draft', () => {
  const r = mergeDrafts(cacheOf([art(9, '2026-08-01', 'publish')]), []);
  assert.deepStrictEqual(r.ghosts, []);
});

test('draft yang baru ditambahkan tidak pernah dihitung sebagai ghost-nya sendiri', () => {
  const r = mergeDrafts(cacheOf([]), [post(11995, '2026-09-19')]);
  assert.deepStrictEqual(r.added, [11995]);
  assert.deepStrictEqual(r.ghosts, []);
});

test('lastSync diperbarui dan totalCount cocok dengan panjang articles', () => {
  const before = '2026-09-08T12:00:00.000Z';
  const r = mergeDrafts(cacheOf([art(1, '2026-07-01')], before),
    [post(1, '2026-07-01'), post(2, '2026-09-19')]);
  assert.notStrictEqual(r.cache.lastSync, before);
  assert.strictEqual(r.cache.totalCount, r.cache.articles.length);
  assert.strictEqual(r.cache.totalCount, 2);
});

test('cache kosong/rusak tidak bikin crash: diperlakukan sebagai nol artikel', () => {
  const r = mergeDrafts({ articles: null }, [post(5, '2026-09-01')]);
  assert.deepStrictEqual(r.added, [5]);
  assert.strictEqual(r.cache.totalCount, 1);
});

test('jalur lengkap: 200 + array -> ok:true dengan added dan ghosts terhitung', async () => {
  const r = await refreshDraftQueue(CFG, cacheOf([art(1, '2026-07-01'), art(2, '2026-07-02')]), {
    httpGet: fakeGet({ statusCode: 200, body: [post(2, '2026-07-02'), post(77, '2026-09-20')], totalPages: 1 })
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.added, [77]);
  assert.deepStrictEqual(r.ghosts, [1]);
});
