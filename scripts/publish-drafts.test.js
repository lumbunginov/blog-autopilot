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

// ---------------------------------------------------------------------------
// Kuota HARIAN pada jalur terbit SUNGGUHAN (tanpa --dry-run).
//
// Ini bagian yang dulu tidak ada dan yang pernah membuat `count: 1` jadi 12 post sehari:
// batch dibatasi per pemanggilan, tidak ada yang menghitung ulang di tujuan.
//
// Tepi jaringan dipalsukan di DUA sisi supaya test menguji keputusan, bukan konektivitas:
//   - hitungan situs  -> stub JSON lewat PUBLISH_GUARD_SITE_COUNT
//   - POST ke WordPress -> wordpress.url diarahkan ke port tertutup di localhost.
// Karena itu setiap test di bawah bisa membedakan TIDAK MENCOBA dari MENCOBA LALU GAGAL:
// kalau penjaga bocor, skrip menembak port mati dan `failed` terisi. `failed` kosong +
// `published` kosong hanya mungkin kalau POST-nya memang tidak pernah terjadi.
const DEAD_WP = 'http://127.0.0.1:9';   // port discard, selalu menolak koneksi

function withSiteCount(stub, fn) {
  const f = path.join(os.tmpdir(), `sc-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify(stub));
  const prev = process.env.PUBLISH_GUARD_SITE_COUNT;
  process.env.PUBLISH_GUARD_SITE_COUNT = f;
  try { return fn(); }
  finally {
    if (prev === undefined) delete process.env.PUBLISH_GUARD_SITE_COUNT;
    else process.env.PUBLISH_GUARD_SITE_COUNT = prev;
    fs.rmSync(f, { force: true });
  }
}

const liveToday = () => new Date().getDay();

test('KUOTA: situs sudah penuh hari ini -> tidak ada POST sama sekali', () => {
  withSiteCount({ count: 1 }, () => {
    withTenant({
      wordpress: { url: DEAD_WP, username: 'u' },
      publish_schedule: { runDays: [liveToday()], count: 1 }
    }, DRAFTS, (id) => {
      const r = run(id);
      assert.strictEqual(r.guard, 'site_quota_reached', JSON.stringify(r));
      assert.deepStrictEqual(r.published, []);
      // Bukti efek samping: satu POST pun tidak pernah ditembakkan.
      assert.ok(!r.failed || r.failed.length === 0, 'menembak WP padahal kuota habis: ' + JSON.stringify(r.failed));
      assert.strictEqual(r.siteCount, 1);
      assert.strictEqual(r.quota, 1);
    });
  });
});

test('KUOTA: hitungan situs TIDAK TERUKUR -> tetap menolak, tanpa POST', () => {
  withSiteCount({ error: 'HTTP 503' }, () => {
    withTenant({
      wordpress: { url: DEAD_WP, username: 'u' },
      publish_schedule: { runDays: [liveToday()], count: 1 }
    }, DRAFTS, (id) => {
      const r = run(id);
      assert.strictEqual(r.guard, 'site_count_unavailable', JSON.stringify(r));
      assert.deepStrictEqual(r.published, []);
      assert.ok(!r.failed || r.failed.length === 0, 'menembak WP padahal buta: ' + JSON.stringify(r.failed));
    });
  });
});

test('KUOTA: --force melewati hari jalan, TIDAK melewati kuota', () => {
  withSiteCount({ count: 3 }, () => {
    withTenant({
      wordpress: { url: DEAD_WP, username: 'u' },
      publish_schedule: { runDays: [(liveToday() + 1) % 7], count: 1 }
    }, DRAFTS, (id) => {
      const r = run(id, ['--force']);
      assert.strictEqual(r.guard, 'site_quota_reached', JSON.stringify(r));
      assert.ok(!r.failed || r.failed.length === 0);
    });
  });
});

test('KUOTA: --count 5 di baris perintah tidak bisa menaikkan kuota harian', () => {
  withSiteCount({ count: 1 }, () => {
    withTenant({
      wordpress: { url: DEAD_WP, username: 'u' },
      publish_schedule: { runDays: [liveToday()], count: 1 }
    }, DRAFTS, (id) => {
      const r = run(id, ['--count', '5']);
      assert.strictEqual(r.guard, 'site_quota_reached', JSON.stringify(r));
      assert.ok(!r.failed || r.failed.length === 0);
    });
  });
});

test('KUOTA: situs masih kosong -> penjaga TIDAK memblokir (POST benar-benar dicoba)', () => {
  // Sisi lain dari koin: penjaga yang selalu menolak juga bug. Port mati membuktikan
  // skrip melewati penjaga dan benar-benar sampai ke tahap POST.
  withSiteCount({ count: 0 }, () => {
    withTenant({
      wordpress: { url: DEAD_WP, username: 'u' },
      publish_schedule: { runDays: [liveToday()], count: 1 }
    }, DRAFTS, (id) => {
      const r = run(id);
      assert.strictEqual(r.guard, undefined, 'penjaga memblokir padahal kuota kosong: ' + JSON.stringify(r));
      assert.strictEqual(r.failed.length, 1, JSON.stringify(r));
      assert.deepStrictEqual(r.published, []);
    });
  });
});

test('KUOTA: --dry-run tetap murni — tidak ada jaringan, tetap melaporkan rencana', () => {
  withSiteCount({ error: 'harusnya tidak pernah dibaca' }, () => {
    withTenant({
      wordpress: { url: DEAD_WP, username: 'u' },
      publish_schedule: { runDays: [liveToday()], count: 1 }
    }, DRAFTS, (id) => {
      const r = run(id, ['--dry-run']);
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.dryRun, true);
      assert.strictEqual(r.wouldPublish.length, 1, JSON.stringify(r));
    });
  });
});

// ---------------------------------------------------------------------------
// ANTREAN DISEGARKAN DARI SITUS sebelum memilih.
//
// Dulu pilihan diambil dari articles-cache.json apa adanya, dan satu-satunya yang mengisi
// file itu adalah manusia yang membuka dashboard. Pernah `lastSync` basi 13 hari dan 7 draft
// terbaru dari penulis otomatis tidak ada di dalamnya: keluaran otonomnya tidak pernah
// sampai ke antrean. Test ini menjalankan main() yang SUNGGUHAN;
// daftar draft situs dipalsukan lewat PUBLISH_QUEUE_SYNC_DRAFTS.
const wpPost = (id, date, status = 'draft') => ({
  id, date: `${date}T00:00:00`, modified: `${date}T00:00:00`, status,
  title: { rendered: `Artikel ${id}` }, slug: `a-${id}`, link: `https://x.test/${id}`, categories: []
});

