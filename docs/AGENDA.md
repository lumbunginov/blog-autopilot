# Agenda Blog Autopilot — Fitur 6–10

Antrean setelah refactor Fitur 1–5 selesai
(`docs/superpowers/specs/2026-09-03-blog-autopilot-refactor-design.md`).

Urutan sudah disusun dari yang paling ringan. Tiap fitur brainstorm + spec sendiri
sebelum dikerjakan — jangan langsung implementasi dari daftar ini.

## 6. Reference image produk — SELESAI (2026-09-03)

Dikerjakan lewat: `docs/superpowers/specs/2026-09-03-reference-image-dan-audit-link-design.md`.

Gambar produk (`found.foto` / `found.gallery`, sudah ada di Business Asset) dikirim
sebagai reference image ke Seedream — lihat `agents/image-generator.md` Step 0 dan
`node scripts/blog-config.js product-image "<judul artikel>"`. Tidak ada folder referensi
baru di autoblog: sumber foto satu-satunya adalah Business Asset.

Yang SENGAJA tidak dikerjakan: folder legacy `Content/Article/image/reference/` (20+
folder Perkap) ditinggalkan begitu saja — Business Asset sudah jadi satu-satunya sumber
foto, memindahkan folder itu cuma menduplikasi data yang sudah ada di tempat lain.

## 7. Audit internal link — SELESAI (2026-09-03)

Dikerjakan lewat: `docs/superpowers/specs/2026-09-03-reference-image-dan-audit-link-design.md`.

`node scripts/audit-links.js` (opsi `--blog <id>`, `--limit <n>`) crawl semua post + page
terbit, cek tiap URL internal (mati/redirect/ok), dan cocokkan dengan produk yang belum
pernah ditautkan. Laporan mendarat di `data/blogs/{id}/audit/link-YYYY-MM-DD.md` + `.json`.
Audit ini baca-saja — tidak menulis apa pun ke WordPress.

Hasil audit penuh pertama (perkap.com, 2026-09-03): 663 dokumen (587 post + 76 page)
di-crawl, 365 URL internal unik, **0 tautan mati**, 0 tak pasti, 37 redirect, 48 artikel
tanpa gambar utama, 10 produk tak pernah ditautkan (kesepuluhnya memang belum punya URL).

Yang SENGAJA tidak dikerjakan dari rencana awal:
- **Perbaikan tautan otomatis** (`suggest-link-fixes.js`, `apply-link-fixes.js`) —
  menunggu keputusan setelah laporan pertama ini benar-benar dibaca. Audit tetap
  baca-saja sampai ada keputusan itu.
- **Unggah gambar di mode manual** — butuh penyimpanan gambar tersendiri di autoblog
  yang belum ada; mode manual sekarang tetap tanpa reference image.

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
