# Blog Autopilot — Refactor Modular + Multi-Tenant (Fitur 1–5)

Tanggal: 2026-09-03
Status: design disetujui, belum diimplementasi

## Masalah

Skill `blog-autopilot` bekerja, tapi bentuknya monolitik:

- `dashboard/server.js` — 889 baris: 8 helper + if-chain 10 endpoint + static file server
- `dashboard/index.html` — 3968 baris dalam satu file
- `scripts/` — hanya 3 file
- Config tunggal di root project, tidak multi-tenant
- Nol unit test
- Kredensial WordPress dan Seedream tersimpan plaintext di config JSON
- Folder skill belum di bawah git

Target bentuknya mengikuti skill `business-asset` yang sudah terbukti: `server.js` tipis,
`scripts/routes/*` per domain, `scripts/lib/*` berisi logika murni yang bisa dites,
`public/` untuk UI, dan `data/` per tenant.

## Keputusan yang sudah diambil

| Topik | Keputusan | Alasan |
|---|---|---|
| Cara refactor | Strangler — pecah bertahap, server hidup tiap commit | ada titik aman; kalau rusak ketahuan langkah mana |
| Framework | Express | `:id` param jadi tulang punggung multi-tenant; hilang ~150–200 baris boilerplate |
| Distribusi | git clone + `npm install` | menggantikan jalur `.skill` zip; build.js tidak diurus di spec ini |
| Sumber daftar artikel | Sync WordPress | WP sudah jadi sumber kebenaran; tidak perlu migrasi INDEX.csv |
| Tenant pertama | `G:\Project\Perkap Article\` di-import | 583 artikel + 20+ kategori sudah ada di sana |
| Article Writer lama | Tidak disentuh | tetap jadi cadangan selama transisi |

## Struktur akhir

```
.claude/skills/blog-autopilot/
  SKILL.md
  .env                        # gitignored
  .env.example
  package.json                # + express
  scripts/
    server.js                 # ~70 baris: express + deps + require routes
    import-blog.js            # sekali jalan, bukan route
    blog-config.js            # helper CLI: cetak config tenant aktif
    md-to-html.js  post-to-wp.js  upload-image.js
    routes/
      blogs.js  config.js  articles.js  plans.js  queue.js  scrape.js  events.js
    lib/
      paths.js  env.js  wp-client.js  wp-sync.js  articles-cache.js
      html-extract.js  schedule-date.js  slug-guard.js
      *.test.js
  public/
    index.html
    js/                       # dipecah per tab
  data/
    blogs/
      perkapcom/
        config.json
        articles-cache.json
        article-plans.json
        agent-queue.json
      _active                 # berisi id tenant aktif
  agents/  references/  docs/
