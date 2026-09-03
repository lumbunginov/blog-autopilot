# Reference Image Produk + Audit Internal Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gambar artikel memakai foto produk asli dari business asset, dan 662 artikel terbit bisa diaudit tautan internalnya.

**Architecture:** Field `url` ditambahkan ke produk di repo `business-asset` (dev 3001 → push → pull di production 3101). Autoblog membaca `p.url` dengan ekstraksi-dari-konteks sebagai fallback, menyajikan foto lewat satu rute berlapis-kunci, dan menampilkan produk sebagai kartu expandable read-only. Modul pencocokan murni memilih produk untuk sebuah artikel; `image-generator.md` mengirim fotonya sebagai reference image ke Seedream. Audit link diport baca-saja dari `post-article`.

**Tech Stack:** Node.js 18+ (CommonJS), Express, `node --test` + `node:assert` (tanpa framework), vanilla JS di dashboard, BytePlus Seedream 4.5.

**Spec:** `docs/superpowers/specs/2026-09-03-reference-image-dan-audit-link-design.md`

## Global Constraints

Nilai-nilai ini mengikat SETIAP task. Disalin verbatim dari spec dan dari aturan proyek yang sudah berlaku.

- **Dua repo, dua folder.** Task 1–3 dikerjakan di `G:\Project\Sikil Project\business_asset\.claude\skills\business-asset` (dev, port 3001). Task 4–12 di `G:\Project\Sikil Project\autoblog\.claude\skills\blog-autopilot`. **JANGAN PERNAH** mengedit `G:\Project\Paperclip\Perkap_com\project\sosmed_content` — itu clone production, perubahan di sana hilang saat pull.
- **Restart server hanya dengan PID-filter.** `netstat -ano | grep :<port>` lalu `taskkill //PID <pid> //F`. **JANGAN PERNAH** `Get-Process node | Stop-Process` — itu membunuh server Paperclip di port 3100 dan seluruh proses node lain (kejadian 2026-08-08).
- **Business asset hanya dibaca oleh autoblog.** Tidak ada kode autoblog yang menulis ke `data/businesses/`. Satu-satunya penulisan ke sana datang dari dashboard business-asset itu sendiri (Task 1–3).
- **Data hidup, jangan disentuh sembarangan.** `data/blogs/perkapcom/` memuat 662 artikel dan 59 kategori. `data/businesses/perkapcom/` dipakai agent sosmed tiap 30 menit. Uji dengan tenant/bisnis buatan, bukan yang hidup.
- **Kredensial hanya di `.env`.** Tidak pernah di argv, config, docs, pesan commit, atau berkas yang dilacak git.
- **Bahasa.** Komentar kode dan pesan galat berbahasa Indonesia, mengikuti kode yang sudah ada. Nama fungsi dan variabel boleh Inggris bila itu istilah teknis.
- **Tes.** `npm test` di autoblog (`node --test scripts/lib/*.test.js scripts/routes/*.test.js`). Di business-asset: `node --test scripts/lib/*.test.js`. Baseline sebelum mulai: autoblog **172 hijau**, business-asset **120 hijau**. Tidak boleh ada yang merah saat selesai.
- **Angka acuan lapangan** (sudah diverifikasi, jangan diubah tanpa mengukur ulang): 45 produk, 41 punya `foto`, 43 item galeri, 88 berkas di `photos/`, 35 URL terekstrak dari `konteks`, 27 internal link unik.
- **Tidak ada penulisan ke WordPress** di seluruh rencana ini. Audit adalah baca-saja.

---

# BAGIAN A — Repo `business-asset` (Task 1–3)

Folder kerja: `G:\Project\Sikil Project\business_asset\.claude\skills\business-asset`

---

### Task 1: Field `url` di backend produk

**Files:**
- Create: `scripts/lib/product-url.js`
- Create: `scripts/lib/product-url.test.js`
- Modify: `scripts/routes/products.js` (POST handler ~baris 21-40, PUT handler ~baris 42-66)

**Interfaces:**
- Consumes: tidak ada (task pertama)
- Produces: `bersihkanUrl(raw) → string` (melempar `Error` ber-`.status = 400` untuk URL tak sah). Produk yang tersimpan mendapat field `url` bertipe string; kosong berarti belum ada halaman.

**Konteks:** `scripts/routes/products.js` menyimpan produk ke `data/businesses/{id}/products.json`. Sembilan field sudah ada (`nama`, `harga`, `konteks`, `faq`, `troubleshooting`, `care`, `targetMarket`, `marketingGuidance`, `foto`). Kita menambah yang kesepuluh: `url`.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `scripts/lib/product-url.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { bersihkanUrl } = require('./product-url');

test('URL kosong sah — 10 produk memang belum punya halaman', () => {
  assert.equal(bersihkanUrl(''), '');
  assert.equal(bersihkanUrl('   '), '');
  assert.equal(bersihkanUrl(null), '');
  assert.equal(bersihkanUrl(undefined), '');
});

test('URL http dan https diterima, spasi pinggir dibuang', () => {
  assert.equal(bersihkanUrl('https://perkap.com/bel-cerdas-cermat/'), 'https://perkap.com/bel-cerdas-cermat/');
  assert.equal(bersihkanUrl('  https://perkap.com/x/  '), 'https://perkap.com/x/');
  assert.equal(bersihkanUrl('http://perkap.com/x/'), 'http://perkap.com/x/');
});

test('skema selain http/https ditolak dengan status 400', () => {
  for (const jahat of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'data:text/html,<script>']) {
    assert.throws(() => bersihkanUrl(jahat), (e) => e.status === 400, `harus menolak: ${jahat}`);
  }
});

test('teks yang bukan URL ditolak dengan status 400', () => {
  for (const jelek of ['bukan url', 'perkap.com/tanpa-skema', '://rusak']) {
    assert.throws(() => bersihkanUrl(jelek), (e) => e.status === 400, `harus menolak: ${jelek}`);
  }
});

test('pesan galat menyebut nilai yang ditolak, supaya pemilik tahu apa yang salah', () => {
  assert.throws(() => bersihkanUrl('bukan url'), /bukan url/);
});
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

```bash
node --test scripts/lib/product-url.test.js
```

Diharapkan: GAGAL dengan `Cannot find module './product-url'`.

- [ ] **Step 3: Tulis implementasi minimal**

Buat `scripts/lib/product-url.js`:

```js
'use strict';
// Validasi URL halaman produk. Dipakai route POST/PUT produk.
// Kosong adalah nilai sah: sebagian produk memang belum punya halaman.

function galat(pesan) {
  const e = new Error(pesan);
  e.status = 400;
  return e;
}

function bersihkanUrl(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  let u;
  try {
    u = new URL(s);
  } catch {
    throw galat(`URL produk tidak valid: ${s}`);
  }
  // Validasi di server, bukan hanya di <input type="url"> — input HTML bisa
  // dilewati klien mana pun, dan URL ini nanti dipasang sebagai href di artikel.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw galat(`URL produk harus http atau https, bukan "${u.protocol}"`);
  }
  return u.toString();
}

module.exports = { bersihkanUrl };
```

- [ ] **Step 4: Jalankan tes, pastikan LULUS**

```bash
node --test scripts/lib/product-url.test.js
```

Diharapkan: 5 tes lulus.

- [ ] **Step 5: Sambungkan ke route POST**

Di `scripts/routes/products.js`, tambahkan require di bagian atas berkas:

```js
const { bersihkanUrl } = require('../lib/product-url');
```

Di handler `app.post('/api/businesses/:id/products', ...)`, ubah baris pembuatan `product`. Baris lama:

```js
      const product = { id: pid, nama, harga: req.body.harga || '', konteks: req.body.konteks || '', faq: req.body.faq || '', troubleshooting: req.body.troubleshooting || '', care: req.body.care || '', targetMarket: req.body.targetMarket || '', marketingGuidance: req.body.marketingGuidance || '', foto, createdAt: new Date().toISOString() };
```

Baris baru (tambahkan `url` setelah `nama`):

```js
      const product = { id: pid, nama, url: bersihkanUrl(req.body.url), harga: req.body.harga || '', konteks: req.body.konteks || '', faq: req.body.faq || '', troubleshooting: req.body.troubleshooting || '', care: req.body.care || '', targetMarket: req.body.targetMarket || '', marketingGuidance: req.body.marketingGuidance || '', foto, createdAt: new Date().toISOString() };
```

`bersihkanUrl` melempar `Error` ber-`.status = 400`; blok `catch` yang sudah ada di handler ini sudah menangani `err.status`, jadi tidak perlu try/catch tambahan.

- [ ] **Step 6: Sambungkan ke route PUT**

Di handler `app.put('/api/businesses/:id/products/:pid', ...)`, tambahkan satu baris tepat setelah baris `const nama = ...`:

```js
      const url = req.body.url !== undefined ? bersihkanUrl(req.body.url) : products[idx].url;
```

Lalu tambahkan `url` ke objek yang disimpan. Baris lama:

```js
      products[idx] = { ...products[idx], nama, harga, konteks, faq, troubleshooting, care, targetMarket, marketingGuidance, foto };
```

Baris baru:

```js
      products[idx] = { ...products[idx], nama, url, harga, konteks, faq, troubleshooting, care, targetMarket, marketingGuidance, foto };
```

**Kenapa `!== undefined` dan bukan `|| ''`:** ini pola yang sudah dipakai sembilan field lain di handler ini. `!== undefined` berarti field yang tidak dikirim mempertahankan nilai lama. Kalau `url` memakai `|| ''`, setiap penyimpanan parsial dari form lain yang tidak memuat field ini akan **menghapus URL produk diam-diam** — kegagalan yang tidak terlihat sampai ada yang memeriksa.

- [ ] **Step 7: Verifikasi manual lewat HTTP**

Server dev 3001 sudah jalan. Buat bisnis uji supaya data perkap yang hidup tidak tersentuh:

```bash
curl -s -X POST http://localhost:3001/api/businesses -H "Content-Type: application/json" -d '{"nama":"Uji URL Produk"}'
```

Catat `id` yang dikembalikan (misal `uji-url-produk`), lalu:

```bash
# Tambah produk dengan URL
curl -s -X POST http://localhost:3001/api/businesses/uji-url-produk/products \
  -F "nama=Produk Satu" -F "url=https://contoh.test/produk-satu/"

# URL tak sah harus ditolak 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/businesses/uji-url-produk/products \
  -F "nama=Produk Jahat" -F "url=javascript:alert(1)"

