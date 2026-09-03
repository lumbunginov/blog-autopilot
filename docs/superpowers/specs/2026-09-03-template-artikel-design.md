# Template Artikel + Variabel — Desain

Status: disetujui untuk masuk rencana implementasi
Tanggal: 2026-09-03

## Masalah

Autoblog tidak punya lapisan yang bisa diatur pemilik blog di antara *rencana artikel*
dan *cara artikel ditulis*. Aturan menulis tertanam permanen di `agents/article-writer.md`;
yang bisa diatur per rencana cuma `content_type` dan `target_words` dari dropdown.

Akibatnya paling terasa pada gambar: `agents/image-generator.md` menyusun prompt dari nol
untuk setiap artikel, hanya berbekal judul + `business_name`/`business_description`. Tidak
ada gaya visual yang tersimpan, jadi konsistensi antar-artikel bergantung pada model saat
itu. Ini kemunduran dibanding skill lama `gen-image` yang punya folder referensi tersendiri.

Skill `business-asset` (agent sosmed content) sudah menyelesaikan masalah yang sama untuk
konten sosial media: template tersimpan di `prompts.json`, variabel `{nama}` di-resolve
dari profil bisnis + produk, dan blok `{riset}...{/riset}` dikerjakan AI sebelum prompt
final dikirim. Desain ini memindahkan pola itu ke autoblog.

## Yang dibangun

Template artikel yang tersimpan per blog, dipilih per rencana, mengendalikan tiga hal:

1. **Prompt artikel** — struktur + gaya tulisan tambahan untuk `article-writer.md`
2. **Prompt gambar** — gaya visual featured image untuk `image-generator.md`
3. **Pola meta** — meta title & description

Isi ketiganya boleh memuat variabel `{namaVariabel}` dan blok `{riset}...{/riset}`.

## Keputusan yang sudah diambil

| Pertanyaan | Keputusan |
|---|---|
| Cakupan | Ketiganya: artikel, gambar, meta |
| Pemilihan template | Per rencana, dropdown di modal Perencanaan |
| Blok `{riset}` | Ikut diport, lewat panggilan AI terpisah |
| Provider riset | OpenAI saja |
| Riset gagal | Berhenti dengan pesan jelas |
| Resolver variabel | Skrip `blog-config.js template <plan_id>` |
| Lokasi UI | Tab baru "Template" di sidebar |
| Rencana tanpa template | Pakai aturan `article-writer.md` sekarang |

## Arsitektur

### Penyimpanan: file terpisah per tenant

`data/blogs/{id}/templates.json`, sejajar `article-plans.json` dan `articles-cache.json`.

**Kenapa bukan di dalam `config.json`:** satu image style di business-asset berukuran
8.733 karakter. `config.json` perkapcom sekarang 9,6 KB dan dikirim utuh pada setiap
`GET /api/config` — dashboard memanggilnya di banyak tempat. Lima template akan
melipatgandakan payload itu untuk semua pemakai, termasuk tenant yang tidak memakai
template sama sekali.

**Kenapa bukan pustaka global lintas-tenant:** sekarang hanya ada satu tenant, dan
variabel `{namaBisnis}` sudah membuat template portabel tanpa perlu dibagi. YAGNI.

### Bentuk data

```json
{
  "templates": [
    {
      "id": "tpl_1789012345678",
      "name": "Transaksional Lokal",
      "article_prompt": "...boleh memuat {keyword}, {riset}...{/riset}...",
      "image_prompt": "...boleh memuat {produkNama}...",
      "meta_title_pattern": "{keyword} {kotaTarget} 2026 | {namaBisnis}",
      "meta_desc_pattern": "...",
      "created_at": "2026-09-03T...",
      "updated_at": "2026-09-03T..."
    }
  ]
}
```

Semua field prompt boleh kosong. Template yang hanya mengisi `image_prompt` sah:
artikelnya tetap ditulis dengan aturan lama, hanya gambarnya yang diarahkan. Ini
bukan kelonggaran — itu justru kasus pemakaian yang paling mendesak (konsistensi visual).

`id` dibuat server, tidak pernah diterima dari klien.

### Rencana artikel

Satu field baru pada record rencana: `template_id` (string, boleh kosong/tidak ada).

Rencana lama tanpa field itu berperilaku persis seperti sekarang. Ini bukan migrasi —
tidak ada penulisan ulang `article-plans.json`.

`template_id` yang menunjuk template terhapus diperlakukan sama dengan kosong, dan
`template` melaporkannya di field `warning` supaya hilangnya terlihat, bukan diam-diam.

## Variabel

`EMPTY_KB` di `lib/knowledge.js` sudah memuat 24 field yang setara `buildVars()`
business-asset — variabel bukan barang baru, hanya perlu dipetakan. Semua field di
bawah sudah diverifikasi berisi data nyata pada tenant perkapcom.