```

### Kenapa `_active` file, bukan query param

SKILL.md dan agent memanggil script dari CLI tanpa tahu state UI. Satu sumber kebenaran
di disk; dashboard tinggal menulis ulang isinya saat user ganti tenant.

### Kredensial

Tidak disimpan di `config.json`. Di `.env`, dinamai per tenant:

```
PERKAPCOM_WP_APP_PASSWORD=...
PERKAPCOM_IMAGE_API_KEY=...
```

`lib/env.js` mengekspor `resolveCredentials(blogId, config)` yang menggabungkan config +
env jadi satu objek runtime. Kalau variabel hilang, lempar error yang **menyebut nama
variabel yang kurang** — jangan kirim request lalu melaporkan 401 sebagai hasil nyata.

Script `post-to-wp.js` dan `upload-image.js` diubah membaca env, tidak lagi menerima
`--password` lewat argv: argv terlihat di `ps` dan masuk ke log intersepsi perintah.
Perkap sudah memperbaiki ini (PER-2297); jangan diulang di sini.

## Langkah refactor (strangler)

Tiap langkah = satu commit dengan server yang masih jalan.

### S0 — git init + baseline

Folder skill belum punya git. `git init`, `.gitignore` berisi `.env`, `node_modules/`,
`data/blogs/*/`, lalu commit baseline. **Wajib sebelum apa pun** — tanpa ini tidak ada
titik balik, dan tanpa `.gitignore` duluan, kredensial 583-artikel masuk history.

### S1 — tarik lib + test

Fungsi murni keluar dari server.js lebih dulu karena tidak menyentuh http:

| lib | dari server.js | test |
|---|---|---|
| `html-extract.js` | `extractFromHtml` (l.56–121) | HTML contoh → field terurai |
| `articles-cache.js` | `readArticlesCache`, `writeArticlesCache`, `mapPost`, `decodeWpEntities` | `&amp;` ter-decode; post → bentuk 8 field |
| `wp-client.js` | `httpGet`, `fetchCategoryMap` | — (I/O) |
| `wp-sync.js` | `doFullSync`, `doIncrementalSync` | incremental hanya ambil `modified >` lastSync |

server.js me-require-nya; perilaku tidak berubah.

### S2 — routes

Ganti if-chain dengan `require('./routes/x')(app, deps)`. Pembagian domain:

- `config.js` → `/api/config` GET/POST, `/api/categories`
- `articles.js` → `/api/articles`, `/api/articles/sync-status`, `/api/articles/toggle`
- `plans.js` → `/api/plans` GET/POST/DELETE
- `queue.js` → `/api/agent-queue` GET/POST/PATCH
- `scrape.js` → `/api/scrape`
- `events.js` → `/api/events` (SSE)
- `blogs.js` → endpoint tenant (lihat Fitur 1)

Boilerplate yang hilang: `readBody`, `cors`, `MIME_TYPES`, static handler, `writeHead` manual.

### S3 — public

`dashboard/index.html` → `public/index.html`, isinya dipecah ke `public/js/` per tab
(settings, knowledge, articles, plans). Murni pemindahan, tanpa perubahan perilaku.

## Fitur

### 1. Multi-tenant

`lib/paths.js` satu-satunya modul yang tahu lokasi file: `blogDir(id)`, `configPath(id)`,
`cachePath(id)`, `activeBlog()`. Semua route lewat situ.

`routes/blogs.js`:

- `GET /api/blogs` — daftar tenant
- `POST /api/blogs` — buat tenant baru dari `config.template.json`
- `GET /api/blogs/:id/config` · `PUT /api/blogs/:id/config`
- `POST /api/blogs/active` — set tenant aktif

Endpoint lama (`/api/config`, `/api/articles`, dst) **tetap ada** dan otomatis memakai
tenant aktif, supaya `index.html` tidak perlu ditulis ulang di langkah ini.

UI: dropdown pemilih tenant di sidebar.

### 2. Import tenant perkap

`scripts/import-blog.js <sumber> <id>` — sekali jalan, bukan route.

Sumber: `G:\Project\Perkap Article\` — perhatikan file ada di **root project**, bukan di
dalam `.claude/skills/blog-autopilot/` (instalasi itu versi lama; source sekarang
membacanya dari `SKILL_DIR`). Yang disalin:

- `blog-autopilot-config.json` → `data/blogs/perkapcom/config.json`
- `articles-cache.json` (583 artikel, sync 2026-04-18) → `articles-cache.json`
- `article-plans.json` (2 plan), `agent-queue.json` (2 task)

Password dan API key **dicabut** dari config saat import dan dicetak ke layar agar user
menempelkannya ke `.env` sendiri. Importer tidak menulis file kredensial diam-diam.

### 3. Kredensial ke .env

Lihat bagian Kredensial di atas. `.env.example` mendokumentasikan nama variabel per tenant.

### 4. Schedule-date otomatis

Salin `find-schedule-date.js` + unit test-nya dari
`Perkap_com/project/article/.claude/skills/post-article/scripts/`. Sumber tanggal terpakai
diganti: bukan `Index_Published.csv`, tapi field `date` di `articles-cache.json`.
Default jam 06:00 WIB dipertahankan.

### 5. Anti-duplikat slug

`lib/slug-guard.js` → `checkSlug(slug, cache)` → `{duplicate, existing}`. Dipanggil di
`routes/plans.js` saat plan dibuat, dan dari SKILL.md sebelum artikel ditulis. 583 slug
sudah ada di cache, jadi ini murni lookup.

## Dampak ke SKILL.md dan agents

Kalau ini dilewat, skill rusak diam-diam:

- `SKILL.md` — 13 sebutan path lama: `dashboard/server.js` (4×) dan
  `blog-autopilot-config.json` (7×, dua memakai `process.cwd()` yang mengasumsikan
  single-tenant). Ganti ke `scripts/server.js`, dan baca config lewat
  `node scripts/blog-config.js` alih-alih `readFileSync` langsung di dalam markdown.
- `agents/wordpress-poster.md` — 3 pemanggilan `scripts/*.js` (path tetap valid), tapi
  kredensial pindah ke env.
- `agents/topic-researcher.md` — 1 sebutan config.
- `QUICKSTART.md` — langkah pasang berubah: git clone → `npm install` → `node scripts/server.js`.

## Verifikasi

Bukti per langkah, bukan "kelihatannya jalan":

| Langkah | Bukti |
|---|---|
| S1 | `node --test scripts/lib/*.test.js` hijau |
| S2 | server start; `GET /api/articles` → 583; 5 tab kebaca |
| S3 | dashboard render; console tanpa error baru |
| F1 | `GET /api/blogs` → `perkapcom`; ganti tenant → config ikut ganti |
| F2 | 583 artikel + 20 kategori muncul di dashboard; `grep -r "jhKd" data/` kosong |
| F3 | `.env` dihapus → error menyebut nama variabel yang kurang, bukan 401 |
| F4 | test hijau; tanggal usulan tidak menabrak `date` mana pun di cache |
| F5 | slug lama ditolak, slug baru lolos |

Verifikasi akhir lewat Playwright pada dashboard (uji dari UI, bukan hanya dari kode),
memakai sesi browser yang sudah terbuka.

## Di luar cakupan

- Fitur 6–10 (lihat `docs/AGENDA.md`)
- `build.js` / distribusi `.skill` zip
- `Perkap_com/project/article/` (Article Writer lama tetap utuh)
