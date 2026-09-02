# Blog Autopilot Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pecah skill `blog-autopilot` yang monolitik jadi modular ala `business-asset`, lalu jadikan multi-tenant dengan perkap.com sebagai tenant pertama.

**Architecture:** Strangler — tiap task menghasilkan server yang masih jalan. Urutan: git baseline → tarik logika murni ke `scripts/lib/` dengan test → pindah ke express + `scripts/routes/` per domain → pindah UI ke `public/` → multi-tenant lewat `lib/paths.js` → import data perkap → kredensial ke `.env` → schedule-date + anti-duplikat slug.

**Tech Stack:** Node.js v24 (`node --test` bawaan, tanpa framework test pihak ketiga), Express 4, HTML/JS vanilla di `public/`.

**Spec:** `docs/superpowers/specs/2026-09-03-blog-autopilot-refactor-design.md`

## Global Constraints

- Direktori kerja semua perintah: `G:\Project\Sikil Project\autoblog\.claude\skills\blog-autopilot`
- Node.js v24.20.0 — test pakai `node:test` + `node:assert`, jangan tambah jest/vitest/mocha
- Express 4 (`npm install express`); jangan tambah dependensi lain kecuali disebut eksplisit di task
- Port dashboard tetap `3847`
- Bahasa pesan error dan komentar kode: campur ID/EN mengikuti berkas yang sedang disunting; jangan menerjemahkan teks yang sudah ada
- File kredensial (`.env`) dan `data/blogs/*/` TIDAK PERNAH masuk git
- Password WordPress dan API key Seedream perkap ada di `blog-autopilot-config.json` (`wordpress.app_password` dan `image_api.api_key`). Berkas itu TIDAK di-track git. Keduanya harus lenyap dari berkas yang di-track setelah Task 9. Jangan pernah menyalin nilainya ke dokumen, pesan commit, atau berkas apa pun yang di-track — termasuk rencana ini. Saat perlu memeriksa kebocoran, baca nilainya saat itu juga dari config, jangan ditulis harfiah.
- Tiap task diakhiri commit. Jangan `git push` — belum ada remote.
- Server dijalankan dengan `node scripts/server.js` setelah Task 5; sebelum itu `node dashboard/server.js`
- Untuk menghentikan server: cari PID-nya, JANGAN `Get-Process node | Stop-Process` — itu ikut membunuh server Paperclip di port 3100

---

### Task 1: Git baseline + gitignore

Folder skill belum di bawah git sama sekali (`git status` → `fatal: not a git repository`). Tanpa ini tidak ada titik balik. `.gitignore` harus ada **sebelum** commit pertama: `blog-autopilot-config.json` di repo saat ini berisi password WordPress dan API key Seedream asli.

**Files:**
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Produces: repo git dengan commit baseline; semua task berikutnya commit ke sini

- [ ] **Step 1: Buat `.gitignore`**

```gitignore
node_modules/
.env
data/blogs/*/
blog-autopilot-config.json
articles-cache.json
article-plans.json
agent-queue.json
*.log
.playwright-mcp/
build/
```

- [ ] **Step 2: Buat `.env.example`**

```bash
# Blog Autopilot — kredensial per tenant.
# Salin ke .env lalu isi. Nama variabel = ID tenant huruf besar + underscore.
# ID tenant "perkapcom" → prefix PERKAPCOM_

PERKAPCOM_WP_APP_PASSWORD=
PERKAPCOM_IMAGE_API_KEY=
```

- [ ] **Step 3: Init repo dan pastikan file rahasia tidak ikut**

```bash
git init
git add -A
git status --short
```

Expected: keluaran `git status --short` TIDAK memuat `blog-autopilot-config.json`, `node_modules/`, maupun `.env`. Kalau muncul, perbaiki `.gitignore` dulu sebelum lanjut.

- [ ] **Step 4: Verifikasi tidak ada rahasia yang ter-stage**

```bash
node -e "const c=require('./blog-autopilot-config.json');require('fs').writeFileSync('.rahasia-cek.txt',[c.wordpress&&c.wordpress.app_password,c.image_api&&c.image_api.api_key].filter(Boolean).join('\n'))"
git diff --cached | grep -c -F -f .rahasia-cek.txt
rm .rahasia-cek.txt
```

Expected: `0`. Kalau bukan 0, cari berkasnya, hapus nilainya dari sana (jangan ganti dengan nilai harfiah lain), `git rm --cached` bila perlu, lalu ulangi Step 3. Berkas `.rahasia-cek.txt` bersifat sementara dan wajib dihapus di akhir perintah — jangan sampai ikut ter-commit.

- [ ] **Step 5: Commit baseline**

```bash
git commit -m "chore: baseline sebelum refactor modular"
```

---

### Task 2: lib/html-extract.js + test

Fungsi paling murni di server.js (input HTML → objek), tidak menyentuh http maupun disk. Titik masuk paling aman.

**Files:**
- Create: `scripts/lib/html-extract.js`
- Create: `scripts/lib/html-extract.test.js`
- Modify: `dashboard/server.js` — hapus `extractFromHtml` (baris 56–121), ganti `require`

**Interfaces:**
- Produces: `extractFromHtml(html, sourceUrl)` → `{businessName, description, products, tagline, url}`

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/lib/html-extract.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { extractFromHtml } = require('./html-extract');

test('og:site_name dipakai sebagai nama bisnis', () => {
  const html = `<html><head>
    <meta property="og:site_name" content="Perkap Sewa Alat">
    <title>Halaman Depan - Perkap</title>
  </head><body></body></html>`;
  const r = extractFromHtml(html, 'https://perkap.com');
  assert.strictEqual(r.businessName, 'Perkap Sewa Alat');
});

test('tanpa og:site_name, judul dipakai dan ekor setelah dash dibuang', () => {
  const html = `<html><head><title>Perkap - Sewa Alat Event</title></head><body></body></html>`;
  const r = extractFromHtml(html, 'https://perkap.com');
  assert.strictEqual(r.businessName, 'Perkap');
});

test('tanpa judul apa pun, hostname jadi cadangan terakhir', () => {
  const r = extractFromHtml('<html><body></body></html>', 'https://perkap.com/blog');
  assert.strictEqual(r.businessName, 'perkap.com');
});

test('meta description menang atas paragraf pertama', () => {
  const html = `<html><head>
    <meta name="description" content="Sewa HT, proyektor, dan sound system untuk event di Malang.">
  </head><body><p>${'x'.repeat(120)}</p></body></html>`;
  const r = extractFromHtml(html, 'https://perkap.com');
  assert.match(r.description, /^Sewa HT/);
});

test('paragraf boilerplate cookie/privacy dilewati', () => {
  const html = `<html><body>
    <p>Cookie policy kami menjelaskan bagaimana situs ini menyimpan data Anda selama sesi berlangsung.</p>
    <p>Perkap menyewakan alat event di Malang dengan harga terjangkau dan pengantaran cepat ke lokasi.</p>
  </body></html>`;
  const r = extractFromHtml(html, 'https://perkap.com');
  assert.match(r.description, /^Perkap menyewakan/);
});

test('heading navigasi umum tidak dianggap produk', () => {
  const html = `<html><body>
    <h2>Beranda</h2><h2>Tentang Kami</h2><h2>Sewa HT</h2><h3>Sewa Proyektor</h3>
  </body></html>`;
  const r = extractFromHtml(html, 'https://perkap.com');
  assert.deepStrictEqual(r.products, ['Sewa HT', 'Sewa Proyektor']);
});

test('produk dibatasi maksimal 8 entri', () => {
  const html = '<html><body>' +
    Array.from({ length: 12 }, (_, i) => `<h2>Sewa Alat ${i}</h2>`).join('') +
    '</body></html>';
  const r = extractFromHtml(html, 'https://perkap.com');
  assert.strictEqual(r.products.length, 8);
});

test('tagline kosong kalau og:title sama dengan nama bisnis', () => {
  const html = `<html><head>
    <meta property="og:site_name" content="Perkap">
    <meta property="og:title" content="Perkap">
  </head><body></body></html>`;
  const r = extractFromHtml(html, 'https://perkap.com');
  assert.strictEqual(r.tagline, '');
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `node --test scripts/lib/html-extract.test.js`
Expected: FAIL — `Cannot find module './html-extract'`

- [ ] **Step 3: Pindahkan fungsi ke lib**

Buat `scripts/lib/html-extract.js`. Salin **persis** badan `extractFromHtml` dari `dashboard/server.js` baris 56–121 (jangan ditulis ulang dari ingatan — perilaku regex-nya harus identik), lalu bungkus:

```js
'use strict';

function extractFromHtml(html, sourceUrl) {
  // ... salin persis isi fungsi lama dari dashboard/server.js:56-121 ...
}

module.exports = { extractFromHtml };
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `node --test scripts/lib/html-extract.test.js`
Expected: PASS, 8 test

- [ ] **Step 5: Sambungkan server lama ke lib**

Di `dashboard/server.js`: hapus definisi `extractFromHtml` (baris 56–121), tambahkan di dekat require lain:

```js
const { extractFromHtml } = require('../scripts/lib/html-extract');
```

- [ ] **Step 6: Verifikasi server masih jalan**

```bash
node dashboard/server.js &
sleep 2
curl -s "http://localhost:3847/api/scrape?url=https://perkap.com" | head -c 300
```

Expected: JSON berisi `businessName`. Hentikan server setelah cek (cari PID-nya, jangan bunuh semua node).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/html-extract.js scripts/lib/html-extract.test.js dashboard/server.js
git commit -m "refactor: pindahkan extractFromHtml ke scripts/lib + test"
```

---

### Task 3: lib/articles-cache.js + test

Cache artikel dipisah, dan **path cache jadi argumen** — ini yang bikin multi-tenant di Task 7 tidak perlu menyentuh lib lagi.

**Files:**
- Create: `scripts/lib/articles-cache.js`
- Create: `scripts/lib/articles-cache.test.js`
- Modify: `dashboard/server.js` — hapus `readArticlesCache`/`writeArticlesCache`/`decodeWpEntities`/`mapPost` (baris 122–161)

**Interfaces:**
- Consumes: —
- Produces:
  - `readArticlesCache(cachePath)` → objek cache atau `null`
  - `writeArticlesCache(cachePath, data)` → `void`
  - `decodeWpEntities(s)` → `string`
  - `mapPost(post, categoryMap)` → `{id,title,status,date,modified,category,slug,url}`

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/lib/articles-cache.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readArticlesCache, writeArticlesCache, decodeWpEntities, mapPost } = require('./articles-cache');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ab-')), 'articles-cache.json');
}

