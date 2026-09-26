'use strict';
// Keputusan penjaga kuota harian, tanpa menyentuh jaringan. Tepi HTTP disuntikkan lewat
// deps.httpGet / deps.countPostsToday; SELURUH logika keputusan yang diuji di sini adalah
// logika yang dijalankan produksi.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const g = require('./daily-quota-guard');

const CFG = { wordpress: { url: 'https://x.test/' }, publish_schedule: { count: 1 } };
const clear = () => ({ count: 0 });

test('dailyQuota membaca publish_schedule.count', () => {
  assert.strictEqual(g.dailyQuota({ publish_schedule: { count: 3 } }), 3);
});

test('dailyQuota jatuh ke 1 kalau count hilang, nol, negatif, atau bukan angka', () => {
  for (const cfg of [{}, null, { publish_schedule: {} }, { publish_schedule: { count: 0 } },
                     { publish_schedule: { count: -2 } }, { publish_schedule: { count: 'dua' } }]) {
    assert.strictEqual(g.dailyQuota(cfg), 1, JSON.stringify(cfg));
  }
});

test('nextDay menyeberangi akhir bulan dan akhir tahun', () => {
  assert.strictEqual(g.nextDay('2026-09-30'), '2026-10-01');
  assert.strictEqual(g.nextDay('2026-12-31'), '2027-01-01');
  assert.strictEqual(g.nextDay('2028-02-28'), '2028-02-29'); // kabisat
});

test('siteCountUrl mengurung tepat satu hari dan menghitung publish DAN future', () => {
  const u = g.siteCountUrl('https://x.test/', '2026-09-21');
  assert.ok(u.startsWith('https://x.test/wp-json/wp/v2/posts?'), u);
  assert.ok(u.includes('after=2026-09-21T00:00:00'), u);
  assert.ok(u.includes('before=2026-09-22T00:00:00'), u);
  assert.ok(u.includes('status=publish,future'), u);
  assert.ok(!u.includes('.test//wp-json'), 'slash ganda: ' + u);
});

// Regresi: penjaga melihat 0 post pukul 05:14 dan meloloskan satu, lalu post `future`
// yang sudah terjadwal menembak pukul 07:00 -> 2 post untuk kuota 1. Post yang
// sudah terjadwal hari ini memakai kuota hari itu walau belum tayang.
test('post future bertanggal hari ini ikut memakai kuota', async () => {
  const v = await g.checkDailyQuota(CFG, '2026-09-21', {
    countPostsToday: async () => ({ count: 1 }) // 0 tayang + 1 future = 1
  });
  assert.strictEqual(v.guard, 'site_quota_reached');
  assert.strictEqual(v.siteCount, 1);
});

test('hitungan situs dikirim dengan auth dari cfg, kalau tidak WP menolak status=future', async () => {
  let seen;
  await g.checkDailyQuota(
    { ...CFG, wordpress: { url: 'https://x.test', username: 'u', app_password: 'p' } },
    '2026-09-21',
    { countPostsToday: async (_b, _t, deps) => { seen = deps.auth; return { count: 0 }; } }
  );
  assert.strictEqual(seen, Buffer.from('u:p').toString('base64'));
});

test('tanpa kredensial auth kosong -> WP menolak -> penjaga buta -> menolak', async () => {
  assert.strictEqual(g.siteAuth({ wordpress: { url: 'https://x.test' } }), '');
  const v = await g.checkDailyQuota(CFG, '2026-09-21', {
    countPostsToday: async () => ({ error: 'HTTP 400' })
  });
  assert.strictEqual(v.guard, 'site_count_unavailable');
});

test('kuota belum habis: boleh lanjut (null)', async () => {
  const v = await g.checkDailyQuota(CFG, '2026-09-21', { countPostsToday: clear });
  assert.strictEqual(v, null);
});

test('site_quota_reached saat hitungan situs SAMA DENGAN kuota (batasnya inklusif)', async () => {
  const v = await g.checkDailyQuota(CFG, '2026-09-21', { countPostsToday: async () => ({ count: 1 }) });
  assert.strictEqual(v.guard, 'site_quota_reached');
  assert.strictEqual(v.siteCount, 1);
  assert.strictEqual(v.quota, 1);
});

