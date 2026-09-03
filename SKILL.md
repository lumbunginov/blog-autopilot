---
name: blog-autopilot
description: "Full-cycle WordPress blog content automation for any business — keyword to published post. Use this skill whenever someone wants to automate blog article writing, create WordPress content, run content marketing automation, generate SEO articles with AI images, set up a blog content pipeline, post articles to WordPress, open blog autopilot dashboard, or configure settings. Trigger on 'tulis artikel', 'write blog', 'buat konten', 'post ke wordpress', 'content automation', 'blog autopilot', 'setup blog', 'open dashboard', or any multi-step article creation workflow. Also trigger on natural language batch article requests like 'buatkan artikel', 'generate artikel', 'buat konten untuk produk', 'buatkan X artikel keyword Y untuk produk Z', 'jadwalkan artikel mulai tanggal', or any request to create multiple articles for a product page."
---

# Blog Autopilot

Complete WordPress blog pipeline: **keyword → research → write → image → publish**

Works for any business type — e-commerce, services, hospitality, B2B, local business, multi-language.

---

## Command Routing

Read the user's input and route to the right handler:

| User types | Handler |
|-----------|---------|
| `/blog-autopilot` (no args) | → **[COMPANION MODE]** |
| `/blog-autopilot monitor` | → **[MONITOR]** companion without reopening browser |
| `/blog-autopilot setup` | → **[SETUP]** open dashboard |
| `/blog-autopilot status` | → **[STATUS]** show config state |
| `/blog-autopilot help` | → **[HELP]** show all commands |
| `/blog-autopilot research [keyword]` | → **[RESEARCH]** ideas only |
| `/blog-autopilot write [keyword]` | → **[WRITE]** no posting |
| `/blog-autopilot post [filepath]` | → **[POST]** existing file |
| `/blog-autopilot fix-image [post_id]` | → **[FIX-IMAGE]** repair missing/failed image |
| `/blog-autopilot audit-links` | → **[AUDIT-LINKS]** periksa tautan internal semua artikel terbit |
| `/blog-autopilot templates` | → **[TEMPLATES]** kelola template artikel |
| `/blog-autopilot generate [input]` | → **[GENERATE]** batch planner via natural language |
| `/blog-autopilot [keyword]` | → **[FULL WORKFLOW]** |

---

## [COMPANION MODE] — No arguments given

When user types `/blog-autopilot` with no keyword:

### Step 1: Start Dashboard

```bash
node ".claude/skills/blog-autopilot/scripts/server.js"
```

If port already in use, skip — dashboard is already running. Tell user:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Blog Autopilot — Companion Mode 🤖
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 Dashboard: http://localhost:3847
📋 Memantau queue task...

Di dashboard kamu bisa:
  ✨ Auto Generate — masukkan seed keywords, AI generate rencana artikel
  + Tambah Manual  — tambah rencana artikel satu per satu

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 2: Check Agent Queue

```bash
node -e "
const http = require('http');
http.get('http://localhost:3847/api/agent-queue', res => {
  let d=''; res.on('data',c=>d+=c);
  res.on('end',()=>{
    const q = JSON.parse(d);
    const pending = (q.tasks||[]).filter(t=>t.status==='pending'||t.status==='in_progress');
    console.log(pending.length > 0 ? JSON.stringify(pending) : 'NO_PENDING');
  });
});
"
```

### Step 3: Process Pending Tasks

If there are pending tasks (`status === 'pending'`):
- For each task where `task.type === 'auto_generate'`:
  - Read `.claude/agents/plan-generator.md` and follow its instructions
  - Read config: `node .claude/skills/blog-autopilot/scripts/blog-config.js knowledge_base`
  - Pass to plan-generator: `task.input` + `knowledge_base` from config + `queue_task_id: task.id` + `dashboard_url: 'http://localhost:3847'`

### Step 4: Schedule Monitoring or Wait