test('entity WordPress ter-decode jadi karakter asli', () => {
  assert.strictEqual(decodeWpEntities('Sewa HT &amp; Proyektor'), 'Sewa HT & Proyektor');
  assert.strictEqual(decodeWpEntities('Harga &#8211; Murah'), 'Harga – Murah');
  assert.strictEqual(decodeWpEntities('&#8220;Kutipan&#8221;'), '"Kutipan"');
});

test('tag HTML di judul dibuang', () => {
  assert.strictEqual(decodeWpEntities('Sewa <em>HT</em> Malang'), 'Sewa HT Malang');
});

test('mapPost menghasilkan tepat 8 field', () => {
  const post = {
    id: 11282,
    title: { rendered: 'Sewa Stand Partitur &amp; Mic' },
    status: 'publish',
    date: '2026-04-13T06:00:00',
    modified: '2026-04-14T08:30:00',
    categories: [846],
    slug: 'sewa-stand-partitur-terdekat-malang',
    link: 'https://perkap.com/2026/04/13/sewa-stand-partitur-terdekat-malang/'
  };
  const r = mapPost(post, { 846: 'Sewa Stand Partitur' });
  assert.deepStrictEqual(Object.keys(r).sort(),
    ['category', 'date', 'id', 'modified', 'slug', 'status', 'title', 'url']);
  assert.strictEqual(r.title, 'Sewa Stand Partitur & Mic');
  assert.strictEqual(r.date, '2026-04-13');
  assert.strictEqual(r.modified, '2026-04-14');
  assert.strictEqual(r.category, 'Sewa Stand Partitur');
});

test('kategori tak dikenal jadi Uncategorized', () => {
  const r = mapPost({ id: 1, title: { rendered: 'X' }, status: 'draft', categories: [999], slug: 'x', link: 'u' }, {});
  assert.strictEqual(r.category, 'Uncategorized');
});

test('post tanpa tanggal tidak melempar error', () => {
  const r = mapPost({ id: 2, title: {}, status: 'draft', categories: [], slug: 'y', link: 'u' }, {});
  assert.strictEqual(r.date, '');
  assert.strictEqual(r.modified, '');
  assert.strictEqual(r.title, '');
});

test('tulis lalu baca menghasilkan objek yang sama', () => {
  const p = tmpFile();
  const data = { lastSync: '2026-09-03T00:00:00.000Z', totalCount: 1, articles: [{ id: 1 }] };
  writeArticlesCache(p, data);
  assert.deepStrictEqual(readArticlesCache(p), data);
});

test('cache yang belum ada mengembalikan null, bukan melempar', () => {
  assert.strictEqual(readArticlesCache(path.join(os.tmpdir(), 'tidak-ada-12345.json')), null);
});

test('cache rusak mengembalikan null, bukan melempar', () => {
  const p = tmpFile();
  fs.writeFileSync(p, '{bukan json');
  assert.strictEqual(readArticlesCache(p), null);
});

test('direktori induk dibuat otomatis saat menulis', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-'));
  const p = path.join(dir, 'blogs', 'perkapcom', 'articles-cache.json');
  writeArticlesCache(p, { articles: [] });
  assert.ok(fs.existsSync(p));
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `node --test scripts/lib/articles-cache.test.js`
Expected: FAIL — modul tidak ditemukan

- [ ] **Step 3: Tulis lib**

```js
'use strict';
const fs = require('fs');
const path = require('path');

function readArticlesCache(cachePath) {
  if (!fs.existsSync(cachePath)) return null;
  try { return JSON.parse(fs.readFileSync(cachePath, 'utf-8')); }
  catch (e) { return null; }
}

function writeArticlesCache(cachePath, data) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[articles-cache] write failed:', e.message);
  }
}

function decodeWpEntities(s) {
  return s
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&amp;/g, '&').replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '');
}

function mapPost(post, categoryMap) {
  const catId = Array.isArray(post.categories) && post.categories[0];
  return {
    id: post.id,
    title: decodeWpEntities(post.title && post.title.rendered || ''),
    status: post.status,
    date: post.date ? post.date.split('T')[0] : '',
    modified: post.modified ? post.modified.split('T')[0] : '',
    category: catId && categoryMap[catId] ? categoryMap[catId] : 'Uncategorized',
    slug: post.slug,
    url: post.link
  };
}

module.exports = { readArticlesCache, writeArticlesCache, decodeWpEntities, mapPost };
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `node --test scripts/lib/articles-cache.test.js`
Expected: PASS, 9 test

- [ ] **Step 5: Sambungkan server lama**

Di `dashboard/server.js`: hapus keempat fungsi (baris 122–161), tambahkan require, lalu **tiap pemanggilan disesuaikan** karena sekarang butuh path:

```js
const cacheLib = require('../scripts/lib/articles-cache');
const { decodeWpEntities, mapPost } = cacheLib;
const readArticlesCache = () => cacheLib.readArticlesCache(ARTICLES_CACHE_FILE);
const writeArticlesCache = (data) => cacheLib.writeArticlesCache(ARTICLES_CACHE_FILE, data);
```

Pembungkus ini sengaja dibuat supaya sisa server.js tidak perlu diubah di task ini; pembungkusnya hilang di Task 7.

- [ ] **Step 6: Verifikasi server masih jalan**

```bash
node dashboard/server.js &
sleep 2
curl -s "http://localhost:3847/api/articles?nosync=true" | head -c 200
```

Expected: JSON dengan `articles` (isi bisa kosong kalau cache belum ada — yang penting bukan error).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/articles-cache.js scripts/lib/articles-cache.test.js dashboard/server.js
git commit -m "refactor: pindahkan cache artikel ke scripts/lib, path jadi argumen"
```

---

### Task 4: lib/wp-client.js + lib/wp-sync.js

Bagian yang menyentuh jaringan. Tidak dites langsung (I/O), tapi dipisah supaya route tidak lagi memuat logika HTTP. Kredensial masuk sebagai argumen `auth`, bukan dibaca dari config di dalam — ini menyiapkan Task 9.

**Files:**
- Create: `scripts/lib/wp-client.js`
- Create: `scripts/lib/wp-sync.js`
- Modify: `dashboard/server.js` — hapus `httpGet`, `fetchCategoryMap` (162–200), `doFullSync`, `doIncrementalSync` (202–270)

**Interfaces:**
- Consumes: `mapPost`, `readArticlesCache`, `writeArticlesCache` dari Task 3
- Produces:
  - `basicAuth(username, password)` → string base64
  - `httpGet(reqUrl, auth)` → `Promise<{body, total, totalPages}>`
  - `httpPost(reqUrl, auth, payloadObj)` → `Promise<{statusCode, body}>`
  - `fetchCategoryMap(wpUrl, auth)` → `Promise<{[id]: name}>`
  - `fetchCategories(wpUrl, auth)` → `Promise<Array<{id,name,slug,count}>>`
  - `fullSync({wpUrl, auth, cachePath})` → `Promise<{lastSync, totalCount, articles}>`
  - `incrementalSync({wpUrl, auth, cachePath, existingCache})` → `Promise<{cache, updated}>`

- [ ] **Step 1: Tulis `scripts/lib/wp-client.js`**

```js
'use strict';
const http = require('http');
const https = require('https');

function basicAuth(username, password) {
  return Buffer.from(`${username}:${password}`).toString('base64');
}

function httpGet(reqUrl, auth, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(reqUrl); } catch (e) { return reject(e); }
    const protocol = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: { 'Authorization': 'Basic ' + auth, 'User-Agent': 'BlogAutopilot/1.0' },
      timeout
    };
    const req = protocol.get(options, (resp) => {
      const total = parseInt(resp.headers['x-wp-total'] || '0');
      const totalPages = parseInt(resp.headers['x-wp-totalpages'] || '1');
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve({ body: JSON.parse(data), total, totalPages, statusCode: resp.statusCode }); }
        catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 100))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function httpPost(reqUrl, auth, payloadObj, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(reqUrl); } catch (e) { return reject(e); }
    const protocol = parsed.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(payloadObj);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'BlogAutopilot/1.0'
      },
      timeout
    };
    const req = protocol.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve({ statusCode: resp.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timeout')); });
    req.write(payload);
    req.end();
  });
}

async function fetchCategoryMap(wpUrl, auth) {
  const base = wpUrl.replace(/\/$/, '');
  try {
    const { body } = await httpGet(`${base}/wp-json/wp/v2/categories?per_page=100`, auth);
    const map = {};
    if (Array.isArray(body)) body.forEach(c => { map[c.id] = c.name; });
    return map;
  } catch (e) {
    console.error('[fetchCategoryMap] failed:', e.message);
    return {};
  }
}

async function fetchCategories(wpUrl, auth) {
  const base = wpUrl.replace(/\/$/, '');
  const { body } = await httpGet(
    `${base}/wp-json/wp/v2/categories?per_page=100&orderby=count&order=desc`, auth, 10000);
  if (!Array.isArray(body)) {
    throw new Error('Unexpected response from WordPress: ' + JSON.stringify(body).substring(0, 200));
  }
  return body.filter(c => c.count >= 0).map(c => ({ id: c.id, name: c.name, slug: c.slug, count: c.count }));
}

module.exports = { basicAuth, httpGet, httpPost, fetchCategoryMap, fetchCategories };
```

- [ ] **Step 2: Tulis `scripts/lib/wp-sync.js`**

```js
'use strict';
const { httpGet, fetchCategoryMap } = require('./wp-client');
const { mapPost, writeArticlesCache } = require('./articles-cache');

const FIELDS = '_fields=id,title,status,date,modified,slug,link,categories';

async function fullSync({ wpUrl, auth, cachePath }) {
  const base = (wpUrl || '').replace(/\/$/, '');
  const categoryMap = await fetchCategoryMap(base, auth);
  let allArticles = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { body, totalPages: tp } = await httpGet(
      `${base}/wp-json/wp/v2/posts?${FIELDS}&status=publish,draft&per_page=100&page=${page}&orderby=date&order=desc`,
      auth
    );
    totalPages = tp || 1;
    if (Array.isArray(body)) allArticles = allArticles.concat(body.map(p => mapPost(p, categoryMap)));
    page++;
  } while (page <= totalPages);

  const cache = {
    lastSync: new Date().toISOString(),
    totalCount: allArticles.length,
    articles: allArticles
  };
  writeArticlesCache(cachePath, cache);
  return cache;
}

async function incrementalSync({ wpUrl, auth, cachePath, existingCache }) {
  const base = (wpUrl || '').replace(/\/$/, '');
  const after = existingCache.lastSync;
  const categoryMap = await fetchCategoryMap(base, auth);

  const { body, totalPages } = await httpGet(
    `${base}/wp-json/wp/v2/posts?${FIELDS}&status=publish,draft&per_page=100&orderby=modified&order=desc&modified_after=${after}`,
    auth
  );

  if (!Array.isArray(body) || body.length === 0) {
    return { cache: existingCache, updated: 0 };
  }

  // Lebih dari 100 post berubah: cache parsial tidak bisa dipercaya, ulang penuh.
  if (totalPages > 1) {
    const cache = await fullSync({ wpUrl, auth, cachePath });
    return { cache, updated: cache.totalCount };
  }

  const existingArticles = Array.isArray(existingCache.articles) ? existingCache.articles : [];
  const idMap = new Map(existingArticles.map(a => [a.id, a]));
  body.forEach(p => {
    const mapped = mapPost(p, categoryMap);
    if (mapped.status === 'publish' || mapped.status === 'draft') idMap.set(p.id, mapped);
    else idMap.delete(p.id); // post yang dibuang/hapus keluar dari cache
  });
  const updated = Array.from(idMap.values());

  const cache = {
    lastSync: new Date().toISOString(),
    totalCount: updated.length,
    articles: updated
  };
  writeArticlesCache(cachePath, cache);
  return { cache, updated: body.length };
}

module.exports = { fullSync, incrementalSync };
```

- [ ] **Step 3: Sambungkan server lama**

Di `dashboard/server.js`: hapus `httpGet`, `fetchCategoryMap`, `doFullSync`, `doIncrementalSync`. Tambahkan require dan pembungkus yang menjaga `syncState` tetap seperti semula:

```js
const { basicAuth, fetchCategories } = require('../scripts/lib/wp-client');
const wpSync = require('../scripts/lib/wp-sync');

async function doFullSync(cfg) {
  syncState = { done: false, updated: 0, lastSync: null };
  const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
  const cache = await wpSync.fullSync({ wpUrl: cfg.wordpress.url, auth, cachePath: ARTICLES_CACHE_FILE });
  syncState = { done: true, updated: cache.totalCount, lastSync: cache.lastSync };
}

async function doIncrementalSync(cfg, existingCache) {
  syncState = { done: false, updated: 0, lastSync: existingCache.lastSync };
  const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
  const { cache, updated } = await wpSync.incrementalSync({
    wpUrl: cfg.wordpress.url, auth, cachePath: ARTICLES_CACHE_FILE, existingCache
  });
  syncState = { done: true, updated, lastSync: cache.lastSync };
}
```

Ganti juga blok HTTP manual di route `/api/categories` (baris ~361–430) dengan `await fetchCategories(wpUrl, basicAuth(username, app_password))` di dalam try/catch yang mengembalikan 500 berisi `{error: e.message}`.

- [ ] **Step 4: Verifikasi sync sungguhan jalan**

```bash
node dashboard/server.js &
sleep 2
curl -s "http://localhost:3847/api/articles?nosync=true" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('total',j.totalCount,'lastSync',j.lastSync)})"
```

Expected: `total` bilangan (0 kalau cache kosong), tanpa error. Lalu buka `http://localhost:3847`, tab Articles, klik sync — daftar terisi.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/wp-client.js scripts/lib/wp-sync.js dashboard/server.js
git commit -m "refactor: pindahkan klien WP dan sinkronisasi ke scripts/lib"
```

---

### Task 5: Express + server.js tipis + routes sederhana

Titik balik terbesar. `server.js` baru di `scripts/`, express menggantikan if-chain. Route yang dipindah duluan yang paling sederhana (murni baca/tulis file JSON): events, plans, queue.

**Files:**
- Create: `scripts/server.js`
- Create: `scripts/routes/events.js`, `scripts/routes/plans.js`, `scripts/routes/queue.js`
- Modify: `package.json` — tambah express + script `start`
- Modify: `dashboard/server.js` — dihapus di Step 8

**Interfaces:**
- Consumes: lib dari Task 2–4
- Produces:
  - `deps` object: `{ paths, state, broadcast }` — dipakai semua route
  - `state.syncState` — `{done, updated, lastSync, error?}`
  - `broadcast(event, data)` — kirim SSE ke semua klien
  - Modul route berbentuk `module.exports = function registerX(app, deps) {}`

- [ ] **Step 1: Pasang express**

```bash
npm install express@^4.21.2
git add package.json package-lock.json
```

- [ ] **Step 2: Tulis `scripts/server.js`**

```js
#!/usr/bin/env node
'use strict';
const path = require('path');
const express = require('express');

const PORT = 3847;
const SKILL_DIR = path.join(__dirname, '..');
const CONFIG_FILE = path.join(SKILL_DIR, 'blog-autopilot-config.json');
const ARTICLES_CACHE_FILE = path.join(SKILL_DIR, 'articles-cache.json');
const PLANS_FILE = path.join(SKILL_DIR, 'article-plans.json');
const QUEUE_FILE = path.join(SKILL_DIR, 'agent-queue.json');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const sseClients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(msg); } catch (e) { sseClients.delete(client); }
  });
}

