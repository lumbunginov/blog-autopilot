# Agenda Blog Autopilot — Fitur 6–10

Antrean setelah refactor Fitur 1–5 selesai
(`docs/superpowers/specs/2026-09-03-blog-autopilot-refactor-design.md`).

Urutan sudah disusun dari yang paling ringan. Tiap fitur brainstorm + spec sendiri
sebelum dikerjakan — jangan langsung implementasi dari daftar ini.

## 6. Reference image produk

Gambar dihasilkan dari foto produk asli, bukan hanya dari prompt teks.

- Sumber pola: `Perkap_com/project/article/.claude/skills/gen-image/` (Seedream 4.5,
  reference image di-encode base64 ke request)
- Yang baru: folder `data/blogs/{id}/reference/{produk}/` per tenant + pemetaan
  produk → folder, dan `context.md` opsional per produk
- Perkap sudah punya 20+ folder referensi di `Content/Article/image/reference/`
- Kenapa relatif mudah: pipeline Seedream sudah jalan di autoblog; yang ditambah cuma
  pencarian file referensi

## 7. Audit + perbaikan internal link

- Sumber: `post-article/scripts/audit-internal-links.js`, `suggest-link-fixes.js`,
  `apply-link-fixes.js`, `apply-link-fixes-elementor.js`
- Butuh peta produk → URL per tenant (di autoblog sudah ada
  `knowledge_base.internal_links`, tinggal diperluas)
- Sekalian: `audit-featured-media.js` (artikel tanpa featured image)

## 8. Product knowledge — SELESAI (2026-09-03)

Dikerjakan lewat sumber knowledge base Business Asset:
`docs/superpowers/specs/2026-09-03-knowledge-source-business-asset-design.md`.

Produk lengkap (spesifikasi, harga, FAQ) diambil per produk lewat
`node scripts/blog-config.js product "<nama>"`, bukan disimpan ulang di autoblog.

Yang SENGAJA tidak dikerjakan dari rencana awal: "UI baru di dashboard (tab tersendiri)"
untuk mengelola product knowledge. Datanya dikelola di dashboard skill `business-asset`
(agent sosmed content) dan autoblog hanya membacanya — menambah tab kedua untuk mengedit
data yang sama berarti dua tempat mengedit satu sumber, dan itu justru yang dihindari.
Dashboard autoblog menampilkannya sebagai daftar read-only di tab Knowledge Base.

Pertanyaan `custom_entries` digabung atau dipisah: DIPISAH. `custom_entries` tetap milik
mode manual; mode business_asset tidak memakainya.

## 9. SERP tracker

Paling mahal, manfaat jangka panjang.

- Sumber: skill `serp-tracker` + `update-status` (Bright Data API)
- Butuh: API key (masuk `.env` per tenant), penyimpanan posisi per keyword per kota,
  tabel + grafik tren di dashboard
- Data historis perkap ada di `Perkap_com/project/article/serp/`

## 10. Edit Elementor

- Sumber: skill `edit-elementor`
- Perkap-specific (butuh Elementor Pro); pertimbangkan **tidak** diport, atau jadikan
  fitur opsional yang mati kalau tenant tidak memakai Elementor
- Prioritas terendah; boleh di-skip

## Catatan lain yang muncul saat brainstorm

- `build.js` / distribusi `.skill` zip: sudah tidak jadi jalur utama setelah pindah ke
  git clone + `npm install`. File-nya dibiarkan, belum diurus.
- Article Writer lama (`Perkap_com/project/article/`) tetap utuh sebagai cadangan.
  Putuskan kapan dipensiunkan setelah autoblog terbukti jalan untuk perkap.
- Instalasi lama `G:\Project\Perkap Article\` menyimpan config di root project, bukan di
  folder skill. Jangan bingung dengan layout source sekarang.