### Dari knowledge base (selalu ada, apa pun sumbernya)

| Variabel | Sumber `knowledge_base` | Nilai perkapcom |
|---|---|---|
| `{namaBisnis}` | `business_name` | Perkap.com |
| `{deskripsiBisnis}` | `business_description` | (terisi) |
| `{tagline}` | `tagline` | Sewa Alat Panitia |
| `{jenisUsaha}` | `business_type` | |
| `{targetAudiens}` | `target_audience` | Panitia acara, Mahasiswa |
| `{nada}` | `tone` | casual |
| `{usp}` | `usp` | |
| `{kota}` | `city` | Malang |
| `{alamat}` | `address` | Jl. Kembang kertas no 24 Lowokwaru |
| `{whatsapp}` | `whatsapp` | 0895412262949 |
| `{email}` | `email` | |
| `{website}` | `website` | perkap.com |
| `{jamOperasional}` | `hours` | 24 Jam |
| `{cta}` | `cta[]` → gabung newline | 1 entri |
| `{kataKhas}` | `signature_words[]` → gabung koma | |
| `{kataHindari}` | `avoid_words[]` → gabung koma | 1 entri |
| `{dos}` | `dos[]` → gabung newline | |
| `{donts}` | `donts[]` → gabung newline | |
| `{topikTerlarang}` | `prohibited_topics[]` → gabung koma | |

### Dari rencana (berbeda tiap artikel)

| Variabel | Field rencana |
|---|---|
| `{keyword}` | `keyword` |
| `{judul}` | `title` |
| `{lsi}` | `lsi_keywords` |
| `{kotaTarget}` | `city` |
| `{kategori}` | `category_name` |
| `{tipeKonten}` | `content_type` |
| `{jumlahKata}` | `target_words` |
| `{slug}` | `slug` |
| `{catatan}` | `notes` |
| `{anchorUrl}` | `anchor_url` |
| `{anchorText}` | `anchor_text` |

`{kotaTarget}` (kota sasaran artikel ini) sengaja dipisah dari `{kota}` (kota tempat
bisnis berada). Perkap.com berkantor di Malang tapi menulis artikel untuk Surabaya,
Blitar, dan Denpasar — menggabungkan keduanya akan menghasilkan artikel Surabaya yang
menyebut alamat Malang sebagai lokasi layanan.

### Dari produk (hanya bila rencana menyebut produk)

Diambil lewat jalur yang sudah ada, `lib/business-asset.js` → `findProduct`, dengan
aturan prioritas URL yang sama seperti `blog-config.js product`: `p.url` yang diketik
pemilik menang atas hasil tambang dari konteks.

| Variabel | Field produk |
|---|---|
| `{produkNama}` | `nama` |
| `{produkHarga}` | `harga` |
| `{produkUrl}` | `url` atau hasil `extractProductUrl` |
| `{produkKonteks}` | `konteks` |
| `{produkFaq}` | `faq` |
| `{produkTargetMarket}` | `targetMarket` |

Produk diambil dari field `product` pada rencana — field yang sudah ada di modal
Perencanaan (`pm-product`). Tidak ditambang dari `notes`: dua rencana hasil Auto Generate
yang ada sekarang menyimpan produknya sebagai teks bebas di `notes`
(`"...| product: Stand Partitur"`), dan menguraikan teks itu berarti menebak. Rencana
lama tanpa `product` diperlakukan sebagai rencana tanpa produk.

Rencana tanpa produk: keenam variabel ini bernilai string kosong, bukan hilang.
Template yang memakainya tetap ter-render, hanya bagian produknya kosong. Hal yang sama
berlaku untuk `{kotaTarget}` bila rencana tidak mengisi `city`.

Nama variabel memakai bahasa Indonesia, mengikuti konvensi business-asset — bukan
mencampur dengan key JSON internal yang berbahasa Inggris.

### Dua aturan yang dibawa dari business-asset

**Variabel tak dikenal dibiarkan apa adanya, tidak dikosongkan.** `resolveVars` di
`lib/io.js:247` mengembalikan `match` untuk key yang tidak dikenal. Salah ketik
`{namaBisnsi}` muncul utuh di prompt akhir — terlihat oleh pemilik template. Kalau
dikosongkan, salah ketik hilang diam-diam dan template kehilangan satu bagian tanpa
jejak. Perilaku ini ditiru persis.

**`{produkKonteks}` di dalam blok `{riset}` tidak ditempel ulang di luar blok.**
Komentar di `lib/ai.js:741-744` menjelaskan sebabnya: menempel konteks mentah
membatalkan ringkasan yang baru dibuat riset, dan memunculkan konteks produk utuh di
ujung prompt. Resolver di sini memakai aturan yang sama — konteks masuk lewat satu
jalur saja.

