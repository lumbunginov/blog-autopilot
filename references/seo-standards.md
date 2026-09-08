# SEO Standards — Blog Autopilot

General SEO rules for all blog articles, regardless of business type or language.

---

## Meta Title

**Format**: `[Focus Keyword]: [Benefit/Hook] | [Business Name]`

- Length: **50–60 characters** (hard max: 60)
- Focus keyword in first 30 characters
- Brand name at the end (optional but recommended)
- Use numbers when possible: "7 Tips", "2025 Guide", "Panduan Lengkap"
- Be specific and clickable — generic titles don't get clicks

**Good examples**:
- `Harga Sewa Sound System 2025: Panduan Lengkap | Perkap` (54 chars)
- `Tips Memilih Catering Pernikahan: 5 Hal Wajib Cek` (51 chars)
- `How to Choose AV Rental: Complete 2025 Guide` (46 chars)

**Bad examples**:
- `Sound System` (too short, no hook)
- `Panduan Lengkap Memilih Sound System Terbaik untuk Event di Jakarta 2025` (too long, 72 chars)

---

## Meta Description

**Format**: `[Hook/Problem]. [Solution with keyword]. [CTA]!`

- Length: **150–160 characters** (hard max: 160)
- Focus keyword in first 100 characters
- End with a clear call-to-action
- Address a benefit or solve a problem

**Good examples**:
- `Hindari 5 kesalahan fatal saat sewa sound system. Panduan pilih vendor terpercaya, cek kualitas alat, tips booking event sukses!` (128 chars ✓)
- `Looking for reliable AV rental? Compare packages, check what's included, and avoid hidden fees. Get your quote today!` (118 chars ✓)

**CTAs by intent**:
- Informational: "Baca panduannya!", "Learn more!", "Simak tips lengkapnya!"
- Transactional: "Dapatkan penawaran!", "Book now!", "Hubungi kami sekarang!"

---

## URL Slug

- Lowercase only, words separated by dashes
- Include primary keyword
- 3–7 words ideal, max 75 characters
- No special characters, no Indonesian accented letters (ä → a, é → e)
- No stop words if avoidable

**Good**: `/tips-memilih-vendor-catering/`, `/harga-sewa-sound-system-2025/`
**Bad**: `/Sewa-Sound-System/`, `/artikel-tentang-tips/`, `/p=1234/`

---

## Keyword Placement (Required)

Place focus keyword in:
1. ✅ H1 title (the article title)
2. ✅ First paragraph — **bold** the first occurrence
3. ✅ At least one H2 heading (exact or close variant)
4. ✅ URL slug
5. ✅ Meta title (first 30 chars)
6. ✅ Meta description (first 100 chars)
7. ✅ Image alt text (natural, not stuffed)
8. ✅ Conclusion paragraph

---

## Keyword Density

Target: **1–2%** of total word count

For a 1000-word article:
- Minimum: 10 appearances
- Ideal: 12–15 appearances
- Maximum: 20 appearances (above = stuffing)

Distribute naturally across sections. Use keyword variations (plural, synonyms, LSI terms) — don't repeat the exact same phrase every time.

---

## Heading Hierarchy

```
H1 — Article title (only one, set by WordPress from post title)
H2 — Main sections (3–6 per article)
H3 — Subsections under H2 (use sparingly)
```

Rules:
- Never skip levels (H2 → H4 is wrong)
- Never use H4 or deeper
- At least 1–2 H2s should include keyword or close variant
- H2 length: 3–8 words

---

## Internal Linking

- Minimum: **2–3 internal links** per article
- Use descriptive anchor text (never "click here" or "baca ini")
- Link to related articles and service/product pages
- Use full absolute URLs

**Good anchor text**: "panduan sewa multimedia", "tips memilih vendor"
**Bad anchor text**: "klik di sini", "artikel ini", "baca selengkapnya"

---

## Content Length

| Content Type | Minimum | Ideal |
|-------------|---------|-------|
| Informational blog | 800 words | 1,000–1,500 words |
| Comparison/guide | 1,000 words | 1,500–2,000 words |
| Local SEO page | 500 words | 800–1,000 words |

Quality > quantity. Never add filler to hit a word count.

---

## Readability

- Paragraphs: 2–4 sentences max
- Sentences: 15–20 words average
- Use H2/H3 every 200–300 words
- Use lists for 3+ items
- Short intro (no more than 2 paragraphs before first H2)

---

## Menulis meta Rank Math lewat REST

**Jangan pakai `wp/v2` untuk ini.** Rank Math mendaftarkan meta `rank_math_*`
ke REST hanya untuk sebagian post type. Pada WordPress lazim, `post` terdaftar
tapi **`page` tidak** — dan kegagalannya sunyi total:

```
POST /wp-json/wp/v2/pages/<id>  {meta:{rank_math_title:'X'}}
  → 200 OK, meta:{}          ← TIDAK tersimpan
GET  /wp-json/wp/v2/pages/<id>?context=edit
  → meta tanpa rank_math_*   ← padahal nilainya ADA di database
```

Bacaannya gagal terpisah dari tulisannya, dan itu yang paling menyesatkan:
`wp/v2` melaporkan meta kosong untuk page yang metanya sebenarnya sudah benar.
Jadi pembacaan balik lewat `wp/v2` **tidak bisa dipakai sebagai verifikasi** —
ia akan bilang "gagal" pada pekerjaan yang berhasil.

Yang bekerja untuk post **maupun** page:

```
POST /wp-json/rankmath/v1/updateMeta
  { "objectID": <id>, "objectType": "post", "meta": { ... } }
```

`objectType` selalu `"post"`, juga untuk page — itu tipe objek WordPress, bukan
post type. Mengisi `"page"` ditolak diam-diam.

Pakai perkakasnya, jangan menyusun permintaan sendiri:

```bash
node scripts/seo-meta.js get <id|url>
node scripts/seo-meta.js set <id> --title "..." --desc "..." --keyword "..."
node scripts/seo-meta.js set <id> --json '{"rank_math_schema_Product":{...}}'
```

`set` selalu memverifikasi dari **HTML yang tersaji** — satu-satunya pembacaan
yang jujur untuk page, dan kebetulan juga yang dilihat mesin pencari. Keluar
kode 1 bila yang tersaji tak sama dengan yang diminta.

### Yang perlu diketahui

| Hal | Aturan |
|---|---|
| Schema | Kunci `rank_math_schema_<Tipe>`, mis. `rank_math_schema_Product`. Endpoint `updateSchemas` ada tapi no-op — balas `200 []` tanpa menyimpan. |
| `rank_math_robots` | Array, bukan string. String diterima 200 lalu diabaikan saat render. |
| Kunci salah ketik | Diterima server dengan 200 lalu hilang tanpa jejak. `seo-meta.js` menolaknya lebih dulu. |
| Focus keyword | Tidak pernah tampak di HTML — untuk analyzer, bukan pengunjung. Tak bisa diverifikasi dari halaman tersaji. |
| Header auth | `blog.js` mengembalikan base64 **telanjang**; header butuh awalan `Basic `. Salah bentuk → 401 `rest_not_logged_in`, pesan yang menuduh kredensial padahal formatnya. |

### Skor Rank Math 0/100 pada halaman Elementor

Analyzer Rank Math membaca editor Gutenberg, yang untuk halaman Elementor
memang kosong — isinya ada di `_elementor_data`. **Setiap** halaman Elementor
di situs seperti ini berskor 0/100, termasuk halaman yang sudah lama berperingkat
baik. Skor itu bukan sinyal mutu di sini; verifikasi lewat HTML tersaji.

---

## Audit meta seluruh situs

```bash
node scripts/seo-audit.js                 # semua page + post terbit
node scripts/seo-audit.js --pages         # page saja
node scripts/seo-audit.js --orphan        # + statistik tautan internal
node scripts/seo-audit.js --json hasil.json
```

Dibaca dari HTML tersaji, satu-satunya pembacaan yang jujur untuk page. Keluar
kode 1 bila ada temuan berat, jadi bisa dipakai sebagai gerbang.

Tingkat temuan:

| Tingkat | Arti |
|---|---|
| **berat** | Halaman tidak muncul atau salah dikenali: meta kosong, `noindex`, canonical menunjuk halaman lain |
| **sedang** | Terpotong di hasil pencarian, atau canonical hilang |
| **ringan** | Ruang yang tersedia belum terpakai |

Dua hal yang sengaja TIDAK dilaporkan sebagai masalah:

- **Halaman yang gagal dibaca.** Halaman error tidak punya meta, dan menilainya
  berarti melaporkan kerusakan buatan sendiri. Audit memakai konkurensi 2 dan
  satu kali coba ulang — pada 5 permintaan bersamaan perkap.com mulai membalas
  503, dan laporan yang berubah tiap dijalankan tidak bisa dipercaya.
- **Skor Rank Math.** Selalu 0/100 untuk halaman Elementor; lihat bagian di atas.

## Redirect saat slug berubah

Slug yang berubah tanpa redirect berarti URL lama jadi 404, dan peringkat yang
sudah didapat hilang bersamanya.

```bash
node scripts/seo-redirect.js add <slug-lama> <url-baru> --object-id <id>
node scripts/seo-redirect.js check <slug|url>
node scripts/seo-redirect.js remove <redirectionID> --object-id <id>
```

`add` memverifikasi sendiri: respons 200 dari Rank Math cuma berarti redirect
tersimpan, bukan bahwa polanya cocok. Keluar kode 1 bila URL lama belum benar-
benar mengalihkan.

`--object-id` adalah post/page penanda asal. Endpointnya mewajibkannya walau
redirect tidak terikat pada konten itu; pakai id halaman tujuan supaya jejaknya
masuk akal saat dibaca orang lain.

Bentuk parameter `/rankmath/v1/updateRedirection` tidak terdokumentasi resmi —
dipetakan dari perilaku editor Rank Math dan diverifikasi langsung:

| Aksi | Parameter |
|---|---|
| Buat | `{objectID, objectType:'post', hasRedirect:true, redirectionSources, redirectionUrl, redirectionType}` |
| Hapus | `{objectID, objectType:'post', hasRedirect:false, redirectionID}` — **id harus STRING**, angka ditolak 400 |

Penghapusan bisa tampak gagal bila langsung dicek: cache masih menyajikan 301
beberapa detik. Itu cache, bukan penghapusan yang gagal.

### Catatan Git Bash di Windows

Argumen berawalan `/` diterjemahkan jadi path Windows: `/sewa-webcam/` sampai
ke skrip sebagai `C:/Program Files/Git/sewa-webcam/`. Tulis **tanpa** garis
miring awal (`sewa-webcam/`) atau pakai URL penuh. Skripnya menolak bentuk
yang sudah dirusak — tanpa penjagaan itu, redirect "berhasil dibuat" atas pola
yang tak akan pernah cocok.