const state = { syncState: { done: true, updated: 0, lastSync: null }, sseClients };
const paths = { SKILL_DIR, CONFIG_FILE, ARTICLES_CACHE_FILE, PLANS_FILE, QUEUE_FILE };
const deps = { paths, state, broadcast };

require('./routes/events')(app, deps);
require('./routes/plans')(app, deps);
require('./routes/queue')(app, deps);

app.use(express.static(path.join(SKILL_DIR, 'dashboard')));

const server = app.listen(PORT, () => {
  const dashboardUrl = `http://localhost:${PORT}`;
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║        Blog Autopilot Dashboard        ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`🌐 Dashboard: ${dashboardUrl}`);
  console.log(`📁 Config   : ${CONFIG_FILE}`);
  console.log('\nPress Ctrl+C to stop\n');
  const { exec } = require('child_process');
  const openCmd = process.platform === 'win32' ? `start ${dashboardUrl}`
    : process.platform === 'darwin' ? `open ${dashboardUrl}` : `xdg-open ${dashboardUrl}`;
  exec(openCmd);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} already in use.`);
    console.error(`Try: http://localhost:${PORT} — it may already be running.\n`);
  } else console.error(e);
  process.exit(1);
});

process.on('SIGINT', () => { console.log('\n\nDashboard stopped.'); process.exit(0); });
```

- [ ] **Step 3: Tulis `scripts/routes/events.js`**

```js
'use strict';

module.exports = function registerEvents(app, deps) {
  const { sseClients } = deps.state;

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('event: connected\ndata: {}\n\n');
    sseClients.add(res);
    res.on('error', () => sseClients.delete(res));
    req.on('close', () => sseClients.delete(res));
  });
};
```

- [ ] **Step 4: Tulis `scripts/routes/plans.js`**

```js
'use strict';
const fs = require('fs');

module.exports = function registerPlans(app, deps) {
  const { PLANS_FILE } = deps.paths;
  const { broadcast } = deps;

  function readPlans() {
    if (!fs.existsSync(PLANS_FILE)) return { plans: [] };
    try { return JSON.parse(fs.readFileSync(PLANS_FILE, 'utf-8')); }
    catch (e) { return { plans: [] }; }
  }

  app.get('/api/plans', (req, res) => res.json(readPlans()));

  app.post('/api/plans', (req, res) => {
    const plan = req.body || {};
    if (!plan.keyword) return res.status(400).json({ error: 'keyword is required' });
    const data = readPlans();
    const now = new Date().toISOString();
    const idx = data.plans.findIndex(p => p.id === plan.id);
    let created = false;
    if (idx === -1) {
      plan.created_at = now; plan.updated_at = now;
      data.plans.unshift(plan); created = true;
    } else {
      plan.created_at = data.plans[idx].created_at;
      plan.updated_at = now;
      data.plans[idx] = plan;
    }
    fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2));
    broadcast('plan_saved', { plan_id: plan.id, keyword: plan.keyword, title: plan.title || plan.keyword });
    res.json({ success: true, created, id: plan.id });
  });

  app.delete('/api/plans', (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const data = readPlans();
    const before = data.plans.length;
    data.plans = data.plans.filter(p => p.id !== id);
    if (data.plans.length === before) return res.status(404).json({ error: 'Plan not found' });
    fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
  });
};
```

- [ ] **Step 5: Tulis `scripts/routes/queue.js`**

```js
'use strict';
const fs = require('fs');

module.exports = function registerQueue(app, deps) {
  const { QUEUE_FILE } = deps.paths;
  const { broadcast } = deps;

  function readQueue() {
    if (!fs.existsSync(QUEUE_FILE)) return { tasks: [] };
    try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); }
    catch (e) { console.error('Failed to parse queue file:', e.message); return { tasks: [] }; }
  }

  app.get('/api/agent-queue', (req, res) => res.json(readQueue()));

  app.post('/api/agent-queue', (req, res) => {
    const task = req.body || {};
    if (!task.type || !task.input) return res.status(400).json({ error: 'type and input are required' });
    const data = readQueue();
    const now = new Date().toISOString();
    task.id = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    task.status = 'pending';
    task.progress = task.type === 'auto_generate'
      ? { current: 0, total: task.input.count || 5 }
      : (task.progress || { current: 0, total: 0 });
    task.results = [];
    task.error = null;
    task.created_at = now;
    task.updated_at = now;
    data.tasks.unshift(task);
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
    broadcast('queue_updated', { id: task.id, status: task.status, progress: task.progress, input: task.input });
    res.json({ success: true, id: task.id });
  });

  app.patch('/api/agent-queue', (req, res) => {
    const update = req.body || {};
    if (!update.id) return res.status(400).json({ error: 'id is required' });
    const data = readQueue();
    const idx = data.tasks.findIndex(t => t.id === update.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });
    if (update.status !== undefined) data.tasks[idx].status = update.status;
    if (update.progress !== undefined) data.tasks[idx].progress = update.progress;
    if (update.results !== undefined) data.tasks[idx].results = update.results;
    if (update.error !== undefined) data.tasks[idx].error = update.error;
    data.tasks[idx].updated_at = new Date().toISOString();
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
    broadcast('queue_updated', { id: update.id, status: data.tasks[idx].status, progress: data.tasks[idx].progress });
    res.json({ success: true });
  });
};
```

- [ ] **Step 6: Tambah script start di `package.json`**

```json
{
  "scripts": {
    "start": "node scripts/server.js",
    "test": "node --test scripts/lib/"
  },
  "dependencies": {
    "express": "^4.21.2"
  },
  "devDependencies": {
    "archiver": "^7.0.1"
  }
}
```

- [ ] **Step 7: Verifikasi ketiga route baru**

```bash
node scripts/server.js &
sleep 2
curl -s http://localhost:3847/api/plans
curl -s http://localhost:3847/api/agent-queue
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3847/
```

Expected: `{"plans":[...]}`, `{"tasks":[...]}`, `200`.

- [ ] **Step 8: Pindahkan sisa route dari server lama**

Buat `scripts/routes/config.js` (`/api/config` GET+POST, `/api/categories` GET, plus fungsi `withSeoDefaults` dari `dashboard/server.js:274-289`), `scripts/routes/articles.js` (`/api/articles`, `/api/articles/sync-status`, `/api/articles/toggle` — pakai `wpSync` dan `httpPost` dari lib, bukan HTTP manual), dan `scripts/routes/scrape.js` (`/api/scrape` — pakai `extractFromHtml` dari lib). Daftarkan ketiganya di `scripts/server.js` sebelum `express.static`. Setelah semua pindah, hapus `dashboard/server.js`.

- [ ] **Step 9: Verifikasi seluruh endpoint**

```bash
node scripts/server.js &
sleep 2
for p in /api/config /api/plans /api/agent-queue /api/articles?nosync=true /api/articles/sync-status; do
  printf "%s -> %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3847$p")"