## Alur render

```
rencana punya template_id
  → node scripts/blog-config.js template <plan_id>
      1. baca templates.json, article-plans.json, knowledge base
      2. bila rencana menyebut produk → ambil detail produk
      3. resolveVars: {var} → nilai
      4. resolveRiset: {riset}…{/riset} → OpenAI → sisipkan hasil
      5. cetak JSON hasil
  → article-writer.md memakai article_prompt sebagai instruksi tambahan
  → image-generator.md memakai image_prompt sebagai dasar prompt
```

Keluaran `template <plan_id>`:

```json
{
  "template_id": "tpl_...",
  "template_name": "Transaksional Lokal",
  "article_prompt": "...sudah ter-resolve penuh...",
  "image_prompt": "...",
  "meta_title": "...",
  "meta_desc": "...",
  "warning": null
}
```

`meta_title` dan `meta_desc` di keluaran ini adalah **saran**, bukan penimpaan.
`template` hanya mencetak; ia tidak pernah menulis ke `article-plans.json`. Meta yang
sudah diketik pemilik di modal Perencanaan menang — pola template dipakai hanya bila
field meta rencana kosong. Pagar panjang meta (50–60 dan 150–160 karakter) tetap milik
`article-writer.md` dan berlaku atas hasil pola template juga.

Rencana tanpa `template_id` (atau menunjuk template terhapus): keluar kode 0 dengan
`{"template_id": null, "warning": "..."}`. Agen melanjutkan dengan aturan bawaannya.
Ini bukan kegagalan — itu jalur normal untuk 663 artikel yang sudah ada.

### Kontrak dengan agen

`agents/article-writer.md` mendapat satu langkah baru sebelum menulis: panggil
`template <plan_id>`, dan bila `article_prompt` terisi, perlakukan sebagai instruksi
tambahan **di atas** aturan bawaan — bukan pengganti. Aturan yang tidak boleh
dikalahkan template: panjang meta title/description, format file, dan larangan
`prohibited_topics`. Template mengatur gaya dan struktur, bukan membatalkan pagar SEO.

`agents/image-generator.md` Step 1 mendapat percabangan: bila `image_prompt` terisi,
pakai itu sebagai dasar prompt; bila kosong, susun sendiri seperti sekarang. Step 0
(cari foto produk) tidak berubah, dan kalimat kunci `"the exact device from the
reference image"` tetap wajib disisipkan saat ada foto — template tidak boleh
menghapusnya, karena tanpa itu model memperlakukan foto sebagai inspirasi gaya.

## Blok riset

`{riset}Tugas riset di sini{/riset}` → dikirim ke OpenAI sebagai tugas terpisah,
hasilnya menggantikan seluruh blok di prompt akhir.

Beberapa blok dalam satu template digabung menjadi satu panggilan dengan format
`[HASIL n]...[/HASIL n]`, persis `resolveRisetBlocks` di `lib/ai.js:14`. Satu panggilan
untuk beberapa blok, bukan satu panggilan per blok.

Konteks yang ikut dikirim bersama tugas riset: profil bisnis (nama, jenis usaha, USP,
target market, tone) dan konteks produk bila ada. Tidak mengirim riwayat artikel —
business-asset mengirim `recentPosts` untuk menghindari sudut yang mirip antar-post
sosial media, tapi autoblog sudah punya `articles-cache.json` dan internal-linking
yang menangani hubungan antar-artikel di lapisan lain.

### Kredensial

Kunci baru di `.env`: `{ID}_TEXT_API_KEY` (mis. `PERKAPCOM_TEXT_API_KEY`), mengikuti
konvensi `envKeys()` di `lib/env.js:43`. Ditambahkan ke `.env.example`.

Kunci ini **hanya wajib bila template memakai `{riset}`**. Template tanpa blok riset
ter-render tanpa kunci sama sekali, dan tenant yang tidak memakai template tidak
terpengaruh.

Kunci tidak pernah masuk argv, config, dokumen, pesan commit, atau file yang dilacak git.

### Gagal keras

Kunci kosong, API menolak, timeout, atau balasan tidak terbaca → keluar kode 1 dengan
pesan yang menyebut penyebabnya. Artikel tidak ditulis; rencana tetap `planned`.

Ini sengaja berbeda dari `product-image`, yang selalu keluar kode 0. Gambar hilang itu
kosmetik dan terlihat di dashboard; riset hilang menghasilkan artikel yang diam-diam
lebih miskin dan tidak terlihat di mana pun. Pelajaran yang sama sudah tercatat di
`.learnings` sebagai "blocker palsu dari curl kosong" dan "planner lapor sukses atas
scan parsial": laporan sukses atas kerja yang tidak lengkap lebih mahal daripada
kegagalan yang berisik.

