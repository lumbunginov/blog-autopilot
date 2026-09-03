#!/usr/bin/env node
/**
 * audit-links.js
 *
 * Meng-crawl seluruh post terbit tenant aktif (REST publik, ?status=publish),
 * mengumpulkan tiap href internal, me-resolve tiap URL unik lewat HTTP, dan
 * melaporkan yang mati beserta artikel yang mengaitkannya.
 *
 * Diport dari post-article/scripts/audit-internal-links.js (Perkap_com).
 * BACA-SAJA: tidak ada penulisan ke WordPress, tidak ada kredensial dipakai.
 *
 * Usage:
 *   node audit-links.js                       # crawl penuh tenant aktif
 *   node audit-links.js --blog perkapcom       # tenant tertentu
 *   node audit-links.js --limit 50             # crawl 50 post pertama saja
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { makePaths } = require('./lib/paths');
const { extractLinks } = require('./lib/link-extract');
const { produkTanpaTautan } = require('./lib/link-report');
const { resolveKnowledgeBase } = require('./lib/knowledge');

const paths = makePaths(path.join(__dirname, '..'));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : Infinity;

const blogId = arg('--blog') || paths.activeBlog();
if (!blogId) {
  console.error('❌ Belum ada blog. Buat dulu lewat POST /api/blogs.');
  process.exit(1);
}
const cfgPath = paths.configPath(blogId);
if (!fs.existsSync(cfgPath)) {
  console.error(`❌ Config tenant "${blogId}" tidak ada: ${cfgPath}`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
const SITE = String(cfg.wordpress && cfg.wordpress.url || '').replace(/\/+$/, '');
if (!SITE) {
  console.error(`❌ Tenant "${blogId}" belum punya wordpress.url di config.`);
  process.exit(1);
}
const API = `${SITE}/wp-json/wp/v2`;
const CONCURRENCY = 8;
const UA = 'Mozilla/5.0 (compatible; BlogAutopilotLinkAudit/1.0)';

const today = new Date().toISOString().slice(0, 10);
const auditDir = path.join(paths.blogDir(blogId), 'audit');
const OUT = path.join(auditDir, `link-${today}.md`);
const JSON_OUT = path.join(auditDir, `link-${today}.json`);

// ---------------------------------------------------------------- fetch posts

async function fetchAll(type) {
  const items = [];
  let page = 1;
  for (;;) {
    const url = `${API}/${type}?per_page=100&page=${page}&status=publish&_fields=id,slug,link,title,content,featured_media`;

    // Origin men-throttle bacaan massal. Dua kegagalan berbeda, dulu sama-sama
    // membatalkan seluruh crawl di tengah jalan:
    //   - 503 biasa
    //   - 200 dengan badan terpotong di tengah JSON (pernah terpotong tepat di
    //     128KB), jadi res.ok bernilai true tapi JSON.parse melempar
    // Keduanya diretry dengan jeda; hasil terpotong bukan hasil.
    let res;
    let batch;
    let lastErr;
    for (const delay of [0, 3000, 8000, 15000]) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      lastErr = null;
      try {
        res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (res.status >= 500) {
          lastErr = new Error(`HTTP ${res.status}`);
        } else if (res.status === 400 || !res.ok) {
          break; // sudah lewat halaman terakhir, atau galat klien nyata — biar pemanggil yang putuskan
        } else {
          batch = await res.json();
          break;
        }
      } catch (e) {
        lastErr = e; // koneksi putus atau badan terpotong
      }
      process.stderr.write(`\n  ${type} page ${page}: ${lastErr.message}, retrying...`);
    }

    if (res.status === 400) break; // sudah lewat halaman terakhir
    if (lastErr) throw new Error(`${type} page ${page}: ${lastErr.message} after retries`);
    if (!res.ok) throw new Error(`${type} page ${page}: HTTP ${res.status}`);
    if (!batch || !batch.length) break;
    items.push(...batch);
    const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10);
    process.stderr.write(`\r  ${type}: ${items.length} fetched (page ${page}/${totalPages})   `);
    if (page >= totalPages) break;
    page++;
  }
  process.stderr.write('\n');
  return items;
}

// ------------------------------------------------------------- status checks

async function checkStatus(url) {
  // Sebagian setup WP/CDN salah menangani HEAD, jatuh ke ranged GET.
  for (const init of [
    { method: 'HEAD', headers: { 'User-Agent': UA } },
    { method: 'GET', headers: { 'User-Agent': UA, Range: 'bytes=0-2047' } },
  ]) {
    try {
      const res = await fetch(url, { ...init, redirect: 'follow' });
      if (init.method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
      return { status: res.status, finalUrl: res.url, method: init.method };
    } catch (e) {
      if (init.method === 'HEAD') continue;
      return { status: 0, error: e.message, finalUrl: url, method: init.method };
    }
  }
  return { status: 0, error: 'unreachable', finalUrl: url };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      done++;
      if (done % 5 === 0 || done === items.length) {
        process.stderr.write(`\r  checked ${done}/${items.length}   `);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  process.stderr.write('\n');
  return results;
}

// --------------------------------------------------------------------- main

(async () => {
  console.error(`Tenant: ${blogId} (${SITE})`);
  console.error('Mengambil konten terbit...');
  const posts = (await fetchAll('posts')).slice(0, LIMIT);
  const pages = LIMIT === Infinity ? await fetchAll('pages') : [];
  console.error(`  ${posts.length} posts, ${pages.length} pages\n`);

  const sources = [
    ...posts.map((p) => ({ ...p, type: 'post' })),
    ...pages.map((p) => ({ ...p, type: 'page' })),
  ];

  // url -> [{ id, slug, type, anchor }]
  const linkMap = new Map();
  for (const src of sources) {
    const html = (src.content && src.content.rendered) || '';
    for (const link of extractLinks(html, SITE)) {
      if (!linkMap.has(link.url)) linkMap.set(link.url, []);
      linkMap.get(link.url).push({
        id: src.id,
        slug: src.slug,
        type: src.type,
        title: src.title && src.title.rendered,
        anchor: link.anchor,
      });
    }
  }

  const urls = [...linkMap.keys()].sort();
  console.error(`Ditemukan ${urls.length} URL internal unik di ${sources.length} dokumen.`);
  console.error('Meresolusi...');

  const statuses = await mapLimit(urls, CONCURRENCY, (u) => checkStatus(u));

  // Sapuan kedua, serial dan berjeda. Sapuan paralel memancing origin untuk
  // throttle: audit pertama melaporkan tiga 503 yang ternyata 200 semua saat
  // dicoba ulang. Apapun yang tampak mati dicek ulang satu per satu supaya
  // rate limit tidak pernah dilaporkan sebagai tautan rusak.
  const suspects = urls
    .map((url, i) => ({ url, i }))
    .filter(({ i }) => statuses[i].status === 0 || statuses[i].status >= 400);
  if (suspects.length) {
    console.error(`Verifikasi ulang ${suspects.length} URL yang dicurigai mati, serial...`);
    for (const [n, s] of suspects.entries()) {
      await new Promise((r) => setTimeout(r, 1500));
      const retry = await checkStatus(s.url);
      if (retry.status >= 200 && retry.status < 400) {
        console.error(`  pulih: ${statuses[s.i].status} -> ${retry.status}  ${s.url}`);
      }
      statuses[s.i] = { ...retry, firstPass: statuses[s.i].status };
      process.stderr.write(`\r  dicek ulang ${n + 1}/${suspects.length}   `);
    }
    process.stderr.write('\n');
  }

  const rows = urls.map((url, i) => ({
    url,
    ...statuses[i],
    refs: linkMap.get(url),
    refCount: linkMap.get(url).length,
  }));

  // Hanya 4xx membuktikan halaman benar-benar hilang. 5xx (atau galat jaringan)
  // berarti origin sedang tidak sehat — perkap.com membalas 503 saat sibuk —
  // jadi itu dilaporkan terpisah sebagai tak pasti, tidak dihitung sebagai
  // tautan rusak.
  const isDead = (r) => r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
  const dead = rows.filter(isDead).sort((a, b) => b.refCount - a.refCount);
  const inconclusive = rows
    .filter((r) => !isDead(r) && (r.status === 0 || r.status >= 400))
    .sort((a, b) => b.refCount - a.refCount);
  const redirected = rows.filter(
    (r) => r.status >= 200 && r.status < 400 && r.finalUrl && r.finalUrl !== r.url
  );

  // -------------------------------------------------------------- laporan
  const lines = [];
  lines.push(`# Audit Tautan Internal — ${SITE}`);
  lines.push('');
  lines.push(`- Dokumen di-crawl: **${sources.length}** (${posts.length} posts, ${pages.length} pages)`);
  lines.push(`- URL internal unik: **${urls.length}**`);
  lines.push(`- Mati (4xx): **${dead.length}**`);
  lines.push(`- Tak pasti (5xx/tak terjangkau — masalah origin, BUKAN tautan rusak): **${inconclusive.length}**`);
  lines.push(`- Redirect (masih resolve): **${redirected.length}**`);
  lines.push(`- Total kemunculan tautan mati: **${dead.reduce((n, r) => n + r.refCount, 0)}**`);
  lines.push('');

  if (dead.length) {
    lines.push('## URL Mati');
    lines.push('');
    lines.push('| Status | Refs | URL |');
    lines.push('|---|---|---|');
    for (const r of dead) {
      lines.push(`| ${r.status || 'ERR'} | ${r.refCount} | ${r.url} |`);
    }
    lines.push('');
    lines.push('## URL Mati — dokumen yang mengaitkan');
    lines.push('');
    for (const r of dead) {
      lines.push(`### ${r.url} — ${r.status || 'ERR'} (${r.refCount} refs)`);
      lines.push('');
      for (const ref of r.refs) {
        lines.push(`- ${ref.type} \`${ref.id}\` \`${ref.slug}\` — anchor: "${ref.anchor}"`);
      }
      lines.push('');
    }
  } else {
    lines.push('Tidak ada tautan internal mati.');
    lines.push('');
  }

  // Silang katalog produk (Task 4, lewat resolveKnowledgeBase — bukan config
  // mentah, karena mode business_asset menyimpan cadangan lama di sana) dengan
  // tautan yang benar-benar ditemukan saat crawl. Menjawab pertanyaan pemilik:
  // halaman produk mana yang tidak pernah mendapat tautan internal?
  const { knowledge_base } = resolveKnowledgeBase(cfg);
  const urlTertaut = new Map();
  for (const [url, refs] of linkMap) urlTertaut.set(url, refs.length);
  const produkTakTertaut = produkTanpaTautan(knowledge_base.products, urlTertaut);

  lines.push(`- Produk tidak pernah ditautkan: **${produkTakTertaut.length}**`);
  lines.push('');

  if (produkTakTertaut.length) {
    lines.push('## URL produk yang tidak pernah ditautkan');
    lines.push('');
    lines.push('| Produk | URL | Artikel menautkan |');
    lines.push('|---|---|---|');
    for (const p of produkTakTertaut) {
      lines.push(`| ${p.name} | ${p.url || '(belum ada URL)'} | ${p.count === null ? '—' : p.count} |`);
    }
    lines.push('');
  }

  // Artikel tanpa gambar utama: featured_media === 0 berarti WordPress tidak
  // punya gambar unggulan terpasang untuk post/page ini.
  const tanpaGambar = sources.filter((s) => s.featured_media === 0);
  lines.push(`- Artikel tanpa gambar utama: **${tanpaGambar.length}**`);
  lines.push('');

  if (tanpaGambar.length) {
    lines.push('## Artikel tanpa gambar utama');
    lines.push('');
    lines.push('| ID | Slug | Judul |');
    lines.push('|---|---|---|');
    for (const s of tanpaGambar) {
      lines.push(`| ${s.id} | ${s.slug} | ${(s.title && s.title.rendered) || ''} |`);
    }
    lines.push('');
  }

  if (inconclusive.length) {
    lines.push('## Tak Pasti — cek manual');
    lines.push('');
    lines.push('Ini tidak resolve, tapi statusnya tidak membuktikan halaman hilang.');
    lines.push('');
    lines.push('| Status | Refs | URL |');
    lines.push('|---|---|---|');
    for (const r of inconclusive) lines.push(`| ${r.status || 'ERR'} | ${r.refCount} | ${r.url} |`);
    lines.push('');
  }

  if (redirected.length) {
    lines.push('## URL Redirect (resolve, tapi bukan kanonik)');
    lines.push('');
    lines.push('| Refs | Dari | Ke |');
    lines.push('|---|---|---|');
    for (const r of redirected.sort((a, b) => b.refCount - a.refCount)) {
      lines.push(`| ${r.refCount} | ${r.url} | ${r.finalUrl} |`);
    }
    lines.push('');
  }

  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    summary: {
      documents: sources.length, urls: urls.length, dead: dead.length,
      inconclusive: inconclusive.length, redirected: redirected.length,
      produkTakTertaut: produkTakTertaut.length, tanpaGambar: tanpaGambar.length
    },
    rows, produkTakTertaut, tanpaGambar
  }, null, 2), 'utf8');

  console.error(`\nLaporan: ${OUT}`);
  console.error(`JSON:    ${JSON_OUT}`);
  console.log(`URL internal mati: ${dead.length} (${dead.reduce((n, r) => n + r.refCount, 0)} kemunculan)`);
  for (const r of dead.slice(0, 40)) {
    console.log(`  ${r.status || 'ERR'}  x${r.refCount}  ${r.url}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
