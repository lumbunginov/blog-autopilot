# Breakdance — alur halaman

Untuk situs dengan **Settings → Page Builder = Breakdance**. Semua dijalankan dari
`.claude/skills/blog-autopilot/scripts/builders/breakdance/`.

Breakdance tidak menyimpan halamannya di REST `wp/v2`. Semua baca/tulis lewat
**WordPress Abilities API** (`/wp-json/wp-abilities/v1`) dengan Application
Password blog yang sama — tidak perlu MCP atau OAuth. Syarat situs: Breakdance
2.x/3.x yang mendaftarkan ability `breakdance/*` (cek: `node ability.js list`).

## Sebelum mulai — muat panduan builder

```bash
node docs.js                         # get-instructions → docs/instructions.md + daftar isi
node docs.js --list                  # sub-skill: building-sites, patterns, design-first-build, ...
node docs.js --skill building-sites  # muat sub-skill yang cocok dengan pekerjaannya
```

Panduan itu (±75 KB) berasal dari plugin yang terpasang, jadi selalu sesuai
versinya. **Jangan baca utuh**: `docs.js` mencetak judul + nomor baris, baca
bagian yang relevan saja. Wajib dimuat sebelum build/edit pertama di sesi itu.

## Perintah

| Script | Untuk |
|---|---|
| `download-page.js <slug\|id>` | Unduh pohon elemen → `trees/<slug>.json`, cetak ringkasan id/tipe/teks |
| `create-page.js <file.html> "Judul" [--slug s] [--status draft]` | Halaman BARU dari HTML+CSS (selalu draft kecuali diminta) |
| `add-html.js <slug\|id> <file.html> [--parent id] [--position n]` | Tambah seksi BARU ke halaman yang ada |
| `edit-page.js <slug\|id> <ops.json> [--dry-run]` | Ubah elemen yang ada (teks, gambar, tautan, properti, pindah, hapus) |
| `preview-page.js <slug\|id> [--css] [--out f.html]` | Render HTML halaman untuk verifikasi (draft juga bisa) |
| `ability.js list \| describe <nama> \| run <nama> '<json>'` | Ability lain yang tak punya script sendiri (61 ability) |

Semua menerima `--blog <id>`. Berkas kerja per blog ada di
`data/blogs/<id>/breakdance/` (`trees/`, `backups/`, `docs/`).

## Membangun vs. menyunting — jangan tertukar

- **Halaman/seksi baru** → tulis HTML semantik + `<style>`, lalu `create-page.js`
  atau `add-html.js` (di balik layar: `html-to-page`).
- **Mengubah yang sudah ada** → `download-page.js` untuk menemukan id, lalu
  `edit-page.js`. `html-to-page` hanya **menambah**: menjalankannya untuk
  "mengganti" seksi meninggalkan salinan lama di tempatnya.

Contoh `ops.json` (ubah teks elemen 101, lalu duplikat tombol 102):

```json
[
  {"op": "update", "payload": {"element_id": 101, "properties": {"content": {"content": {"text": "Teks baru"}}}}},
  {"op": "duplicate", "payload": {"element_id": 102}}
]
```

`update` menggabungkan properti (properti lain tetap). Properti per elemen:
`node ability.js run get-element-schemas '{"element_slugs":["EssentialElements\\FText"],"paths":["content"]}'`
(`paths` memangkas skema yang bisa sangat besar).

## Aturan keselamatan

1. **Suntingan selalu lewat `edit-page.js`.** Script itu mengambil pohon
   terbaru, menyimpan cadangannya ke `backups/`, memeriksa semua id, baru
   mengirim. `edit-post` atomik (batch gagal = tidak ada yang berubah); cadangan
   gunanya untuk suntingan yang berhasil tapi keliru. Pakai `--dry-run` untuk
   batch besar. Elemen yang baru dibuat (insert/duplicate) belum punya id yang
   diketahui — operasi yang merujuknya dikirim di batch berikutnya, setelah
   `download-page.js`.
2. **CSS di `<style>` menjadi selector GLOBAL** situs, bukan milik halaman itu
   saja. Pakai awalan kelas khas per komponen (mis. `produk-hero`, bukan `hero`)
   supaya tidak menimpa kelas yang dipakai halaman lain. Mengubah kelas yang
   sudah ada **mengganti** seluruh propertinya di breakpoint itu — baca dulu
   dengan `get-css-selectors` (`include_properties: true`) dan kirim lengkap.
3. **Responsif wajib.** `@media` hanya diimpor bila query-nya disalin persis
   dari `node ability.js run get-breakpoints`; query lain dibuang diam-diam.
   `style=""` inline juga dibuang.
4. **Halaman baru selalu draft.** Terbitkan hanya bila diminta:
   `node ability.js run change-post-status '{"post_id":<id>,"status":"publish"}'`.
5. **Pengaturan seluruh situs** (`set-global-settings`, `set-settings` seperti
   Modern Normalize, template header/footer, `set-home-page`, maintenance mode)
   mengubah semua halaman — minta persetujuan pengguna dulu.
6. Membuang halaman uji: `change-post-status` → `trash`, dan hapus selector yang
   ikut dibuat (`get-css-selectors` dengan `search`, lalu `delete-css-selectors`).

## Meta SEO

Sama untuk semua builder: `node ../../seo-meta.js get|set ...` — lihat
`references/seo-standards.md`.

## Kalau gagal

| Gejala | Sebab | Tindakan |
|---|---|---|
| `rest_no_route` saat `ability.js list` | Abilities API / Breakdance tidak aktif atau terlalu lama | Perbarui WordPress & Breakdance |
| `Read-only abilities require GET` / `input is not of type object` | memanggil ability tanpa `lib/abilities.js` | Pakai `ability.js` |
| `tidak dibangun dengan Breakdance` | halaman milik builder lain (mis. Elementor) | Sunting dengan builder aslinya |
| `operasi ditolak sebelum dikirim` | id salah / sudah dihapus / elemen baru dari batch yang sama | `download-page.js`, perbaiki id |
| `edit-post gagal, tidak ada yang diubah` | properti tidak sesuai skema elemen | `ability.js run get-element-schemas` untuk elemen itu, perbaiki properti |
| Pohon yang diunduh tidak memuat suntingan terbaru | cache server untuk GET | Sudah ditangani `lib/abilities.js` (pemecah cache); jangan panggil REST langsung |
| Tampilan desktop saja di HP | `@media` tidak persis sama dengan breakpoint | Salin query dari `get-breakpoints` |
| `html-to-page gagal` setelah halaman dibuat | HTML ditolak | Halaman kosong tetap ada — `add-html.js <id>` setelah diperbaiki, atau trash |

## Test

```bash
node --test scripts/builders/breakdance/lib/*.test.js scripts/lib/abilities.test.js
```
