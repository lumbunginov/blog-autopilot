# Halaman Elementor

Referensi kapabilitas Elementor milik **blog-autopilot**. Dibuka hanya ketika
pengguna mengelola *halaman* (page) Elementor — artikel/post tidak lewat sini.

Aktif bila **Settings → Page Builder → Elementor** di dashboard.

Kelola halaman (page) Elementor lewat berkas JSON: download → extract → edit →
validate → compress → upload.

Memakai kredensial WordPress blog-autopilot — tidak ada MCP server dan tidak ada
konfigurasi terpisah.

## Prasyarat

- Blog terdaftar di `data/blogs/<id>/config.json` (isi lewat dashboard).
- `<ID>_WP_APP_PASSWORD` ada di `.env` skill.
- Aplikasi password punya hak edit page.

Semua perintah bekerja pada **blog aktif**. Untuk tenant lain, tambahkan
`--blog <id>` di perintah mana pun.

## Perintah

Semua dijalankan dari `.claude/skills/blog-autopilot/scripts/builders/elementor/`:

```bash
node download-page.js <slug|pageId|all>      # WordPress → pages/
node extract-elementor.js <slug.json|all>    # pages/ → elementor/   (edit di sini)
node validate-elementor.js <slug.json>       # cek JSON-nya sehat
node check-blueprint.js <slug.json|all>      # cek bentuknya konsisten
node check-clone.js <sumber.json> <hasil.json> # cek isi sumber tidak tertinggal
node capture-blueprint.js <slug.json> <nama> # rekam kerangka jadi blueprint
node compress-elementor.js <slug.json|all>   # elementor/ → compress/
node upload-page.js <slug>                   # compress/ → halaman yang SUDAH ada, lalu verifikasi tampilan
node upload-page.js <slug> --verify-only     # cek ulang tampilan tanpa upload
node create-page.js <file.json> "Judul"      # elementor/ → halaman BARU
```

`create-page.js` membuat halaman baru; `upload-page.js` menimpa halaman yang
sudah ada. Keduanya tidak saling menggantikan.

`node upload-page.js <slug> --page-id 123` mengarahkan hasil ke halaman lain —
pakai ini untuk uji coba di halaman staging sebelum menyentuh halaman asli.

## Lokasi berkas

Per blog, di dalam `data/` skill:

```
data/blogs/<blog-id>/elementor/
├── pages/      ← respons mentah WordPress (jangan diedit)
├── elementor/  ← EDIT DI SINI
└── compress/   ← siap upload (dihasilkan, jangan diedit)
```

Nama berkas memakai slug halaman: `sewa-ht-bandung.json`.

## Alur: edit halaman yang sudah ada

```bash
node download-page.js sewa-ht-bandung
node extract-elementor.js sewa-ht-bandung.json
# edit elementor/sewa-ht-bandung.json
node validate-elementor.js sewa-ht-bandung.json
node check-blueprint.js sewa-ht-bandung.json
node compress-elementor.js sewa-ht-bandung.json
node upload-page.js sewa-ht-bandung
```

## Alur: halaman baru dari template

`clone-template.js` meregenerasi seluruh id elemen dan mengganti teks secara
rekursif, lalu memvalidasi sebelum menulis:

```bash
node clone-template.js sewa-ht-bandung.json sewa-ht-yogyakarta.json \
  "Sewa HT Yogyakarta" --replace "Bandung:Yogyakarta"
```

Keluarannya format halaman WordPress (`{content, page_settings, version, title, type}`)
di `elementor/`.

`--replace` hanya mengganti teks yang disebut. **Gambar, kueri kategori (widget
posts), harga, dan kalimat lain tetap milik halaman sumber** — dan lolos
`validate-elementor.js` maupun `check-blueprint.js`. Ganti isinya, lalu buktikan
tidak ada yang tertinggal:

```bash
node check-clone.js produk-a.json produk-b.json --keep "Area layanan"
```

Yang dilaporkan: teks identik, paragraf yang sebagian besar katanya sama
(ditandai `mirip NN%` — pola `--replace` yang cuma mengganti nama), gambar
dengan url atau id media yang sama, dan daftar id kueri yang sama. Label pendek
tanpa angka ("Harga sewa") dilewati; label berangka ("15K / unit") tidak.
`--keep` (potongan teks, url, atau id; bisa berulang) untuk isi yang memang
sengaja sama. Keluar kode 1 bila ada sisa.