# PUT tanpa mengirim url — URL lama harus utuh
curl -s -X PUT http://localhost:3001/api/businesses/uji-url-produk/products/produk-satu \
  -F "harga=Rp 100.000"
```

Diharapkan: produk pertama tersimpan dengan `url`; permintaan kedua membalas `400`; setelah PUT ketiga, `url` masih `https://contoh.test/produk-satu/`.

Periksa berkasnya:

```bash
node -e "console.log(JSON.stringify(require('./data/businesses/uji-url-produk/products.json'),null,1))"
```

- [ ] **Step 8: Jalankan seluruh tes repo**

```bash
node --test scripts/lib/*.test.js
```

Diharapkan: 125 lulus (120 baseline + 5 baru), 0 gagal.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/product-url.js scripts/lib/product-url.test.js scripts/routes/products.js
git commit -m "feat(produk): field url halaman produk, divalidasi di server"
```

---

### Task 2: Input URL di form produk

**Files:**
- Modify: `public/index.html` (form produk, sekitar baris 224)
- Modify: `public/js/produk.js` (render kartu ~baris 20-52, `startEditProduct` ~baris 280, reset form ~baris 261, `formData` ~baris 302)

**Interfaces:**
- Consumes: field `url` pada produk dari Task 1
- Produces: form yang mengirim `url` di `FormData`, dan kartu produk yang menampilkan tautannya

**Konteks:** Form produk memakai id berawalan `p-` (`p-nama`, `p-harga`, `p-konteks`, …). Penyimpanan lewat `FormData` ke route Task 1. Kartu produk dirender dari template literal di `renderProducts`.

- [ ] **Step 1: Tambah input di HTML**

Di `public/index.html`, cari baris:

```html
          <div class="form-group"><label>Nama Produk</label><input id="p-nama" type="text" placeholder="Es Kopi Susu"></div>
```

Tambahkan tepat di bawahnya:

```html
          <div class="form-group" style="margin-top:10px"><label>URL Halaman Produk</label><input id="p-url" type="url" placeholder="https://perkap.com/nama-produk/"><div style="font-size:11px;color:var(--text-dim);margin-top:4px">Opsional. Dipakai sebagai tautan internal saat artikel blog menyebut produk ini.</div></div>
```

- [ ] **Step 2: Kirim `url` saat menyimpan**

Di `public/js/produk.js`, cari:

```js
  formData.append('harga', document.getElementById('p-harga').value);
```

Tambahkan tepat di atasnya:

```js
  formData.append('url', document.getElementById('p-url').value);
```

- [ ] **Step 3: Isi saat mengedit, kosongkan saat menambah**

Di fungsi reset form (yang memuat `document.getElementById('p-nama').value = '';`), tambahkan:

```js
  document.getElementById('p-url').value = '';
```

Di `startEditProduct`, setelah `document.getElementById('p-nama').value = product.nama;`, tambahkan:

```js
  document.getElementById('p-url').value = product.url || '';
```

`|| ''` penting: produk lama tidak punya field ini, dan `undefined` akan tercetak sebagai teks "undefined" di kolom input.

- [ ] **Step 4: Tampilkan di kartu produk**

Di `renderProducts`, cari baris harga:

```js
          ${p.harga ? `<div class="product-konteks" style="color:var(--accent)">💰 ${p.harga.substring(0,80) + (p.harga.length > 80 ? '...' : '')}</div>` : ''}
```

Tambahkan tepat di bawahnya:

```js
          ${p.url
            ? `<div class="product-konteks">🔗 <a href="${p.url}" target="_blank" rel="noopener noreferrer">${p.url.replace(/^https?:\/\//, '').substring(0,50)}</a></div>`
            : '<div class="product-konteks" style="color:var(--text-dim)">🔗 belum ada URL halaman</div>'}
```

`rel="noopener noreferrer"` wajib pada tautan `target="_blank"`: tanpa itu halaman tujuan bisa mengakses `window.opener` dan mengarahkan ulang dashboard.

- [ ] **Step 5: Verifikasi lewat Playwright**

**Reuse sesi browser yang sudah terbuka — jangan membuka sesi baru.** Sesi baru selalu mulai dari kondisi logout.

Buka `http://localhost:3001`, pilih bisnis uji `Uji URL Produk` dari Task 1, lalu:

1. Klik Edit pada "Produk Satu" → kolom URL harus terisi `https://contoh.test/produk-satu/`
2. Ubah jadi `https://contoh.test/berubah/` → Simpan → kartu menampilkan URL baru
3. Tambah produk baru tanpa mengisi URL → kartu menampilkan "belum ada URL halaman"
4. Edit produk itu, isi `bukan-url` → simpan → browser menolak lewat validasi `type="url"`; kalau tetap terkirim, server membalas 400

Ambil tangkapan layar kartu produk sebagai bukti.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/js/produk.js
git commit -m "feat(produk): kolom URL halaman produk di form dan kartu"
```

---

### Task 3: Push dev, pull production, isi 10 URL yang kosong

**Files:**
- Tidak ada berkas kode yang diubah. Task ini adalah penyebaran dan pengisian data.

**Interfaces:**
- Consumes: Task 1 dan 2 sudah ter-commit di folder dev
- Produces: production clone (3101) berjalan dengan kode yang sama; `products.json` perkap memuat `url` untuk produk yang punya halaman

**PERINGATAN — langkah berurutan, jangan dilompati.** Task ini menyentuh data hidup yang dipakai agent sosmed tiap 30 menit dan dibaca live oleh autoblog. Kerjakan berurutan dan verifikasi tiap langkah sebelum lanjut.

- [ ] **Step 1: Cadangkan `products.json` production**

```bash
cd "G:/Project/Paperclip/Perkap_com/project/sosmed_content"
cp data/businesses/perkapcom/products.json "data/businesses/perkapcom/products.json.bak-$(date +%Y%m%d-%H%M%S)-preurl"
ls -la data/businesses/perkapcom/products.json.bak-*preurl
```

Diharapkan: satu berkas cadangan baru, ukuran sekitar 237 KB.

- [ ] **Step 2: Push dari dev**

```bash
cd "G:/Project/Sikil Project/business_asset/.claude/skills/business-asset"
git log --oneline -3
git push
```

- [ ] **Step 3: Pull di production**

```bash
cd "G:/Project/Paperclip/Perkap_com/project/sosmed_content"
git status --short
git pull
git log --oneline -1
```

Diharapkan: commit teratas sama persis dengan folder dev. Kalau `git status` menunjukkan berkas kode yang termodifikasi (bukan `data/`), **berhenti** — berarti ada yang pernah mengedit langsung di production; laporkan sebelum melanjutkan.

- [ ] **Step 4: Restart server 3101 — HANYA dengan PID-filter**

```bash
netstat -ano | grep :3101
```

Catat PID dari baris `LISTENING`, lalu:

```bash
taskkill //PID <pid-yang-dicatat> //F
```

**JANGAN PERNAH** `Get-Process node | Stop-Process` — itu membunuh server Paperclip di port 3100 dan seluruh proses node lain di mesin ini (kejadian 2026-08-08).

Nyalakan kembali:

```bash
cd "G:/Project/Paperclip/Perkap_com/project/sosmed_content"
node scripts/server.js
```

Jalankan di latar belakang. Verifikasi hidup:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3101/
```

Diharapkan: `200`.

- [ ] **Step 5: Verifikasi server Paperclip 3100 masih hidup**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/
```

Diharapkan: bukan `000`. Kalau `000`, server Paperclip ikut mati — nyalakan kembali sebelum melanjutkan.

- [ ] **Step 6: Isi URL untuk 10 produk yang kosong**

Sepuluh produk ini tidak punya URL di `konteks`-nya. Buka dashboard production `http://localhost:3101` lewat Playwright (**reuse sesi yang sudah terbuka**), pilih bisnis Perkap.com, tab Produk, lalu isi kolom URL Halaman Produk untuk masing-masing:

| Produk | URL |
|---|---|
| Hollyland LARK A1 Duo | (cari di perkap.com; kosongkan kalau belum ada halaman) |
| Converter Type-C to HDMI Vention | (idem) |
| Mixer Audio Ashley SMR 6 | (idem) |
| Mixer Audio Yamaha DX06 | (idem) |
| Mixer Audio Zetapro Kingkong 8 | (idem) |
| Confetti Machine Elektrik | (idem) |
| Pompa Angin Elektrik Reaim | (idem) |
| Webcam Logitech C920 | (idem) |
| Tripod Kamera QZSD-999H | (idem) |
| Stand Parled | (idem) |

**Kosong adalah jawaban yang sah.** Kalau halaman produknya memang belum ada di perkap.com, biarkan kosong — mengarang URL menghasilkan tautan mati di artikel, yang justru masalah yang sedang diperbaiki Fitur 7. Cari dulu di `https://perkap.com/?s=<nama produk>` sebelum memutuskan.

Catat berapa yang benar-benar terisi; angka itu masuk laporan akhir.

- [ ] **Step 7: Verifikasi data utuh**

```bash
cd "G:/Project/Paperclip/Perkap_com/project/sosmed_content"
node -e "
const p = require('./data/businesses/perkapcom/products.json');
const bak = require('./data/businesses/perkapcom/' + require('fs').readdirSync('./data/businesses/perkapcom').find(f => f.includes('preurl')));
console.log('jumlah produk sekarang:', p.length, '| sebelum:', bak.length);
console.log('punya url:', p.filter(x => x.url).length);
const hilang = bak.filter(b => !p.find(x => x.id === b.id));
console.log('produk hilang:', hilang.length, hilang.map(x => x.nama));
const berubah = bak.filter(b => { const n = p.find(x => x.id === b.id); return n && (n.nama !== b.nama || n.harga !== b.harga || n.konteks !== b.konteks); });
console.log('produk yang nama/harga/konteksnya berubah:', berubah.length, berubah.map(x => x.nama));
"
```

Diharapkan: jumlah tetap 45, produk hilang 0, produk berubah 0. Hanya `url` yang boleh bertambah. Kalau ada yang berubah selain itu, pulihkan dari cadangan Step 1 dan laporkan.

- [ ] **Step 8: Commit (tidak ada berkas kode — hanya catat di ledger)**

Tidak ada `git commit` di task ini: `data/` ada di `.gitignore` kedua repo. Catat di ledger: commit hash yang di-pull, jumlah URL yang terisi, dan nama berkas cadangan.

---

# BAGIAN B — Produk kaya di autoblog (Task 4–7)

Folder kerja: `G:\Project\Sikil Project\autoblog\.claude\skills\blog-autopilot`

---

### Task 4: `mapProducts` membaca `url` dan meringkas gambar

