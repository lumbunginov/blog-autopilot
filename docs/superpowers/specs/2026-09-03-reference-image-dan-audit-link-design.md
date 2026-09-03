# Reference Image Produk + Audit Internal Link

Tanggal: 2026-09-03
Status: design disetujui, belum diimplementasi
Menutup: agenda Fitur 6 (reference image) dan Fitur 7 (audit internal link) di `docs/AGENDA.md`
Melanjutkan: `2026-09-03-knowledge-source-business-asset-design.md`

## Masalah

**Fitur 6.** Gambar artikel dihasilkan murni dari prompt teks. Untuk artikel tentang
"Bel Cerdas Cermat", Seedream menggambar alat kuis khayalan — bukan alat yang benar-benar
disewakan perkap. Padahal foto aslinya sudah ada dan terawat.

**Fitur 7.** 662 artikel terbit tanpa pernah diperiksa apakah tautan internalnya masih
hidup. `validate-seo.js` lama tidak pernah me-resolve URL, jadi tautan mati ikut terbit
(PER-2653).

**Ketimpangan bentuk produk.** Di autoblog, produk hanya `{id, name, url, price,
target_market}` — daftar baris datar. Di business asset, produk punya foto utama, galeri
bercaption, konteks, FAQ, troubleshooting, care. Dashboard autoblog menampilkan yang
miskin padahal yang kaya tersedia.

### Yang ditemukan di lapangan

Diperiksa langsung, bukan diasumsikan:

| Hal | Angka |
|---|---|
| Produk di `products.json` | 45 |
| Punya `foto` utama | 41 (4 kosong) |
| File foto utama hilang dari disk | **0** |
| Item galeri | 43, semuanya ada di disk |
| Total file di `photos/` | 88 |
| URL keekstrak dari `konteks` | 35 dari 45 |
| Produk punya field `url` sendiri | **0 — field-nya belum ada** |

Sepuluh produk tanpa URL: Hollyland LARK A1 Duo, Converter Type-C to HDMI Vention,
Mixer Ashley SMR 6, Mixer Yamaha DX06, Mixer Zetapro Kingkong 8, Confetti Machine
Elektrik, Pompa Angin Elektrik Reaim, Webcam Logitech C920, Tripod QZSD-999H, Stand Parled.

Folder legacy `Content/Article/image/reference/` berisi 29 folder produk. Isinya lebih
miskin (tanpa caption, tanpa harga, tidak terawat) dan sudah tidak diperbarui sejak
business asset jadi sumber utama. **Ditinggalkan**, tidak diport.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Field `url` produk | ditambah di **business asset** | satu sumber; 10 produk tanpa URL jadi bisa diisi lewat form, bukan menyunting markdown |
| Ekstraksi dari `konteks` | tetap ada, sebagai fallback | 35 produk sudah benar tanpa mengetik ulang apa pun |
| Sumber gambar referensi | **business asset saja** | 88 file terawat, nol hilang; legacy tidak menambah apa pun yang layak dirawat |
| Tampilan produk di KB | expandable read-only, **hanya mode business_asset** | mode manual tidak punya penyimpanan gambar — tidak ada yang bisa ditampilkan |
| Cakupan fitur 7 | **audit saja**, perbaikan menyusul | audit baca-saja aman kapan pun; menulis balik ke 662 artikel produksi butuh keputusan terpisah |
| Repo business asset | edit di **dev (3001)** lalu push, lalu pull di **production (3101)** | `data/` hidup di production; edit langsung di sana hilang saat pull |

---

# Bagian A — Field `url` di business asset

Repo `lumbunginov/business-asset`. Folder kerja:
`G:\Project\Sikil Project\business_asset\.claude\skills\business-asset` (port 3001).

## Bentuk data

```json
{
  "id": "mixer-ashley-smr6",
  "nama": "Mixer Audio Ashley SMR 6",
  "url": "https://perkap.com/sewa-mixer-audio/",
  "harga": "...",
  "foto": "1782347725956.png"
}
```

`url` opsional. Produk lama tanpa `url` tetap sah — tidak ada migrasi data, tidak ada
penulisan massal ke `products.json`.

## Perubahan

| File | Perubahan |
|---|---|
| `scripts/routes/products.js` | POST: `url` dari body. PUT: pola `!== undefined` yang sama seperti field lain |
| `public/index.html` | satu input `id="p-url"` di bawah Nama Produk |
| `public/js/produk.js` | `formData.append('url', ...)`, isi saat edit, kosongkan saat tambah, tampilkan di kartu produk |

Pola PUT yang sudah dipakai field lain dan wajib diikuti:

```js
const url = req.body.url !== undefined ? req.body.url : products[idx].url;
```