done
```

Expected: semua `200`. Lalu buka dashboard, klik kelima tab, pastikan tidak ada error baru di console browser.

- [ ] **Step 10: Commit**

```bash
git add scripts/server.js scripts/routes/ package.json package-lock.json
git rm dashboard/server.js
git commit -m "refactor: pindah ke express, pecah endpoint jadi scripts/routes"
```

---

### Task 6: Pindahkan UI ke public/

Murni pemindahan berkas — tidak ada perubahan perilaku. `index.html` 3968 baris: CSS 7–1294, markup 1294–2379, JS 2379–3966 (103 fungsi).

**Files:**
- Create: `public/index.html`, `public/styles/main.css`, `public/js/app.js`
- Modify: `scripts/server.js` — `express.static` menunjuk `public/`
- Delete: `dashboard/index.html`

**Interfaces:**
- Produces: `public/` sebagai root statis

- [ ] **Step 1: Pindahkan berkas dengan git supaya riwayat terjaga**

```bash
mkdir -p public/js public/styles
git mv dashboard/index.html public/index.html
rmdir dashboard
```

- [ ] **Step 2: Arahkan static ke public**

Di `scripts/server.js` ganti:

```js
app.use(express.static(path.join(SKILL_DIR, 'public')));
```

- [ ] **Step 3: Verifikasi dashboard masih tampil**

```bash
node scripts/server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3847/
```

Expected: `200`, dan dashboard terbuka normal di browser.

- [ ] **Step 4: Commit titik aman sebelum memecah isi**

```bash
git add -A
git commit -m "refactor: pindahkan dashboard ke public/"
```

- [ ] **Step 5: Keluarkan CSS**

Potong isi antara `<style>` (baris 7) dan `</style>` (1294) ke `public/styles/main.css`, ganti dengan:

```html
<link rel="stylesheet" href="/styles/main.css">
```

- [ ] **Step 6: Keluarkan JS**

Potong isi antara `<script>` (2379) dan `</script>` (3966) ke `public/js/app.js`, ganti dengan:

```html
<script src="/js/app.js"></script>
```

- [ ] **Step 7: Verifikasi dari UI dengan Playwright**

Buka `http://localhost:3847`, klik tiap tab (Settings, Knowledge Base, Articles, Perencanaan, How to Use, Setup Wizard), ambil screenshot, dan baca console log.
Expected: semua tab tampil, console tanpa error selain `favicon.ico` 404 yang memang sudah ada sebelumnya.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: pisahkan CSS dan JS dashboard ke berkas sendiri"
```

---

### Task 7: Multi-tenant lewat lib/paths.js

Satu modul jadi satu-satunya yang tahu lokasi berkas. Endpoint lama tetap ada dan otomatis memakai tenant aktif, jadi `public/js/app.js` belum perlu diubah.

**Files:**
- Create: `scripts/lib/paths.js`, `scripts/lib/paths.test.js`, `scripts/routes/blogs.js`
- Modify: `scripts/server.js`, semua berkas di `scripts/routes/`

**Interfaces:**
- Produces:
  - `sanitizeId(raw)` → string aman untuk nama folder (huruf kecil, angka, dash)
  - `blogsDir()` → `<SKILL_DIR>/data/blogs`
  - `blogDir(id)`, `configPath(id)`, `cachePath(id)`, `plansPath(id)`, `queuePath(id)`
  - `listBlogs()` → `string[]`
  - `activeBlog()` → id tenant aktif; membuat `_active` berisi tenant pertama kalau belum ada
  - `setActiveBlog(id)` → `void`, melempar kalau tenant tidak ada

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/lib/paths.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeId, makePaths } = require('./paths');

function tmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ab-paths-')); }

test('id dibersihkan jadi aman untuk nama folder', () => {
  assert.strictEqual(sanitizeId('Perkap.com'), 'perkapcom');
  assert.strictEqual(sanitizeId('Blog Saya!'), 'blog-saya');
  assert.strictEqual(sanitizeId('  spasi  '), 'spasi');
});

test('id yang mencoba keluar folder ditolak', () => {
  assert.throws(() => sanitizeId('../rahasia'), /tidak valid/i);
  assert.throws(() => sanitizeId(''), /tidak valid/i);
  assert.throws(() => sanitizeId('...'), /tidak valid/i);
});

test('path tenant tersusun di bawah data/blogs', () => {
  const p = makePaths(tmpRoot());
  assert.ok(p.configPath('perkapcom').endsWith(path.join('data', 'blogs', 'perkapcom', 'config.json')));
  assert.ok(p.cachePath('perkapcom').endsWith('articles-cache.json'));
});

test('listBlogs kosong kalau folder belum ada', () => {
  const p = makePaths(tmpRoot());
  assert.deepStrictEqual(p.listBlogs(), []);
});

test('listBlogs hanya memuat direktori, mengabaikan berkas _active', () => {
  const root = tmpRoot();
  const p = makePaths(root);
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'perkapcom'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'blogs', '_active'), 'perkapcom');
  assert.deepStrictEqual(p.listBlogs(), ['perkapcom']);
});

test('activeBlog memilih tenant pertama kalau _active belum ada', () => {
  const root = tmpRoot();
  const p = makePaths(root);
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'perkapcom'), { recursive: true });
  assert.strictEqual(p.activeBlog(), 'perkapcom');
  assert.strictEqual(fs.readFileSync(path.join(root, 'data', 'blogs', '_active'), 'utf-8').trim(), 'perkapcom');
});

test('activeBlog null kalau belum ada tenant sama sekali', () => {
  assert.strictEqual(makePaths(tmpRoot()).activeBlog(), null);
});

test('setActiveBlog menolak tenant yang tidak ada', () => {
  const p = makePaths(tmpRoot());
  assert.throws(() => p.setActiveBlog('tidakada'), /tidak ditemukan/i);
});

test('setActiveBlog mengubah tenant aktif', () => {
  const root = tmpRoot();
  const p = makePaths(root);
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'satu'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'dua'), { recursive: true });
  p.setActiveBlog('dua');
  assert.strictEqual(p.activeBlog(), 'dua');
});

test('_active yang menunjuk tenant terhapus jatuh ke tenant tersisa', () => {
  const root = tmpRoot();
  const p = makePaths(root);
  fs.mkdirSync(path.join(root, 'data', 'blogs', 'satu'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'blogs', '_active'), 'sudah-dihapus');
  assert.strictEqual(p.activeBlog(), 'satu');
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `node --test scripts/lib/paths.test.js`
Expected: FAIL — modul tidak ditemukan

- [ ] **Step 3: Tulis `scripts/lib/paths.js`**

```js
'use strict';
const fs = require('fs');
const path = require('path');

function sanitizeId(raw) {
  const id = String(raw == null ? '' : raw).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!id) throw new Error(`ID blog tidak valid: "${raw}"`);
  return id;
}

function makePaths(skillDir) {
  const blogsDir = () => path.join(skillDir, 'data', 'blogs');
  const blogDir = (id) => path.join(blogsDir(), sanitizeId(id));
  const activeFile = () => path.join(blogsDir(), '_active');

  function listBlogs() {
    const dir = blogsDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  }

  function activeBlog() {
    const blogs = listBlogs();
    if (blogs.length === 0) return null;
    const f = activeFile();
    if (fs.existsSync(f)) {
      const id = fs.readFileSync(f, 'utf-8').trim();
      if (blogs.includes(id)) return id;
    }
    // _active hilang atau menunjuk tenant yang sudah dihapus: jatuh ke tenant pertama.
    fs.writeFileSync(f, blogs[0], 'utf-8');
    return blogs[0];
  }

  function setActiveBlog(id) {
    const clean = sanitizeId(id);
    if (!listBlogs().includes(clean)) throw new Error(`Blog "${clean}" tidak ditemukan`);
    fs.mkdirSync(blogsDir(), { recursive: true });
    fs.writeFileSync(activeFile(), clean, 'utf-8');
  }

  return {
    skillDir,
    blogsDir, blogDir, listBlogs, activeBlog, setActiveBlog,
    configPath: (id) => path.join(blogDir(id), 'config.json'),
    cachePath: (id) => path.join(blogDir(id), 'articles-cache.json'),
    plansPath: (id) => path.join(blogDir(id), 'article-plans.json'),
    queuePath: (id) => path.join(blogDir(id), 'agent-queue.json')
  };
}

module.exports = { sanitizeId, makePaths };
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `node --test scripts/lib/paths.test.js`
Expected: PASS, 10 test

- [ ] **Step 5: Ganti path tetap di server.js dengan paths**

Di `scripts/server.js`, buang keempat konstanta `CONFIG_FILE`/`ARTICLES_CACHE_FILE`/`PLANS_FILE`/`QUEUE_FILE`, ganti:

```js
const { makePaths } = require('./lib/paths');
const paths = makePaths(SKILL_DIR);
const deps = { paths, state, broadcast };
```

Di tiap route, ganti pemakaian konstanta jadi resolusi per-permintaan. Pola bakunya — tenant boleh dipilih lewat `?blog=`, kalau tidak ada pakai tenant aktif:

```js
function resolveBlog(req) {
  const id = req.query.blog || req.body?.blog || deps.paths.activeBlog();
  if (!id) throw new Error('Belum ada blog. Buat dulu lewat POST /api/blogs.');
  return id;
}
```

