# Knowledge Base: Sumber Manual atau Business Asset

Tanggal: 2026-09-03
Status: design disetujui, belum diimplementasi
Menutup: agenda Fitur 8 (Product knowledge) di `docs/AGENDA.md`

## Masalah

Knowledge base tenant diisi manual lewat dashboard. Untuk perkap, hasilnya tipis dan
sebagian masih isian contoh bawaan:

| Field | Isi sekarang |
|---|---|
| `products` | 8 produk, 7 di antaranya tanpa URL |
| `internal_links` | 1 baris contoh palsu: `https://yourblog.com/example-page/` |
| `target_audience` | teks placeholder template: "Who your customers are (e.g., …)" |
| `prohibited_topics` | kosong |

Padahal data yang sama sudah dirawat di skill `business-asset` (agent sosmed content),
jauh lebih lengkap dan diperbarui rutin:

`G:\Project\Paperclip\Perkap_com\project\sosmed_content\data\businesses\perkapcom\`

- `profile.json` — nama, tagline, jenis usaha, kota, targetMarket, toneOfVoice, kataHindari, website
- `products.json` — **45 produk**, tiap produk punya `nama`, `harga`, `konteks`
  (product knowledge penuh; 35 memuat URL perkap.com), `faq`, `targetMarket`

Mengetik ulang 45 produk ke dashboard adalah kerja sia-sia yang langsung basi begitu
business asset diperbarui.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Cara baca | **Live read** tiap dipakai | edit di dashboard sosmed langsung terasa; tidak ada salinan basi |
| Kedalaman produk | nama + url + harga + konteks + faq | penulis artikel dapat spesifikasi asli, bukan hanya nama |
| Sumber data | baca file langsung | server sosmed (3101) tidak perlu hidup |
| Pemilih | `root` + `business_id` terpisah | UI bisa menampilkan dropdown; user tidak menempel path |
| Mode business_asset | knowledge base **read-only** | tanpa ini, sekali Save hasil live tertulis balik jadi salinan beku |
| Folder hilang | error yang menyebut path | jangan diam-diam jatuh ke manual atau ke KB kosong |

## Bentuk config

Field baru di `data/blogs/{id}/config.json`:

```json
"knowledge_source": {
  "type": "business_asset",
  "business_asset": {
    "root": "G:\\Project\\Paperclip\\Perkap_com\\project\\sosmed_content\\data\\businesses",
    "business_id": "perkapcom"
  }
}
```

`type` hanya `"manual"` atau `"business_asset"`. Config tanpa `knowledge_source` sama
sekali diperlakukan `manual` — semua tenant lama tetap jalan tanpa migrasi.

`knowledge_base` yang tersimpan **tidak dihapus** saat mode business_asset. Ia tetap ada
di disk sebagai cadangan; kalau user kembali ke manual, isinya utuh seperti sebelumnya.

## Kedalaman dua tingkat

143 KB `konteks` + `faq` tersebar di 45 produk. Menyuntikkan semuanya ke penulis artikel
membuang konteks untuk 44 produk yang tidak sedang ditulis.

| Tingkat | Isi per produk | Dipakai |
|---|---|---|
| **Ringkas** | `id`, `name`, `url`, `price`, `target_market` | `GET /api/config`, dropdown produk, plan, dashboard |
| **Penuh** | ringkas + `context` + `faq` | satu produk, saat artikel tentang produk itu ditulis |

Tingkat penuh hanya lewat `node scripts/blog-config.js product <id-atau-nama>`.
Tidak pernah ikut di `GET /api/config`.

## Pemetaan business asset ke knowledge base

`lib/business-asset.js`, fungsi murni, dites:

| Autoblog | Business asset | Catatan |
|---|---|---|
| `business_name` | `profile.nama` | |
| `business_description` | `profile.deskripsi` | kosong → dirakit dari `tagline` + `jenisUsaha` + `kota` |
| `target_audience` | `profile.targetMarket` | |
| `tone` | `profile.toneOfVoice` dipetakan | `santai`→`casual`, `formal`/`profesional`→`professional`, `edukatif`→`educational`; tak dikenal → `professional` |
| `products[]` | `products.json` | `name`←`nama`, `price`←`harga`, `url` diekstrak dari `konteks` |
| `internal_links[]` | URL unik hasil ekstraksi | anchor = nama produk |
| `avoid_words[]` | `profile.kataHindari` | **field baru** |
| `prohibited_topics` | — | selalu `[]` |
| `custom_entries` | — | selalu `[]` |

### Kenapa `kataHindari` bukan `prohibited_topics`

`kataHindari: ["Termurah"]` berarti "jangan memakai kata ini". `prohibited_topics`
berbunyi, di `article-writer.md`: *"Never write about topics in prohibited_topics"*.
Memetakannya ke sana membuat penulis menghindari seluruh topik harga murah, padahal
maksud pemiliknya cuma satu kata yang tidak boleh dipakai. Field terpisah, aturan
terpisah satu baris.

### Ekstraksi URL produk

Dari `konteks`, ambil URL yang host-nya sama dengan host `wordpress.url` tenant, ambil
kemunculan pertama. Produk tanpa URL yang cocok → `url: ""` (tetap masuk daftar).

Host dibandingkan setelah dinormalkan (buang `www.`, huruf kecil). Kalau `wordpress.url`
belum diisi, ekstraksi dilewati seluruhnya dan semua `url` kosong — jangan menebak host
dari URL pertama yang ditemukan, karena `konteks` juga memuat tautan ke situs lain.

`internal_links` = URL hasil ekstraksi, unik, urut sesuai urutan produk.

## Modul

### `lib/business-asset.js` (baru, murni)

```
readBusinessAsset(root, businessId)   → { profile, products }   I/O; melempar error jelas
mapProfile(profile)                   → potongan knowledge_base
mapProducts(products, siteUrl)        → { products: [ringkas], internal_links: [] }
findProduct(products, idOrName)       → produk penuh | null
toneFrom(toneOfVoice)                 → tone autoblog
extractProductUrl(konteks, siteUrl)   → url | ''
```

`businessId` disanitasi lewat `sanitizeId` yang sudah ada (`lib/paths.js`) supaya `../`
tidak bisa menembus keluar `root`.

### `avoid_words` di mode manual

Field ini baru, jadi tenant manual belum punya. `resolveKnowledgeBase` mengembalikan
`avoid_words: config.knowledge_base.avoid_words || []` di mode manual — penulis artikel
selalu menerima array, tidak pernah `undefined`. UI manual belum diberi kolom untuk
mengisinya di spec ini; kosong adalah nilai yang benar sampai ada yang memintanya.

### `lib/knowledge.js` (baru)

```
resolveKnowledgeBase(config, { skillDir })  → { knowledge_base, source, error? }
```

Satu-satunya tempat yang memutuskan manual vs business_asset. Mode manual mengembalikan
`config.knowledge_base` apa adanya. Mode business_asset membaca live; kalau gagal, ia
mengembalikan `error` berisi pesan yang menyebut path — **bukan** melempar, supaya
dashboard tetap terbuka dan bisa menampilkan masalahnya.

### Perubahan modul yang ada

- `routes/config.js` — `GET /api/config` memakai `resolveKnowledgeBase`; `POST /api/config`
  membuang `knowledge_base` saat mode business_asset (pola sama seperti `stripCredentials`,
  plus `warning` di respons)
- `routes/blogs.js` — `GET/PUT /api/blogs/:id/config` diperlakukan sama
- `lib/config-merge.js` — `stripKnowledgeBase(body, mode)`, dites
- `scripts/blog-config.js` — subperintah `product <id-atau-nama>`; `knowledge_base` ikut resolusi
- `routes/knowledge-source.js` (baru) — `GET /api/business-assets?root=…` (daftar bisnis di
  sebuah root) dan `GET /api/knowledge-preview` (hasil resolusi tenant aktif)

`GET /api/business-assets` menerima path sembarang dari query. Ia hanya boleh
mengembalikan **daftar subfolder yang memuat `profile.json`**, plus `nama` dan jumlah
produk dari tiap folder itu — tidak pernah isi file lain, tidak pernah menuruni pohon
direktori. Root yang bukan direktori, atau yang tidak memuat satu pun business asset,
dijawab dengan daftar kosong dan pesan yang menyebut path; bukan 500.

## UI

Tab Knowledge Base dapat kartu baru **di paling atas**, sebelum "Auto-fill from Website":

```
Sumber Knowledge Base
( ) Input manual        — isi sendiri di halaman ini
(o) Business Asset      — ambil dari data bisnis skill sosmed content

  Folder root  [ G:\...\data\businesses        ]  [Muat]
  Bisnis       [ Perkap.com (45 produk)      v ]

  Terbaca: 45 produk - 35 internal link - tone casual