If no pending tasks:
```
✅ Tidak ada task pending saat ini.
Dashboard buka di: http://localhost:3847

Ketik /blog-autopilot monitor untuk cek queue lagi nanti.
Atau ketik /blog-autopilot [keyword] untuk workflow lengkap.
```

Use ScheduleWakeup to check again in 2 minutes:
```
ScheduleWakeup(120, "/blog-autopilot monitor")
```

---

## [MONITOR] — Check queue without reopening browser

Same as [COMPANION MODE] Step 2–4, but skip Step 1 (do not start server or open browser).

Tell user: "Mengecek queue..." then process any pending tasks found.

---

## [SETUP] — Open dashboard

Run the dashboard server:

```bash
node ".claude/skills/blog-autopilot/scripts/server.js"
```

Tell user: "Dashboard terbuka di browser (http://localhost:3847). Isi semua settings lalu klik **Save**. Setelah selesai, ketik `/blog-autopilot status` untuk verifikasi."

---

## [STATUS] — Show config state

Check the active tenant's config and report clearly:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js --id && \
node .claude/skills/blog-autopilot/scripts/blog-config.js wordpress
```

WordPress password itself is not in the config output — check its presence via `.env` (`{ID}_WP_APP_PASSWORD`).

Show result as a checklist:

```
📋 STATUS KONFIGURASI
─────────────────────
✅ Blog Aktif         : perkapcom
✅ WordPress URL      : https://yourblog.com
✅ WordPress Username : your-username
✅ WordPress Password : •••••••• (dari .env)
✅ Business Name      : [nama bisnis]
✅ Business Desc      : [ada]
⚠️ Image API         : belum diset

Status: Siap dipakai (image akan diskip)

Untuk mengubah settings: /blog-autopilot setup
```

If no active blog, show:
```
❌ Belum ada blog.

Jalankan setup dulu:
  node ".claude/skills/blog-autopilot/scripts/server.js"

Atau ketik: /blog-autopilot setup
```

---

## [BLOGS] — Kelola beberapa blog

Skill ini menyimpan tiap blog terpisah di `data/blogs/{id}/`.

- Lihat daftar: `curl -s http://localhost:3847/api/blogs`
- Ganti blog aktif: lewat dropdown di sidebar dashboard
- Impor instalasi lama: `node scripts/import-blog.js "<folder>" <id>`

Kredensial tiap blog ada di `.env` dengan awalan id blog huruf besar,
misalnya `PERKAPCOM_WP_APP_PASSWORD`. Lihat `.env.example`.

---

## [HELP] — Show all commands

```
📖 BLOG AUTOPILOT — DAFTAR PERINTAH
═══════════════════════════════════════════════════

WORKFLOW UTAMA
  /blog-autopilot [keyword]
    → Proses lengkap: riset → tulis → gambar → post WordPress
    → Contoh: /blog-autopilot tips memilih catering murah

WORKFLOW PARSIAL
  /blog-autopilot research [keyword]
    → Hanya generate 5 ide artikel (tidak menulis)
    
  /blog-autopilot write [keyword]
    → Riset + tulis artikel (tidak post ke WordPress)
    
  /blog-autopilot post [path-file.md]
    → Post file markdown yang sudah ada ke WordPress
    → Contoh: /blog-autopilot post ./articles/artikel-saya.md

GENERATE ARTIKEL (tanpa dashboard)
  /blog-autopilot generate [input]
    → Buat batch artikel langsung dari perintah, tanpa buka dashboard
    → Input bisa natural language atau structured
    → Contoh: /blog-autopilot generate tips sewa HT --product "Sewa HT" --location Surabaya --count 3 --start 2026-04-20 --spacing 7
    → Atau: "buatkan 3 artikel keyword tips sewa HT untuk Sewa HT di Surabaya mulai 20 April jeda 7 hari"
    → Agent akan minta konfirmasi sebelum eksekusi

REPAIR / FIX
  /blog-autopilot fix-image [post_id]
    → Generate + upload + insert gambar ke artikel yang belum punya gambar
    → Contoh: /blog-autopilot fix-image 11282

AUDIT
  /blog-autopilot audit-links
    → Periksa tautan internal semua artikel terbit (baca-saja, beberapa menit)
    → Laporan: data/blogs/{id}/audit/link-YYYY-MM-DD.md

TEMPLATE
  /blog-autopilot templates
    → Kelola template artikel (prompt artikel, gambar, pola meta)
    → Template dipilih per rencana di tab Perencanaan

COMPANION MODE
  /blog-autopilot
    → Buka dashboard + masuk companion mode (pantau queue otomatis)
    
  /blog-autopilot monitor
    → Cek queue task tanpa buka browser ulang

PENGATURAN
  /blog-autopilot setup
    → Buka dashboard (settings + knowledge base)
    
  /blog-autopilot status
    → Cek status konfigurasi saat ini
    
  /blog-autopilot help
    → Tampilkan halaman ini

═══════════════════════════════════════════════════
Config per blog: data/blogs/{id}/config.json — kredensial di .env
Jangan commit .env ke git (berisi API keys)!
```