- [ ] **Step 6: Tulis `scripts/routes/blogs.js`**

```js
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function registerBlogs(app, deps) {
  const { paths } = deps;
  const { sanitizeId } = require('../lib/paths');

  app.get('/api/blogs', (req, res) => {
    const blogs = paths.listBlogs().map(id => {
      let name = id;
      try {
        const cfg = JSON.parse(fs.readFileSync(paths.configPath(id), 'utf-8'));
        name = cfg.knowledge_base?.business_name || cfg.wordpress?.url || id;
      } catch (e) { /* config belum ada atau rusak: pakai id */ }
      return { id, name };
    });
    res.json({ blogs, active: paths.activeBlog() });
  });

  app.post('/api/blogs', (req, res) => {
    try {
      const id = sanitizeId(req.body?.id);
      if (paths.listBlogs().includes(id)) {
        return res.status(409).json({ error: `Blog "${id}" sudah ada` });
      }
      const tplPath = path.join(paths.skillDir, 'config.template.json');
      const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf-8'));
      const clean = JSON.parse(JSON.stringify(tpl, (k, v) => k.startsWith('_') ? undefined : v));
      fs.mkdirSync(paths.blogDir(id), { recursive: true });
      fs.writeFileSync(paths.configPath(id), JSON.stringify(clean, null, 2), 'utf-8');
      if (!paths.activeBlog()) paths.setActiveBlog(id);
      res.json({ success: true, id });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/blogs/:id/config', (req, res) => {
    try {
      const p = paths.configPath(req.params.id);
      if (!fs.existsSync(p)) return res.status(404).json({ error: 'Config tidak ditemukan' });
      res.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.put('/api/blogs/:id/config', (req, res) => {
    try {
      const p = paths.configPath(req.params.id);
      if (!fs.existsSync(path.dirname(p))) return res.status(404).json({ error: 'Blog tidak ditemukan' });
      fs.writeFileSync(p, JSON.stringify(req.body, null, 2), 'utf-8');
      res.json({ success: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/blogs/active', (req, res) => {
    try {
      paths.setActiveBlog(req.body?.id);
      res.json({ success: true, active: paths.activeBlog() });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
};
```

Daftarkan di `scripts/server.js`: `require('./routes/blogs')(app, deps);`

- [ ] **Step 7: Tambah pemilih tenant di dashboard**

Di `public/index.html`, tepat di bawah judul sidebar, tambahkan:

```html
<div class="blog-switcher">
  <select id="blogSelect" aria-label="Pilih blog"></select>
</div>
```

Di `public/js/app.js` tambahkan:

```js
async function loadBlogs() {
  const r = await fetch('/api/blogs').then(x => x.json());
  const sel = document.getElementById('blogSelect');
  if (!sel) return;
  sel.innerHTML = (r.blogs || [])
    .map(b => `<option value="${b.id}"${b.id === r.active ? ' selected' : ''}>${b.name}</option>`)
    .join('');
  sel.onchange = async () => {
    await fetch('/api/blogs/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sel.value })
    });
    location.reload();
  };
}
loadBlogs();
```

- [ ] **Step 8: Verifikasi multi-tenant**

```bash
node scripts/server.js &
sleep 2
curl -s -X POST http://localhost:3847/api/blogs -H "Content-Type: application/json" -d '{"id":"uji-coba"}'
curl -s http://localhost:3847/api/blogs
```

Expected: `{"success":true,"id":"uji-coba"}`, lalu daftar memuat `uji-coba` dan `active` terisi. Hapus folder uji setelahnya: `rm -rf data/blogs/uji-coba`.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/paths.js scripts/lib/paths.test.js scripts/routes/ scripts/server.js public/
git commit -m "feat: multi-tenant lewat data/blogs + lib/paths"
```

---

### Task 8: Import tenant perkap

Sumbernya `G:\Project\Perkap Article\` — perhatikan berkasnya ada di **root project**, bukan di dalam `.claude/skills/blog-autopilot/`. Instalasi itu versi lama.

**Files:**
- Create: `scripts/import-blog.js`

**Interfaces:**
- Consumes: `makePaths`, `sanitizeId` dari Task 7
- Produces: `data/blogs/perkapcom/` berisi config + cache + plans + queue

- [ ] **Step 1: Tulis `scripts/import-blog.js`**

```js
#!/usr/bin/env node
'use strict';
// Impor instalasi blog-autopilot lama jadi satu tenant.
// Pemakaian: node scripts/import-blog.js "<folder-sumber>" <id-tenant>
//
// Password dan API key TIDAK ditulis ke berkas mana pun — dicetak ke layar
// supaya kamu sendiri yang menempelkannya ke .env.

const fs = require('fs');
const path = require('path');
const { makePaths, sanitizeId } = require('./lib/paths');

const [srcArg, idArg] = process.argv.slice(2);
if (!srcArg || !idArg) {
  console.error('Pemakaian: node scripts/import-blog.js "<folder-sumber>" <id-tenant>');
  process.exit(1);
}
if (!fs.existsSync(srcArg)) {
  console.error(`❌ Folder sumber tidak ada: ${srcArg}`);
  process.exit(1);
}

const id = sanitizeId(idArg);
const paths = makePaths(path.join(__dirname, '..'));

if (paths.listBlogs().includes(id)) {
  console.error(`❌ Tenant "${id}" sudah ada. Hapus dulu data/blogs/${id} kalau ingin impor ulang.`);
  process.exit(1);
}

const srcConfig = path.join(srcArg, 'blog-autopilot-config.json');
if (!fs.existsSync(srcConfig)) {
  console.error(`❌ Tidak ada blog-autopilot-config.json di ${srcArg}`);
  console.error('   Berkas ini ada di ROOT project instalasi lama, bukan di dalam .claude/skills/.');
  process.exit(1);
}

fs.mkdirSync(paths.blogDir(id), { recursive: true });

const cfg = JSON.parse(fs.readFileSync(srcConfig, 'utf-8'));
const prefix = id.toUpperCase().replace(/-/g, '_');
const secrets = [];

if (cfg.wordpress?.app_password) {
  secrets.push([`${prefix}_WP_APP_PASSWORD`, cfg.wordpress.app_password]);
  delete cfg.wordpress.app_password;
}
if (cfg.image_api?.api_key) {
  secrets.push([`${prefix}_IMAGE_API_KEY`, cfg.image_api.api_key]);
  delete cfg.image_api.api_key;
}

fs.writeFileSync(paths.configPath(id), JSON.stringify(cfg, null, 2), 'utf-8');
console.log(`✅ config.json  → data/blogs/${id}/config.json`);

const copies = [
  ['articles-cache.json', paths.cachePath(id)],
  ['article-plans.json', paths.plansPath(id)],
  ['agent-queue.json', paths.queuePath(id)]
];
for (const [name, dest] of copies) {
  const src = path.join(srcArg, name);
  if (!fs.existsSync(src)) { console.log(`⏭️  ${name} tidak ada di sumber, dilewati`); continue; }
  fs.copyFileSync(src, dest);
  let info = '';
  try {
    const d = JSON.parse(fs.readFileSync(dest, 'utf-8'));
    const n = (d.articles || d.plans || d.tasks || []).length;
    info = ` (${n} entri)`;
  } catch (e) { info = ' (tidak terbaca sebagai JSON)'; }
  console.log(`✅ ${name}${info}`);
}

if (!paths.activeBlog()) paths.setActiveBlog(id);

console.log(`\n📋 Tempelkan baris berikut ke .env (berkas ini TIDAK ditulis otomatis):\n`);
for (const [k, v] of secrets) console.log(`${k}=${v}`);
if (secrets.length === 0) console.log('(tidak ada kredensial di config sumber)');
console.log(`\nSelesai. Tenant aktif: ${paths.activeBlog()}`);
```

- [ ] **Step 2: Jalankan impor**

```bash
node scripts/import-blog.js "G:/Project/Perkap Article" perkapcom
```

Expected: config + 3 berkas tersalin, `articles-cache.json (583 entri)`, lalu dua baris env tercetak.

- [ ] **Step 3: Tempelkan kredensial ke .env**

Salin dua baris yang tercetak ke berkas `.env` di root skill. Jangan commit berkas ini — sudah masuk `.gitignore` di Task 1.

- [ ] **Step 4: Pastikan tidak ada rahasia yang tersimpan di data tenant**

```bash
node -e "const c=require('G:/Project/Perkap Article/blog-autopilot-config.json');require('fs').writeFileSync('.rahasia-cek.txt',[c.wordpress&&c.wordpress.app_password,c.image_api&&c.image_api.api_key].filter(Boolean).join('\n'))"
grep -r -F -f .rahasia-cek.txt data/ ; echo "exit=$?"
rm .rahasia-cek.txt
```

Expected: `exit=1` (grep tidak menemukan apa pun di `data/`). Kredensial harus hanya ada di `.env`.

- [ ] **Step 5: Verifikasi dari dashboard**

Jalankan `node scripts/server.js`, buka `http://localhost:3847`.
Expected: pemilih blog menampilkan tenant perkap; tab Articles memuat 583 artikel; tab Settings menampilkan 20+ kategori tersimpan (Sewa HT 76, Sewa Proyektor 59, dst).

- [ ] **Step 6: Commit**

```bash
git add scripts/import-blog.js
git commit -m "feat: importer instalasi lama jadi tenant"
```

---

### Task 9: Kredensial ke .env

Setelah task ini, tidak ada satu pun password di berkas yang di-track git, dan tidak ada password di `argv`.

**Files:**
- Create: `scripts/lib/env.js`, `scripts/lib/env.test.js`
- Modify: `scripts/routes/config.js`, `scripts/routes/articles.js`, `scripts/server.js`
- Modify: `scripts/post-to-wp.js`, `scripts/upload-image.js`

**Interfaces:**
- Consumes: config tenant dari Task 7
- Produces:
  - `loadDotEnv(filePath)` → `void`, mengisi `process.env` (tidak menimpa yang sudah ada)
  - `envKeys(blogId)` → `{wpPassword: 'PREFIX_WP_APP_PASSWORD', imageKey: 'PREFIX_IMAGE_API_KEY'}`
  - `resolveCredentials(blogId, config, env = process.env)` → `{wordpress: {url, username, app_password}, image_api: {type, api_key}}`; melempar `Error` yang menyebut nama variabel kalau kurang

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/lib/env.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadDotEnv, envKeys, resolveCredentials } = require('./env');

const cfg = () => ({
  wordpress: { url: 'https://perkap.com', username: 'faizallazuar' },
  image_api: { type: 'seedream' }
});

