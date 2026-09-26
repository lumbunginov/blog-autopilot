'use strict';
// Kuota HARIAN untuk penerbitan otomatis — bukan kuota per pemanggilan.
//
// Kenapa ada: `publish_schedule.count` dibaca sebagai "ambil N draft" oleh kode yang
// menerbitkan, tapi ditulis sebagai "N post per hari jalan" oleh orang yang mengisi config.
// Satu sinyal, dua pembaca. Selama tidak ada yang menghitung ulang di tujuan, tiap
// pemanggilan ulang menghabiskan kuota yang sama dari nol: pernah jadi 12 post dalam sehari
// untuk `count: 1`.
//
// Yang mengikat adalah hitungan di TUJUAN, bukan catatan penerbitnya sendiri. Ada beberapa
// jalur yang bisa menaikkan post ke situs yang sama (antrean draft, `post-to-wp.js
// --status publish`, post `future` WordPress yang menembak sendiri). Ledger mana pun cuma
// melihat jalurnya sendiri; hitungan situs melihat semuanya. Pernah, pukul 07:05
// situs sudah punya 2 post sementara ledger penerbitnya belum pernah ada — dan penjaga yang
// bertanya pada ledger menjawab "silakan naikkan yang ketiga".
//
// Arah amannya SELALU menolak. Kalau hitungan tidak terukur (jaringan/HTTP gagal), kami juga
// menolak: "tidak tahu" bukan "aman". Melewatkan satu post jauh lebih murah daripada
// menerbitkan dua belas. Penolakan karena buta diberi tanda berbeda (`site_count_unavailable`)
// supaya tidak tertukar dengan penolakan karena kuota memang habis (`site_quota_reached`).

const { httpGet } = require('./wp-client');

// Tanggal lokal mesin. WP membandingkan `after`/`before` terhadap waktu lokalnya
// sendiri — rentangnya sebanding selama mesin dan situs memakai zona waktu yang sama.
function localToday(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nextDay(iso) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// `future` ikut dihitung, bukan cuma `publish`. Post WordPress berstatus `future` yang
// bertanggal hari ini AKAN tayang hari ini — cron WP menembakkannya sendiri, di luar
// jangkauan Node. Menghitung yang sudah tayang saja berarti penjaga hanya melihat keadaan
// pada detik ia berjalan: pernah ia melihat 0 pukul 05:14, meloloskan satu post,
// lalu post `future` yang sudah terjadwal menembak pukul 07:00 — dua post untuk kuota 1. Yang belum tayang
// tapi sudah terjadwal hari ini sudah memakai kuota; satu-satunya saat kita bisa
// memperhitungkannya adalah SEBELUM ia menembak.
//
// Konsekuensinya query ini butuh autentikasi: `status=future` pada permintaan anonim
// dijawab 400 `rest_forbidden_status`. Tanpa kredensial hasilnya "tidak terukur" -> menolak.
function siteCountUrl(baseUrl, today) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return `${base}/wp-json/wp/v2/posts` +
    `?after=${today}T00:00:00&before=${nextDay(today)}T00:00:00` +
    '&per_page=100&status=publish,future&_fields=id,date,status';
}

// Kuota harian dari config tenant. Tidak ada / tidak masuk akal -> 1, angka paling konservatif
// yang masih menerbitkan sesuatu.
function dailyQuota(cfg) {
  const n = cfg && cfg.publish_schedule && Number(cfg.publish_schedule.count);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// Basic auth dari config tenant. Kosong kalau kredensial belum ada — permintaan lalu
// dijawab 400 oleh WP dan penjaga menolak karena buta, yang memang arah amannya.
function siteAuth(cfg) {
  const wp = (cfg && cfg.wordpress) || {};
  if (!wp.username || !wp.app_password) return '';
  return Buffer.from(`${wp.username}:${wp.app_password}`).toString('base64');
}

// Berapa post yang sudah tayang ATAU dijadwalkan tayang hari ini, siapa pun yang menerbitkannya.
// Mengembalikan { count } atau { error }. Tidak pernah melempar: gagal menghitung adalah
// hasil yang harus dibaca pemanggil, bukan crash yang menghapus keputusannya.
async function countPostsToday(baseUrl, today, deps = {}) {
  const get = deps.httpGet || httpGet;
  // Tepi jaringan yang dipalsukan test dan pembungkus: file JSON berisi { "count": N }
  // atau { "error": "..." }. Nama env-nya sengaja umum supaya
  // pembungkus milik pemakai (mis. penjaga kuota tambahan di luar skill) bisa dipalsukan
  // dengan stub yang sama.
  const stubFile = deps.siteCountFile || process.env.PUBLISH_GUARD_SITE_COUNT || null;
  if (stubFile) {
    let stub;
    try { stub = JSON.parse(require('fs').readFileSync(stubFile, 'utf-8')); }
    catch (e) { return { error: `stub hitungan situs tidak terbaca: ${e.message}` }; }
    return stub.error ? { error: stub.error } : { count: Number(stub.count) || 0 };
  }
  if (!baseUrl) return { error: 'wordpress.url tidak ada di config tenant' };
  let res;
  try {
    res = await get(siteCountUrl(baseUrl, today), deps.auth || '', deps.timeout || 15000);
  } catch (e) {
    return { error: `probe situs gagal: ${e.message}` };
  }
  if (res && res.statusCode && res.statusCode !== 200) {
    return { error: `HTTP ${res.statusCode}` };
  }
  if (!Array.isArray(res && res.body)) return { error: 'balasan situs bukan array' };
  return { count: res.body.length };
}

// Keputusan penjaga. Mengembalikan `null` kalau boleh lanjut menerbitkan, atau objek
// { guard, message, ... } kalau harus berhenti. Tepi jaringan disuntikkan lewat
// `deps.countPostsToday` supaya test menjalankan keputusan yang sama tanpa menyentuh WP.
async function checkDailyQuota(cfg, today, deps = {}) {
  const count = deps.countPostsToday || countPostsToday;
  const quota = dailyQuota(cfg);
  const baseUrl = cfg && cfg.wordpress && cfg.wordpress.url;
  // Kredensial diambil dari cfg yang sudah lewat resolveCredentials. Dibutuhkan karena
  // hitungan menyertakan `status=future` (lihat siteCountUrl). Pemanggil boleh menimpa
  // lewat deps.auth; test memakai jalur itu.
  const site = await count(baseUrl, today, { ...deps, auth: deps.auth || siteAuth(cfg) });

  if (site.error) {
    return {
      guard: 'site_count_unavailable',
      quota,
      message: `Tidak bisa menghitung post yang sudah tayang ${today} di situs (${site.error}). ` +
        'Tidak menerbitkan: "tidak terukur" bukan "aman".'
    };
  }
  if (site.count >= quota) {
    return {
      guard: 'site_quota_reached',
      quota,
      siteCount: site.count,
      message: `Situs sudah punya ${site.count} post bertanggal ${today} (kuota ${quota}). ` +
        'Tidak menerbitkan lagi, siapa pun yang menerbitkan yang sudah ada.'
    };
  }
  return null;
}

module.exports = {
  localToday,
  siteAuth,
  nextDay,
  siteCountUrl,
  dailyQuota,
  countPostsToday,
  checkDailyQuota
};
