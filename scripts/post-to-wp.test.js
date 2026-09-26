'use strict';
// Kuota HARIAN pada post-to-wp.js — jalur terbit ke-2 dan ke-3.
//
// publish-drafts.js sudah lebih dulu dijaga. Skrip ini tidak, dan justru inilah yang pernah
// menerbitkan 4 post yang lahir LANGSUNG sebagai `publish` dalam 54 detik, semuanya melewati antrean draft, `runDays`, dedup judul DAN ledger harian
// sekaligus — karena tidak satu pun dari empat hal itu berada di jalur yang dilewatinya.
//
// Dua bentuk yang memakai kuota:
//   --status publish   -> dipanggil lewat workflow.auto_publish (agents/wordpress-poster.md:88)
//   --schedule-date    -> memaksa status `future`; cron WordPress menembakkannya sendiri,
//                         di luar jangkauan Node. Post `future` bertanggal hari ini SUDAH
//                         memakai kuota hari ini, dan satu-satunya saat kita bisa
//                         memperhitungkannya adalah sebelum ia dibuat.
//
// Tepi jaringan dipalsukan di DUA sisi supaya yang diuji adalah keputusan, bukan konektivitas:
//   - hitungan situs    -> stub JSON lewat PUBLISH_GUARD_SITE_COUNT
//   - POST ke WordPress -> --wp-url diarahkan ke port tertutup di localhost.
// Karena itu tiap test di bawah bisa membedakan TIDAK MENCOBA dari MENCOBA LALU GAGAL:
// kalau penjaga bocor, skrip menembak port mati dan mencetak `ERROR:connect ECONNREFUSED`.
// Tidak ada `ERROR:` DAN ada `GUARD:` hanya mungkin kalau POST-nya memang tidak pernah terjadi.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SKILL_DIR = path.join(__dirname, '..');
const SCRIPT = path.join(__dirname, 'post-to-wp.js');
const DEAD_WP = 'http://127.0.0.1:9';   // port discard, selalu menolak koneksi

// Bukti skrip benar-benar sampai ke tahap POST. Pesannya datang dari
// createPost().catch di post-to-wp.js.
const TRIED_NETWORK = /ERROR:.*(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|socket|timeout)/i;
const GUARD_LINE = /GUARD:([a-z_]+)/;