Timeout panggilan riset: 60 detik. Riset menghasilkan beberapa paragraf, bukan satu
kalimat, dan batas 15 detik seperti `wp-client` akan memotong balasan yang sah.

## File

### Baru

| File | Tanggung jawab |
|---|---|
| `scripts/lib/template-vars.js` | Murni: bangun peta variabel, ganti `{var}`. Tanpa I/O, tanpa jaringan. |
| `scripts/lib/template-store.js` | Baca/tulis `templates.json`, validasi bentuk, buat `id`. |
| `scripts/lib/openai-text.js` | Satu panggilan HTTP ke OpenAI. Satu-satunya tempat yang tahu bentuk API-nya. |
| `scripts/lib/riset.js` | Temukan blok `{riset}`, gabung jadi satu tugas, sisipkan hasil. Memanggil `openai-text`. |
| `scripts/routes/templates.js` | `GET/POST/DELETE /api/templates` |
| `scripts/lib/*.test.js` | Uji untuk tiap modul murni di atas |

Pemisahan `riset.js` dari `openai-text.js` disengaja: penguraian blok dan penyisipan
hasil bisa diuji sepenuhnya tanpa jaringan, dengan pemanggil OpenAI diganti ganda.

### Diubah

| File | Perubahan |
|---|---|
| `scripts/lib/paths.js` | Tambah `templatesPath(id)` |
| `scripts/blog-config.js` | Subperintah `template <plan_id>` |
| `scripts/server.js` | Daftarkan `routes/templates` |
| `scripts/routes/plans.js` | Terima & simpan `template_id` |
| `public/index.html` | Item sidebar + halaman Template + dropdown di modal rencana |
| `public/js/app.js` | Muat/simpan template, isi dropdown |
| `agents/article-writer.md` | Langkah baru: panggil `template`, pakai `article_prompt` |
| `agents/image-generator.md` | Step 1 bercabang pada `image_prompt` |
| `.env.example` | `PERKAPCOM_TEXT_API_KEY=` |
| `SKILL.md` | Routing + help |
| `docs/AGENDA.md` | Catat fitur ini |

## Pengujian

Modul murni (`template-vars`, `riset`, `template-store`) diuji dengan
`node --test`, mengikuti pola `*.test.js` yang sudah dipakai 20 modul lain.

Kasus yang wajib ada, masing-masing lahir dari perilaku yang sudah dibahas di atas:

- variabel dikenal terganti; variabel **tak dikenal tetap utuh** di keluaran
- rencana tanpa produk → enam variabel produk jadi string kosong, bukan `undefined`
- `{kota}` dan `{kotaTarget}` menghasilkan nilai berbeda saat keduanya terisi
- beberapa blok `{riset}` → **satu** panggilan, bukan satu per blok
- balasan riset tanpa tag `[HASIL n]` → galat, bukan prompt yang terpotong diam-diam
- kunci API kosong + template memakai `{riset}` → galat
- kunci API kosong + template **tanpa** `{riset}` → berhasil
- `template_id` menunjuk template terhapus → `warning` terisi, keluar kode 0
- `templates.json` tidak ada → daftar kosong, bukan lemparan
- rencana yang sudah punya `meta_title` → pola template tidak menimpanya

Pengujian ujung-ke-ujung lewat dashboard memakai Playwright MCP, sesuai aturan
pengembangan fitur browser: buat template, pilih di rencana, jalankan, periksa
hasilnya dari UI.

## Batasan yang disengaja

**Tidak ada template default dan tidak ada pemilihan acak.** Business-asset memakai
`resolveStyleId` yang memilih acak agar konten sosial media bervariasi. Autoblog tidak
meniru itu: artikel blog ditulis untuk peringkat pencarian, dan hasil yang bisa
diprediksi lebih berharga daripada variasi. Rencana tanpa template memakai aturan
`article-writer.md` yang sekarang.

**Tidak ada versi/riwayat template.** Mengedit template menimpa yang lama. Artikel yang
sudah terbit tidak berubah, jadi tidak ada yang rusak — tapi tidak ada juga cara
kembali ke versi sebelumnya. Tambahkan bila ternyata dibutuhkan.

**Tidak ada pratinjau render di dashboard.** Untuk melihat hasil resolve, jalankan
`blog-config.js template <plan_id>`. Tombol pratinjau di UI berarti menjalankan riset
(berbiaya API) dari klik yang mudah tak sengaja.

**`{riset}` tidak dicache.** Blok riset mengolah konteks produk artikel ini; menyimpan
hasilnya berarti artikel produk B memakai riset produk A. Pola bug artefak basi yang
sudah pernah terjadi (`.last-decide.json` → 6 slot konten dobel) tidak diulang di sini.
