'use strict';
// Cek keputusan publish-drafts TANPA menyentuh jaringan: hari jalan, saringan
// minDate, urutan FIFO, batas jumlah. Yang memanggil WordPress diuji lewat
// --dry-run, yang berhenti tepat sebelum request.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SKILL_DIR = path.join(__dirname, '..');
const SCRIPT = path.join(__dirname, 'publish-drafts.js');

function article(id, date, status) {
  return { id, title: `Artikel ${id}`, status, date, slug: `a-${id}`, url: `https://x.test/${id}` };
}

// Tenant sementara di dalam data/blogs supaya paths.js menemukannya, lalu
// dibuang lagi. Tenant produksi tidak pernah disentuh.
function withTenant(cfgExtra, articles, fn) {
  const id = 'zz-test-' + process.pid + '-' + Math.random().toString(36).slice(2, 8);
  const dir = path.join(SKILL_DIR, 'data', 'blogs', id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
      wordpress: { url: 'https://x.test', username: 'u' },
      image_api: { type: 'none' },
      ...cfgExtra
    }));
    fs.writeFileSync(path.join(dir, 'articles-cache.json'), JSON.stringify({
      lastSync: new Date().toISOString(), totalCount: articles.length, articles
    }));
    return fn(id);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function run(id, extraArgs = []) {
  const env = { ...process.env };
  // resolveCredentials menuntut password ada; nilainya tak pernah dipakai
  // karena setiap test berhenti sebelum request keluar.
  env[id.toUpperCase().replace(/-/g, '_') + '_WP_APP_PASSWORD'] = 'x';
  let out;
  try {
    out = execFileSync('node', [SCRIPT, '--blog', id, ...extraArgs], { encoding: 'utf-8', env });
  } catch (e) {
    out = e.stdout || '';
  }
  return JSON.parse(out);
}

const DRAFTS = [
  article(1, '2018-12-24', 'draft'),
  article(2, '2024-05-15', 'draft'),
  article(3, '2026-05-25', 'draft'),
  article(4, '2026-07-01', 'draft'),
  article(5, '2026-08-29', 'draft'),
  article(9, '2026-08-01', 'publish')
];

test('hari yang tidak terdaftar di runDays: tidak menerbitkan apa pun, tapi bukan error', () => {
  // runDays kosong-arti: pakai hari yang PASTI bukan hari ini.
  const today = new Date().getDay();
  const otherDay = (today + 1) % 7;
  withTenant({ publish_schedule: { runDays: [otherDay] } }, DRAFTS, (id) => {
    const r = run(id, ['--dry-run']);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.scheduled, false);
    assert.deepStrictEqual(r.published, []);
  });
});

test('hari jalan: memilih draft TERTUA yang memenuhi minDate (FIFO)', () => {
  const today = new Date().getDay();
  withTenant({ publish_schedule: { runDays: [today], count: 1, minDate: '2026-01-01' } }, DRAFTS, (id) => {
    const r = run(id, ['--dry-run']);
    assert.strictEqual(r.scheduled, true);
    assert.strictEqual(r.wouldPublish.length, 1);
    assert.strictEqual(r.wouldPublish[0].id, 3, 'harus draft 2026 tertua, bukan yang 2018/2024');
  });
});

test('minDate menyaring draft lawas dan melaporkan jumlahnya', () => {
  const today = new Date().getDay();
  withTenant({ publish_schedule: { runDays: [today], minDate: '2026-01-01' } }, DRAFTS, (id) => {
    const r = run(id, ['--dry-run']);
    assert.strictEqual(r.draftsTotal, 5);
    assert.strictEqual(r.draftsEligible, 3);
    assert.strictEqual(r.skippedOlderThanMinDate, 2);
  });
});

test('count membatasi jumlah per hari jalan, dan sisa dilaporkan', () => {
  const today = new Date().getDay();
  withTenant({ publish_schedule: { runDays: [today], count: 2, minDate: '2026-01-01' } }, DRAFTS, (id) => {
    const r = run(id, ['--dry-run']);
    assert.deepStrictEqual(r.wouldPublish.map(a => a.id), [3, 4]);
    assert.strictEqual(r.remainingAfter, 1);
  });
});

test('--count di baris perintah menang atas config', () => {
  const today = new Date().getDay();
  withTenant({ publish_schedule: { runDays: [today], count: 1, minDate: '2026-01-01' } }, DRAFTS, (id) => {
    const r = run(id, ['--dry-run', '--count', '3']);
    assert.strictEqual(r.wouldPublish.length, 3);
  });
});

test('--force menjalankan di hari mana pun', () => {
  const otherDay = (new Date().getDay() + 1) % 7;
  withTenant({ publish_schedule: { runDays: [otherDay] } }, DRAFTS, (id) => {
    const r = run(id, ['--dry-run', '--force']);
    assert.strictEqual(r.scheduled, true);
    assert.ok(r.wouldPublish.length > 0);
  });
});

test('tidak ada draft memenuhi syarat: ok, antrean kosong', () => {
  const today = new Date().getDay();
  const onlyOld = [article(1, '2018-12-24', 'draft'), article(9, '2026-08-01', 'publish')];
  withTenant({ publish_schedule: { runDays: [today], minDate: '2026-01-01' } }, onlyOld, (id) => {
    const r = run(id, ['--dry-run']);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.draftsEligible, 0);
    assert.deepStrictEqual(r.published, []);
  });
});

test('post berstatus publish tidak pernah ikut terpilih', () => {
  const today = new Date().getDay();
  withTenant({ publish_schedule: { runDays: [today], count: 10, minDate: '2026-01-01' } }, DRAFTS, (id) => {
    const r = run(id, ['--dry-run']);
    assert.ok(!r.wouldPublish.some(a => a.id === 9));
  });
});

test('default dipakai saat publish_schedule tidak ada di config', () => {
  withTenant({}, DRAFTS, (id) => {
    const r = run(id, ['--dry-run', '--force']);
    // default count = 1, minDate 2026-01-01 → draft 2026 tertua
    assert.strictEqual(r.wouldPublish.length, 1);
    assert.strictEqual(r.wouldPublish[0].id, 3);
  });
});

test('blog yang tidak ada ditolak dengan ok:false, bukan crash', () => {
  let out;
  try {
    out = execFileSync('node', [SCRIPT, '--blog', 'tidak-ada-tenant-ini', '--dry-run'], { encoding: 'utf-8' });
  } catch (e) {
    out = e.stdout || '';
  }
  const r = JSON.parse(out);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /tidak ditemukan/i);
});