---

## [TEMPLATES] — Kelola template artikel

Template mengatur prompt artikel, prompt gambar, dan pola meta. Dipilih per
rencana di tab Perencanaan.

Buka dashboard (`npm start` di folder skill), lalu menu **Template**.

Untuk melihat hasil render satu rencana:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js template "<plan_id>"
```

Keluar kode 0 dengan `template_id: null` = rencana itu tanpa template (jalur
normal). Keluar kode 1 = riset gagal, dan artikel tidak boleh ditulis.

Blok `{riset}...{/riset}` di dalam template dikerjakan OpenAI sebelum artikel
ditulis. Butuh `{ID}_TEXT_API_KEY` di `.env` — hanya kalau template memakai blok
itu. Template tanpa `{riset}` jalan tanpa kunci sama sekali.

---

## [GENERATE] — Batch article planner via natural language

Use when user gives a natural language request like:
- "buatkan 3 artikel keyword tips sewa HT untuk produk Sewa HT di Surabaya, mulai 20 April, jeda 7 hari"
- "generate articles keyword sewa proyektor for product Sewa Proyektor location Malang count 5"
- `/blog-autopilot generate tips sewa HT --product "Sewa HT" --location Surabaya --count 3 --start 2026-04-20 --spacing 7`

### Step 1: Read Config

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js
```

Ambil `knowledge_base` dan `workflow` dari hasil JSON-nya.

### Step 2: Parse Input & Extract Parameters

From the user's input (natural language or structured), extract these 6 fields:

| Field | Contoh | Wajib? | Default |
|-------|--------|--------|---------|
| `seed_keyword` | "tips sewa HT" | ✅ | — |
| `target_location` | "Surabaya" | ✅ | — |
| `product` | "Sewa HT" | ✅ | — |
| `product_url` | "https://perkap.com/sewa-ht/" | ❌ | cari di `knowledge_base.products` |
| `count` | 3 | ✅ | — |
| `start_date` | "2026-04-20" | ✅ | besok |
| `spacing_days` | 7 | ✅ | 7 |

**Auto-lookup `product_url`:** Jika `product` cocok dengan nama di `knowledge_base.products`, gunakan URL-nya otomatis. Tidak perlu tanya user.

**Konversi tanggal relatif:**
- "besok" → `today + 1 day`
- "minggu depan" → `today + 7 days`
- "1 Mei" / "May 1" → konversi ke `YYYY-MM-DD`
- Jika tidak ada tanggal sama sekali → gunakan besok sebagai default

### Step 3: Validasi — Minta Konfirmasi Jika Ada yang Kurang Jelas