test('site_quota_reached saat situs melebihi kuota', async () => {
  const v = await g.checkDailyQuota(CFG, '2026-09-21', { countPostsToday: async () => ({ count: 12 }) });
  assert.strictEqual(v.guard, 'site_quota_reached');
  assert.ok(v.message.includes('12'), v.message);
});

test('kuota > 1 dihormati: 2 tayang dari kuota 3 masih boleh lanjut', async () => {
  const cfg = { ...CFG, publish_schedule: { count: 3 } };
  const v = await g.checkDailyQuota(cfg, '2026-09-21', { countPostsToday: async () => ({ count: 2 }) });
  assert.strictEqual(v, null);
});

// "Tidak terukur" tidak boleh dibaca "aman" — ini inti penjaganya, bukan pelengkap.
test('tidak terukur -> MENOLAK, dengan tanda yang BERBEDA dari kuota habis', async () => {
  const v = await g.checkDailyQuota(CFG, '2026-09-21', { countPostsToday: async () => ({ error: 'timeout 15s' }) });
  assert.strictEqual(v.guard, 'site_count_unavailable');
  assert.notStrictEqual(v.guard, 'site_quota_reached');
  assert.ok(v.message.includes('timeout 15s'), v.message);
  assert.strictEqual(v.siteCount, undefined, 'jangan mengarang hitungan saat buta');
});

test('wordpress.url hilang -> tidak terukur, bukan lanjut', async () => {
  const v = await g.checkDailyQuota({ publish_schedule: { count: 1 } }, '2026-09-21', {});
  assert.strictEqual(v.guard, 'site_count_unavailable');
});

test('countPostsToday: HTTP non-200 adalah error, bukan hitungan nol', async () => {
  const r = await g.countPostsToday('https://x.test', '2026-09-21',
    { httpGet: async () => ({ statusCode: 403, body: [] }) });
  assert.deepStrictEqual(r, { error: 'HTTP 403' });
});

test('countPostsToday: balasan bukan array adalah error, bukan hitungan nol', async () => {
  const r = await g.countPostsToday('https://x.test', '2026-09-21',
    { httpGet: async () => ({ statusCode: 200, body: { code: 'rest_no_route' } }) });
  assert.strictEqual(r.error, 'balasan situs bukan array');
});

test('countPostsToday: httpGet melempar -> error, tidak ikut melempar', async () => {
  const r = await g.countPostsToday('https://x.test', '2026-09-21',
    { httpGet: async () => { throw new Error('ECONNREFUSED'); } });
  assert.ok(r.error.includes('ECONNREFUSED'), r.error);
});

test('countPostsToday: array kosong adalah hitungan nol yang sah', async () => {
  const r = await g.countPostsToday('https://x.test', '2026-09-21',
    { httpGet: async () => ({ statusCode: 200, body: [] }) });
  assert.deepStrictEqual(r, { count: 0 });
});

test('stub PUBLISH_GUARD_SITE_COUNT memalsukan tepi tanpa jaringan', async () => {
  const f = path.join(os.tmpdir(), `sc-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  try {
    fs.writeFileSync(f, JSON.stringify({ count: 5 }));
    const r = await g.countPostsToday('https://x.test', '2026-09-21', { siteCountFile: f });
    assert.deepStrictEqual(r, { count: 5 });
    fs.writeFileSync(f, JSON.stringify({ error: 'situs mati' }));
    const e = await g.countPostsToday('https://x.test', '2026-09-21', { siteCountFile: f });
    assert.deepStrictEqual(e, { error: 'situs mati' });
  } finally { fs.rmSync(f, { force: true }); }
});

test('stub tidak terbaca -> error, bukan hitungan nol yang membuka gerbang', async () => {
  const r = await g.countPostsToday('https://x.test', '2026-09-21',
    { siteCountFile: path.join(os.tmpdir(), 'tidak-ada-' + process.pid + '.json') });
  assert.ok(r.error, JSON.stringify(r));
});