**Files:**
- Modify: `scripts/lib/business-asset.js` (`mapProducts` ~baris 113-133)
- Modify: `scripts/lib/business-asset.test.js` (tambah tes)

**Interfaces:**
- Consumes: produk business asset yang kini boleh punya `url` (Task 1)
- Produces: `mapProducts(products, siteUrl) → { products: [...], internal_links: [...] }` dengan tiap produk kini bertambah `image`, `gallery_count`, `has_context`, `faq_count`. Fungsi baru yang diekspor: `hitungFaq(teks) → number`.

**Konteks:** `mapProducts` memetakan produk business asset ke bentuk ringkas knowledge base. Sekarang ia hanya mengekstrak URL dari `konteks`. Kita menambah `p.url` sebagai sumber utama dan empat field ringkasan berukuran tetap.

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan ke `scripts/lib/business-asset.test.js`:

```js
test('mapProducts: url produk menang atas url yang ditambang dari konteks', () => {
  const products = [{
    id: 'a', nama: 'Produk A',
    url: 'https://situs.test/dari-form/',
    konteks: 'Link: https://situs.test/dari-konteks/'
  }];
  const hasil = ba.mapProducts(products, 'https://situs.test');
  assert.equal(hasil.products[0].url, 'https://situs.test/dari-form/');
  assert.deepEqual(hasil.internal_links, [{ url: 'https://situs.test/dari-form/', anchor: 'Produk A' }]);
});

test('mapProducts: tanpa field url, ekstraksi dari konteks tetap jalan', () => {
  const products = [{ id: 'a', nama: 'Produk A', konteks: 'Link: https://situs.test/dari-konteks/' }];
  const hasil = ba.mapProducts(products, 'https://situs.test');
  assert.equal(hasil.products[0].url, 'https://situs.test/dari-konteks/');
});

test('mapProducts: url kosong atau berisi spasi jatuh ke ekstraksi konteks', () => {
  const products = [{ id: 'a', nama: 'A', url: '   ', konteks: 'https://situs.test/x/' }];
  assert.equal(ba.mapProducts(products, 'https://situs.test').products[0].url, 'https://situs.test/x/');
});

test('mapProducts: ringkasan gambar dan konten berukuran tetap', () => {
  const products = [{
    id: 'a', nama: 'A', foto: 'f.png',
    gallery: [{ id: 'g1', filename: 'g1.png' }, { id: 'g2', filename: 'g2.png' }],
    konteks: 'ada isinya',
    faq: '### Pertanyaan satu\njawab\n### Pertanyaan dua\njawab'
  }];
  const p = ba.mapProducts(products, '').products[0];
  assert.equal(p.image, 'f.png');
  assert.equal(p.gallery_count, 2);
  assert.equal(p.has_context, true);
  assert.equal(p.faq_count, 2);
});

test('mapProducts: produk kosong memberi nilai ringkasan yang aman, bukan undefined', () => {
  const p = ba.mapProducts([{ id: 'a', nama: 'A' }], '').products[0];
  assert.equal(p.image, '');
  assert.equal(p.gallery_count, 0);
  assert.equal(p.has_context, false);
  assert.equal(p.faq_count, 0);
});

test('mapProducts: gallery yang bukan array dihitung nol, tidak melempar', () => {
  const p = ba.mapProducts([{ id: 'a', nama: 'A', gallery: 'rusak' }], '').products[0];
  assert.equal(p.gallery_count, 0);
});

test('mapProducts: ringkasan TIDAK memuat teks panjang', () => {
  const products = [{ id: 'a', nama: 'A', konteks: 'x'.repeat(5000), faq: 'y'.repeat(5000),
    troubleshooting: 'z'.repeat(5000), care: 'w'.repeat(5000) }];
  const p = ba.mapProducts(products, '').products[0];
  for (const k of ['context', 'konteks', 'faq', 'troubleshooting', 'care', 'gallery']) {
    assert.equal(k in p, false, `field "${k}" tidak boleh ada di tingkat ringkas`);
  }
  assert.ok(JSON.stringify(p).length < 500, 'satu produk ringkas harus jauh di bawah 500 byte');
});

test('hitungFaq menghitung heading, bukan baris', () => {
  assert.equal(ba.hitungFaq(''), 0);
  assert.equal(ba.hitungFaq(null), 0);
  assert.equal(ba.hitungFaq('teks tanpa heading sama sekali'), 0);
  assert.equal(ba.hitungFaq('### Satu\nisi'), 1);
  assert.equal(ba.hitungFaq('### Satu\nisi\n### Dua\nisi\n### Tiga'), 3);
  assert.equal(ba.hitungFaq('## Bukan tiga pagar\n### Ini iya'), 1);
});
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

```bash
node --test scripts/lib/business-asset.test.js
```

Diharapkan: gagal — `hitungFaq` belum ada, dan field ringkasan belum diproduksi.

- [ ] **Step 3: Implementasikan**

Di `scripts/lib/business-asset.js`, tambahkan sebelum `mapProducts`:

```js
// Jumlah pertanyaan FAQ = jumlah heading "### ". Dipakai untuk lencana di
// dashboard; teks FAQ sendiri TIDAK pernah ikut tingkat ringkas.
const FAQ_HEADING_RE = /^###\s+\S/gm;

function hitungFaq(teks) {
  const s = String(teks == null ? '' : teks);
  if (!s.trim()) return 0;
  return (s.match(FAQ_HEADING_RE) || []).length;
}
```

Ganti isi `mapProducts`:

```js
function mapProducts(products, siteUrl) {
  const list = Array.isArray(products) ? products : [];
  const seen = new Set();
  const internal_links = [];
  const out = list.map(p => {
    const name = String(p?.nama || '').trim();
    // URL yang diketik pemilik di form lebih otoritatif daripada yang ditambang
    // dari markdown konteks. Ekstraksi tetap jadi jaring pengaman untuk 35
    // produk yang URL-nya sudah benar tanpa pernah diketik ulang.
    const url = String(p?.url || '').trim() || extractProductUrl(p?.konteks, siteUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      internal_links.push({ url, anchor: name });
    }
    return {
      id: String(p?.id || '').trim(),
      name,
      url,
      price: String(p?.harga || '').trim(),
      target_market: String(p?.targetMarket || '').trim(),
      // Ringkasan berukuran tetap: nama berkas, dua angka, satu boolean.
      // Teks panjang (konteks, faq, troubleshooting, care) TIDAK pernah ke sini —
      // 45 produk x ~3 KB akan membuat GET /api/config membengkak 143 KB.
      image: String(p?.foto || '').trim(),
      gallery_count: Array.isArray(p?.gallery) ? p.gallery.length : 0,
      has_context: Boolean(String(p?.konteks || '').trim()),
      faq_count: hitungFaq(p?.faq)
    };
  });
  return { products: out, internal_links };
}
```

Tambahkan `hitungFaq` ke `module.exports`.

- [ ] **Step 4: Jalankan tes, pastikan LULUS**

```bash
node --test scripts/lib/business-asset.test.js
```

- [ ] **Step 5: Verifikasi dengan data perkap yang asli**

```bash
node -e "
const ba = require('./scripts/lib/business-asset');
const { products } = ba.readBusinessAsset('G:/Project/Paperclip/Perkap_com/project/sosmed_content/data/businesses', 'perkapcom');
const hasil = ba.mapProducts(products, 'https://perkap.com');
console.log('produk:', hasil.products.length);
console.log('punya url:', hasil.products.filter(p => p.url).length);
console.log('internal link unik:', hasil.internal_links.length);
console.log('punya image:', hasil.products.filter(p => p.image).length);
console.log('ukuran ringkas (KB):', Math.round(JSON.stringify(hasil.products).length / 1024));
"
```

Diharapkan: 45 produk, punya URL minimal 35 (lebih kalau Task 3 mengisi sebagian), punya image 41, ukuran ringkas di bawah 45 KB (Ruling R2: 36 KB dari totalnya sudah ada sebelum task ini, didominasi target_market; yang mengikat adalah tidak adanya field teks panjang, bukan angka KB).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/business-asset.js scripts/lib/business-asset.test.js
git commit -m "feat(kb): produk membaca field url dan meringkas gambar/konten"
```

---

### Task 5: Rute foto produk dengan kunci berlapis

**Files:**
- Modify: `scripts/routes/knowledge-source.js`
- Modify: `scripts/routes/knowledge-source.test.js`

**Interfaces:**
- Consumes: `resolveKnowledgeBase`, `sourceType`, `assertBusinessId` yang sudah ada
- Produces: `GET /api/business-asset-photo?file=<nama>` (200 dengan `image/*`, atau 400/404) dan `GET /api/business-asset-product?id=<produk>` (satu produk penuh)

**Konteks:** Rute ini menyajikan berkas dari disk ke browser, jadi ia permukaan serangan path traversal. `root` diambil dari config tenant, **tidak pernah** dari query — browser tidak boleh menentukan direktori mana yang dibaca.

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan ke `scripts/routes/knowledge-source.test.js`. Ikuti pola pembuatan server uji yang sudah ada di berkas itu (tenant sementara + config buatan). Buat folder business asset uji berisi `photos/sah.png`:

```js
test('foto: berkas sah dilayani dengan content-type gambar', async () => {
  // ... siapkan tenant business_asset yang menunjuk root uji ...
  const res = await get(srv, '/api/business-asset-photo?file=sah.png');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^image\/png/);
});

test('foto: path traversal ditolak dan tidak membocorkan isi berkas', async () => {
  const jahat = [
    '../../../../.env',
    '..%2f..%2fconfig.json',
    '....//....//rahasia.png',
    'sub/dir/foto.png',
    'sah.png\u0000.txt'
  ];
  for (const f of jahat) {
    const res = await get(srv, '/api/business-asset-photo?file=' + encodeURIComponent(f));
    assert.ok(res.status === 400 || res.status === 404, `harus ditolak: ${f} (dapat ${res.status})`);
    assert.ok(!/DB_PASSWORD|wordpress|app_password/i.test(res.body), `tidak boleh membocorkan isi: ${f}`);
  }
});

test('foto: ekstensi selain gambar ditolak', async () => {
  for (const f of ['config.json', 'catatan.txt', 'skrip.js', 'tanpaekstensi']) {
    const res = await get(srv, '/api/business-asset-photo?file=' + f);
    assert.ok(res.status === 400 || res.status === 404, `harus ditolak: ${f}`);
  }
});

test('foto: mode manual menolak, karena tidak punya sumber gambar', async () => {
  // tenant manual
  const res = await get(srvManual, '/api/business-asset-photo?file=sah.png');
  assert.equal(res.status, 400);
});

test('foto: berkas yang tidak ada memberi 404 tanpa menyebut path absolut', async () => {
  const res = await get(srv, '/api/business-asset-photo?file=tidakada.png');
  assert.equal(res.status, 404);
  assert.ok(!res.body.includes('C:\\') && !res.body.includes('G:/'), 'jangan bocorkan path disk');
});

test('detail produk: mengembalikan satu produk penuh, bukan katalog', async () => {
  const res = await get(srv, '/api/business-asset-product?id=produk-uji');
  assert.equal(res.status, 200);
  const p = JSON.parse(res.body);
  assert.equal(p.id, 'produk-uji');
  assert.ok('context' in p && 'faq' in p);
  assert.equal(Array.isArray(p), false, 'jangan kirim seluruh katalog');
});

test('detail produk: produk tidak dikenal memberi 404, bukan 500', async () => {
  const res = await get(srv, '/api/business-asset-product?id=tidak-ada-produk-ini');
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

```bash
node --test scripts/routes/knowledge-source.test.js
```

- [ ] **Step 3: Implementasikan**

Di `scripts/routes/knowledge-source.js`, tambahkan require:

```js
const { sourceType } = require('../lib/knowledge');
const { assertBusinessId, readBusinessAsset, findProduct, hitungFaq } = require('../lib/business-asset');
```

Tambahkan penolong dan dua rute:

```js
  // Hanya nama berkas polos. Tanpa pemisah path, tanpa titik ganda, tanpa NUL.
  const NAMA_BERKAS_RE = /^[A-Za-z0-9._-]+$/;
  const EKSTENSI_GAMBAR = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

  // Config tenant aktif, atau null kalau tenant bukan mode business_asset.
  function baTenantAktif(req) {
    const blogId = resolveBlog(req, paths);
    const file = paths.configPath(blogId);
    const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
    if (sourceType(cfg) !== 'business_asset') return null;
    return { cfg, ba: cfg.knowledge_source.business_asset || {} };
  }

  app.get('/api/business-asset-photo', (req, res) => {
    let ctx;
    try { ctx = baTenantAktif(req); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!ctx) return res.status(400).json({ error: 'Tenant aktif tidak memakai Business Asset.' });

    const nama = String(req.query.file || '');
    // Lapis 1: bentuk nama berkas. Menolak "/", "\", "..", NUL, dan spasi.
    if (!NAMA_BERKAS_RE.test(nama)) return res.status(400).json({ error: 'Nama berkas tidak valid.' });
    // Lapis 2: hanya ekstensi gambar. Config, .env, dan skrip tidak pernah tersaji.
    const ext = path.extname(nama).toLowerCase();
    if (!EKSTENSI_GAMBAR.has(ext)) return res.status(400).json({ error: 'Hanya berkas gambar.' });

    let dirFoto;
    try {
      // Lapis 3: root dari CONFIG, bukan dari query. Browser tidak pernah
      // menentukan direktori mana yang dibaca.
      dirFoto = path.resolve(String(ctx.ba.root || ''), assertBusinessId(ctx.ba.business_id), 'photos');
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const berkas = path.resolve(dirFoto, nama);
    // Lapis 4: jaring terakhir. Apa pun yang lolos tiga lapis di atas tetap
    // wajib berada di dalam folder photos.
    if (berkas !== dirFoto && !berkas.startsWith(dirFoto + path.sep)) {
      return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
    }
    if (!fs.existsSync(berkas) || !fs.statSync(berkas).isFile()) {
      // Pesan sengaja tidak menyebut path absolut: jangan bocorkan tata letak disk.
      return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
    }
    res.setHeader('Content-Type', MIME[ext]);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(berkas).pipe(res);
  });

  app.get('/api/business-asset-product', (req, res) => {
    let ctx;
    try { ctx = baTenantAktif(req); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!ctx) return res.status(400).json({ error: 'Tenant aktif tidak memakai Business Asset.' });

    const q = String(req.query.id || '').trim();
    if (!q) return res.status(400).json({ error: 'Parameter "id" wajib diisi.' });
    let found;
    try {
      const { products } = readBusinessAsset(ctx.ba.root, ctx.ba.business_id);
      found = findProduct(products, q);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (!found) return res.status(404).json({ error: `Produk "${q}" tidak ditemukan.` });

    // Satu produk, bukan katalog: membuka 45 kartu tidak pernah menarik 143 KB sekaligus.
    res.json({
      id: found.id || '',
      name: found.nama || '',
      url: found.url || '',
      price: found.harga || '',
      target_market: found.targetMarket || '',
      context: found.konteks || '',
      faq: found.faq || '',
      faq_count: hitungFaq(found.faq),
      troubleshooting: found.troubleshooting || '',
      care: found.care || '',
      image: found.foto || '',
      gallery: Array.isArray(found.gallery) ? found.gallery : []
    });
  });
```

- [ ] **Step 4: Jalankan tes, pastikan LULUS**

```bash
node --test scripts/routes/knowledge-source.test.js
```

- [ ] **Step 5: Buktikan tes benar-benar menggigit (mutation test)**

Hapus sementara lapis 4 (blok `if (berkas !== dirFoto && ...)`), jalankan tes. Tes traversal harus **MERAH**. Kembalikan, jalankan lagi, harus hijau. Kalau tetap hijau tanpa lapis 4, tesnya tidak menguji apa-apa — perbaiki tesnya.

Ulangi untuk lapis 2 (allowlist ekstensi): hapus, tes ekstensi harus merah.

- [ ] **Step 6: Commit**

```bash
git add scripts/routes/knowledge-source.js scripts/routes/knowledge-source.test.js
git commit -m "feat(kb): rute foto produk berkunci berlapis dan detail satu produk"
```

---

### Task 6: Kartu produk expandable di dashboard

**Files:**
- Modify: `public/js/app.js` (`renderProducts` ~baris 538, `addProductItem` ~baris 547)
- Modify: `public/index.html` (gaya kartu produk)

**Interfaces:**
- Consumes: produk ringkas dari Task 4 (`image`, `gallery_count`, `has_context`, `faq_count`), rute dari Task 5
- Produces: tidak ada modul baru; hanya tampilan

**Konteks:** `renderProducts` sekarang membuat baris `<input>` yang bisa disunting. Di mode business_asset, semua input itu sudah dibuat read-only oleh `applyKnowledgeReadonly`. Kita menggantinya dengan kartu — **hanya di mode business_asset**. Mode manual tidak berubah sama sekali: autoblog tidak punya penyimpanan gambar, jadi tidak ada yang bisa ditampilkan.

- [ ] **Step 1: Cabangkan render berdasarkan sumber**

**Jebakan urutan — sudah diverifikasi, jangan diabaikan.** Di `populateForm`, `renderProducts` dipanggil di baris ~83, sedangkan `populateKnowledgeSource` (yang memasang radio sumber) baru di baris ~87. Membaca `ksCurrentType()` di dalam `renderProducts` berarti membaca radio tenant SEBELUMNYA pada pemuatan pertama — kartu tidak muncul, atau muncul untuk tenant yang salah. Karena itu sumber **dioper sebagai argumen**, bukan dibaca dari DOM.

Di `public/js/app.js`, ubah `renderProducts`:

```js
// `source` dioper eksplisit: saat populateForm berjalan, radio sumber belum
// dipasang (populateKnowledgeSource dipanggil setelah ini), jadi membaca
// ksCurrentType() di sini akan memberi jawaban tenant sebelumnya.
function renderProducts(arr, source) {
  const container = document.getElementById('products-list');
  container.innerHTML = '';
  // Mode business_asset: kartu read-only dengan foto dan detail.
  // Mode manual TIDAK berubah — autoblog tidak punya penyimpanan gambar,
  // jadi tidak ada foto yang bisa ditampilkan untuk tenant manual.
  if (source === 'business_asset') {
    renderProductCards(arr, container);
    return;
  }
  const items = arr.length ? arr : [{ name: '', url: '' }];
  items.forEach(p => addProductItem(typeof p === 'string' ? { name: p, url: '' } : p));
}
```

Di `populateForm`, ubah pemanggilnya (baris ~83):

```js
  renderProducts(c.knowledge_base?.products || [],
    c.knowledge_source?.type === 'business_asset' ? 'business_asset' : 'manual');
```

Itu satu-satunya pemanggil (`grep -n "renderProducts(" public/js/app.js` memberi dua hasil: definisi dan pemanggil ini). Alur scrape memakai `addProductItem` langsung — jalur mode manual, tidak berubah.

**Saat radio diganti tanpa memuat ulang halaman**, daftar produk harus ikut berganti bentuk. Di `onKsTypeChange`, setelah `applyKnowledgeReadonly(...)`, panggil ulang render dengan produk dari config terakhir yang dimuat dan tipe yang baru dipilih.

- [ ] **Step 1b: Kunci `collectForm` dengan tes regresi**

`collectForm` memanen produk dari `.product-row`. Tampilan kartu tidak punya elemen itu, jadi di mode business_asset `collectForm` mengirim `products: []`. Itu **saat ini tidak berbahaya** karena `stripKnowledgeBase` di server membuang seluruh `knowledge_base` saat mode business_asset — pertahanan yang dipasang di fitur sebelumnya justru untuk kasus seperti ini.

Yang berbahaya adalah kalau pertahanan itu suatu saat dilonggarkan: cadangan manual tenant akan tertimpa daftar produk kosong. Karena itu tambahkan satu tes yang mengunci perilaku server, di `scripts/routes/config.test.js`:

```js
test('POST config mode business_asset: knowledge_base kosong dari browser TIDAK menimpa cadangan manual', async () => {
  // Tampilan kartu tidak punya .product-row, jadi collectForm mengirim
  // products: []. Server wajib membuangnya, bukan menuliskannya.
  // Tanpa ini, satu Save di mode business_asset menghapus cadangan manual.
  const sebelum = bacaConfig(id).knowledge_base;
  const res = await post(srv, '/api/config', {
    knowledge_source: { type: 'business_asset', business_asset: { root: ROOT_UJI, business_id: 'uji' } },
    knowledge_base: { business_name: '', products: [], prohibited_topics: [], custom_entries: [] }
  });
  assert.equal(res.status, 200);
  assert.deepEqual(bacaConfig(id).knowledge_base, sebelum, 'cadangan manual harus utuh');
});
```

Jalankan, pastikan hijau. Lalu buktikan tesnya menggigit: nonaktifkan sementara pembuangan `knowledge_base` di `stripKnowledgeBase`, tes harus **MERAH**. Kembalikan.

- [ ] **Step 2: Tulis `renderProductCards`**

```js
function renderProductCards(arr, container) {
  if (!arr.length) {
    container.innerHTML = '<div class="kb-kosong">Belum ada produk di business asset ini.</div>';
    return;
  }
  container.innerHTML = arr.map(p => `
    <div class="produk-kartu" data-produk="${escHtml(p.id)}">
      <div class="produk-kartu-baris" onclick="toggleProdukKartu('${escHtml(p.id)}')">
        <div class="produk-kartu-foto">${
          p.image
            ? `<img src="/api/business-asset-photo?file=${encodeURIComponent(p.image)}" alt="${escHtml(p.name)}" loading="lazy">`
            : `<span class="produk-kartu-inisial">${escHtml((p.name || '?').slice(0, 2).toUpperCase())}</span>`
        }</div>
        <div class="produk-kartu-isi">
          <div class="produk-kartu-nama"><span class="produk-kartu-panah">▶</span> ${escHtml(p.name)}</div>
          <div class="produk-kartu-meta">
            ${p.price ? `<span>${escHtml(p.price.slice(0, 60))}${p.price.length > 60 ? '…' : ''}</span>` : ''}
            ${p.url
              ? `<span class="produk-kartu-url">🔗 ${escHtml(p.url.replace(/^https?:\/\//, '').slice(0, 40))}</span>`
              : '<span class="produk-kartu-nourl">⚠ belum ada URL</span>'}
          </div>
        </div>
        <div class="produk-kartu-lencana">
          ${p.has_context ? '<span title="Punya konteks produk">📝</span>' : ''}
          ${p.faq_count ? `<span title="${p.faq_count} pertanyaan FAQ">❓${p.faq_count}</span>` : ''}
          ${p.gallery_count ? `<span title="${p.gallery_count} foto galeri">📷${p.gallery_count}</span>` : ''}
        </div>
      </div>
      <div class="produk-kartu-detail" id="produk-detail-${escHtml(p.id)}" hidden></div>
    </div>
  `).join('');
}
```

`escHtml` sudah ada di berkas ini — pakai itu, jangan menulis penolong baru. Setiap nilai yang masuk HTML **wajib** lewat `escHtml`; nama produk datang dari sistem lain dan bisa memuat karakter apa pun.

- [ ] **Step 3: Ambil detail saat kartu dibuka**

```js
const cacheDetailProduk = new Map();

async function toggleProdukKartu(id) {
  const panel = document.getElementById('produk-detail-' + id);
  if (!panel) return;
  const kartu = panel.closest('.produk-kartu');
  const panah = kartu?.querySelector('.produk-kartu-panah');
  if (!panel.hidden) {
    panel.hidden = true;
    if (panah) panah.textContent = '▶';
    return;
  }
  panel.hidden = false;
  if (panah) panah.textContent = '▼';
  if (cacheDetailProduk.has(id)) { panel.innerHTML = cacheDetailProduk.get(id); return; }

  panel.innerHTML = '<div class="produk-kartu-memuat">Memuat detail…</div>';
  try {
    // Diambil saat dibuka, bukan saat halaman dimuat: 45 produk x konteks penuh
    // itu 143 KB yang hampir seluruhnya tidak akan dibaca.
    const r = await fetch('/api/business-asset-product?id=' + encodeURIComponent(id));
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Gagal memuat detail produk');
    const html = renderDetailProduk(d);
    cacheDetailProduk.set(id, html);
    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = `<div class="produk-kartu-galat">${escHtml(e.message)}</div>`;
  }
}

function renderDetailProduk(d) {
  const bagian = (label, isi) => isi && isi.trim()
    ? `<details class="produk-detail-bagian"><summary>${escHtml(label)}</summary><pre>${escHtml(isi)}</pre></details>`
    : '';
  const galeri = (d.gallery || []).length
    ? `<div class="produk-detail-galeri">${d.gallery.map(g =>
        `<img src="/api/business-asset-photo?file=${encodeURIComponent(g.filename)}" alt="${escHtml(g.caption || '')}" title="${escHtml(g.caption || '')}" loading="lazy">`
      ).join('')}</div>`
    : '';
  return bagian('Konteks Produk', d.context)
    + bagian('FAQ', d.faq)
    + bagian('Troubleshooting', d.troubleshooting)
    + bagian('Perawatan', d.care)
    + bagian('Target Market', d.target_market)
    + galeri;
}
```

`<pre>` dengan `escHtml` dipilih daripada me-render markdown: isi konteks datang dari sistem lain, dan me-render HTML-nya membuka jalan injeksi. Ini panel baca-saja untuk memeriksa data, bukan pembaca artikel.

- [ ] **Step 4: Tambah gaya di `index.html`**

Tambahkan ke blok `<style>` yang sudah ada. Wajib: `.produk-kartu-foto` berukuran tetap (misal 56x56, `object-fit: cover`) supaya gambar rusak tidak merusak tata letak; `.produk-kartu-nourl` berwarna peringatan; `.produk-detail-bagian pre` `white-space: pre-wrap` dan tinggi maksimum dengan gulir sendiri.

- [ ] **Step 5: Verifikasi lewat Playwright**

**Reuse sesi browser yang sudah terbuka.** Server autoblog di port 3847.

1. Buka dashboard, tab Knowledge Base, tenant `perkapcom` (mode business_asset)
2. Hitung kartu: harus **45**
3. Hitung lencana "belum ada URL": harus sama dengan 45 dikurangi jumlah produk ber-URL (10 dikurangi yang terisi di Task 3)
4. Buka satu kartu produk ber-galeri (mis. Bel Cerdas Cermat) → konteks, FAQ, dan 4 gambar galeri tampil
5. Tutup, buka lagi → tidak ada permintaan jaringan kedua (cache bekerja)
6. Buka Network tab, muat ulang halaman → **tidak ada** permintaan `business-asset-product` sebelum ada kartu yang diklik
7. Ganti tenant ke mode manual → daftar produk kembali ke bentuk input baris, persis seperti sebelum perubahan
8. Tangkapan layar untuk bukti

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js public/index.html
git commit -m "feat(dashboard): kartu produk expandable dengan foto di mode business asset"
```

---

### Task 7: `blog-config.js product` ikut lengkap

**Files:**
- Modify: `scripts/blog-config.js` (blok `if (arg === 'product')`)

**Interfaces:**
- Consumes: `findProduct` dan `extractProductUrl` (keduanya sudah di-require berkas ini)
- Produces: keluaran `product` bertambah `troubleshooting`, `care`, `image`, `gallery`, dan `url` kini menghormati `p.url`

**Konteks:** Subperintah ini dipakai `article-writer.md` untuk mengambil spesifikasi satu produk. Sekarang ia mencetak 7 field dan selalu menambang URL dari konteks — mengabaikan `p.url` yang baru.

- [ ] **Step 1: Perbaiki sumber URL dan tambah field**

Ganti blok `console.log(JSON.stringify({...}))` di dalam `if (arg === 'product')`:

```js
  console.log(JSON.stringify({
    id: found.id || '',
    name: found.nama || '',
    price: found.harga || '',
    // Sama seperti mapProducts: url yang diketik pemilik menang atas hasil
    // tambang dari konteks. Tanpa ini, CLI dan dashboard bisa memberi URL
    // berbeda untuk produk yang sama.
    url: String(found.url || '').trim() || extractProductUrl(found.konteks, cfg.wordpress?.url || ''),
    target_market: found.targetMarket || '',
    context: found.konteks || '',
    faq: found.faq || '',
    troubleshooting: found.troubleshooting || '',
    care: found.care || '',
    image: found.foto || '',
    gallery: Array.isArray(found.gallery) ? found.gallery : []
  }, null, 2));
```

- [ ] **Step 2: Verifikasi**

```bash
node scripts/blog-config.js product "Bel Cerdas Cermat" | node -e "
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
  const p = JSON.parse(s);
  console.log('nama:', p.name);
  console.log('url:', p.url || '(kosong)');
  console.log('punya context:', p.context.length > 100);
  console.log('punya troubleshooting:', !!p.troubleshooting);
  console.log('image:', p.image || '(kosong)');
  console.log('galeri:', p.gallery.length);
});"
```

Diharapkan: nama benar, URL perkap.com, context panjang, image terisi, galeri 4.

Pastikan juga `GET /api/config` **tidak** ikut membengkak:

```bash
curl -s http://localhost:3847/api/config | node -e "
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
  const c = JSON.parse(s);
  const p = c.knowledge_base.products;
  console.log('produk:', p.length, '| ukuran KB:', Math.round(JSON.stringify(p).length/1024));
  console.log('ada context bocor:', p.some(x => 'context' in x || 'konteks' in x));
});"
```

Diharapkan: 45 produk, di bawah 60 KB, tidak ada context yang bocor.

- [ ] **Step 3: Jalankan seluruh tes**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add scripts/blog-config.js
git commit -m "feat(cli): detail produk menghormati field url dan memuat gambar"
```

---

# BAGIAN C — Reference image (Task 8–9)

---

### Task 8: Modul pencocokan artikel ke produk

**Files:**
- Create: `scripts/lib/product-match.js`
- Create: `scripts/lib/product-match.test.js`

**Interfaces:**
- Consumes: daftar produk ringkas (Task 4)
- Produces: `matchProduct(products, { title, keyword, productName }) → { product, reason } | null`

**Konteks:** Fungsi murni, tanpa I/O. Ia memutuskan produk mana (kalau ada) yang cocok untuk sebuah artikel. Ketiadaan kecocokan adalah hasil yang sah dan sering — artikel umum tidak bicara tentang satu produk.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `scripts/lib/product-match.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { matchProduct } = require('./product-match');

const PRODUK = [
  { id: 'bel-cerdas-cermat-custom', name: 'Bel Cerdas Cermat Custom' },
  { id: 'mixer-ashley-smr6', name: 'Mixer Audio Ashley SMR 6' },
  { id: 'mixer-yamaha-dx06', name: 'Mixer Audio Yamaha DX06' },
  { id: 'sewa-ht', name: 'Sewa HT' }
];

test('nama produk eksplisit cocok persis dengan id', () => {
  const r = matchProduct(PRODUK, { productName: 'bel-cerdas-cermat-custom' });
  assert.equal(r.product.id, 'bel-cerdas-cermat-custom');
  assert.equal(r.reason, 'nama-eksplisit');
});

test('nama produk eksplisit cocok persis dengan nama, beda huruf besar-kecil tidak masalah', () => {
  assert.equal(matchProduct(PRODUK, { productName: 'bel cerdas cermat custom' }).product.id, 'bel-cerdas-cermat-custom');
});

test('judul artikel memuat nama produk', () => {
  const r = matchProduct(PRODUK, { title: 'Tips Menyewa Bel Cerdas Cermat Custom untuk Lomba Sekolah' });
  assert.equal(r.product.id, 'bel-cerdas-cermat-custom');
  assert.equal(r.reason, 'judul');
});

test('kata kunci fokus memuat nama produk', () => {
  assert.equal(matchProduct(PRODUK, { keyword: 'sewa bel cerdas cermat custom malang' }).product.id, 'bel-cerdas-cermat-custom');
});

test('DUA produk berbagi kata umum: TIDAK MENEBAK, kembalikan null', () => {
  // "Mixer Audio Ashley SMR 6" dan "Mixer Audio Yamaha DX06" berbagi
  // "mixer" dan "audio". Menebak salah satunya berarti artikel Yamaha
  // memakai foto Ashley — salah yang tidak terlihat salah.
  assert.equal(matchProduct(PRODUK, { title: 'Panduan Memilih Mixer Audio untuk Acara' }), null);
});

test('satu produk menang telak lewat kata: diterima', () => {
  const r = matchProduct(PRODUK, { title: 'Review Mixer Audio Yamaha DX06 untuk Band' });
  assert.equal(r.product.id, 'mixer-yamaha-dx06');
});

test('satu kata umum saja tidak cukup', () => {
  assert.equal(matchProduct(PRODUK, { title: 'Cara Merawat Audio Rumahan' }), null);
});

test('artikel yang tidak menyebut produk mana pun memberi null', () => {
  assert.equal(matchProduct(PRODUK, { title: 'Tips Mengatur Anggaran Acara Kantor' }), null);
});

test('masukan kosong atau rusak tidak melempar', () => {
  assert.equal(matchProduct([], { title: 'apa saja' }), null);
  assert.equal(matchProduct(null, { title: 'apa saja' }), null);
  assert.equal(matchProduct(PRODUK, {}), null);
  assert.equal(matchProduct(PRODUK, null), null);
});

test('produk bernama sangat pendek tidak menyapu segalanya', () => {
  // "Sewa HT" — "ht" hanya 2 huruf, di bawah ambang kata bermakna.
  assert.equal(matchProduct(PRODUK, { title: 'Tips Sewa Peralatan Acara' }), null);
});

test('nama produk eksplisit yang tidak dikenal memberi null, bukan tebakan', () => {
  assert.equal(matchProduct(PRODUK, { productName: 'Produk Yang Tidak Ada' }), null);
});
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

```bash
node --test scripts/lib/product-match.test.js
```

- [ ] **Step 3: Implementasikan**

Buat `scripts/lib/product-match.js`:

```js
'use strict';
// Memilih produk yang relevan untuk sebuah artikel, supaya gambar artikel
// bisa memakai foto produk asli. Fungsi murni: tanpa I/O, tanpa jaringan.
//
// Tidak menemukan kecocokan adalah hasil yang SAH dan sering. Artikel umum
// tidak bicara tentang satu produk, dan memaksakan tebakan berarti artikel
// tentang Yamaha memakai foto Ashley — salah yang tidak terlihat salah
// sampai ada yang memperhatikan.

const KATA_UMUM = new Set([
  'sewa', 'rental', 'harga', 'jual', 'untuk', 'dengan', 'yang', 'dari', 'pada',
  'custom', 'set', 'paket', 'unit', 'buah', 'audio', 'sistem', 'alat'
]);

const PANJANG_KATA_MIN = 4;
const KATA_COCOK_MIN = 2;

function normal(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function kataBermakna(s) {
  return normal(s).split(/[^a-z0-9]+/)
    .filter(w => w.length >= PANJANG_KATA_MIN && !KATA_UMUM.has(w));
}

function matchProduct(products, opsi) {
  const list = Array.isArray(products) ? products : [];
  const o = opsi || {};
  if (!list.length) return null;

  const productName = normal(o.productName);
  const title = normal(o.title);
  const keyword = normal(o.keyword);

  // 1. Nama produk eksplisit. Ini jalur normal: alur artikel perkap sudah
  //    membawa nama produk, jadi tidak perlu menebak apa pun.
  if (productName) {
    const persis = list.find(p => normal(p.id) === productName || normal(p.name) === productName);
    if (persis) return { product: persis, reason: 'nama-eksplisit' };
    // Nama eksplisit yang tidak dikenal berarti pemanggil salah ketik atau
    // produknya memang tidak ada. Menebak dari judul di sini akan menyamarkan
    // kesalahan itu, jadi berhenti.
    return null;
  }

  // 2 & 3. Judul atau kata kunci memuat nama produk utuh.
  for (const sumber of [{ teks: title, reason: 'judul' }, { teks: keyword, reason: 'kata-kunci' }]) {
    if (!sumber.teks) continue;
    const cocok = list.filter(p => {
      const n = normal(p.name);
      return n && sumber.teks.includes(n);
    });
    // Kalau dua produk sama-sama termuat (mis. satu nama adalah awalan nama
    // lain), pilih yang namanya paling panjang — itu yang paling spesifik.
    if (cocok.length) {
      cocok.sort((a, b) => normal(b.name).length - normal(a.name).length);
      return { product: cocok[0], reason: sumber.reason };
    }
  }

  // 4. Kecocokan kata. Hanya berlaku bila TEPAT SATU produk mencapai skor
  //    tertinggi; seri berarti tidak ada kecocokan.
  const teks = new Set(kataBermakna(`${title} ${keyword}`));
  if (!teks.size) return null;

  let terbaik = [];
  let skorTerbaik = 0;
  for (const p of list) {
    const skor = kataBermakna(p.name).filter(w => teks.has(w)).length;
    if (skor < KATA_COCOK_MIN) continue;
    if (skor > skorTerbaik) { skorTerbaik = skor; terbaik = [p]; }
    else if (skor === skorTerbaik) terbaik.push(p);
  }
  if (terbaik.length !== 1) return null;
  return { product: terbaik[0], reason: `kata-cocok-${skorTerbaik}` };
}

module.exports = { matchProduct, kataBermakna };
```

- [ ] **Step 4: Jalankan tes, pastikan LULUS**

```bash
node --test scripts/lib/product-match.test.js
```

- [ ] **Step 5: Uji terhadap 45 produk asli**

```bash
node -e "
const ba = require('./scripts/lib/business-asset');
const { matchProduct } = require('./scripts/lib/product-match');
const { products } = ba.readBusinessAsset('G:/Project/Paperclip/Perkap_com/project/sosmed_content/data/businesses', 'perkapcom');
const ringkas = ba.mapProducts(products, 'https://perkap.com').products;
const uji = [
  'Tips Memilih Bel Cerdas Cermat untuk Lomba Sekolah',
  'Panduan Lengkap Mixer Audio untuk Pemula',
  'Review Mixer Audio Yamaha DX06',
  'Cara Menghemat Anggaran Acara Kantor',
  'Sewa Sound System Malang untuk Wedding'
];
for (const t of uji) {
  const r = matchProduct(ringkas, { title: t });
  console.log((r ? r.product.name + '  [' + r.reason + ']' : 'TIDAK ADA') + '   <-  ' + t);
}
"
```

Diharapkan: judul Bel Cerdas Cermat dapat produk benar; "Mixer Audio untuk Pemula" **TIDAK ADA** (seri); "Yamaha DX06" dapat produk benar; judul anggaran **TIDAK ADA**.

Kalau hasil nyata berbeda dari harapan, itu temuan: laporkan angkanya sebelum menyetel ambang. Jangan menyetel ambang sampai kecocokan yang salah lolos.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/product-match.js scripts/lib/product-match.test.js
git commit -m "feat(gambar): modul pencocokan artikel ke produk, menolak menebak saat seri"
```

---

### Task 9: `product-image` dan reference image di generator

**Files:**
- Modify: `scripts/blog-config.js` (subperintah baru `product-image`)
- Modify: `agents/image-generator.md`

**Interfaces:**
- Consumes: `matchProduct` (Task 8), `readBusinessAsset` dan `findProduct`
- Produces: `node scripts/blog-config.js product-image "<judul atau nama produk>"` mencetak satu baris JSON: `{ path, product, caption }` atau `{ path: null, reason }`

**Konteks:** `image-generator.md` sekarang selalu teks-ke-gambar. Seedream sudah mendukung image-to-image lewat `payload.image` berisi data URI base64 — pola itu sudah terbukti di `gen-image/scripts/seedream-client.js`.

- [ ] **Step 1: Tambah subperintah**

Di `scripts/blog-config.js`, tambahkan blok baru setelah blok `if (arg === 'product')`:

```js
// Cari foto referensi untuk artikel. SELALU keluar dengan kode 0 dan JSON
// yang bisa dibaca: gambar hilang tidak boleh menggagalkan penulisan artikel.
if (arg === 'product-image') {
  const q = process.argv[3] || '';
  const keluar = (obj) => { console.log(JSON.stringify(obj)); process.exit(0); };

  if (sourceType(cfg) !== 'business_asset') {
    keluar({ path: null, reason: 'Knowledge base tidak bersumber dari Business Asset.' });
  }
  const ba = cfg.knowledge_source.business_asset || {};
  let products;
  try {
    ({ products } = readBusinessAsset(ba.root, ba.business_id));
  } catch (e) {
    keluar({ path: null, reason: `Business asset tidak terbaca: ${e.message}` });
  }

  const ringkas = mapProducts(products, cfg.wordpress?.url || '').products;
  const cocok = matchProduct(ringkas, { productName: q, title: q });
  if (!cocok) keluar({ path: null, reason: `Tidak ada produk yang cocok dengan "${q}".` });

  const penuh = findProduct(products, cocok.product.id);
  if (!penuh) keluar({ path: null, reason: `Produk "${cocok.product.id}" hilang saat diambil detailnya.` });

  const dirFoto = path.join(ba.root, ba.business_id, 'photos');
  // Foto utama dulu; kalau kosong, item galeri pertama.
  const kandidat = [];
  if (penuh.foto) kandidat.push({ file: penuh.foto, caption: '' });
  for (const g of (Array.isArray(penuh.gallery) ? penuh.gallery : [])) {
    if (g?.filename) kandidat.push({ file: g.filename, caption: g.caption || '' });
  }
  if (!kandidat.length) keluar({ path: null, reason: `Produk "${penuh.nama}" belum punya foto.` });

  const MAKS_BYTE = 8 * 1024 * 1024;
  for (const k of kandidat) {
    const p = path.join(dirFoto, k.file);
    if (!fs.existsSync(p)) continue;   // tercatat tapi hilang: perlakukan sama dengan tidak ada
    // base64 membengkak 33%; permintaan raksasa gagal dengan galat yang tidak
    // jelas dari API, jadi lewati sebelum sampai ke sana.
    if (fs.statSync(p).size > MAKS_BYTE) continue;
    keluar({ path: p, product: penuh.nama, caption: k.caption, reason: cocok.reason });
  }
  keluar({ path: null, reason: `Foto produk "${penuh.nama}" tercatat tapi tidak ada di disk (atau terlalu besar).` });
}
```

Tambahkan `mapProducts` dan `matchProduct` ke require di bagian atas berkas, dan tambahkan `product-image` ke blok komentar pemakaian.

- [ ] **Step 2: Verifikasi semua cabang**

```bash
# Cocok, punya foto
node scripts/blog-config.js product-image "Bel Cerdas Cermat"

# Tidak ada produk yang cocok
node scripts/blog-config.js product-image "Tips Mengatur Anggaran Acara"

# Seri, harus menolak menebak
node scripts/blog-config.js product-image "Panduan Memilih Mixer Audio"
```

Diharapkan: pertama memberi `path` ke berkas yang ada; kedua dan ketiga memberi `path: null` dengan `reason` yang jelas. **Ketiganya keluar dengan kode 0** — periksa dengan `echo $?`.

- [ ] **Step 3: Perbarui `agents/image-generator.md`**

Tambahkan bagian baru tepat sebelum "Step 1: Craft the Image Prompt":

````markdown
---

## Step 0: Cari foto produk asli (kalau ada)

Sebelum menyusun prompt, cek apakah artikel ini tentang produk yang fotonya sudah ada:

```bash
# dijalankan dari root project
node .claude/skills/blog-autopilot/scripts/blog-config.js product-image "{ARTICLE_TITLE}"
```

Keluarannya satu baris JSON:

- `{"path": "...", "product": "...", "caption": "..."}` — ada foto asli
- `{"path": null, "reason": "..."}` — tidak ada; lanjutkan seperti biasa ke Step 1

**Kalau ada `path`**, prompt berubah nada. Jangan minta AI menggambar produknya dari
nol — mintalah ia menempatkan produk yang ADA DI FOTO ke dalam suasana pemakaian:

| Tanpa foto | Dengan foto |
|---|---|
| "Quiz buzzer system on a table, professional photography" | "Place the exact device from the reference image on a judge's table at a school quiz competition, students in background, warm hall lighting, professional photography, no text" |

Kalimat kuncinya: **"the exact device from the reference image"**. Tanpa itu, model
memperlakukan foto sebagai inspirasi gaya, bukan sebagai produk yang harus ditampilkan
apa adanya — dan hasilnya alat khayalan yang mirip-mirip.

Lalu kirim fotonya bersama permintaan (bagian `payload.image` di Step 2).
````

Di bagian Seedream pada Step 2, tambahkan setelah `const payload = JSON.stringify({...})`:

````markdown
**Kalau Step 0 memberi `path`**, sisipkan foto sebagai reference image. Ganti blok
`payload` dengan:

```js
const refPath = '{REFERENCE_PATH}';   // dari Step 0; kosongkan kalau path null
const badan = {
  model: 'seedream-4-5-251128',
  prompt: prompt,
  size: '2560x1440',
  watermark: false,
  response_format: 'b64_json'
};
if (refPath) {
  const ext = require('path').extname(refPath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  badan.image = 'data:image/' + mime + ';base64,' + fs.readFileSync(refPath).toString('base64');
}
const payload = JSON.stringify(badan);
```
````

- [ ] **Step 4: Uji satu gambar sungguhan**

Kalau `PERKAPCOM_IMAGE_API_KEY` ada di `.env`, hasilkan satu gambar dengan reference dan
satu tanpa, untuk judul yang sama. Bandingkan: yang memakai reference harus menampilkan
alat yang bentuknya sama dengan foto aslinya.

Kalau kunci API tidak ada, lewati dan catat di ledger bahwa langkah ini belum diverifikasi
end-to-end. **Jangan** menaruh kunci di argv atau di berkas mana pun.

- [ ] **Step 5: Commit**

```bash
git add scripts/blog-config.js agents/image-generator.md
git commit -m "feat(gambar): foto produk asli jadi reference image Seedream"
```

---

# BAGIAN D — Audit internal link (Task 10–12)

---

### Task 10: Port audit internal link

**Files:**
- Create: `scripts/audit-links.js`
- Create: `scripts/lib/link-extract.js`
- Create: `scripts/lib/link-extract.test.js`

**Interfaces:**
- Consumes: `makePaths`, config tenant
- Produces: `normalizeLink(raw, siteUrl) → string | null`, `extractLinks(html, siteUrl) → [{url, anchor}]`; berkas laporan di `data/blogs/{id}/audit/`

**Konteks:** Diport dari `G:\Project\Paperclip\Perkap_com\project\article\.claude\skills\post-article\scripts\audit-internal-links.js` (315 baris). Bagian yang murni (normalisasi dan ekstraksi tautan) dipisah ke modul supaya bisa dites tanpa jaringan; sisanya (crawl, resolve, laporan) tetap satu skrip.

**PENTING — empat perilaku yang wajib diport apa adanya.** Masing-masing lahir dari laporan palsu yang benar-benar terjadi. Menghapus salah satunya menghasilkan laporan yang terlihat benar dan salah.

- [ ] **Step 1: Tulis tes untuk bagian murni**

Buat `scripts/lib/link-extract.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeLink, extractLinks } = require('./link-extract');

const SITUS = 'https://perkap.com';

test('tautan ke situs lain diabaikan', () => {
  assert.equal(normalizeLink('https://google.com/x', SITUS), null);
  assert.equal(normalizeLink('https://tokopedia.com/perkap', SITUS), null);
});

test('www dan huruf besar dianggap situs yang sama', () => {
  assert.equal(normalizeLink('https://www.perkap.com/x/', SITUS), 'https://perkap.com/x/');
  assert.equal(normalizeLink('https://PERKAP.com/x/', SITUS), 'https://perkap.com/x/');
});

test('path relatif diselesaikan terhadap situs', () => {
  assert.equal(normalizeLink('/sewa-ht/', SITUS), 'https://perkap.com/sewa-ht/');
});

test('http dinaikkan ke https, fragment dibuang', () => {
  assert.equal(normalizeLink('http://perkap.com/x/#bagian', SITUS), 'https://perkap.com/x/');
});

test('skema non-web diabaikan', () => {
  for (const s of ['mailto:a@b.com', 'tel:+62812', 'javascript:void(0)', '#anchor']) {
    assert.equal(normalizeLink(s, SITUS), null, `harus diabaikan: ${s}`);
  }
});

test('artefak REST /wp-json/ diabaikan', () => {
  // Elementor membangun paginasi dari URL permintaan saat itu. Lewat REST,
  // paginasi muncul sebagai /wp-json/... yang tidak bisa dijangkau pengunjung
  // mana pun. Audit pertama melaporkan 55 "tautan mati" seperti ini.
  assert.equal(normalizeLink('https://perkap.com/wp-json/wp/v2/pages/page/2/', SITUS), null);
});

test('extractLinks mengambil url dan teks anchor, membersihkan tag di dalamnya', () => {
  const html = '<p><a href="/sewa-ht/">Sewa <strong>HT</strong></a> dan <a href="https://google.com">luar</a></p>';
  const hasil = extractLinks(html, SITUS);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].url, 'https://perkap.com/sewa-ht/');
  assert.equal(hasil[0].anchor, 'Sewa HT');
});

test('extractLinks tahan terhadap html kosong atau rusak', () => {
  assert.deepEqual(extractLinks('', SITUS), []);
  assert.deepEqual(extractLinks(null, SITUS), []);
  assert.deepEqual(extractLinks('<a href=>rusak</a>', SITUS), []);
});

test('situs kosong berarti tidak ada tautan internal yang bisa dikenali', () => {
  assert.equal(normalizeLink('https://perkap.com/x/', ''), null);
});
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

```bash
node --test scripts/lib/link-extract.test.js
```

- [ ] **Step 3: Implementasikan modul murni**

Buat `scripts/lib/link-extract.js` — port dari `normalize` dan `extractLinks` di skrip lama, dengan situs jadi parameter (bukan konstanta `perkap.com`).

```js
'use strict';
// Normalisasi dan ekstraksi tautan internal dari HTML artikel.
// Murni: tanpa jaringan, tanpa berkas — supaya bisa dites tanpa memanggil situs.

const HREF_RE = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

function hostBersih(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function normalizeLink(raw, siteUrl) {
  const host = hostBersih(siteUrl);
  if (!host) return null;
  let u;
  try { u = new URL(String(raw || ''), siteUrl); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.hostname.toLowerCase().replace(/^www\./, '') !== host) return null;

  // Artefak REST. Elementor membangun paginasi dengan paginate_links(), yang
  // memakai URL permintaan saat itu sebagai dasar — lewat REST, itu endpoint
  // REST-nya sendiri. Halaman aslinya menampilkan /slug/2/ yang benar. Audit
  // pertama melaporkan 55 "tautan mati" yang tidak bisa dijangkau siapa pun.
  if (u.pathname.startsWith('/wp-json/')) return null;

  u.protocol = 'https:';
  u.hostname = host;
  u.hash = '';
  return u.toString();
}

function extractLinks(html, siteUrl) {
  const out = [];
  const s = String(html == null ? '' : html);
  HREF_RE.lastIndex = 0;
  let m;
  while ((m = HREF_RE.exec(s)) !== null) {
    const url = normalizeLink(m[1], siteUrl);
    if (!url) continue;
    const anchor = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    out.push({ url, anchor });
  }
  return out;
}

module.exports = { normalizeLink, extractLinks };
```

- [ ] **Step 4: Jalankan tes, pastikan LULUS**

```bash
node --test scripts/lib/link-extract.test.js
```

- [ ] **Step 5: Tulis skrip audit**

Buat `scripts/audit-links.js`. Port `fetchAll`, `checkStatus`, `mapLimit`, dan penyusun laporan dari skrip lama. Perubahan yang dibutuhkan:

| Aspek | Lama | Baru |
|---|---|---|
| Situs | konstanta `'https://perkap.com'` | `cfg.wordpress.url` tenant aktif |
| Ekstraksi | fungsi lokal | `require('./lib/link-extract')` |
| Keluaran | path relatif ke folder skill | `paths.blogDir(id) + '/audit/link-YYYY-MM-DD.md'` dan `.json` |
| Argumen | `--limit`, `--out` | tambah `--blog <id>` |

**Empat perilaku yang WAJIB diport apa adanya:**

1. **Retry berlapis** dengan jeda `[0, 3000, 8000, 15000]` untuk 503 dan badan JSON terpotong. Origin membalas 200 dengan badan terpotong di 128 KB; tanpa ini crawl mati di tengah dan melaporkan hasil parsial sebagai hasil penuh.
2. **Abaikan `/wp-json/`** — sudah ada di `link-extract.js`.
3. **Sapuan ulang serial** berjeda 1,5 detik untuk setiap URL yang tampak mati. Sapuan paralel memancing throttle; audit pertama melaporkan tiga 503 yang ternyata 200 semua.
4. **Hanya 4xx berarti mati.** 5xx, 408, 429, dan galat jaringan masuk kolom "tak pasti", dilaporkan terpisah, tidak pernah dihitung sebagai tautan rusak:

```js
const isMati = (r) => r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
```

Kredensial: tidak ada. Audit hanya membaca REST publik (`?status=publish`). Jangan menambahkan header autentikasi.

- [ ] **Step 6: Uji dengan batas kecil**

```bash
node scripts/audit-links.js --limit 20
```

Diharapkan: laporan tertulis di `data/blogs/perkapcom/audit/`, kolom "tak pasti" terpisah dari "mati", dan skrip selesai tanpa melempar.

Pastikan tidak ada yang ditulis ke tempat lain:

```bash
git status --short
node -e "console.log(require('fs').statSync('G:/Project/Paperclip/Perkap_com/project/sosmed_content/data/businesses/perkapcom/products.json').mtime)"
```

Diharapkan: hanya berkas laporan yang baru (dan `data/blogs/` ada di `.gitignore`, jadi `git status` bersih); mtime `products.json` tidak berubah.

- [ ] **Step 7: Commit**

```bash
git add scripts/audit-links.js scripts/lib/link-extract.js scripts/lib/link-extract.test.js
git commit -m "feat(audit): port audit internal link, baca-saja, per tenant"
```

---

### Task 11: Audit gambar utama dan silang produk

**Files:**
- Modify: `scripts/audit-links.js` (tambah dua bagian laporan)
- Modify: `scripts/lib/link-extract.test.js` (tes untuk fungsi silang)
- Create: `scripts/lib/link-report.js`

**Interfaces:**
- Consumes: hasil crawl dari Task 10, `knowledge_base.products` (Task 4)
- Produces: `produkTanpaTautan(products, urlTertaut) → [{name, url, count}]`

**Konteks:** Nilai tambah yang tidak dimiliki skrip lama: sekarang ada peta produk ke URL yang sahih, jadi laporan bisa menjawab "halaman produk mana yang tidak pernah ditautkan dari 662 artikel".

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan ke `scripts/lib/link-extract.test.js`:

```js
const { produkTanpaTautan } = require('./link-report');

test('produk yang tidak pernah ditautkan terdaftar dengan hitungan nol', () => {
  const produk = [
    { name: 'A', url: 'https://s.test/a/' },
    { name: 'B', url: 'https://s.test/b/' },
    { name: 'C', url: '' }
  ];
  const tertaut = new Map([['https://s.test/a/', 5]]);
  const hasil = produkTanpaTautan(produk, tertaut);
  assert.equal(hasil.length, 2);
  assert.deepEqual(hasil.find(x => x.name === 'B'), { name: 'B', url: 'https://s.test/b/', count: 0 });
  assert.equal(hasil.find(x => x.name === 'C').url, '');
});

test('produk tanpa URL dan produk ber-URL-tak-tertaut dibedakan', () => {
  const hasil = produkTanpaTautan([{ name: 'C', url: '' }], new Map());
  assert.equal(hasil[0].count, null, 'tanpa URL: hitungan tidak berlaku, bukan nol');
});

test('perbandingan URL mengabaikan garis miring akhir dan www', () => {
  const produk = [{ name: 'A', url: 'https://www.s.test/a' }];
  const tertaut = new Map([['https://s.test/a/', 3]]);
  assert.equal(produkTanpaTautan(produk, tertaut).length, 0);
});
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

- [ ] **Step 3: Implementasikan `scripts/lib/link-report.js`**

```js
'use strict';
// Menyilangkan katalog produk dengan tautan yang benar-benar ada di artikel.
// Menjawab: halaman produk mana yang tidak pernah mendapat tautan internal?

function kunci(u) {
  try {
    const x = new URL(String(u || ''));
    return x.hostname.toLowerCase().replace(/^www\./, '') + x.pathname.replace(/\/+$/, '');
  } catch { return ''; }
}

function produkTanpaTautan(products, urlTertaut) {
  const peta = new Map();
  for (const [u, n] of (urlTertaut instanceof Map ? urlTertaut : new Map())) {
    const k = kunci(u);
    if (k) peta.set(k, (peta.get(k) || 0) + n);
  }
  const out = [];
  for (const p of (Array.isArray(products) ? products : [])) {
    const url = String(p?.url || '').trim();
    if (!url) {
      // Tanpa URL, "berapa kali ditautkan" tidak punya arti — bukan nol.
      out.push({ name: p?.name || '', url: '', count: null });
      continue;
    }
    const n = peta.get(kunci(url)) || 0;
    if (n === 0) out.push({ name: p?.name || '', url, count: 0 });
  }
  return out;
}

module.exports = { produkTanpaTautan };
```

- [ ] **Step 4: Sambungkan ke laporan**

Di `scripts/audit-links.js`, setelah bagian tautan mati, tambahkan bagian baru. Ambil `knowledge_base.products` lewat `resolveKnowledgeBase(cfg)` — bukan membaca config mentah, karena di mode business_asset isi mentahnya cadangan lama.

```
## URL produk yang tidak pernah ditautkan
| Produk | URL | Artikel menautkan |
|---|---|---|
| Stand Parled | (belum ada URL) | — |
| Mixer Yamaha DX06 | https://perkap.com/... | 0 |
```

- [ ] **Step 5: Port audit gambar utama**

Tambahkan ke skrip yang sama (bukan berkas terpisah — ia memakai daftar artikel yang sudah ditarik, jadi memisahnya berarti crawl dua kali). Port `audit-featured-media.js`: artikel dengan `featured_media === 0` masuk daftar. Tambahkan `featured_media` ke `_fields` di `fetchAll`.

Bagian laporan:

```
## Artikel tanpa gambar utama
| ID | Slug | Judul |
```

- [ ] **Step 6: Jalankan audit penuh**

```bash
node scripts/audit-links.js
```

Ini menjelajahi 662 artikel dan akan makan waktu beberapa menit. Catat angkanya untuk laporan akhir: berapa mati, berapa tak pasti, berapa redirect, berapa tanpa gambar, berapa produk tak tertaut.

- [ ] **Step 7: Commit**

```bash
git add scripts/audit-links.js scripts/lib/link-report.js scripts/lib/link-extract.test.js
git commit -m "feat(audit): silang produk tak tertaut dan artikel tanpa gambar utama"
```

---

### Task 12: Dokumentasi dan penutupan agenda

**Files:**
- Modify: `SKILL.md`
- Modify: `agents/article-writer.md`
- Modify: `agents/topic-researcher.md`
- Modify: `docs/AGENDA.md`

**Interfaces:**
- Consumes: seluruh task sebelumnya
- Produces: dokumentasi yang cocok dengan kode yang benar-benar ada

- [ ] **Step 1: `SKILL.md` — perintah audit**

Tambahkan ke daftar perintah:

```markdown
| `/blog-autopilot audit-links` | → **[AUDIT-LINKS]** periksa tautan internal semua artikel terbit |
```

Dan bagian `[AUDIT-LINKS]`: baca-saja, tidak menulis apa pun ke WordPress; makan waktu beberapa menit untuk ratusan artikel; laporan mendarat di `data/blogs/{id}/audit/`.

- [ ] **Step 2: `article-writer.md` — foto dan URL produk**

Di bagian pengambilan detail produk, tambahkan bahwa keluaran kini memuat `troubleshooting`, `care`, dan `image`. Tambahkan satu aturan: kalau `url` produk kosong, **jangan mengarang tautan** — tulis nama produknya tanpa tautan. Mengarang URL menghasilkan tautan mati, yang persis masalah yang diperbaiki audit.

- [ ] **Step 3: `topic-researcher.md` — lencana produk**

Sebutkan bahwa daftar produk kini memuat `has_context`, `faq_count`, `gallery_count`; produk dengan konteks dan FAQ adalah kandidat artikel yang lebih kaya.

- [ ] **Step 4: `docs/AGENDA.md` — tandai selesai**

Ganti bagian Fitur 6 dan 7 dengan catatan SELESAI beserta tanggal, menunjuk spec ini, dan **sebutkan yang sengaja tidak dikerjakan**: perbaikan tautan otomatis (`suggest-link-fixes.js`, `apply-link-fixes.js`) menunggu keputusan setelah laporan pertama terbaca; folder legacy `Content/Article/image/reference/` ditinggalkan; unggah gambar di mode manual butuh penyimpanan tersendiri.

Perbarui juga catatan lain kalau ada yang jadi usang.

- [ ] **Step 5: Jalankan seluruh tes sekali lagi**

```bash
npm test
```

Diharapkan: seluruh tes hijau. Baseline 172 ditambah tes baru dari Task 4, 5, 8, 10, 11.

- [ ] **Step 6: Commit**

```bash
git add SKILL.md agents/article-writer.md agents/topic-researcher.md docs/AGENDA.md
git commit -m "docs: fitur 6 & 7 selesai, agenda diperbarui"
```

---

## Catatan untuk pelaksana

**Urutan mengikat.** Task 1-3 harus selesai (termasuk pull di production) sebelum Task 4 diuji terhadap data asli — `mapProducts` membaca `p.url` yang baru ada setelah Task 1-3.

**Task 3 adalah satu-satunya yang menyentuh data hidup.** Cadangkan dulu, verifikasi setelahnya, dan jangan pernah memakai `Get-Process node | Stop-Process`.

**Kalau sebuah tes tetap hijau setelah kamu merusak kode yang seharusnya diujinya**, tes itu tidak menguji apa-apa. Perbaiki tesnya sebelum lanjut. Ini sudah terjadi tiga kali di fitur sebelumnya.

**Playwright: reuse sesi yang sudah terbuka.** Sesi baru selalu mulai dari kondisi logout dan memaksa login ulang.