**Jika ada field wajib yang TIDAK bisa diekstrak dari input**, tanyakan semuanya sekaligus dalam satu pesan:

```
❓ Beberapa informasi belum lengkap, tolong lengkapi:

1. Seed Keyword   : [kosong / tidak jelas — berikan 1 kata kunci utama]
2. Target Lokasi  : [kosong — kota atau wilayah target?]
3. Produk         : [kosong — nama produk yang ingin di-support?]
4. Jumlah Artikel : [kosong — berapa artikel yang ingin dibuat?]

Contoh jawaban: "tips sewa HT | Surabaya | Sewa HT | 3"
```

Tunggu jawaban user sebelum lanjut. Setelah user menjawab, kembali ke Step 2 dengan informasi lengkap.

**Jika SEMUA field wajib sudah tersedia**, langsung lanjut ke Step 4 tanpa tanya.

### Step 4: Tampilkan Konfirmasi

Selalu tampilkan ringkasan sebelum eksekusi, dan minta persetujuan:

```
📋 Konfirmasi Generate Artikel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 Seed Keyword    : [seed_keyword]
📍 Target Lokasi   : [target_location]
🏷  Produk          : [product]
🔗 Product URL     : [product_url atau "tidak ada"]
📝 Jumlah Artikel  : [count] artikel
📅 Mulai Posting   : [start_date]
⏱  Jeda Antar Post : [spacing_days] hari
📅 Jadwal Preview  :
   [start_date] · [seed_keyword] × [target_location] — artikel 1
   [start_date + spacing] · [seed_keyword] × [target_location] — artikel 2
   ... dst
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lanjutkan? (ya / tidak / edit)
```

- **"ya"** → lanjut Step 5
- **"tidak"** → batalkan, tidak ada yang diproses
- **"edit [field] [nilai baru]"** → update field tersebut, tampilkan konfirmasi ulang

### Step 5: Pastikan Dashboard Running

```bash
node -e "
const http = require('http');
http.get('http://localhost:3847/api/plans', res => {
  console.log(res.statusCode === 200 ? 'RUNNING' : 'DOWN');
}).on('error', () => console.log('DOWN'));
" 2>&1
```

Jika `DOWN`: jalankan server dulu:
```bash
node ".claude/skills/blog-autopilot/scripts/server.js" &
```
Tunggu 2 detik lalu lanjut.

### Step 6: Submit ke Agent Queue

```bash
node -e "
const http = require('http');
const task = {
  type: 'auto_generate',
  input: {
    seed_keyword: '[seed_keyword]',
    target_location: '[target_location]',
    product: '[product]',
    product_url: '[product_url]',
    anchor_text: '[product] [target_location]',
    count: [count],
    spacing_days: [spacing_days],
    start_date: '[start_date]'
  }
};
const payload = JSON.stringify(task);
const req = http.request({ hostname: 'localhost', port: 3847, path: '/api/agent-queue', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
  let d=''; res.on('data',c=>d+=c);
  res.on('end',()=>{ const r=JSON.parse(d); console.log('TASK_ID:'+r.id); });
});
req.write(payload); req.end();
" 2>&1
```

Catat `TASK_ID` dari output.

### Step 7: Proses Task Langsung

Setelah task masuk queue, langsung proses tanpa menunggu:

- Baca `.claude/agents/plan-generator.md` dan ikuti instruksinya
- Baca config lengkap: `node .claude/skills/blog-autopilot/scripts/blog-config.js`
- Pass ke plan-generator: semua field dari `task.input` + `knowledge_base` + `workflow` + `queue_task_id: TASK_ID` + `dashboard_url: 'http://localhost:3847'`

### Step 8: Laporan Selesai

Setelah semua artikel selesai diproses:

```
✅ Generate selesai!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 Seed Keyword  : [seed_keyword]
📍 Lokasi        : [target_location]
🏷  Produk        : [product]
📝 Artikel dibuat: [count]
📅 Jadwal        : [start_date] — [last_date]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cek hasil di: http://localhost:3847
```