Setelah lolos, kirim jadi halaman baru:

```bash
node create-page.js sewa-ht-yogyakarta.json "Sewa HT Yogyakarta" \
  --slug sewa-ht-yogyakarta --status draft
```

`create-page.js` menerima dua bentuk berkas — array section (hasil
`extract-elementor.js`) maupun format halaman WordPress (hasil
`clone-template.js`). Tanpa `--status` halaman dibuat **draft**; naikkan ke
`publish` setelah tampilannya diperiksa. Tanpa `--slug`, WordPress menurunkan
slug dari judul. Respons WordPress otomatis disimpan ke `pages/<slug>.json`,
jadi siklus edit berikutnya bisa langsung `extract-elementor.js`.

## Blueprint halaman — menjaga halaman sejenis tetap sebentuk

`validate-elementor.js` memeriksa JSON-nya **sehat**; ia tidak tahu apa-apa soal
bentuk. Halaman dengan seksi ekstra, seksi hilang, atau seksi tertukar lolos
validasi dengan mulus dan baru ketahuan setelah terbit — itulah cara satu
halaman produk keluar dengan format berbeda dari saudaranya.

Blueprint merekam **kerangka** satu halaman: urutan seksi dan widget di dalamnya.
Isinya — teks, gambar, harga — tidak direkam, jadi halaman sejenis tetap bebas
berbeda isi tapi wajib sebentuk.

Rekam sekali dari halaman yang bentuknya sudah benar:

```bash
node capture-blueprint.js sewa-kabel-aux-to-rca.json produk-sewa   --note "Halaman produk sewa: hook, spek, galeri, harga, blog list"
```

Tandai halaman lain yang harus mengikutinya (cukup sekali per halaman):

```bash
node check-blueprint.js sewa-tripod-kamera-bandung.json --blueprint produk-sewa
```

Sesudah itu `node check-blueprint.js <slug>` — atau `all` untuk semua yang sudah
ditandai — cukup dijalankan tanpa argumen lain. Keluar kode 1 bila ada yang
menyimpang, jadi aman dipakai sebagai gerbang sebelum compress.

Halaman tanpa tanda **dilewati, bukan digagalkan**: halaman yang memang tidak
sejenis tidak perlu dipaksa masuk cetakan mana pun.

Semua ini juga ada di dashboard: menu **Template → Halaman**.

### Kalau sebuah halaman memang harus beda

Ada dua jalan, dan pilihannya milik pemilik situs, bukan otomatis:

1. **Halaman yang dibetulkan** — kalau bedanya memang tak disengaja.
2. **Blueprint kedua** — kalau memang jenis halaman yang lain. Rekam blueprint
   baru dari halaman itu dan petakan halaman sejenisnya ke sana.

Yang tidak dianjurkan: melebarkan satu blueprint sampai menerima segala bentuk.
Blueprint yang menerima apa saja tidak menahan apa pun.

## Aturan yang tidak boleh dilanggar

**Jangan pernah menyusun ulang JSON dengan tangan** — tanpa `sed`, tanpa
find/replace lintas berkas, tanpa merangkai string. Elementor menyimpan ribuan
nilai bersarang; satu koma salah membuat halaman kosong di frontend dan editor
Elementor menolak memuatnya. Gunakan `clone-template.js`, atau Node dengan
`JSON.parse`/`JSON.stringify`.

**Selalu `validate-elementor.js` sebelum compress.** Validator menangkap
sintaks rusak, `id`/`elType` yang hilang, dan id duplikat — tiga penyebab
halaman rusak yang paling sering.

**Lalu `check-blueprint.js`, kalau halamannya sudah ditandai.** Validator
meloloskan halaman yang bentuknya menyimpang; pemeriksa blueprint menahannya.

**Halaman hasil clone: `check-clone.js` terhadap sumbernya.** Bentuk yang benar
tidak menjamin isinya baru — halaman produk bisa terbit dengan harga, spesifikasi,
dan foto produk lain. Jangan menyatakan halaman selesai sebelum ini lolos.

