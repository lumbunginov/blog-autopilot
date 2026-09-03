# Blog Autopilot — Panduan Cepat

Skill ini mengotomasi penulisan artikel WordPress: dari keyword → riset → tulis → generate gambar → post.

---

## Kebutuhan Sistem

- **Claude Code** (sudah terinstall)
- **Node.js** v16+ — cek dengan: `node --version`
- **WordPress** dengan REST API aktif (WordPress.com atau self-hosted)
- **Image API Key** *(opsional)* — Google Gemini atau OpenAI

---

## Pemasangan

1. Clone repo ini ke `.claude/skills/blog-autopilot` di dalam project kamu
2. `cd .claude/skills/blog-autopilot && npm install`
3. Salin `.env.example` jadi `.env`, isi kredensial tiap blog
4. Jalankan: `npm start` (atau `node scripts/server.js`)
5. Dashboard terbuka di http://localhost:3847

**Verifikasi** skill terinstall — di Claude Code, ketik:
```
/blog-autopilot
```
→ Harus muncul pesan welcome

---

## Setup Pertama Kali (wajib)

### Langkah 1 — Buka Dashboard

Di Claude Code, ketik:
```
/blog-autopilot setup
```

Atau jalankan langsung:
```bash
node ".claude/skills/blog-autopilot/scripts/server.js"
```

Browser akan terbuka otomatis di `http://localhost:3847`

### Langkah 2 — Isi Settings

Di tab **Settings**, isi:

| Field | Cara mendapatkan |
|-------|-----------------|
| WordPress URL | URL blog kamu, contoh: `https://namablog.com` |
| WordPress Username | Username login WordPress kamu |
| Application Password | WP Admin → Users → Profile → Application Passwords → Add New |
| Image API Key | Google AI Studio (gratis) atau OpenAI (berbayar) — opsional |

> **Cara buat WordPress Application Password:**
> 1. Login ke WordPress Admin
> 2. Klik nama user di pojok kanan atas → **Profile**
> 3. Scroll bawah → **Application Passwords**
> 4. Ketik nama (contoh: "Blog Autopilot") → **Add New Application Password**
> 5. Copy password yang muncul (format: `xxxx xxxx xxxx xxxx`)

### Langkah 3 — Isi Knowledge Base

Di tab **Knowledge Base**, isi:
- **Business Name** — Nama bisnis/blog kamu
- **Business Description** — Apa yang bisnis kamu jual/tawarkan
- **Products & Services** — Daftar produk/layanan utama
- **Target Audience** — Siapa pembaca/pelanggan kamu
- **Tone** — Gaya bahasa (profesional, kasual, edukatif, dll)

### Langkah 4 — Save

Klik tombol **Save Settings** → config tersimpan otomatis.

Cek status: `/blog-autopilot status`

---

## Mulai Menulis Artikel

```
/blog-autopilot [keyword artikel kamu]
```

**Contoh:**
```
/blog-autopilot tips memilih catering pernikahan
/blog-autopilot harga sewa sound system murah
/blog-autopilot cara membuat website toko online
/blog-autopilot best restaurant in Bali
```

**Yang terjadi:**
1. Claude generate 5 ide artikel → kamu pilih satu
2. Claude tulis artikel SEO-optimized (800–1200 kata)
3. Claude generate featured image (jika API key diisi)
4. Artikel otomatis terpost ke WordPress sebagai **Draft**
5. Kamu dapat link preview dan link edit di WordPress Admin

---

## Perintah Lengkap

```
/blog-autopilot [keyword]           → Workflow lengkap
/blog-autopilot research [keyword]  → Hanya generate ide (tidak tulis)
/blog-autopilot write [keyword]     → Tulis artikel (tidak post)
/blog-autopilot post [file.md]      → Post file yang sudah ada
/blog-autopilot setup               → Buka dashboard settings
/blog-autopilot status              → Cek konfigurasi
/blog-autopilot help                → Lihat semua perintah
```

---

## Tips

- Artikel selalu tersimpan sebagai **Draft** — review dulu sebelum publish
- File artikel tersimpan lokal di folder `./articles/`
- Gambar tersimpan lokal di folder `./images/`
- Config tersimpan per blog di `data/blogs/{id}/config.json`; kredensial ada di `.env` — **jangan share file `.env`** (berisi API keys)
- Keyword bisa bahasa Indonesia atau Inggris — sesuai setting language di dashboard

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| "Config belum ada" | Jalankan `/blog-autopilot setup` |
| "401 Unauthorized" | Cek WordPress username + application password |
| "Cannot connect" | Pastikan WordPress URL benar (pakai https://) |
| Dashboard tidak terbuka | Jalankan manual: `node ".claude/skills/blog-autopilot/scripts/server.js"` |
| Port 3847 sudah dipakai | Buka langsung: http://localhost:3847 |

---

*Blog Autopilot — dibuat dengan Claude Code*
