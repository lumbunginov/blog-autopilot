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

Semua dijalankan dari `.claude/skills/blog-autopilot/scripts/elementor/`:

```bash
node download-page.js <slug|pageId|all>      # WordPress → pages/
node extract-elementor.js <slug.json|all>    # pages/ → elementor/   (edit di sini)
node validate-elementor.js <slug.json>       # cek struktur elementor/
node compress-elementor.js <slug.json|all>   # elementor/ → compress/
node upload-page.js <slug>                   # compress/ → halaman yang SUDAH ada
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

Nama berkas memakai slug halaman: `sewa-ht-malang.json`.

## Alur: edit halaman yang sudah ada

```bash
node download-page.js sewa-ht-malang
node extract-elementor.js sewa-ht-malang.json
# edit elementor/sewa-ht-malang.json
node validate-elementor.js sewa-ht-malang.json
node compress-elementor.js sewa-ht-malang.json
node upload-page.js sewa-ht-malang
```

## Alur: halaman baru dari template

`clone-template.js` meregenerasi seluruh id elemen dan mengganti teks secara
rekursif, lalu memvalidasi sebelum menulis:

```bash
node clone-template.js sewa-ht-malang.json sewa-ht-denpasar.json \
  "Sewa HT Denpasar" --replace "Malang:Denpasar"
```

Keluarannya format halaman WordPress (`{content, page_settings, version, title, type}`)
di `elementor/`. Kirim langsung jadi halaman baru:

```bash
node create-page.js sewa-ht-denpasar.json "Sewa HT Denpasar" \
  --slug sewa-ht-denpasar --status draft
```

`create-page.js` menerima dua bentuk berkas — array section (hasil
`extract-elementor.js`) maupun format halaman WordPress (hasil
`clone-template.js`). Tanpa `--status` halaman dibuat **draft**; naikkan ke
`publish` setelah tampilannya diperiksa. Tanpa `--slug`, WordPress menurunkan
slug dari judul. Respons WordPress otomatis disimpan ke `pages/<slug>.json`,
jadi siklus edit berikutnya bisa langsung `extract-elementor.js`.

## Aturan yang tidak boleh dilanggar

**Jangan pernah menyusun ulang JSON dengan tangan** — tanpa `sed`, tanpa
find/replace lintas berkas, tanpa merangkai string. Elementor menyimpan ribuan
nilai bersarang; satu koma salah membuat halaman kosong di frontend dan editor
Elementor menolak memuatnya. Gunakan `clone-template.js`, atau Node dengan
`JSON.parse`/`JSON.stringify`.

**Selalu `validate-elementor.js` sebelum compress.** Validator menangkap
sintaks rusak, `id`/`elType` yang hilang, dan id duplikat — tiga penyebab
halaman rusak yang paling sering.

**Upload mengubah halaman live.** Konfirmasi dulu ke pemilik situs, atau
arahkan ke halaman staging dengan `--page-id`. `pages/` menyimpan salinan
sebelum-edit; itu jalan pulang bila hasilnya salah.

**Halaman baru dibuat sebagai draft.** `create-page.js` tidak pernah
mem-publish tanpa diminta — periksa dulu di editor Elementor, baru ubah
statusnya.

## Kalau gagal

| Gejala | Sebab | Tindakan |
|---|---|---|
| `Kredensial WordPress ... belum diset` | `.env` skill belum berisi password | Tambahkan `<ID>_WP_APP_PASSWORD=...` |
| `[tanpa data Elementor]` saat download | halaman tidak dibangun dengan Elementor | Edit lewat WP admin biasa |
| `No _elementor_data found` | berkas `pages/` diambil bukan dengan `context=edit` | Download ulang dengan `download-page.js` |
| HTTP 401/403 saat upload | app password tidak punya hak edit page | Pakai akun editor/admin |
| `bukan array section Elementor maupun format halaman WordPress` | berkas sumber create-page salah bentuk | Pakai hasil `extract-elementor.js` atau `clone-template.js` |
| Halaman baru tak muncul di situs | dibuat sebagai draft (default) | Publish di WP admin, atau `--status publish` |
| Halaman kosong setelah upload | JSON rusak lolos ke compress | `pages/` → extract ulang, edit lagi, validate |
| Tampilan lama masih muncul | cache Elementor/CDN | Elementor → Tools → Regenerate CSS, lalu purge cache |

Detail lain: `references/elementor-widgets.md` (struktur widget & settings),
`references/elementor-troubleshooting.md`.

## Test

```bash
node --test scripts/elementor/workflow.test.js
```