Alasannya: `!== undefined` berarti field yang tidak dikirim mempertahankan nilai lama.
Memakai `|| ''` di PUT akan **menghapus URL** setiap kali ada penyimpanan parsial dari
form lain yang tidak memuat field ini.

## Validasi

URL divalidasi di server, bukan hanya di `<input type="url">` (yang bisa dilewati oleh
klien mana pun):

```js
function bersihkanUrl(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  let u;
  try {
    u = new URL(s);
  } catch {
    const e = new Error('URL produk tidak valid: ' + s);
    e.status = 400;
    throw e;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    const e = new Error('URL produk harus http atau https');
    e.status = 400;
    throw e;
  }
  return u.toString();
}
```

Kosong adalah nilai sah — 10 produk memang belum punya halaman.

## Penyebaran

1. Commit dan push dari folder dev
2. `git pull` di `G:\Project\Paperclip\Perkap_com\project\sosmed_content`
3. Restart server 3101 dengan **PID-filter**:
   `netstat -ano | grep :3101` lalu `taskkill //PID <pid> //F`
   **JANGAN** `Get-Process node | Stop-Process` — itu membunuh server Paperclip di 3100
   dan seluruh node lain (kejadian 2026-08-08)
4. Verifikasi kedua clone di commit yang sama: `git log --oneline -1`

---

# Bagian B — Produk kaya di autoblog

## Dua tingkat, tetap

Keputusan lama dipertahankan: katalog penuh 143 KB tidak pernah ikut `GET /api/config`.

| Tingkat | Isi per produk | Dipakai |
|---|---|---|
| **Ringkas** | `id`, `name`, `url`, `price`, `target_market`, `image`, `gallery_count`, `has_context`, `faq_count` | `GET /api/config`, dropdown, dashboard |
| **Penuh** | ringkas + `context`, `faq`, `troubleshooting`, `care`, `gallery[]` | `blog-config.js product <id>` |

Empat field baru di tingkat ringkas semuanya berukuran tetap — angka dan boolean, bukan
teks panjang. `image` adalah satu nama berkas (`"1782347725956.png"`), bukan isi gambar.
Tambahan untuk 45 produk di bawah 4 KB.

## `mapProducts` — perubahan

`scripts/lib/business-asset.js`:

```js
const url = String(p?.url || '').trim() || extractProductUrl(p?.konteks, siteUrl);
```

`p.url` menang; `konteks` jadi jaring pengaman. Urutan ini penting: URL yang diketik
pemilik di form lebih otoritatif daripada yang ditambang dari markdown.

Ringkasan per produk bertambah:

```js
image: String(p?.foto || '').trim(),
gallery_count: Array.isArray(p?.gallery) ? p.gallery.length : 0,
has_context: Boolean(String(p?.konteks || '').trim()),
faq_count: hitungFaq(p?.faq)
```

`hitungFaq` menghitung heading `###` di teks FAQ; nol kalau kosong. Dites terpisah dengan
FAQ kosong, satu heading, banyak heading, dan teks tanpa heading sama sekali.

## Penyajian gambar

Rute baru di `scripts/routes/knowledge-source.js`:

```
GET /api/business-asset-photo?business_id=perkapcom&file=1782347725956.png
```

Ini menyajikan berkas dari disk ke browser, jadi ia adalah permukaan serangan path
traversal dan **harus** dikunci berlapis:

1. `root` diambil dari **config tenant**, tidak pernah dari query — browser tidak boleh
   menentukan direktori mana yang dibaca
2. `business_id` lewat `assertBusinessId` yang sudah ada
3. `file` wajib cocok `/^[A-Za-z0-9._-]+$/` — tanpa garis miring, backslash, titik ganda, atau NUL
4. Ekstensi wajib `.png`, `.jpg`, `.jpeg`, atau `.webp`
5. Setelah `path.resolve`, hasilnya wajib berada di dalam
   `<root>/<business_id>/photos` ditambah pemisah — pemeriksaan terakhir yang menangkap
   apa pun yang lolos empat lapis di atas
6. Berkas di luar itu → 404 tanpa membocorkan path yang dicari

Tes wajib: path traversal dengan titik ganda, bentuk ter-URL-encode, nama berisi NUL,
nama berisi backslash, ekstensi `.json`, dan berkas sah yang memang harus 200.

Mode manual tidak punya sumber gambar, jadi rute ini menolak dengan 400 saat tenant aktif
bukan business_asset.

## Tampilan dashboard

Tab Knowledge Base, mode business_asset. Baris datar diganti kartu:

```
+----------------------------------------------+
| [img] Bel Cerdas Cermat Custom            v  |
|       Rp 60.000-210.000/hari   perkap.com    |
+----------------------------------------------+
|  Konteks   > 4.2 KB                          |
|  FAQ       > 8 pertanyaan                    |
|  Galeri    [img][img][img][img]              |
+----------------------------------------------+
| [img] Mixer Audio Ashley SMR 6            >  |
|       Rp 150.000/hari   ! belum ada URL      |
+----------------------------------------------+
```

- Tertutup secara bawaan; isi penuh diambil saat dibuka, bukan saat halaman dimuat
- Lencana "belum ada URL" membuat 10 produk yang bolong terlihat tanpa perlu laporan
- Produk tanpa `foto` menampilkan kotak abu berinisial, bukan gambar rusak
- Mode manual **tidak berubah** — tetap baris nama + URL seperti sekarang

Detail penuh diambil lewat rute baru `GET /api/business-asset-product?id=<produk>` yang
mengembalikan satu produk (bukan katalog), sehingga membuka 45 kartu sekali pun tidak
pernah menarik 143 KB dalam satu tarikan.

---

# Bagian C — Reference image (Fitur 6)

## Pencocokan artikel ke produk

Modul baru `scripts/lib/product-match.js`, murni, dites:

```
matchProduct(products, { title, keyword, productName }) -> { product, score, reason } | null
```

Urutan, berhenti di kecocokan pertama:

1. `productName` diberikan dan cocok persis dengan `id` atau `name` — inilah jalur normal,
   karena alur artikel perkap sudah membawa nama produk
2. Judul artikel memuat nama produk (bandingkan setelah huruf kecil dan spasi dirapikan)
3. Kata kunci fokus memuat nama produk
4. Kecocokan kata: minimal **dua** kata bermakna (panjang minimal 4, bukan kata umum) yang sama

Ambang dua kata dipilih setelah melihat data asli: "Mixer Audio Ashley SMR 6" dan "Mixer
Audio Yamaha DX06" berbagi dua kata umum ("mixer", "audio"). Ambang satu kata akan
membuat artikel tentang Yamaha memakai foto Ashley — salah gambar lebih buruk daripada
tanpa gambar, karena tidak terlihat salah sampai ada yang memperhatikan. Aturan 4 karena
itu **hanya berlaku bila tepat satu produk** mencapai skor tertinggi; seri berarti tidak
ada kecocokan.

Tidak ada kecocokan → `null` → alur lama (teks-ke-gambar) berjalan seperti sebelumnya.

## Alur gambar

`agents/image-generator.md` mendapat langkah baru sebelum menyusun prompt:

```bash
node scripts/blog-config.js product-image "<nama produk>"
```

Keluarannya satu baris JSON: `{ "path": "...", "product": "...", "caption": "..." }`
atau `{ "path": null, "reason": "..." }`.

Kalau ada `path`:
- berkas dibaca, di-encode base64 data URI, dikirim sebagai `payload.image` — bentuk yang
  persis sama seperti yang sudah dipakai `gen-image/scripts/seedream-client.js`
- prompt berubah nada: dari "gambarkan alat kuis" jadi "tampilkan alat pada foto ini dalam
  suasana lomba cerdas cermat di aula sekolah"

Kalau `path` null, tidak ada yang berubah dari perilaku sekarang.

Pemilihan berkas: `foto` utama dulu; kalau kosong, item galeri pertama; kalau dua-duanya
tidak ada, `null`. Berkas yang tercatat tapi hilang dari disk diperlakukan sama dengan
tidak ada — dicatat di `reason`, tidak melempar. Gambar hilang tidak boleh menggagalkan
penulisan artikel.

Batas ukuran: berkas di atas 8 MB dilewati dengan `reason`, karena base64 membengkak 33%
dan permintaan raksasa gagal dengan galat yang tidak jelas dari API.

---

# Bagian D — Audit internal link (Fitur 7)

## Cakupan

Baca-saja. Tidak ada penulisan ke WordPress di spec ini. `suggest-link-fixes.js` dan
`apply-link-fixes.js` menunggu keputusan terpisah setelah laporan pertama terbaca.

## `scripts/audit-links.js` (baru)

Diport dari `post-article/scripts/audit-internal-links.js` dengan tiga perubahan:

| Aspek | Lama | Baru |
|---|---|---|
| Situs | konstanta `perkap.com` di kode | dari `config.wordpress.url` tenant aktif |
| Keluaran | path relatif ke folder skill | `data/blogs/{id}/audit/link-YYYY-MM-DD.md` dan `.json` |
| Kredensial | tidak ada (konten publik) | tetap tidak ada — hanya membaca REST publik |

**Yang wajib diport apa adanya**, karena tiap potong adalah pelajaran dari kegagalan nyata:

- **Retry berlapis** dengan jeda 0, 3, 8, 15 detik untuk 503 dan badan JSON terpotong.
  Origin perkap membalas 200 dengan badan terpotong di 128 KB; tanpa ini crawl mati di tengah
- **Abaikan path `/wp-json/`** — Elementor membangun paginasi dari URL permintaan saat itu,
  jadi lewat REST muncul sebagai `/wp-json/wp/v2/pages/page/2/`. Audit pertama melaporkan
  55 "tautan mati" yang tidak bisa dijangkau pengunjung mana pun
- **Sapuan ulang serial** untuk setiap URL yang tampak mati, berjeda 1,5 detik. Sapuan
  paralel memancing throttle; audit pertama melaporkan tiga 503 yang ternyata 200 semua
- **Hanya 4xx berarti mati.** 5xx, 408, 429, dan galat jaringan masuk kolom "tak pasti",
  dilaporkan terpisah, tidak pernah dihitung sebagai tautan rusak

Menghapus salah satu dari empat itu menghasilkan laporan yang terlihat benar dan salah —
mode kegagalan yang paling mahal.

## `scripts/audit-media.js` (baru)

Port `audit-featured-media.js`: daftar artikel tanpa gambar utama. Keluaran menyatu ke
laporan yang sama.

## Silang dengan knowledge base

Nilai tambah yang tidak dimiliki skrip lama: sekarang ada peta produk ke URL yang sahih.
Laporan mendapat satu bagian tambahan:

```
## URL produk yang tidak pernah ditautkan
| Produk | URL | Artikel menautkan |
|---|---|---|
| Stand Parled | (belum ada URL) | — |
| Mixer Yamaha DX06 | https://perkap.com/... | 0 |
```

Ini menjawab pertanyaan yang benar-benar dipedulikan pemilik: halaman produk mana yang
tidak pernah mendapat tautan internal dari 662 artikel yang sudah ada.

## Menjalankan

```bash
node scripts/audit-links.js
node scripts/audit-links.js --limit 50
node scripts/audit-links.js --blog perkapcom
```

Tidak dipasang di dashboard maupun dijadwalkan. Crawl 662 artikel memakan waktu dan
membebani origin; ia dijalankan saat diminta, bukan otomatis.

---

## Verifikasi

| Hal | Bukti |
|---|---|
| Field `url` tersimpan | isi URL di form dev 3001, `products.json` memuat `url`, muat ulang form terisi |
| PUT tidak menghapus URL | simpan produk tanpa mengirim `url`, nilai lama utuh |
| URL tidak sah ditolak | skema `javascript:` ditolak 400, `products.json` tidak berubah |
| Produksi ikut | pull di 3101, `git log -1` sama dengan dev, form memuat kolom URL |
| Prioritas `url` | produk punya `url` dan URL di konteks, yang menang `p.url` |
| Fallback utuh | 35 produk tanpa `url` tetap terekstrak dari konteks |
| Ringkas tetap ramping | `GET /api/config` tidak memuat `context`/`faq`/`gallery`; ukuran di bawah 60 KB |
| Foto tersaji | permintaan foto sah membalas 200 dengan `image/png` |
| Traversal ditolak | titik ganda, bentuk ter-encode, backslash, NUL, ekstensi `.json` semuanya 404/400 tanpa isi berkas |
| Kartu produk | dashboard mode business_asset menampilkan 45 kartu, 10 berlencana "belum ada URL" |
| Mode manual utuh | tenant manual menampilkan daftar produk persis seperti sebelum perubahan |
| Pencocokan produk | "Bel Cerdas Cermat" dapat produk benar; "Mixer Audio" mengembalikan null (seri, tidak menebak) |
| Gambar referensi | `product-image "Bel Cerdas Cermat"` memberi path; berkas hilang memberi `path: null` dan `reason` |
| Artikel tanpa produk | artikel umum memberi `path: null`, alur teks-ke-gambar seperti biasa |
| Audit jalan | `audit-links.js --limit 20` menulis laporan, kolom tak-pasti terpisah dari mati |
| Audit tidak menulis | `git status` di folder data bersih dan mtime `products.json` tidak berubah |

Verifikasi akhir lewat Playwright pada kedua dashboard, memakai sesi browser yang sudah
terbuka — sesi baru selalu mulai dari kondisi logout.

## Di luar cakupan

- Menerapkan perbaikan tautan ke WordPress — keputusan terpisah setelah laporan pertama terbaca
- Unggah gambar di mode manual — butuh penyimpanan gambar tersendiri di autoblog
- Folder legacy `Content/Article/image/reference/` — ditinggalkan
- Menulis balik apa pun ke business asset dari autoblog (autoblog tetap hanya membaca)
- Fitur 9 (SERP tracker) dan 10 (Edit Elementor)