---

## [AUDIT-LINKS] — Periksa tautan internal semua artikel terbit

Baca-saja: tidak menulis apa pun ke WordPress. Crawl semua post + page terbit,
kumpulkan URL internal, cek satu-satu (mati/redirect/ok), dan cocokkan dengan
produk yang belum pernah ditautkan. Untuk ratusan artikel ini makan waktu
beberapa menit.

```bash
node scripts/audit-links.js
```

Opsi:
- `--blog <id>` — tenant tertentu (default: tenant aktif)
- `--limit <n>` — crawl n post pertama saja (buat tes cepat), `n` harus bilangan
  bulat positif atau ditolak dengan exit bukan-nol

Laporan mendarat di `data/blogs/{id}/audit/link-YYYY-MM-DD.md` (dibaca manusia)
dan `.json` (dibaca script). Tidak ada perbaikan otomatis — lihat `docs/AGENDA.md`
Fitur 7 untuk kenapa.

`--limit` menghasilkan laporan di berkas TERPISAH (`link-YYYY-MM-DD-limitN.md`/`.json`)
supaya tidak pernah menimpa laporan penuh, dan laporannya bertanda parsial di
kepala berkas — angka "produk tak tertaut" dan "artikel tanpa gambar" di sana
TIDAK sahih (crawl `--limit` melewati seluruh pages dan cuma sebagian posts).

---

## [FIX-IMAGE] — Repair missing or failed image on a published post

Use when: image was not generated, failed to upload, or was not inserted into the article content.

Input: `post_id` (WordPress post ID, e.g. `11282`) or `slug` (e.g. `sewa-stand-partitur-terdekat-malang`)

### Step 1: Read Config

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js
```

Ambil `wordpress`, `image_api`, `knowledge_base`, `output` dari hasil JSON-nya. WordPress app password dan image API key tidak ada di output ini — script yang memanggilnya membaca kredensial itu sendiri dari `.env` (`{ID}_WP_APP_PASSWORD`, `{ID}_IMAGE_API_KEY`).

### Step 2: Fetch Post from WordPress

If input is a number → use as `post_id`. If it's a slug → fetch by slug first.

```bash
# By post_id
node -e "
const https = require('https');
const { loadDotEnv, envKeys } = require('./.claude/skills/blog-autopilot/scripts/lib/env');
loadDotEnv('./.claude/skills/blog-autopilot/.env');
const blogId = 'BLOG_ID';
const wpPassword = process.env[envKeys(blogId).wpPassword];
if (!wpPassword) {
  console.error('ERROR:' + envKeys(blogId).wpPassword + ' belum diset di .env');
  process.exit(1);
}
const auth = Buffer.from('USERNAME:' + wpPassword).toString('base64');
https.get({ hostname: 'WPURL_HOST', path: '/wp-json/wp/v2/posts/POST_ID', headers: { Authorization: 'Basic ' + auth } }, res => {
  let d=''; res.on('data',c=>d+=c);
  res.on('end',()=>{
    const p = JSON.parse(d);
    console.log('POST_TITLE:' + p.title?.rendered);
    console.log('POST_SLUG:' + p.slug);
    console.log('POST_STATUS:' + p.status);
    console.log('HAS_IMAGE:' + (p.content?.rendered?.includes('<img ') ? 'yes' : 'no'));
    console.log('FEATURED_MEDIA:' + (p.featured_media || 0));
  });
});
"
```

If post not found (404): stop and tell user "Post tidak ditemukan. Cek post_id atau slug."

### Step 3: Check if Image Already Exists in Content

Parse `HAS_IMAGE` from Step 2 output.

- **If `HAS_IMAGE: yes`** → stop and report:
  ```
  ✅ Post sudah memiliki inline image di konten.
  Tidak perlu diperbaiki.
  Admin: https://[wp-url]/wp-admin/post.php?post=[post_id]&action=edit
  ```

- **If `HAS_IMAGE: no`** → continue to Step 4.

### Step 4: Generate Image

Read and follow the image-generator.md approach:

```
Article title: [POST_TITLE from Step 2]
Blog ID: [active blog id]
Config: config.image_api  (type only — the API key comes from .env, never from this config)
Knowledge Base: config.knowledge_base
```

Output path: `{config.output.images_dir}/{POST_SLUG}.png`

If image generation fails: stop and report the error. Do not proceed.

### Step 5: Upload Image to WordPress

```bash
node ".claude/skills/blog-autopilot/scripts/upload-image.js" \
  --image "{images_dir}/{POST_SLUG}.png" \
  --wp-url "{config.wordpress.url}" \
  --username "{config.wordpress.username}" \
  --alt "{descriptive alt text with POST_TITLE and location}"