function withLiveDrafts(stub, fn) {
  const f = path.join(os.tmpdir(), `qs-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify(stub));
  const prev = process.env.PUBLISH_QUEUE_SYNC_DRAFTS;
  process.env.PUBLISH_QUEUE_SYNC_DRAFTS = f;
  try { return fn(); }
  finally {
    if (prev === undefined) delete process.env.PUBLISH_QUEUE_SYNC_DRAFTS;
    else process.env.PUBLISH_QUEUE_SYNC_DRAFTS = prev;
    fs.rmSync(f, { force: true });
  }
}

const LIVE_SAME_AS_CACHE = [
  wpPost(1, '2018-12-24'), wpPost(2, '2024-05-15'),
  wpPost(3, '2026-05-25'), wpPost(4, '2026-07-01'), wpPost(5, '2026-08-29')
];

test('SYNC: draft yang hanya ada di situs masuk antrean pada run yang sama', () => {
  withLiveDrafts({ drafts: [...LIVE_SAME_AS_CACHE, wpPost(77, '2026-09-19')] }, () => {
    withSiteCount({ count: 1 }, () => {   // kuota penuh: berhenti sebelum POST
      withTenant({
        wordpress: { url: DEAD_WP, username: 'u' },
        publish_schedule: { runDays: [liveToday()], count: 1 }
      }, DRAFTS, (id) => {
        const r = run(id);
        assert.strictEqual(r.queueSync.ok, true, JSON.stringify(r.queueSync));
        assert.deepStrictEqual(r.queueSync.addedIds, [77]);
        // 3, 4, 5 dari cache + 77 yang baru disinkron. Tanpa sync jawabannya 3.
        assert.strictEqual(r.draftsEligible, 4, JSON.stringify(r));
      });
    });
  });
});

test('SYNC: cache benar-benar ditulis ulang, bukan cuma dilaporkan', () => {
  withLiveDrafts({ drafts: [...LIVE_SAME_AS_CACHE, wpPost(77, '2026-09-19')] }, () => {
    withSiteCount({ count: 1 }, () => {
      withTenant({
        wordpress: { url: DEAD_WP, username: 'u' },
        publish_schedule: { runDays: [liveToday()], count: 1 }
      }, DRAFTS, (id) => {
        run(id);
        const onDisk = JSON.parse(fs.readFileSync(
          path.join(SKILL_DIR, 'data', 'blogs', id, 'articles-cache.json'), 'utf-8'));
        assert.ok(onDisk.articles.some(a => a.id === 77), 'draft baru tidak tersimpan ke cache');
      });
    });
  });
});

test('SYNC gagal TIDAK menghentikan penerbitan, tapi juga tidak diam', () => {
  withLiveDrafts({ error: 'HTTP 401' }, () => {
    withSiteCount({ count: 1 }, () => {
      withTenant({
        wordpress: { url: DEAD_WP, username: 'u' },
        publish_schedule: { runDays: [liveToday()], count: 1 }
      }, DRAFTS, (id) => {
        const r = run(id);
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.queueSync.ok, false);
        assert.match(r.queueSync.error, /401/);
        // Tetap sampai ke penjaga kuota: cache basi hanya menghilangkan draft baru.
        assert.strictEqual(r.guard, 'site_quota_reached', JSON.stringify(r));
        assert.strictEqual(r.draftsEligible, 3);
      });
    });
  });
});

test('SYNC: id yang di cache draft tapi bukan draft lagi di situs tidak jadi kandidat', () => {
  // Situs tidak lagi menyebut 3 sebagai draft -> ghost. Tanpa saringan ini skrip akan
  // menembak POST ke post yang sudah tayang dan memakan kuota hari itu tanpa hasil.
  withLiveDrafts({ drafts: LIVE_SAME_AS_CACHE.filter(p => p.id !== 3) }, () => {
    withSiteCount({ count: 1 }, () => {
      withTenant({
        wordpress: { url: DEAD_WP, username: 'u' },
        publish_schedule: { runDays: [liveToday()], count: 1 }
      }, DRAFTS, (id) => {
        const r = run(id);
        assert.strictEqual(r.queueSync.ghosts, 1, JSON.stringify(r.queueSync));
        assert.strictEqual(r.draftsEligible, 2, JSON.stringify(r));
        assert.ok(!r.wouldPublish.some(a => a.id === 3), 'ghost masih jadi kandidat terbit');
      });
    });
  });
});

test('--dry-run tetap tanpa jaringan, tapi basinya cache tetap terlihat', () => {
  // Stub sengaja bikin error: kalau dry-run menyentuh jalur sync, ini akan terbaca.
  withLiveDrafts({ error: 'seharusnya tidak pernah dipanggil' }, () => {
    withTenant({ publish_schedule: { runDays: [liveToday()], count: 1 } }, DRAFTS, (id) => {
      const r = run(id, ['--dry-run']);
      assert.strictEqual(r.queueSync.skipped, 'dry-run', JSON.stringify(r.queueSync));
      assert.strictEqual(r.queueSync.ok, undefined);
      assert.ok(r.queueSync.cacheLastSync, 'umur cache harus tetap tercetak di dry-run');
    });
  });
});