**Upload belum tentu langsung terlihat.** `upload-page.js` menulis `_elementor_data`
lewat REST, dan itu tidak memicu hook simpan milik Elementor. Pada halaman yang sudah
pernah tampil (termasuk yang sempat di-preview), cache elemen Elementor terus
menyajikan render lama — id elemen lama, teks lama — walau datanya sudah baru dan
cache server melaporkan *miss*. Karena itu setelah upload, skrip mengambil HTML publik
dan membandingkannya dengan perubahan antara `pages/<slug>.json` (versi sebelum) dan
data baru: isi baru harus tampil, isi yang dibuang tidak boleh masih tampil. Kalau
belum berubah, skrip keluar **kode 3** beserta langkah membersihkan cache-nya. Jangan
menyatakan halaman selesai sebelum `--verify-only` lolos. Halaman draft tidak bisa
diverifikasi (tidak terlihat publik); halaman baru dari `create-page.js` belum pernah
dirender, jadi tidak terkena masalah ini. Perubahan yang tidak berupa teks/gambar/elemen
(mis. id kategori kueri widget posts) tidak bisa dibuktikan dengan cara ini — periksa
hasil widget-nya di halaman.

**Upload mengubah halaman live.** Konfirmasi dulu ke pemilik situs, atau
arahkan ke halaman staging dengan `--page-id`. `pages/` menyimpan salinan
sebelum-edit; itu jalan pulang bila hasilnya salah.

**Halaman baru dibuat sebagai draft.** `create-page.js` tidak pernah
mem-publish tanpa diminta — periksa dulu di editor Elementor, baru ubah
statusnya.

## Meta SEO halaman

Meta Rank Math untuk **page** tidak bisa ditulis lewat `wp/v2` — diterima
dengan 200 lalu hilang, dan dibaca kembali sebagai kosong walau nilainya ada.
Pakai `scripts/seo-meta.js`:

```bash
node ../../seo-meta.js get <id|url>
node ../../seo-meta.js set <id> --title "..." --desc "..." --keyword "..."
```

Selengkapnya, termasuk schema dan kenapa skor Rank Math selalu 0/100 untuk
halaman Elementor: `references/seo-standards.md`.

## Kalau gagal

| Gejala | Sebab | Tindakan |
|---|---|---|
| `Kredensial WordPress ... belum diset` | `.env` skill belum berisi password | Tambahkan `<ID>_WP_APP_PASSWORD=...` |
| `[tanpa data Elementor]` saat download | halaman tidak dibangun dengan Elementor | Edit lewat WP admin biasa |
| `No _elementor_data found` | berkas `pages/` diambil bukan dengan `context=edit` | Download ulang dengan `download-page.js` |
| HTTP 401/403 saat upload | app password tidak punya hak edit page | Pakai akun editor/admin |
| `bukan array section Elementor maupun format halaman WordPress` | berkas sumber create-page salah bentuk | Pakai hasil `extract-elementor.js` atau `clone-template.js` |
| `isi masih sama dengan <sumber>` | teks/gambar/kueri halaman sumber tertinggal setelah clone | Ganti isi yang disebut; `--keep` hanya untuk yang memang sengaja sama |
| `menyimpang dari blueprint` | bentuk halaman beda dari saudaranya | Betulkan halamannya, atau rekam blueprint terpisah bila memang beda jenis |
| `blueprint "..." tidak ada` | nama salah ketik, atau blueprint sudah dihapus | `capture-blueprint.js` ulang, atau lepas tandanya di dashboard |
| Halaman baru tak muncul di situs | dibuat sebagai draft (default) | Publish di WP admin, atau `--status publish` |
| Halaman kosong setelah upload | JSON rusak lolos ke compress | `pages/` → extract ulang, edit lagi, validate |
| `Halaman publik BELUM berubah` (keluar 3) / tampilan lama masih muncul | cache elemen Elementor — simpan lewat REST tidak membersihkannya; lalu cache plugin/CDN | Elementor → Tools → Clear Files & Data (atau buka di editor Elementor → Update), purge cache, lalu `upload-page.js <slug> --verify-only` |

Detail lain: `references/builders/elementor/widgets.md` (struktur widget & settings),
`references/builders/elementor/troubleshooting.md`.

## Test

```bash
node --test scripts/builders/elementor/workflow.test.js
```