test('nama variabel diturunkan dari id tenant', () => {
  assert.deepStrictEqual(envKeys('perkapcom'), {
    wpPassword: 'PERKAPCOM_WP_APP_PASSWORD',
    imageKey: 'PERKAPCOM_IMAGE_API_KEY'
  });
  assert.strictEqual(envKeys('blog-saya').wpPassword, 'BLOG_SAYA_WP_APP_PASSWORD');
});

test('kredensial lengkap tergabung ke config', () => {
  const r = resolveCredentials('perkapcom', cfg(), {
    PERKAPCOM_WP_APP_PASSWORD: 'rahasia',
    PERKAPCOM_IMAGE_API_KEY: 'kunci'
  });
  assert.strictEqual(r.wordpress.app_password, 'rahasia');
  assert.strictEqual(r.image_api.api_key, 'kunci');
  assert.strictEqual(r.wordpress.username, 'faizallazuar');
});

test('password hilang melempar error yang MENYEBUT nama variabelnya', () => {
  assert.throws(() => resolveCredentials('perkapcom', cfg(), {}),
    /PERKAPCOM_WP_APP_PASSWORD/);
});

test('image key hilang tidak melempar kalau tipe none', () => {
  const c = cfg(); c.image_api.type = 'none';
  const r = resolveCredentials('perkapcom', c, { PERKAPCOM_WP_APP_PASSWORD: 'x' });
  assert.strictEqual(r.image_api.api_key, '');
});

test('image key hilang melempar kalau tipe butuh kunci', () => {
  assert.throws(() => resolveCredentials('perkapcom', cfg(), { PERKAPCOM_WP_APP_PASSWORD: 'x' }),
    /PERKAPCOM_IMAGE_API_KEY/);
});

test('config asli tidak ikut berubah', () => {
  const c = cfg();
  resolveCredentials('perkapcom', c, { PERKAPCOM_WP_APP_PASSWORD: 'x', PERKAPCOM_IMAGE_API_KEY: 'y' });
  assert.strictEqual(c.wordpress.app_password, undefined);
});

test('loadDotEnv membaca pasangan kunci-nilai dan melewati komentar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-env-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, '# komentar\nFOO_BAR=nilai satu\n\nKOSONG=\n');
  const env = {};
  loadDotEnv(f, env);
  assert.strictEqual(env.FOO_BAR, 'nilai satu');
  assert.strictEqual(env.KOSONG, '');
  assert.strictEqual(env['# komentar'], undefined);
});

test('loadDotEnv tidak menimpa variabel yang sudah ada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-env-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, 'FOO=dari-berkas\n');
  const env = { FOO: 'dari-shell' };
  loadDotEnv(f, env);
  assert.strictEqual(env.FOO, 'dari-shell');
});