```

Saat mode business_asset:

- semua field knowledge base di bawahnya **read-only** (redup, tidak bisa diketik)
- tombol "Save Knowledge Base" berubah jadi "Sumber: Business Asset" dan mati
- kartu "Auto-fill from Website" disembunyikan — dua sumber otomatis yang saling menimpa
  cuma membingungkan
- daftar produk menampilkan 45 produk (read-only) dengan lencana harga

Beralih kembali ke manual mengembalikan semua field ke `config.knowledge_base` tersimpan.

Kalau resolusi gagal, kartu menampilkan kotak merah berisi path yang dicari dan alasannya
(folder tidak ada / `products.json` rusak), dan titik status sidebar jadi merah.

## Dampak ke agent dan SKILL.md

- `agents/article-writer.md` — tambah bagian: sebelum menulis, kalau artikel menyebut satu
  produk, jalankan `node scripts/blog-config.js product "<nama>"` untuk mengambil `context`
  + `faq` + harga produk itu. Tambah satu aturan: jangan pakai kata di `avoid_words`.
- `agents/topic-researcher.md` — daftar produk kini bisa 45; ambil yang relevan saja.
- `SKILL.md` — auto-lookup `product_url` tetap sama bentuknya (`knowledge_base.products`),
  tapi sekarang terisi otomatis di mode business_asset.

## Verifikasi

| Hal | Bukti |
|---|---|
| Pemetaan | `node --test scripts/lib/business-asset.test.js` hijau |
| Live read | ubah `nama` di `profile.json` → muat ulang dashboard → nama ikut berubah tanpa import |
| Produk | `GET /api/config` → `knowledge_base.products.length === 45` |
| Internal link | `internal_links` berisi URL perkap.com asli; `yourblog.com` tidak ada |
| Read-only | POST config berisi `knowledge_base` palsu → file di disk tidak berubah + ada `warning` |
| Tingkat penuh | `blog-config.js product "Bel Cerdas Cermat"` memuat `context`; `GET /api/config` tidak |
| Traversal | `business_id: "../../rahasia"` ditolak, menyebut id tidak valid |
| Folder hilang | root disalahketik → kotak merah menyebut path, dashboard tetap terbuka |
| Mode manual | tenant tanpa `knowledge_source` berperilaku persis seperti sebelumnya |

Verifikasi akhir lewat Playwright pada dashboard, memakai sesi browser yang sudah terbuka.

## Di luar cakupan

- Menulis balik ke business asset (autoblog hanya membaca)
- Sinkronisasi otomatis dua arah / watcher file
- `foto`, `gallery`, `troubleshooting`, `care` — dipakai fitur 6 (reference image) nanti
- Fitur 6, 7, 9, 10 di `docs/AGENDA.md`