// Tenant sementara di dalam data/blogs supaya paths.js menemukannya, lalu dibuang lagi.
// Tenant produksi tidak pernah disentuh.
function withTenant(cfgExtra, fn) {
  const id = 'zz-ptw-' + process.pid + '-' + Math.random().toString(36).slice(2, 8);
  const dir = path.join(SKILL_DIR, 'data', 'blogs', id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
      wordpress: { url: DEAD_WP, username: 'u' },
      seo_plugin: { type: 'none' },
      ...cfgExtra
    }));
    fs.writeFileSync(path.join(dir, 'artikel.converted.json'), JSON.stringify({
      title: 'Artikel Uji', html: '<p>isi</p>', slug: 'artikel-uji'
    }));
    return fn(id, path.join(dir, 'artikel.converted.json'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function withSiteCount(stub, fn) {
  const f = path.join(os.tmpdir(), `ptw-sc-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
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

function run(id, dataFile, extraArgs = []) {
  const env = { ...process.env };
  // Password dituntut ada sebelum apa pun; nilainya tak pernah dipakai karena
  // setiap test berhenti sebelum ada balasan WordPress.
  env[id.toUpperCase().replace(/-/g, '_') + '_WP_APP_PASSWORD'] = 'x';
  const argv = [SCRIPT, '--data', dataFile, '--wp-url', DEAD_WP,
    '--username', 'u', '--blog', id, ...extraArgs];
  try {
    const stdout = execFileSync('node', argv, { encoding: 'utf-8', env, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const FULL = { count: 1 };            // kuota 1, situs sudah punya 1 -> habis
const QUOTA1 = { publish_schedule: { count: 1 } };

function assertRefused(r, guardName) {
  const m = r.out.match(GUARD_LINE);
  assert.ok(m, 'penjaga tidak menolak sama sekali. Keluaran: ' + r.out);
  assert.strictEqual(m[1], guardName, r.out);
  assert.ok(!TRIED_NETWORK.test(r.out), 'menembak WordPress padahal ditolak penjaga: ' + r.out);
  assert.strictEqual(r.code, 1, 'penolakan harus kode keluar 1: ' + r.out);
}

function assertPassedGuard(r) {
  assert.ok(!GUARD_LINE.test(r.out), 'penjaga memblokir padahal tidak boleh: ' + r.out);
  assert.ok(TRIED_NETWORK.test(r.out), 'tidak sampai ke tahap POST: ' + r.out);
}

// --- status yang MEMAKAI kuota ------------------------------------------------

test('KUOTA: --status publish saat situs sudah penuh -> tidak ada POST sama sekali', () => {
  withSiteCount(FULL, () => {
    withTenant(QUOTA1, (id, data) => {
      assertRefused(run(id, data, ['--status', 'publish']), 'site_quota_reached');
    });
  });
});

test('KUOTA: --schedule-date TANPA --status tetap kena penjaga (status efektif `future`)', () => {
  // Ini yang membedakan penjaga yang menyaring status EFEKTIF dari yang menyaring
  // --status: di sini --status tidak pernah disebut, jadi nilai argumennya `draft`
  // (default), tapi status yang benar-benar dikirim ke WordPress adalah `future`.
  // Penjaga yang membaca statusArg akan meloloskan ini dan jalur 3 tetap terbuka.
  withSiteCount(FULL, () => {
    withTenant(QUOTA1, (id, data) => {
      assertRefused(run(id, data, ['--schedule-date', '2026-12-01']), 'site_quota_reached');
    });
  });
});

test('KUOTA: --status future kena penjaga (post yang menembak sendiri tetap memakai kuota)', () => {
  withSiteCount(FULL, () => {
    withTenant(QUOTA1, (id, data) => {
      assertRefused(run(id, data, ['--status', 'future']), 'site_quota_reached');
    });
  });
});

test('KUOTA: status yang TIDAK dikenali ikut tertahan — bukan hanya `publish`', () => {
  // Penjaga harus ditulis `status !== "draft"`, bukan `status === "publish"`.
  // Daftar-putih status yang diketahui akan meloloskan yang pertama kali muncul:
  // `pending`, `private`, salah ketik, atau status baru WordPress. Status yang tidak
  // terbaca BUKAN draft, dan arah amannya menolak.
  withSiteCount(FULL, () => {
    withTenant(QUOTA1, (id, data) => {
      assertRefused(run(id, data, ['--status', 'pending']), 'site_quota_reached');
    });
  });
});

// --- draft: pengecualian yang eksplisit dan bertest ---------------------------

test('DRAFT: tidak pernah tertahan, walau kuota situs habis', () => {
  // Draft tidak menerbitkan apa pun, jadi menahannya hanya memblokir pipeline normal
  // (auto_publish: false membuat setiap artikel baru mendarat sebagai draft).
  withSiteCount(FULL, () => {
    withTenant(QUOTA1, (id, data) => {
      assertPassedGuard(run(id, data, ['--status', 'draft']));
    });
  });
});

test('DRAFT: tidak tertahan walau hitungan situs tidak terukur', () => {
  withSiteCount({ error: 'HTTP 503' }, () => {
    withTenant(QUOTA1, (id, data) => {
      assertPassedGuard(run(id, data, ['--status', 'draft']));
    });
  });
});

test('DRAFT adalah default: tanpa --status dan tanpa --schedule-date, tidak tertahan', () => {
  withSiteCount(FULL, () => {
    withTenant(QUOTA1, (id, data) => {
      assertPassedGuard(run(id, data, []));
    });
  });
});

// --- "tidak terukur" bukan "aman" --------------------------------------------

test('BUTA: hitungan situs gagal -> menolak terbit, dan alasannya disebut', () => {
  withSiteCount({ error: 'HTTP 503' }, () => {
    withTenant(QUOTA1, (id, data) => {
      const r = run(id, data, ['--status', 'publish']);
      assertRefused(r, 'site_count_unavailable');
      assert.match(r.out, /HTTP 503/, 'alasan penolakan harus terbaca di pesan: ' + r.out);
    });
  });
});

// --- sisi lain dari koin: penjaga yang selalu menolak juga bug ---------------

test('LOLOS: situs masih kosong -> publish benar-benar dicoba', () => {
  withSiteCount({ count: 0 }, () => {
    withTenant(QUOTA1, (id, data) => {
      assertPassedGuard(run(id, data, ['--status', 'publish']));
    });
  });
});

test('LOLOS: kuota 3, situs baru 2 -> masih boleh satu lagi', () => {
  withSiteCount({ count: 2 }, () => {
    withTenant({ publish_schedule: { count: 3 } }, (id, data) => {
      assertPassedGuard(run(id, data, ['--status', 'publish']));
    });
  });
});

test('--schedule-date cacat tetap ditolak karena formatnya, bukan karena kuota', () => {
  // Validasi format tetap berjalan lebih dulu: pesannya tidak boleh berubah jadi
  // pesan kuota, supaya salah ketik tanggal tetap terbaca sebagai salah ketik.
  withSiteCount({ count: 0 }, () => {
    withTenant(QUOTA1, (id, data) => {
      const r = run(id, data, ['--schedule-date', '01-12-2026']);
      assert.strictEqual(r.code, 1);
      assert.match(r.out, /Invalid --schedule-date format/, r.out);
    });
  });
});