test('loadDotEnv diam saja kalau berkas tidak ada', () => {
  const env = {};
  loadDotEnv(path.join(os.tmpdir(), 'tidak-ada-98765.env'), env);
  assert.deepStrictEqual(env, {});
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `node --test scripts/lib/env.test.js`
Expected: FAIL — modul tidak ditemukan

- [ ] **Step 3: Tulis `scripts/lib/env.js`**

```js
'use strict';
const fs = require('fs');

// Tipe image_api yang tidak memerlukan API key.
const NO_KEY_TYPES = new Set(['none', '']);

function loadDotEnv(filePath, env = process.env) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf-8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!key) continue;
    if (env[key] === undefined) env[key] = value; // shell menang atas berkas
  }
}

function envKeys(blogId) {
  const prefix = String(blogId).toUpperCase().replace(/-/g, '_');
  return {
    wpPassword: `${prefix}_WP_APP_PASSWORD`,
    imageKey: `${prefix}_IMAGE_API_KEY`
  };
}

function resolveCredentials(blogId, config, env = process.env) {
  const keys = envKeys(blogId);
  const cfg = JSON.parse(JSON.stringify(config || {}));

  const wpPassword = env[keys.wpPassword];
  if (!wpPassword) {
    throw new Error(
      `Kredensial WordPress untuk blog "${blogId}" belum diset. ` +
      `Tambahkan ${keys.wpPassword}=... ke berkas .env di root skill ` +
      `(lihat .env.example).`
    );
  }
  cfg.wordpress = { ...(cfg.wordpress || {}), app_password: wpPassword };

  const imageType = cfg.image_api?.type || 'none';
  const imageKey = env[keys.imageKey] || '';
  if (!imageKey && !NO_KEY_TYPES.has(imageType)) {
    throw new Error(
      `API key gambar untuk blog "${blogId}" belum diset (image_api.type = "${imageType}"). ` +
      `Tambahkan ${keys.imageKey}=... ke berkas .env, atau set image_api.type ke "none".`
    );
  }
  cfg.image_api = { ...(cfg.image_api || {}), api_key: imageKey };

  return cfg;
}

module.exports = { loadDotEnv, envKeys, resolveCredentials, NO_KEY_TYPES };
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `node --test scripts/lib/env.test.js`
Expected: PASS, 9 test

- [ ] **Step 5: Muat .env saat server start**

Di `scripts/server.js`, paling atas setelah require:

```js
const { loadDotEnv } = require('./lib/env');
loadDotEnv(path.join(SKILL_DIR, '.env'));
```

- [ ] **Step 6: Pakai resolveCredentials di route**

Di tiap route yang membaca config untuk memanggil WordPress (`config.js` untuk `/api/categories`, `articles.js` untuk sync dan toggle), bungkus pembacaan config:

```js
const { resolveCredentials } = require('../lib/env');
// ...
let cfg;
try {
  cfg = resolveCredentials(blogId, JSON.parse(fs.readFileSync(paths.configPath(blogId), 'utf-8')));
} catch (e) {
  return res.status(400).json({ error: e.message });
}
```

Route `GET /api/config` **tidak** memakai `resolveCredentials` — dashboard tidak boleh menerima password. Kirim config apa adanya (tanpa `app_password`/`api_key`), plus penanda:

```js
res.json({ ...cfg, _credentials: { wpPasswordSet: !!process.env[envKeys(blogId).wpPassword] } });
```

- [ ] **Step 7: Ubah script agar membaca env, bukan argv**

Di `scripts/post-to-wp.js` dan `scripts/upload-image.js`: hapus `--password` dari argumen yang diterima. Ganti dengan pembacaan env di awal berkas:

```js
const { loadDotEnv, envKeys } = require('./lib/env');
loadDotEnv(require('path').join(__dirname, '..', '.env'));
const blogId = args.blog || 'perkapcom';
const password = process.env[envKeys(blogId).wpPassword];
if (!password) {
  console.error(`❌ ${envKeys(blogId).wpPassword} belum diset di .env`);
  process.exit(1);
}
```

Alasan: `argv` terlihat di `ps` dan masuk ke log intersepsi perintah. Perkap sudah memperbaiki ini (PER-2297).

- [ ] **Step 8: Verifikasi error menyebut nama variabel, bukan 401**

```bash
mv .env .env.simpan
node scripts/server.js &
sleep 2
curl -s "http://localhost:3847/api/categories"
mv .env.simpan .env
```

Expected: pesan memuat `PERKAPCOM_WP_APP_PASSWORD`, bukan `401` atau `Unauthorized`.

- [ ] **Step 9: Verifikasi dengan .env terpasang**

```bash
node scripts/server.js &
sleep 2
curl -s "http://localhost:3847/api/categories" | head -c 200
```

Expected: JSON array kategori (Sewa HT, dst).

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/env.js scripts/lib/env.test.js scripts/routes/ scripts/server.js scripts/post-to-wp.js scripts/upload-image.js
git commit -m "feat: kredensial pindah ke .env per tenant, keluar dari argv"
```

---

### Task 10: Schedule-date otomatis

Disalin dari `Perkap_com/project/article/.claude/skills/post-article/scripts/find-schedule-date.js`, dengan dua perubahan wajib:

1. Sumber tanggal terpakai: `articles-cache.json` (field `date`), bukan `Index_Published.csv`
2. Offset zona waktu jadi **per tenant** — berkas asli mengunci `SITE_GMT_OFFSET_HOURS = 7` untuk perkap.com. Blog lain bisa di zona lain, dan salah offset berarti artikel terbit di jam yang salah tanpa error apa pun.

**Files:**
- Create: `scripts/lib/schedule-date.js`, `scripts/lib/schedule-date.test.js`
- Modify: `config.template.json` — tambah `workflow.site_gmt_offset` dan `workflow.schedule_hour`

**Interfaces:**
- Consumes: `readArticlesCache` dari Task 3
- Produces:
  - `takenDatesFromCache(cache)` → `Set<string>` berisi `YYYY-MM-DD`
  - `addDays(dateStr, n)` → `YYYY-MM-DD`
  - `toScheduleString(dateStr, hour)` → `"YYYY-MM-DDTHH:00:00"`
  - `utcOffsetHours(timeZone, at)` → number
  - `assertTimezoneContract({timeZone, gmtOffset}, at)` → melempar kalau tidak cocok
  - `scheduleStringToInstant(str, gmtOffset)` → `Date`
  - `earliestSchedulableDate({timeZone, hour}, now)` → `YYYY-MM-DD`
  - `findAvailableDate({takenDates, startDate, timeZone, hour, now, maxDaysAhead})` → string atau `null`

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/lib/schedule-date.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const {
  takenDatesFromCache, addDays, toScheduleString, utcOffsetHours,
  assertTimezoneContract, scheduleStringToInstant, earliestSchedulableDate, findAvailableDate
} = require('./schedule-date');

const WIB = { timeZone: 'Asia/Jakarta', gmtOffset: 7 };

test('tanggal terpakai diambil dari field date di cache', () => {
  const cache = { articles: [
    { id: 1, date: '2026-04-13', slug: 'a' },
    { id: 2, date: '2026-04-15', slug: 'b' },
    { id: 3, date: '', slug: 'c' }
  ]};
  assert.deepStrictEqual([...takenDatesFromCache(cache)].sort(), ['2026-04-13', '2026-04-15']);
});

test('cache kosong atau null menghasilkan himpunan kosong', () => {
  assert.strictEqual(takenDatesFromCache(null).size, 0);
  assert.strictEqual(takenDatesFromCache({}).size, 0);
});

test('stempel ISO penuh diterima, diambil bagian tanggalnya', () => {
  const cache = { articles: [{ id: 1, date: '2026-04-13T09:08:13.536Z' }] };
  assert.deepStrictEqual([...takenDatesFromCache(cache)], ['2026-04-13']);
});

test('addDays melewati batas bulan dan tahun', () => {
  assert.strictEqual(addDays('2026-01-31', 1), '2026-02-01');
  assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(addDays('2028-02-28', 1), '2028-02-29');
});

test('string jadwal tidak membawa offset UTC', () => {
  assert.strictEqual(toScheduleString('2026-07-21', 6), '2026-07-21T06:00:00');
  assert.doesNotMatch(toScheduleString('2026-07-21', 6), /Z|\+/);
});

test('utcOffsetHours membaca basis data zona sungguhan', () => {
  assert.strictEqual(utcOffsetHours('Asia/Jakarta', new Date('2026-07-01T00:00:00Z')), 7);
  assert.strictEqual(utcOffsetHours('America/New_York', new Date('2026-01-15T00:00:00Z')), -5);
  assert.strictEqual(utcOffsetHours('America/New_York', new Date('2026-07-15T00:00:00Z')), -4);
});

test('kontrak zona lulus kalau zona dan offset cocok', () => {
  assert.doesNotThrow(() => assertTimezoneContract(WIB, new Date('2026-07-01T00:00:00Z')));
});

test('kontrak zona GAGAL kalau zona dan offset berbeda — ini bug yang dicegah', () => {
  assert.throws(
    () => assertTimezoneContract({ timeZone: 'Asia/Makassar', gmtOffset: 7 }, new Date('2026-07-01T00:00:00Z')),
    /kontrak zona/i
  );
});

test('slot terbit teruraikan ke instan yang benar bagi penerima', () => {
  // 06:00 WIB tanggal 21 = 23:00Z tanggal 20.
  assert.strictEqual(
    scheduleStringToInstant('2026-07-21T06:00:00', 7).toISOString(),
    '2026-07-20T23:00:00.000Z'
  );
});

test('scheduleStringToInstant menolak string yang tidak jelas artinya', () => {
  assert.throws(() => scheduleStringToInstant('2026-07-21T06:00:00Z', 7), /bukan string jadwal/i);
  assert.throws(() => scheduleStringToInstant('2026-07-21', 7), /bukan string jadwal/i);
});

test('sebelum jam terbit, hari ini masih boleh dipakai', () => {
  // 2026-07-19T22:30Z = 2026-07-20 05:30 WIB
  assert.strictEqual(
    earliestSchedulableDate({ ...WIB, hour: 6 }, new Date('2026-07-19T22:30:00Z')),
    '2026-07-20'
  );
});

test('tepat jam terbit sudah dianggap lewat', () => {
  // 2026-07-19T23:00Z = 2026-07-20 06:00 WIB
  assert.strictEqual(
    earliestSchedulableDate({ ...WIB, hour: 6 }, new Date('2026-07-19T23:00:00Z')),
    '2026-07-21'
  );
});

test('tanggal yang sudah terpakai dilewati', () => {
  const taken = new Set(['2026-07-20', '2026-07-21']);
  const r = findAvailableDate({
    takenDates: taken, startDate: null, ...WIB, hour: 6,
    now: new Date('2026-07-19T22:00:00Z')
  });
  assert.strictEqual(r, '2026-07-22T06:00:00');
});

test('tanggal permintaan di masa lalu ditarik ke yang paling awal', () => {
  const r = findAvailableDate({
    takenDates: new Set(), startDate: '2020-01-01', ...WIB, hour: 6,
    now: new Date('2026-07-19T22:00:00Z')
  });
  assert.strictEqual(r, '2026-07-20T06:00:00');
});

test('null kalau semua hari dalam rentang pencarian sudah terpakai', () => {
  const taken = new Set();
  for (let i = 0; i < 40; i++) taken.add(addDays('2026-07-20', i));
  const r = findAvailableDate({
    takenDates: taken, startDate: null, ...WIB, hour: 6,
    now: new Date('2026-07-19T22:00:00Z'), maxDaysAhead: 30
  });
  assert.strictEqual(r, null);
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `node --test scripts/lib/schedule-date.test.js`
Expected: FAIL — modul tidak ditemukan

- [ ] **Step 3: Tulis `scripts/lib/schedule-date.js`**

```js
'use strict';
// ---------------------------------------------------------------------------
// KONTRAK ZONA WAKTU — baca sebelum mengubah apa pun di sini.
//
// Modul ini memancarkan string tanggal TANPA offset UTC. WordPress membaca
// `date` tanpa offset dalam zona waktu SITUS-nya sendiri. Jadi satu-satunya
// zona yang membuat string itu berarti sesuai maksud kita adalah zona situs.
//
// Di skill lama (Perkap Article), nilai ini dikunci ke WIB (UTC+7) karena
// perkap.com melaporkan gmt_offset "7". Di sini nilainya PER TENANT, dibaca
// dari config.workflow.site_gmt_offset + site_timezone, karena blog lain bisa
// berada di zona lain — dan salah offset berarti artikel terbit di jam yang
// salah tanpa satu pun error muncul.
//
// assertTimezoneContract mengecek keduanya saling cocok, supaya keduanya tidak
// bisa berbeda diam-diam.
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DAYS_AHEAD = 30;
const pad = (n) => String(n).padStart(2, '0');

function takenDatesFromCache(cache) {
  const out = new Set();
  const articles = cache && Array.isArray(cache.articles) ? cache.articles : [];
  for (const a of articles) {
    const m = String(a && a.date || '').match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) out.add(m[1]);
  }
  return out;
}

function utcOffsetHours(timeZone, at = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(at).reduce((acc, x) => ((acc[x.type] = x.value), acc), {});
  const wallClockAsIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((wallClockAsIfUtc - at.getTime()) / 60000) / 60;
}

function assertTimezoneContract({ timeZone, gmtOffset }, at = new Date()) {
  const actual = utcOffsetHours(timeZone, at);
  if (actual !== gmtOffset) {
    throw new Error(
      `Kontrak zona rusak: modul menghitung dalam ${timeZone} (UTC${actual >= 0 ? '+' : ''}${actual}) ` +
      `tapi situs WordPress diset UTC+${gmtOffset}. String jadwal tanpa offset akan terbit di jam yang salah. ` +
      `Ukur ulang gmt_offset di <url-situs>/wp-json/ lalu perbarui workflow.site_gmt_offset ` +
      `dan workflow.site_timezone bersamaan.`
    );
  }
}

function scheduleStringToInstant(scheduleStr, gmtOffset) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(String(scheduleStr).trim());
  if (!m) throw new Error(`Bukan string jadwal (harus YYYY-MM-DDTHH:MM:SS): "${scheduleStr}"`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - gmtOffset * 3600000);
}

function nowInTimezone(at, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(at).reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function toScheduleString(dateStr, hour) {
  return `${dateStr}T${pad(hour)}:00:00`;
}

function earliestSchedulableDate({ timeZone, hour }, now = new Date()) {
  const site = nowInTimezone(now, timeZone);
  const slotHasPassed = site.hour > hour || (site.hour === hour && site.minute >= 0);
  return slotHasPassed ? addDays(site.date, 1) : site.date;
}

function findAvailableDate({ takenDates, startDate = null, timeZone, gmtOffset, hour,
                             now = new Date(), maxDaysAhead = DEFAULT_MAX_DAYS_AHEAD }) {
  assertTimezoneContract({ timeZone, gmtOffset }, now);
  const earliest = earliestSchedulableDate({ timeZone, hour }, now);
  // YYYY-MM-DD urut secara leksikografis, jadi perbandingan string sudah benar.
  const start = startDate && startDate > earliest ? startDate : earliest;
  for (let day = 0; day < maxDaysAhead; day++) {
    const dateStr = addDays(start, day);
    if (!takenDates.has(dateStr)) return toScheduleString(dateStr, hour);
  }
  return null;
}

module.exports = {
  DEFAULT_MAX_DAYS_AHEAD, takenDatesFromCache, utcOffsetHours, assertTimezoneContract,
  scheduleStringToInstant, nowInTimezone, addDays, toScheduleString,
  earliestSchedulableDate, findAvailableDate
};
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `node --test scripts/lib/schedule-date.test.js`
Expected: PASS, 15 test

- [ ] **Step 5: Tambah setelan zona ke template config**

Di `config.template.json`, di dalam `workflow`, tambahkan:

```json
    "site_timezone": "Asia/Jakarta",
    "_site_timezone_note": "Nama zona IANA situs WordPress. Harus cocok dengan site_gmt_offset.",
    "site_gmt_offset": 7,
    "_site_gmt_offset_note": "Ukur di <url-situs>/wp-json/ pada field gmt_offset.",
    "schedule_hour": 6,
```

Tambahkan juga ketiga nilai itu ke `data/blogs/perkapcom/config.json` (perkap.com = `Asia/Jakarta`, `7`, `6`).

- [ ] **Step 6: Verifikasi terhadap data perkap sungguhan**

```bash
node -e "
const { makePaths } = require('./scripts/lib/paths');
const { readArticlesCache } = require('./scripts/lib/articles-cache');
const { takenDatesFromCache, findAvailableDate } = require('./scripts/lib/schedule-date');
const p = makePaths(process.cwd());
const cache = readArticlesCache(p.cachePath('perkapcom'));
const taken = takenDatesFromCache(cache);
const slot = findAvailableDate({ takenDates: taken, timeZone: 'Asia/Jakarta', gmtOffset: 7, hour: 6 });
console.log('tanggal terpakai:', taken.size, '| usulan:', slot);
console.log('bentrok?', taken.has(slot.split('T')[0]));
"
```

Expected: `tanggal terpakai` ratusan, `usulan` berupa string jadwal, `bentrok? false`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/schedule-date.js scripts/lib/schedule-date.test.js config.template.json
git commit -m "feat: cari tanggal jadwal dari cache artikel, offset zona per tenant"
```

---

### Task 11: Anti-duplikat slug

**Files:**
- Create: `scripts/lib/slug-guard.js`, `scripts/lib/slug-guard.test.js`
- Modify: `scripts/routes/plans.js`

**Interfaces:**
- Consumes: cache dari Task 3
- Produces:
  - `slugify(text)` → `string`
  - `checkSlug(slug, cache)` → `{duplicate: boolean, existing: {id,title,slug,url,status}|null}`

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/lib/slug-guard.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { slugify, checkSlug } = require('./slug-guard');

const cache = { articles: [
  { id: 11282, title: 'Sewa Stand Partitur Malang', slug: 'sewa-stand-partitur-terdekat-malang',
    url: 'https://perkap.com/x/', status: 'publish' },
  { id: 11283, title: 'Sewa HT Surabaya', slug: 'sewa-ht-surabaya',
    url: 'https://perkap.com/y/', status: 'draft' }
]};

test('slug yang sudah ada terdeteksi dan artikelnya dikembalikan', () => {
  const r = checkSlug('sewa-ht-surabaya', cache);
  assert.strictEqual(r.duplicate, true);
  assert.strictEqual(r.existing.id, 11283);
  assert.strictEqual(r.existing.status, 'draft');
});

test('slug baru lolos', () => {
  const r = checkSlug('sewa-ht-malang', cache);
  assert.strictEqual(r.duplicate, false);
  assert.strictEqual(r.existing, null);
});

test('perbandingan mengabaikan beda huruf besar-kecil dan garis miring', () => {
  assert.strictEqual(checkSlug('/Sewa-HT-Surabaya/', cache).duplicate, true);
});

test('cache kosong atau null selalu lolos', () => {
  assert.strictEqual(checkSlug('apa-saja', null).duplicate, false);
  assert.strictEqual(checkSlug('apa-saja', { articles: [] }).duplicate, false);
});

test('slug kosong dianggap tidak duplikat, bukan melempar', () => {
  assert.strictEqual(checkSlug('', cache).duplicate, false);
});

test('slugify membuat slug dari judul Indonesia', () => {
  assert.strictEqual(slugify('Sewa HT Malang: Aman, Jernih, & Stabil'), 'sewa-ht-malang-aman-jernih-stabil');
  assert.strictEqual(slugify('  Spasi   Berlebih  '), 'spasi-berlebih');
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `node --test scripts/lib/slug-guard.test.js`
Expected: FAIL — modul tidak ditemukan

- [ ] **Step 3: Tulis `scripts/lib/slug-guard.js`**

```js
'use strict';

function slugify(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalize(slug) {
  return String(slug == null ? '' : slug).trim().toLowerCase().replace(/^\/+|\/+$/g, '');
}

function checkSlug(slug, cache) {
  const target = normalize(slug);
  if (!target) return { duplicate: false, existing: null };
  const articles = cache && Array.isArray(cache.articles) ? cache.articles : [];
  const hit = articles.find(a => normalize(a.slug) === target);
  return hit
    ? { duplicate: true, existing: { id: hit.id, title: hit.title, slug: hit.slug, url: hit.url, status: hit.status } }
    : { duplicate: false, existing: null };
}

module.exports = { slugify, checkSlug };
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `node --test scripts/lib/slug-guard.test.js`
Expected: PASS, 6 test

- [ ] **Step 5: Pasang penjaga di route plans**

Di `scripts/routes/plans.js`, dalam handler `POST /api/plans`, sebelum plan disimpan:

```js
const { slugify, checkSlug } = require('../lib/slug-guard');
const { readArticlesCache } = require('../lib/articles-cache');
// ...
const slug = plan.slug || slugify(plan.title || plan.keyword);
const check = checkSlug(slug, readArticlesCache(paths.cachePath(blogId)));
if (check.duplicate && !plan.allow_duplicate) {
  return res.status(409).json({
    error: `Slug "${slug}" sudah dipakai artikel lain.`,
    existing: check.existing
  });
}
plan.slug = slug;
```

`allow_duplicate: true` adalah jalan keluar sengaja untuk kasus artikel memang ingin ditulis ulang.

- [ ] **Step 6: Verifikasi terhadap 583 slug perkap**

```bash
node scripts/server.js &
sleep 2
# slug yang sudah ada → 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3847/api/plans \
  -H "Content-Type: application/json" \
  -d '{"keyword":"uji","slug":"sewa-stand-partitur-terdekat-malang"}'
# slug baru → 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3847/api/plans \
  -H "Content-Type: application/json" \
  -d '{"id":"uji-slug-1","keyword":"uji","slug":"slug-yang-pasti-belum-ada-98765"}'
curl -s -X DELETE http://localhost:3847/api/plans -H "Content-Type: application/json" -d '{"id":"uji-slug-1"}'
```

Expected: `409` lalu `200`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/slug-guard.js scripts/lib/slug-guard.test.js scripts/routes/plans.js
git commit -m "feat: tolak plan dengan slug yang sudah dipakai"
```

---

### Task 12: Perbarui SKILL.md, agents, dan QUICKSTART

Kalau ini dilewat, skill rusak diam-diam: SKILL.md masih menyuruh `node dashboard/server.js` yang sudah dihapus di Task 5, dan masih membaca config single-tenant.

**Files:**
- Create: `scripts/blog-config.js`
- Modify: `SKILL.md` (13 sebutan path lama), `agents/wordpress-poster.md`, `agents/topic-researcher.md`, `QUICKSTART.md`

**Interfaces:**
- Consumes: `makePaths`, `resolveCredentials`
- Produces: `node scripts/blog-config.js [bagian]` → cetak JSON config tenant aktif, tanpa kredensial

- [ ] **Step 1: Tulis `scripts/blog-config.js`**

```js
#!/usr/bin/env node
'use strict';
// Cetak config tenant aktif sebagai JSON. Dipakai SKILL.md dan agent
// supaya markdown tidak perlu tahu letak berkasnya.
//
// Pemakaian:
//   node scripts/blog-config.js                 → seluruh config
//   node scripts/blog-config.js knowledge_base  → satu bagian saja
//   node scripts/blog-config.js --id            → id tenant aktif
//
// Kredensial TIDAK pernah ikut tercetak.

const fs = require('fs');
const path = require('path');
const { makePaths } = require('./lib/paths');

const paths = makePaths(path.join(__dirname, '..'));
const id = paths.activeBlog();
if (!id) {
  console.error('❌ Belum ada blog. Buka dashboard lalu buat satu, atau jalankan scripts/import-blog.js.');
  process.exit(1);
}

const arg = process.argv[2];
if (arg === '--id') { console.log(id); process.exit(0); }

const cfgPath = paths.configPath(id);
if (!fs.existsSync(cfgPath)) {
  console.error(`❌ Config tenant "${id}" tidak ada: ${cfgPath}`);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
if (cfg.wordpress) delete cfg.wordpress.app_password;
if (cfg.image_api) delete cfg.image_api.api_key;

console.log(JSON.stringify(arg ? cfg[arg] : cfg, null, 2));
```

- [ ] **Step 2: Verifikasi helper**

```bash
node scripts/blog-config.js --id
node scripts/blog-config.js knowledge_base | head -c 200
node scripts/blog-config.js | grep -c "app_password"
```

Expected: `perkapcom`; potongan knowledge base; hitungan `app_password` = `0`.

- [ ] **Step 3: Perbarui SKILL.md**

Ganti seluruh kemunculan:

| Lama | Baru |
|---|---|
| `node ".claude/skills/blog-autopilot/dashboard/server.js"` | `node ".claude/skills/blog-autopilot/scripts/server.js"` |
| blok `readFileSync('blog-autopilot-config.json')` | `node .claude/skills/blog-autopilot/scripts/blog-config.js knowledge_base` |
| `path.join(process.cwd(), '.claude/skills/blog-autopilot/blog-autopilot-config.json')` | `node .claude/skills/blog-autopilot/scripts/blog-config.js` |
| `Config tersimpan di: blog-autopilot-config.json` | `Config per blog: data/blogs/{id}/config.json — kredensial di .env` |

Di bagian `[STATUS]`, ganti pengecekan config jadi:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js --id && \
node .claude/skills/blog-autopilot/scripts/blog-config.js wordpress
```

Tambahkan satu bagian baru sesudah `[STATUS]`:

```markdown
## [BLOGS] — Kelola beberapa blog

Skill ini menyimpan tiap blog terpisah di `data/blogs/{id}/`.

- Lihat daftar: `curl -s http://localhost:3847/api/blogs`
- Ganti blog aktif: lewat dropdown di sidebar dashboard
- Impor instalasi lama: `node scripts/import-blog.js "<folder>" <id>`

Kredensial tiap blog ada di `.env` dengan awalan id blog huruf besar,
misalnya `PERKAPCOM_WP_APP_PASSWORD`. Lihat `.env.example`.
```

- [ ] **Step 4: Perbarui agents**

Di `agents/wordpress-poster.md`, hapus `--password "{config.wordpress.app_password}"` dari ketiga contoh pemanggilan script, ganti keterangannya jadi: "Password dibaca script dari `.env` (`{ID}_WP_APP_PASSWORD`); jangan pernah dilewatkan lewat argumen baris perintah."

Di `agents/topic-researcher.md`, ganti "Knowledge Base (from `blog-autopilot-config.json`)" jadi "Knowledge Base (dari `node scripts/blog-config.js knowledge_base`)".

- [ ] **Step 5: Perbarui QUICKSTART.md**

Ganti bagian pemasangan jadi:

```markdown
## Pemasangan

1. Clone repo ini ke `.claude/skills/blog-autopilot` di dalam project kamu
2. `cd .claude/skills/blog-autopilot && npm install`
3. Salin `.env.example` jadi `.env`, isi kredensial tiap blog
4. Jalankan: `npm start` (atau `node scripts/server.js`)
5. Dashboard terbuka di http://localhost:3847
```

Hapus rujukan ke `/install` dan berkas `.skill` — jalur distribusi itu sudah tidak dipakai.

- [ ] **Step 6: Pastikan tidak ada rujukan path lama yang tertinggal**

```bash
grep -rn "dashboard/server.js\|blog-autopilot-config.json" SKILL.md agents/ QUICKSTART.md references/ ; echo "exit=$?"
```

Expected: `exit=1` (tidak ada yang cocok).

- [ ] **Step 7: Jalankan seluruh test dan periksa kebersihan repo**

```bash
node --test scripts/lib/
grep -oE "=.+$" .env | cut -c2- | grep -v "^$" > .rahasia-cek.txt
git ls-files | xargs grep -l -F -f .rahasia-cek.txt ; echo "exit=$?"
rm .rahasia-cek.txt
```

Expected: semua test hijau; `exit=1` pada grep (tidak ada rahasia di berkas yang di-track).

- [ ] **Step 8: Verifikasi menyeluruh dari UI**

Jalankan `node scripts/server.js`, buka `http://localhost:3847` dengan Playwright (pakai sesi browser yang sudah terbuka, jangan buka sesi baru):

1. Dropdown blog menampilkan tenant perkap
2. Tab Articles memuat 583 artikel
3. Tab Settings menampilkan 20+ kategori tersimpan
4. Tab Perencanaan bisa dibuka
5. Console browser tanpa error baru

Ambil screenshot sebagai bukti.

- [ ] **Step 9: Commit**

```bash
git add SKILL.md agents/ QUICKSTART.md scripts/blog-config.js
git commit -m "docs: sesuaikan SKILL.md dan agent dengan struktur baru"
```
