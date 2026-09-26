'use strict';
// Segarkan antrean draft dari WordPress sebelum memilih apa yang naik.
//
// Kenapa ada: `publish-drafts.js` memilih dari `articles-cache.json`, dan satu-satunya
// yang pernah mengisi ulang file itu adalah manusia yang membuka dashboard
// (`scripts/routes/articles.js` -> `lib/wp-sync.js`). Di pipeline otonom itu dependensi
// mati. Pernah terukur di pemakaian nyata: `lastSync` basi 13 hari, dan 7 draft yang ditulis
// agent penulis otomatis sejak itu ABSEN sama sekali dari cache. Semuanya ada dan sehat di
// situs. Artinya keluaran otonom tidak pernah sampai ke antrean terbit dengan sendirinya.
//
// Gejalanya diam, dan itu bagian terburuknya: FIFO mengambil yang tertua, jadi selama masih
// ada 48 draft lama di depan, antrean terlihat penuh dan sehat. Yang bocor cuma yang baru,
// dan cuma terlihat kalau seseorang membandingkan cache dengan situs.
//
// Kenapa daftar PENUH, bukan `modified_after` seperti lib/wp-sync.js: sinkron inkremental
// tidak bisa melihat apa yang HILANG dari status draft, dan — lebih buruk — `httpGet`
// menyelesaikan promise-nya pada status HTTP apa pun, jadi balasan 401/403 (badan JSON,
// bukan array) dibaca `incrementalSync` sebagai "tidak ada yang berubah". Kegagalan auth
// jadi tidak bisa dibedakan dari hasil negatif yang wajar. Di sini status HTTP diperiksa
// eksplisit dan apa pun selain 200 adalah `error`, bukan "kosong".
//
// Arah gagalnya: sync gagal TIDAK menghentikan penerbitan. Cache basi hanya MENGHILANGKAN
// draft baru; ia tidak pernah mengarang draft lama yang belum diperiksa. Jadi FIFO di atas
// cache basi tetap aman — yang tidak aman adalah membiarkannya basi tanpa suara. Bandingkan
// dengan penjaga kuota, yang arah amannya justru menolak: di sana "tidak terukur" berarti
// kita bisa menerbitkan terlalu banyak; di sini berarti kita menerbitkan terlalu sedikit.

const { httpGet } = require('./wp-client');
const { mapPost } = require('./articles-cache');

const FIELDS = '_fields=id,title,status,date,modified,slug,link,categories';
const PER_PAGE = 100;

function draftListUrl(baseUrl) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return `${base}/wp-json/wp/v2/posts?${FIELDS}` +
    `&status=draft&per_page=${PER_PAGE}&orderby=date&order=desc`;
}

function siteAuth(cfg) {
  const wp = (cfg && cfg.wordpress) || {};
  if (!wp.username || !wp.app_password) return '';
  return Buffer.from(`${wp.username}:${wp.app_password}`).toString('base64');
}

// Ambil daftar draft hidup. { drafts: [...] } atau { error }. Tidak pernah melempar.
async function fetchLiveDrafts(baseUrl, deps = {}) {
  const get = deps.httpGet || httpGet;
  // Tepi jaringan yang dipalsukan test end-to-end: file JSON berisi
  // { "drafts": [ <post WP mentah>, ... ] } atau { "error": "..." }. Sama pola dengan
  // PUBLISH_GUARD_SITE_COUNT milik daily-quota-guard, supaya main() yang SUNGGUHAN bisa
  // dijalankan test tanpa menyentuh WordPress — suite yang cuma memanggil fungsi kecil
  // tidak pernah membuktikan kabelnya tersambung.
  const stubFile = deps.draftListFile || process.env.PUBLISH_QUEUE_SYNC_DRAFTS || null;
  if (stubFile) {
    let stub;
    try { stub = JSON.parse(require('fs').readFileSync(stubFile, 'utf-8')); }
    catch (e) { return { error: `stub daftar draft tidak terbaca: ${e.message}` }; }
    return stub.error ? { error: stub.error } : { drafts: stub.drafts || [] };
  }
  if (!baseUrl) return { error: 'wordpress.url tidak ada di config tenant' };
  let res;
  try {
    res = await get(draftListUrl(baseUrl), deps.auth || '', deps.timeout || 15000);
  } catch (e) {
    return { error: `probe draft gagal: ${e.message}` };
  }
  // Status HTTP diperiksa DULU. httpGet menyelesaikan promise-nya pada status apa pun,
  // jadi tanpa baris ini balasan 401 terbaca sebagai "tidak ada draft".
  if (res && res.statusCode && res.statusCode !== 200) return { error: `HTTP ${res.statusCode}` };
  if (!Array.isArray(res && res.body)) return { error: 'balasan situs bukan array' };
  // Lebih dari satu halaman: daftarnya terpotong, jadi "yang absen" tidak terukur.
  // Sebut tidak terukur, jangan diam-diam separuh.
  if (Number(res.totalPages || 1) > 1) {
    return { error: `daftar draft lebih dari ${PER_PAGE} (${res.totalPages} halaman), tidak terukur utuh` };
  }
  return { drafts: res.body };
}

// Gabungkan draft hidup ke dalam cache.
//
//   added  — draft yang ada di situs tapi tidak ada di cache sama sekali (inilah kebocorannya)
//   ghosts — id yang di cache berstatus `draft` tapi TIDAK lagi draft di situs
//
// `ghosts` tidak dihapus dari cache: kita tahu ia bukan draft, tapi tidak tahu ia jadi apa,
// dan menulis status karangan ke cache hanya memindahkan kebohongan. Yang dilakukan pemanggil
// adalah MENYARING id itu dari kandidat terbit — menerbitkan ulang post yang sudah tayang
// akan memakan kuota hari itu tanpa menaikkan apa pun.
//
// Entri baru masuk tanpa kategori (`Uncategorized`): daftar ini tidak menarik peta kategori,
// dan satu panggilan tambahan tidak sepadan untuk field yang tidak dipakai keputusan terbit.
// Full sync dari dashboard memperbaikinya. Entri yang SUDAH ada tidak pernah ditimpa.
function mergeDrafts(cache, liveDrafts) {
  const articles = Array.isArray(cache && cache.articles) ? cache.articles.slice() : [];
  const known = new Map(articles.map((a, i) => [a.id, i]));
  const liveIds = new Set(liveDrafts.map(p => p.id));

  const added = [];
  for (const p of liveDrafts) {
    if (known.has(p.id)) continue;
    const mapped = mapPost(p, {});
    articles.push(mapped);
    added.push(mapped.id);
  }

  const ghosts = articles
    .filter(a => a.status === 'draft' && !liveIds.has(a.id) && !added.includes(a.id))
    .map(a => a.id);

  return {
    cache: { lastSync: new Date().toISOString(), totalCount: articles.length, articles },
    added,
    ghosts
  };
}

// Jalur lengkap. { ok: true, cache, added, ghosts } atau { ok: false, error }.
async function refreshDraftQueue(cfg, cache, deps = {}) {
  const baseUrl = cfg && cfg.wordpress && cfg.wordpress.url;
  const live = await fetchLiveDrafts(baseUrl, { ...deps, auth: deps.auth || siteAuth(cfg) });
  if (live.error) return { ok: false, error: live.error };
  return { ok: true, ...mergeDrafts(cache, live.drafts) };
}

module.exports = { refreshDraftQueue, fetchLiveDrafts, mergeDrafts, draftListUrl, siteAuth };