```

Password is not passed here — the script reads it from `.env` (variable `{ID}_WP_APP_PASSWORD`) and must never be passed as a command-line argument.

Read `{image_path}.upload.json` → extract `media_id` and `image_url`.

If upload fails: stop and report error.

### Step 6: Insert Image into Post Content

Fetch the current raw post content, then insert a `<figure>` block after the first `</p>`:

```bash
node -e "
const https = require('https');
const { loadDotEnv, envKeys } = require('./.claude/skills/blog-autopilot/scripts/lib/env');
loadDotEnv('./.claude/skills/blog-autopilot/.env');
const blogId = 'BLOG_ID';
const wpPassword = process.env[envKeys(blogId).wpPassword];
if (!wpPassword) {
  console.error('ERROR:' + envKeys(blogId).wpPassword + ' belum diset di .env');
  process.exit(1);
}
const auth = Buffer.from('USERNAME:' + wpPassword).toString('base64');
const imageUrl = 'IMAGE_URL';
const mediaId = MEDIA_ID;
const altText = 'ALT_TEXT';
const figureBlock = '<figure class=\"wp-block-image size-large\"><img src=\"' + imageUrl + '\" alt=\"' + altText + '\" class=\"wp-image-' + mediaId + '\"/></figure>';

// Fetch content
https.get({ hostname: 'WPURL_HOST', path: '/wp-json/wp/v2/posts/POST_ID', headers: { Authorization: 'Basic ' + auth } }, res => {
  let d=''; res.on('data',c=>d+=c);
  res.on('end',()=>{
    const post = JSON.parse(d);
    const content = post.content?.rendered || '';
    const newContent = content.replace('</p>', '</p>\n' + figureBlock);

    // Update post
    const payload = JSON.stringify({ content: newContent, featured_media: mediaId });
    const req = https.request({
      hostname: 'WPURL_HOST', path: '/wp-json/wp/v2/posts/POST_ID', method: 'POST',
      headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res2 => {
      let r=''; res2.on('data',c=>r+=c);
      res2.on('end',()=>{ const p=JSON.parse(r); console.log('UPDATED:' + p.id + ' status:' + p.status); });
    });
    req.write(payload); req.end();
  });
});
"
```

### Step 7: Cleanup Temp File

```bash
node -e "
const fs = require('fs');
const f = '{images_dir}/{POST_SLUG}.png.upload.json';
try { if(fs.existsSync(f)) fs.unlinkSync(f); } catch(e) {}
"
```

### Step 8: Report Result

```
✅ Gambar berhasil diperbaiki!
──────────────────────────────────────
📝 Post     : [POST_TITLE]
🖼️ Gambar   : [image_url]
📋 Admin    : https://[wp-url]/wp-admin/post.php?post=[post_id]&action=edit
🔗 Preview  : https://[wp-url]/?p=[post_id]&preview=true
──────────────────────────────────────
Gambar sudah di-insert ke konten dan di-set sebagai featured image.
```

---

## [FULL WORKFLOW] — Run complete pipeline

### Step 1: Check Config

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js --id 2>/dev/null || echo MISSING
node .claude/skills/blog-autopilot/scripts/blog-config.js wordpress 2>/dev/null
```

Cek apakah `wordpress.url` dan `wordpress.username` ada isinya untuk menentukan `OK` vs `INCOMPLETE`.

- `MISSING` → Show COMPANION MODE welcome message and suggest `/blog-autopilot setup`
- `INCOMPLETE` → Run STATUS to show what's missing, suggest: `/blog-autopilot setup`
- `OK` → Continue to Step 2

### Step 2: Topic Research

Read `agents/topic-researcher.md` and follow its instructions.

Input: keyword + `knowledge_base` from config
Output: 5 article ideas as numbered list

Ask user which idea to develop. Wait for selection.

### Step 3: Article Writing

Read `agents/article-writer.md` and follow its instructions.

Input: chosen idea + full `knowledge_base` + `workflow` config
Output: markdown file saved to `config.output.articles_dir` (default: `./articles/`)

Kalau artikel ini punya rencana di `data/blogs/{id}/article-plans.json`, cari
rencananya dengan mencocokkan `keyword` atau `slug` terhadap artikel yang mau
ditulis, lalu **oper `id` rencana itu ke agen sebagai `plan_id`** — tanpa itu
template yang dipilih pemilik tidak pernah terpakai. Tidak ada rencana yang
cocok = jalur normal; agen menulis dengan aturan bawaannya.

### Step 4: Image Generation

Read `agents/image-generator.md` and follow its instructions.

Input: article title + business context (the API key comes from `.env`, not from config — see image-generator.md)
Output: image file saved to `config.output.images_dir` (default: `./images/`)

Oper juga `plan_id` yang sama seperti Step 3 (dicari dengan cara yang sama di
`data/blogs/{id}/article-plans.json`). Kalau Step 3 sudah memanggil subperintah
`template`, **oper `image_prompt` dan `warning` hasilnya** ke agen gambar dan
jangan suruh ia memanggil ulang — blok `{riset}` tidak di-cache, panggilan kedua
berbayar lagi dan teksnya beda.

Skip if `config.image_api.type` is `"none"`.

### Step 5: WordPress Publishing

Read `agents/wordpress-poster.md` and follow its instructions.

Input: markdown file + image file + WordPress config
Output: WordPress post (draft by default, published if `auto_publish: true`)

### Step 6: Report Results

```
✅ Selesai! Artikel berhasil dibuat.
──────────────────────────────────────
📝 Judul  : [title]
🔗 Preview: [preview URL]  ← cek dulu sebelum publish
📋 Admin  : [wp-admin edit URL]
📁 File   : [local markdown path]
🖼️ Gambar : [local image path]
──────────────────────────────────────
Status: Draft — review lalu publish manual di WordPress Admin
```

---

## [RESEARCH] — Ideas only

Run Step 2 (Topic Research) only. Do not write or post.

---

## [WRITE] — Write without posting

Run Steps 2–3 (Research + Writing). Skip image and posting.

Tell user: "Artikel tersimpan di `[filepath]`. Untuk post ke WordPress: `/blog-autopilot post [filepath]`"

---

## [POST] — Post existing markdown

Skip research/writing, go straight to Steps 4–5 (Image + Posting) using the provided file.

---

## Config File Reference

Config per blog: **`data/blogs/{id}/config.json`** — kredensial di **`.env`** (bukan di config).
`.env` sudah ada di `.gitignore`.

Struktur lengkap: lihat `config.template.json`

## Agent & Script Files

- `agents/` — Instruksi detail tiap step workflow
- `scripts/` — Node.js scripts untuk WordPress API
- `references/` — SEO standards dan formatting rules
- `data/blogs/{id}/templates.json` — Template artikel per blog (dikelola di tab Template)
