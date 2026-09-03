# Template Artikel + Variabel — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pemilik blog bisa menyimpan template (prompt artikel, prompt gambar, pola meta) berisi variabel `{var}` dan blok `{riset}`, lalu memilihnya per rencana artikel.

**Architecture:** Template disimpan per tenant di `data/blogs/{id}/templates.json`, terpisah dari `config.json` supaya payload `GET /api/config` tidak membengkak. Rendering dikerjakan CLI `blog-config.js template <plan_id>`: substitusi variabel murni (`lib/template-vars.js`), lalu blok `{riset}` diselesaikan lewat satu panggilan OpenAI (`lib/riset.js` + `lib/openai-text.js`). Agen penulis dan penggambar memakai hasilnya sebagai instruksi tambahan, bukan pengganti aturan bawaan.

**Tech Stack:** Node.js (stdlib `https`, `fs`, `path`), Express 4, `node --test`. Tanpa dependensi baru.

**Spec:** `docs/superpowers/specs/2026-09-03-template-artikel-design.md`

## Global Constraints

- Semua path dijalankan dari root skill: `G:/Project/Sikil Project/autoblog/.claude/skills/blog-autopilot`
- Ini folder **dev**. Jangan menyentuh instalasi lain. Skill `business-asset` di `Perkap_com/project/sosmed_content` hanya **dibaca** sebagai rujukan — jangan pernah menulis ke sana.
- `data/blogs/perkapcom/` memuat data hidup (663 artikel di cache, 2 rencana). Jangan menghapus atau menulis ulang isinya di luar yang diminta task.
- Uji: `npm test` (= `node --test scripts/lib/*.test.js scripts/routes/*.test.js`). Semua uji lama harus tetap hijau di setiap commit.
- Kredensial hanya di `.env`. Tidak pernah di argv, config, dokumen, pesan commit, atau file yang dilacak git.
- Nama variabel template berbahasa Indonesia (`{namaBisnis}`, bukan `{business_name}`).
- Variabel tak dikenal **dibiarkan utuh** di keluaran, tidak dikosongkan.
- Komentar kode berbahasa Indonesia, mengikuti gaya file sekitarnya.
- Jangan menjalankan `Get-Process node | Stop-Process` — itu mematikan server Paperclip di port 3100. Untuk restart, pakai PID dari `netstat -ano | grep :3847` lalu `taskkill //PID <pid> //F`.

---

## Struktur File

| File | Tanggung jawab |
|---|---|
| `scripts/lib/template-store.js` | Baca/tulis `templates.json`, validasi bentuk, buat `id`. Satu-satunya yang tahu bentuk file itu. |
| `scripts/lib/template-vars.js` | Murni. Bangun peta variabel dari KB+rencana+produk, ganti `{var}`. Tanpa I/O. |
| `scripts/lib/openai-text.js` | Satu panggilan HTTPS ke OpenAI. Satu-satunya yang tahu bentuk API-nya. |
| `scripts/lib/riset.js` | Urai blok `{riset}`, gabung jadi satu tugas, sisipkan hasil. Pemanggil OpenAI disuntik. |
| `scripts/routes/templates.js` | `GET/POST/DELETE /api/templates` |
| `scripts/blog-config.js` | Subperintah `template <plan_id>` yang merangkai semuanya |

Pemisahan `riset.js` dari `openai-text.js` disengaja: penguraian dan penyisipan bisa diuji penuh tanpa jaringan.

---

### Task 1: template-store.js — penyimpanan template

**Files:**
- Create: `scripts/lib/template-store.js`
- Create: `scripts/lib/template-store.test.js`
- Modify: `scripts/lib/paths.js` (tambah `templatesPath`)

**Interfaces:**
- Consumes: `makePaths(skillDir)` dari `lib/paths.js`
- Produces:
  - `readTemplates(file) -> { templates: [] }` — file tidak ada → `{ templates: [] }`, tidak melempar
  - `writeTemplates(file, data) -> void`
  - `saveTemplate(file, input) -> { template, created }` — `input.id` kosong → buat `tpl_<epoch>`
  - `deleteTemplate(file, id) -> boolean` — `false` bila id tidak ada
  - `findTemplate(file, id) -> object|null`
  - `FIELD_TEMPLATE = ['name','article_prompt','image_prompt','meta_title_pattern','meta_desc_pattern']`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `scripts/lib/template-store.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readTemplates, writeTemplates, saveTemplate, deleteTemplate, findTemplate } = require('./template-store');

function berkasSementara() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-store-'));
  return path.join(dir, 'templates.json');
}

test('file belum ada → daftar kosong, bukan lemparan', () => {
  assert.deepEqual(readTemplates(berkasSementara()), { templates: [] });
});

test('file rusak → daftar kosong, bukan lemparan', () => {
  const f = berkasSementara();
  fs.writeFileSync(f, '{ bukan json');
  assert.deepEqual(readTemplates(f), { templates: [] });
});

test('simpan template baru membuat id dan created_at', () => {
  const f = berkasSementara();
  const { template, created } = saveTemplate(f, { name: 'Transaksional' });
  assert.equal(created, true);
  assert.match(template.id, /^tpl_\d+$/);
  assert.equal(template.name, 'Transaksional');
  assert.ok(template.created_at);
  assert.equal(template.updated_at, template.created_at);
  assert.equal(readTemplates(f).templates.length, 1);
});

test('id dari klien diabaikan saat membuat template baru', () => {
  const f = berkasSementara();
  const { template } = saveTemplate(f, { id: '../../jahat', name: 'X' });
  assert.match(template.id, /^tpl_\d+$/);
});

test('menyimpan ulang dengan id yang ada = update, bukan duplikat', () => {
  const f = berkasSementara();
  const { template } = saveTemplate(f, { name: 'Awal', article_prompt: 'A' });
  const hasil = saveTemplate(f, { id: template.id, name: 'Ubah', article_prompt: 'B' });
  assert.equal(hasil.created, false);
  assert.equal(hasil.template.name, 'Ubah');
  assert.equal(hasil.template.created_at, template.created_at);
  assert.equal(readTemplates(f).templates.length, 1);
});

test('nama kosong ditolak', () => {
  assert.throws(() => saveTemplate(berkasSementara(), { name: '   ' }), /nama/i);
});

test('semua field prompt boleh kosong', () => {
  const { template } = saveTemplate(berkasSementara(), { name: 'Cuma gambar', image_prompt: 'gaya X' });
  assert.equal(template.article_prompt, '');
  assert.equal(template.meta_title_pattern, '');
  assert.equal(template.image_prompt, 'gaya X');
});

test('field asing dari klien tidak ikut tersimpan', () => {
  const { template } = saveTemplate(berkasSementara(), { name: 'X', jahat: 'nilai' });
  assert.equal(template.jahat, undefined);
});

test('hapus template yang ada mengembalikan true; yang tidak ada false', () => {
  const f = berkasSementara();
  const { template } = saveTemplate(f, { name: 'X' });
  assert.equal(deleteTemplate(f, template.id), true);
  assert.equal(deleteTemplate(f, template.id), false);
  assert.equal(readTemplates(f).templates.length, 0);
});

test('findTemplate mengembalikan null untuk id tak dikenal', () => {
  const f = berkasSementara();
  saveTemplate(f, { name: 'X' });
  assert.equal(findTemplate(f, 'tpl_tidak_ada'), null);
});

test('writeTemplates menormalkan bentuk yang bukan array', () => {
  const f = berkasSementara();
  writeTemplates(f, { templates: 'bukan array' });
  assert.deepEqual(readTemplates(f), { templates: [] });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Jalankan: `node --test scripts/lib/template-store.test.js`
Harapan: GAGAL dengan `Cannot find module './template-store'`

- [ ] **Step 3: Tulis implementasinya**

Buat `scripts/lib/template-store.js`:

```js
'use strict';
// Satu-satunya tempat yang tahu bentuk templates.json. Route dan CLI lewat sini
// supaya aturan "id dibuat server" dan "field asing dibuang" tidak tersebar.
const fs = require('fs');
const path = require('path');

// Field yang boleh datang dari klien. Apa pun di luar daftar ini dibuang —
// id, created_at, dan updated_at milik server, bukan milik pengirim.
const FIELD_TEMPLATE = ['name', 'article_prompt', 'image_prompt', 'meta_title_pattern', 'meta_desc_pattern'];

function readTemplates(file) {
  // File belum ada / rusak bukan galat: tenant baru memang belum punya template,
  // dan dashboard harus tetap terbuka saat file-nya kacau.
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return { templates: Array.isArray(data?.templates) ? data.templates : [] };
  } catch { return { templates: [] }; }
}

function writeTemplates(file, data) {
  const templates = Array.isArray(data?.templates) ? data.templates : [];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ templates }, null, 2));
}

function bersihkan(input) {
  const out = {};
  for (const k of FIELD_TEMPLATE) out[k] = String(input?.[k] ?? '').trim();
  return out;
}

function saveTemplate(file, input) {
  const bersih = bersihkan(input);
  if (!bersih.name) throw new Error('Nama template wajib diisi.');

  const data = readTemplates(file);
  const id = String(input?.id || '').trim();
  const idx = id ? data.templates.findIndex(t => t.id === id) : -1;
  const now = new Date().toISOString();

  let template, created;
  if (idx === -1) {
    // id dari klien SELALU diabaikan untuk template baru: itu jalur yang bisa
    // dipakai menyuntik id sembarang (mis. "../../x") ke dalam file.
    template = { id: `tpl_${Date.now()}`, ...bersih, created_at: now, updated_at: now };
    data.templates.unshift(template);
    created = true;
  } else {
    template = { ...data.templates[idx], ...bersih, updated_at: now };
    data.templates[idx] = template;
    created = false;
  }
  writeTemplates(file, data);
  return { template, created };
}

function deleteTemplate(file, id) {
  const data = readTemplates(file);
  const sebelum = data.templates.length;
  data.templates = data.templates.filter(t => t.id !== id);
  if (data.templates.length === sebelum) return false;
  writeTemplates(file, data);
  return true;
}

function findTemplate(file, id) {
  if (!id) return null;
  return readTemplates(file).templates.find(t => t.id === id) || null;
}

module.exports = { readTemplates, writeTemplates, saveTemplate, deleteTemplate, findTemplate, FIELD_TEMPLATE };
```

- [ ] **Step 4: Tambah `templatesPath` ke paths.js**

Di `scripts/lib/paths.js`, di dalam objek yang dikembalikan `makePaths`, tepat setelah baris `plansPath`, sisipkan:

```js
    templatesPath: (id) => path.join(blogDir(id), 'templates.json'),
```

- [ ] **Step 5: Jalankan uji, pastikan lolos**

Jalankan: `node --test scripts/lib/template-store.test.js`
Harapan: LOLOS, 11 uji

- [ ] **Step 6: Jalankan seluruh uji**

Jalankan: `npm test`
Harapan: semua lolos, tidak ada regresi

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/template-store.js scripts/lib/template-store.test.js scripts/lib/paths.js
git commit -m "feat(template): penyimpanan templates.json per tenant"
```

---

### Task 2: template-vars.js — peta variabel & substitusi

**Files:**
- Create: `scripts/lib/template-vars.js`
- Create: `scripts/lib/template-vars.test.js`

**Interfaces:**
- Consumes: bentuk `knowledge_base` dari `lib/knowledge.js` (`EMPTY_KB`), record rencana dari `article-plans.json`, record produk mentah dari business asset
- Produces:
  - `buildVars(kb, plan, produk) -> object` — peta nama variabel → string
  - `resolveVars(text, vars) -> string` — `{var}` dikenal diganti; **tak dikenal dibiarkan utuh**

**Catatan penting untuk implementer:** `lsi_keywords` tersimpan sebagai **string** di `data/blogs/perkapcom/article-plans.json`, tapi `public/js/app.js:1682` menyimpannya sebagai **array**. Kedua bentuk harus diterima. Ini bukan bug yang diperbaiki task ini — hanya ditangani.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `scripts/lib/template-vars.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildVars, resolveVars } = require('./template-vars');

const KB = {
  business_name: 'Perkap.com', business_description: 'Sewa alat acara',
  tagline: 'Sewa Alat Panitia', business_type: '', target_audience: 'Panitia acara',
  tone: 'casual', usp: '', city: 'Malang', address: 'Jl. Kembang kertas no 24',
  whatsapp: '0895412262949', email: '', website: 'perkap.com', hours: '24 Jam',
  cta: ['Hubungi kami'], signature_words: ['gaskeun'], avoid_words: ['murahan'],
  dos: ['sebut harga'], donts: ['janji berlebihan'], prohibited_topics: ['politik']
};

const RENCANA = {
  keyword: 'sewa ht malang', title: 'Sewa HT Malang 2026',
  lsi_keywords: 'rental ht, sewa radio', city: 'Surabaya',
  category_name: 'Sewa HT', content_type: 'transactional', target_words: 800,
  slug: 'sewa-ht-malang', notes: 'catatan internal',
  anchor_url: 'https://perkap.com/sewa-ht/', anchor_text: 'sewa HT'
};

const PRODUK = {
  nama: 'Sewa HT', harga: '25K/hari', url: 'https://perkap.com/sewa-ht/',
  konteks: 'HT analog untuk panitia', faq: 'Q: berapa hari minimal?',
  targetMarket: 'panitia event'
};

test('variabel knowledge base terisi', () => {
  const v = buildVars(KB, RENCANA, null);
  assert.equal(v.namaBisnis, 'Perkap.com');
  assert.equal(v.tagline, 'Sewa Alat Panitia');
  assert.equal(v.nada, 'casual');
  assert.equal(v.jamOperasional, '24 Jam');
});

test('array knowledge base digabung jadi teks', () => {
  const v = buildVars(KB, RENCANA, null);
  assert.equal(v.cta, 'Hubungi kami');
  assert.equal(v.kataKhas, 'gaskeun');
  assert.equal(v.kataHindari, 'murahan');
  assert.equal(v.topikTerlarang, 'politik');
});

test('kota bisnis dan kota target artikel adalah dua variabel berbeda', () => {
  const v = buildVars(KB, RENCANA, null);
  assert.equal(v.kota, 'Malang');
  assert.equal(v.kotaTarget, 'Surabaya');
});

test('rencana tanpa kota → kotaTarget kosong, bukan undefined', () => {
  const v = buildVars(KB, { ...RENCANA, city: undefined }, null);
  assert.equal(v.kotaTarget, '');
});

test('lsi_keywords berbentuk string diterima apa adanya', () => {
  assert.equal(buildVars(KB, RENCANA, null).lsi, 'rental ht, sewa radio');
});

test('lsi_keywords berbentuk array digabung koma', () => {
  const v = buildVars(KB, { ...RENCANA, lsi_keywords: ['a', 'b'] }, null);
  assert.equal(v.lsi, 'a, b');
});

test('variabel produk terisi saat produk ada', () => {
  const v = buildVars(KB, RENCANA, PRODUK);
  assert.equal(v.produkNama, 'Sewa HT');
  assert.equal(v.produkHarga, '25K/hari');
  assert.equal(v.produkUrl, 'https://perkap.com/sewa-ht/');
  assert.equal(v.produkFaq, 'Q: berapa hari minimal?');
  assert.equal(v.produkTargetMarket, 'panitia event');
});

test('tanpa produk, keenam variabel produk jadi string kosong, bukan undefined', () => {
  const v = buildVars(KB, RENCANA, null);
  for (const k of ['produkNama', 'produkHarga', 'produkUrl', 'produkKonteks', 'produkFaq', 'produkTargetMarket']) {
    assert.equal(v[k], '', `${k} harus string kosong`);
  }
});

test('jumlahKata jadi string, bukan angka', () => {
  assert.equal(buildVars(KB, RENCANA, null).jumlahKata, '800');
});

test('resolveVars mengganti variabel yang dikenal', () => {
  assert.equal(resolveVars('Halo {namaBisnis} di {kota}', { namaBisnis: 'Perkap.com', kota: 'Malang' }),
    'Halo Perkap.com di Malang');
});

test('variabel TAK DIKENAL dibiarkan utuh, tidak dikosongkan', () => {
  assert.equal(resolveVars('{namaBisnis} {namaBisnsi}', { namaBisnis: 'Perkap.com' }),
    'Perkap.com {namaBisnsi}');
});

test('variabel dikenal bernilai kosong tetap diganti jadi kosong', () => {
  assert.equal(resolveVars('[{usp}]', { usp: '' }), '[]');
});

test('teks tanpa variabel dikembalikan apa adanya', () => {
  assert.equal(resolveVars('tanpa variabel', {}), 'tanpa variabel');
});

test('masukan kosong atau rusak tidak melempar', () => {
  assert.doesNotThrow(() => buildVars(null, null, null));
  assert.doesNotThrow(() => resolveVars(null, null));
  assert.equal(resolveVars(null, null), '');
});

test('blok riset tidak ikut tersentuh resolveVars', () => {
  const teks = '{riset}cari 5 fakta tentang {produkNama}{/riset}';
  assert.equal(resolveVars(teks, { produkNama: 'Sewa HT' }),
    '{riset}cari 5 fakta tentang Sewa HT{/riset}');
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Jalankan: `node --test scripts/lib/template-vars.test.js`
Harapan: GAGAL dengan `Cannot find module './template-vars'`

- [ ] **Step 3: Tulis implementasinya**

Buat `scripts/lib/template-vars.js`:

```js
'use strict';
// Murni: tanpa I/O, tanpa jaringan. Semua yang dibutuhkan datang lewat argumen,
// supaya aturan substitusi bisa diuji tanpa tenant, tanpa file, tanpa API.

const teks = (v) => String(v == null ? '' : v);

// Array knowledge base → satu teks. Newline untuk yang berupa kalimat utuh
// (cta, dos, donts), koma untuk yang berupa daftar kata.
const gabungBaris = (a) => (Array.isArray(a) ? a : []).map(teks).filter(Boolean).join('\n');
const gabungKoma = (a) => (Array.isArray(a) ? a : []).map(teks).filter(Boolean).join(', ');

// lsi_keywords tersimpan sebagai string di article-plans.json, tapi app.js
// menyimpannya sebagai array. Dua-duanya diterima — memaksa satu bentuk di sini
// berarti rencana lama kehilangan LSI-nya tanpa jejak.
function lsiTeks(v) {
  if (Array.isArray(v)) return gabungKoma(v);
  return teks(v);
}

function buildVars(kb, plan, produk) {
  const k = kb || {};
  const p = plan || {};
  const d = produk || {};
  return {
    // ── Knowledge base: identitas & profil bisnis
    namaBisnis:      teks(k.business_name),
    deskripsiBisnis: teks(k.business_description),
    tagline:         teks(k.tagline),
    jenisUsaha:      teks(k.business_type),
    targetAudiens:   teks(k.target_audience),
    nada:            teks(k.tone),
    usp:             teks(k.usp),
    // ── Knowledge base: kontak & lokasi bisnis
    kota:            teks(k.city),
    alamat:          teks(k.address),
    whatsapp:        teks(k.whatsapp),
    email:           teks(k.email),
    website:         teks(k.website),
    jamOperasional:  teks(k.hours),
    // ── Knowledge base: gaya menulis
    cta:             gabungBaris(k.cta),
    kataKhas:        gabungKoma(k.signature_words),
    kataHindari:     gabungKoma(k.avoid_words),
    dos:             gabungBaris(k.dos),
    donts:           gabungBaris(k.donts),
    topikTerlarang:  gabungKoma(k.prohibited_topics),
    // ── Rencana artikel ini
    keyword:      teks(p.keyword),
    judul:        teks(p.title),
    lsi:          lsiTeks(p.lsi_keywords),
    // kotaTarget SENGAJA terpisah dari kota: bisnis berkantor di Malang tapi
    // menulis artikel untuk Surabaya. Menggabungkannya menghasilkan artikel
    // Surabaya yang menyebut alamat Malang sebagai lokasi layanan.
    kotaTarget:   teks(p.city),
    kategori:     teks(p.category_name),
    tipeKonten:   teks(p.content_type),
    jumlahKata:   teks(p.target_words),
    slug:         teks(p.slug),
    catatan:      teks(p.notes),
    anchorUrl:    teks(p.anchor_url),
    anchorText:   teks(p.anchor_text),
    // ── Produk (kosong bila rencana tidak menyebut produk)
    produkNama:         teks(d.nama),
    produkHarga:        teks(d.harga),
    produkUrl:          teks(d.url),
    produkKonteks:      teks(d.konteks),
    produkFaq:          teks(d.faq),
    produkTargetMarket: teks(d.targetMarket)
  };
}

// Variabel TAK DIKENAL dibiarkan utuh — meniru resolveVars di business-asset
// (lib/io.js:247). Salah ketik {namaBisnsi} muncul apa adanya di prompt akhir
// sehingga terlihat pemilik template; dikosongkan berarti hilang diam-diam.
function resolveVars(text, vars) {
  const v = vars || {};
  return teks(text).replace(/\{(\w+)\}/g, (cocok, key) =>
    Object.prototype.hasOwnProperty.call(v, key) ? teks(v[key]) : cocok
  );
}

module.exports = { buildVars, resolveVars };
```

Catatan: `{riset}` dan `{/riset}` tidak tergigit regex `\{(\w+)\}` — `{/riset}` memuat garis miring yang bukan `\w`, dan `{riset}` bukan nama variabel di peta sehingga dibiarkan utuh oleh aturan "tak dikenal".

- [ ] **Step 4: Jalankan uji, pastikan lolos**

Jalankan: `node --test scripts/lib/template-vars.test.js`
Harapan: LOLOS, 15 uji

- [ ] **Step 5: Jalankan seluruh uji**

Jalankan: `npm test`
Harapan: semua lolos

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/template-vars.js scripts/lib/template-vars.test.js
git commit -m "feat(template): peta variabel dan substitusi {var}"
```

---

### Task 3: openai-text.js — satu panggilan teks ke OpenAI

**Files:**
- Create: `scripts/lib/openai-text.js`
- Create: `scripts/lib/openai-text.test.js`
- Modify: `scripts/lib/env.js` (tambah `textKey` di `envKeys`)
- Modify: `scripts/lib/env.test.js` (uji `textKey`)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `envKeys(blogId)` dari `lib/env.js`
- Produces:
  - `envKeys(blogId).textKey` → `'{ID}_TEXT_API_KEY'`
  - `async askOpenAI(apiKey, prompt, opts) -> string` — `opts.timeout` default 60000, `opts.model` default `'gpt-4o-mini'`
  - Melempar `Error` bila `apiKey` kosong, HTTP bukan 2xx, balasan tidak terurai, atau timeout

- [ ] **Step 1: Tulis uji yang gagal**

Buat `scripts/lib/openai-text.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { askOpenAI } = require('./openai-text');
const { envKeys } = require('./env');

test('envKeys menyediakan nama kunci teks per tenant', () => {
  assert.equal(envKeys('perkapcom').textKey, 'PERKAPCOM_TEXT_API_KEY');
  assert.equal(envKeys('blog-baru').textKey, 'BLOG_BARU_TEXT_API_KEY');
});

test('kunci API kosong ditolak sebelum menyentuh jaringan', async () => {
  await assert.rejects(() => askOpenAI('', 'halo'), /kunci|key/i);
  await assert.rejects(() => askOpenAI(null, 'halo'), /kunci|key/i);
});

test('prompt kosong ditolak', async () => {
  await assert.rejects(() => askOpenAI('sk-palsu', '   '), /prompt/i);
});
```

Uji jalur sukses HTTP tidak ditulis di sini: modul ini sengaja hanya membungkus
satu panggilan `https.request`, dan jalur sukses/gagalnya diuji lewat suntikan
ganda di Task 4 (`riset.js`) tanpa menyentuh jaringan.

Tambahkan ke `scripts/lib/env.test.js` (di akhir file):

```js
test('envKeys memuat kunci teks', () => {
  assert.equal(envKeys('perkapcom').textKey, 'PERKAPCOM_TEXT_API_KEY');
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Jalankan: `node --test scripts/lib/openai-text.test.js`
Harapan: GAGAL dengan `Cannot find module './openai-text'`

- [ ] **Step 3: Tambah `textKey` di env.js**

Di `scripts/lib/env.js`, fungsi `envKeys` (baris 43), ubah objek yang dikembalikan menjadi:

```js
  return {
    wpPassword: `${prefix}_WP_APP_PASSWORD`,
    imageKey: `${prefix}_IMAGE_API_KEY`,
    // Kunci teks hanya wajib bila template memakai blok {riset}. Tenant tanpa
    // template, atau template tanpa riset, tidak pernah membutuhkannya —
    // karena itu ia TIDAK divalidasi di resolveCredentials.
    textKey: `${prefix}_TEXT_API_KEY`
  };
```

Jangan menambahkan validasi `textKey` ke `resolveCredentials`: itu akan membuat
semua tenant gagal memuat config hanya karena kunci yang belum tentu dipakai.

- [ ] **Step 4: Tulis implementasinya**

Buat `scripts/lib/openai-text.js`:

```js
'use strict';
// Satu-satunya tempat yang tahu bentuk API OpenAI. Modul lain memanggil
// askOpenAI dan tidak pernah menyusun payload-nya sendiri.
const https = require('https');

const MODEL_BAWAAN = 'gpt-4o-mini';
// 60 detik, bukan 15 seperti wp-client: riset menghasilkan beberapa paragraf,
// dan batas pendek memotong balasan yang sah.
const TIMEOUT_BAWAAN = 60000;

function askOpenAI(apiKey, prompt, opts = {}) {
  const kunci = String(apiKey || '').trim();
  const isi = String(prompt || '').trim();
  const model = opts.model || MODEL_BAWAAN;
  const timeout = opts.timeout || TIMEOUT_BAWAAN;

  // Ditolak sebelum menyentuh jaringan: pesannya harus menyebut apa yang kurang,
  // bukan "401 Unauthorized" yang tidak memberi tahu apa pun ke pemilik blog.
  if (!kunci) return Promise.reject(new Error('Kunci API teks kosong. Isi {ID}_TEXT_API_KEY di .env.'));
  if (!isi) return Promise.reject(new Error('Prompt riset kosong.'));

  const payload = JSON.stringify({
    model,
    messages: [{ role: 'user', content: isi }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kunci}`,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          // Potong badan balasan: pesan galat OpenAI bisa panjang, dan isinya
          // masuk ke terminal pemilik blog.
          return reject(new Error(`OpenAI menolak (HTTP ${res.statusCode}): ${data.slice(0, 300)}`));
        }
        let json;
        try { json = JSON.parse(data); }
        catch { return reject(new Error(`Balasan OpenAI bukan JSON: ${data.slice(0, 200)}`)); }
        const isiBalasan = json?.choices?.[0]?.message?.content;
        if (!isiBalasan) return reject(new Error(`Balasan OpenAI tanpa isi: ${data.slice(0, 200)}`));
        resolve(isiBalasan);
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`OpenAI tidak menjawab dalam ${timeout} ms.`)); });
    req.on('error', (e) => reject(new Error(`Panggilan OpenAI gagal: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}

module.exports = { askOpenAI, MODEL_BAWAAN, TIMEOUT_BAWAAN };
```

- [ ] **Step 5: Perbarui .env.example**

Tambahkan satu baris di akhir `.env.example`:

```
# Hanya dibutuhkan bila template memakai blok {riset}. Kosongkan bila tidak dipakai.
PERKAPCOM_TEXT_API_KEY=
```

- [ ] **Step 6: Jalankan uji, pastikan lolos**

Jalankan: `node --test scripts/lib/openai-text.test.js scripts/lib/env.test.js`
Harapan: LOLOS

- [ ] **Step 7: Jalankan seluruh uji**

Jalankan: `npm test`
Harapan: semua lolos

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/openai-text.js scripts/lib/openai-text.test.js scripts/lib/env.js scripts/lib/env.test.js .env.example
git commit -m "feat(template): pemanggil teks OpenAI dan kunci TEXT_API_KEY"
```

---

### Task 4: riset.js — urai, gabung, sisipkan blok {riset}

**Files:**
- Create: `scripts/lib/riset.js`
- Create: `scripts/lib/riset.test.js`

**Interfaces:**
- Consumes: `askOpenAI` disuntik lewat argumen (bukan `require` langsung), supaya bisa diganti ganda di uji
- Produces:
  - `punyaRiset(text) -> boolean`
  - `async resolveRiset(text, { ask, konteks }) -> string` — `ask(prompt)` mengembalikan `Promise<string>`
  - Melempar bila balasan tidak memuat tag `[HASIL n]` yang diminta

- [ ] **Step 1: Tulis uji yang gagal**

Buat `scripts/lib/riset.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { punyaRiset, resolveRiset } = require('./riset');

// Ganti ganda: mencatat berapa kali dipanggil dan dengan prompt apa.
function askPalsu(balasan) {
  const panggilan = [];
  const ask = async (prompt) => { panggilan.push(prompt); return balasan; };
  ask.panggilan = panggilan;
  return ask;
}

test('punyaRiset mendeteksi blok', () => {
  assert.equal(punyaRiset('{riset}cari fakta{/riset}'), true);
  assert.equal(punyaRiset('tanpa blok apa pun'), false);
  assert.equal(punyaRiset(''), false);
  assert.equal(punyaRiset(null), false);
});

test('teks tanpa blok riset dikembalikan tanpa memanggil AI', async () => {
  const ask = askPalsu('[HASIL 1]x[/HASIL 1]');
  const hasil = await resolveRiset('teks biasa', { ask });
  assert.equal(hasil, 'teks biasa');
  assert.equal(ask.panggilan.length, 0);
});

test('satu blok diganti hasilnya', async () => {
  const ask = askPalsu('[HASIL 1]\nFakta A\n[/HASIL 1]');
  const hasil = await resolveRiset('Awal {riset}cari fakta{/riset} akhir', { ask });
  assert.equal(hasil, 'Awal Fakta A akhir');
});

test('beberapa blok diselesaikan dalam SATU panggilan, bukan satu per blok', async () => {
  const ask = askPalsu('[HASIL 1]Satu[/HASIL 1]\n[HASIL 2]Dua[/HASIL 2]');
  const hasil = await resolveRiset('{riset}tugas a{/riset} dan {riset}tugas b{/riset}', { ask });
  assert.equal(ask.panggilan.length, 1, 'harus satu panggilan untuk dua blok');
  assert.equal(hasil, 'Satu dan Dua');
});

test('prompt yang dikirim memuat semua tugas dan format keluaran yang diminta', async () => {
  const ask = askPalsu('[HASIL 1]a[/HASIL 1]\n[HASIL 2]b[/HASIL 2]');
  await resolveRiset('{riset}tugas satu{/riset}{riset}tugas dua{/riset}', { ask });
  const p = ask.panggilan[0];
  assert.match(p, /tugas satu/);
  assert.match(p, /tugas dua/);
  assert.match(p, /\[HASIL 1\]/);
  assert.match(p, /\[HASIL 2\]/);
});

test('konteks bisnis ikut dikirim bila diberikan', async () => {
  const ask = askPalsu('[HASIL 1]a[/HASIL 1]');
  await resolveRiset('{riset}t{/riset}', { ask, konteks: 'PROFIL: Perkap.com' });
  assert.match(ask.panggilan[0], /PROFIL: Perkap\.com/);
});

test('balasan tanpa tag HASIL melempar, bukan menghasilkan prompt terpotong diam-diam', async () => {
  const ask = askPalsu('maaf saya tidak bisa membantu');
  await assert.rejects(() => resolveRiset('{riset}t{/riset}', { ask }), /HASIL/);
});

test('balasan kurang satu tag melempar', async () => {
  const ask = askPalsu('[HASIL 1]ada[/HASIL 1]');
  await assert.rejects(() => resolveRiset('{riset}a{/riset}{riset}b{/riset}', { ask }), /HASIL 2/);
});

test('galat dari ask diteruskan apa adanya, tidak ditelan', async () => {
  const ask = async () => { throw new Error('Kunci API teks kosong.'); };
  await assert.rejects(() => resolveRiset('{riset}t{/riset}', { ask }), /Kunci API teks kosong/);
});

test('blok riset kosong dilewati tanpa memanggil AI', async () => {
  const ask = askPalsu('[HASIL 1]x[/HASIL 1]');
  const hasil = await resolveRiset('a {riset}   {/riset} b', { ask });
  assert.equal(ask.panggilan.length, 0);
  assert.equal(hasil, 'a  b');
});

test('penulisan blok tidak peka huruf besar-kecil', async () => {
  const ask = askPalsu('[HASIL 1]Hasil[/HASIL 1]');
  assert.equal(await resolveRiset('{RISET}tugas{/RISET}', { ask }), 'Hasil');
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Jalankan: `node --test scripts/lib/riset.test.js`
Harapan: GAGAL dengan `Cannot find module './riset'`

- [ ] **Step 3: Tulis implementasinya**

Buat `scripts/lib/riset.js`:

```js
'use strict';
// Blok {riset}...{/riset} diselesaikan AI sebelum prompt final dipakai.
// Meniru resolveRisetBlocks di business-asset (lib/ai.js:14), termasuk
// format [HASIL n] dan aturan "beberapa blok = satu panggilan".
//
// Pemanggil AI DISUNTIK lewat opsi `ask`, bukan di-require di sini: dengan
// begitu seluruh penguraian dan penyisipan bisa diuji tanpa jaringan.

const RE_RISET = /\{riset\}([\s\S]*?)\{\/riset\}/gi;

function punyaRiset(text) {
  RE_RISET.lastIndex = 0;
  return RE_RISET.test(String(text || ''));
}

function susunPrompt(tugas, konteks) {
  const daftarTugas = tugas.map((t, i) => `TUGAS ${i + 1}:\n${t}`).join('\n\n');
  const format = tugas.map((_, i) =>
    `[HASIL ${i + 1}]\n<isi hasil tugas ${i + 1} di sini>\n[/HASIL ${i + 1}]`
  ).join('\n\n');
  return [
    konteks || '',
    `INSTRUKSI RISET — selesaikan semua tugas:\n\n${daftarTugas}`,
    `\nFormat keluaran WAJIB (jangan tambah teks lain di luar tag):\n${format}`
  ].filter(Boolean).join('\n\n');
}

function ambilHasil(balasan, nomor) {
  const re = new RegExp(`\\[HASIL ${nomor}\\]([\\s\\S]*?)\\[\\/HASIL ${nomor}\\]`, 'i');
  const cocok = String(balasan || '').match(re);
  return cocok ? cocok[1].trim() : null;
}

async function resolveRiset(text, { ask, konteks } = {}) {
  const isi = String(text || '');
  const cocokan = [...isi.matchAll(RE_RISET)];
  if (cocokan.length === 0) return isi;

  // Blok yang isinya kosong tidak layak memicu panggilan berbayar; ia cukup
  // dibuang. Blok berisi tetap dikerjakan.
  const berisi = cocokan.filter(m => m[1].trim());
  if (berisi.length === 0) return isi.replace(RE_RISET, '');

  if (typeof ask !== 'function') throw new Error('resolveRiset butuh opsi `ask`.');

  const tugas = berisi.map(m => m[1].trim());
  const balasan = await ask(susunPrompt(tugas, konteks));

  // Ambil SEMUA hasil dulu, baru menyisipkan. Balasan yang kurang satu tag
  // harus menggagalkan seluruhnya — menyisipkan sebagian menghasilkan prompt
  // yang terpotong diam-diam, dan itu tidak terlihat di mana pun.
  const hasil = [];
  for (let i = 0; i < tugas.length; i++) {
    const h = ambilHasil(balasan, i + 1);
    if (h === null) {
      throw new Error(`Balasan riset tidak memuat [HASIL ${i + 1}]. Balasan: ${String(balasan).slice(0, 200)}`);
    }
    hasil.push(h);
  }

  let n = 0;
  return isi.replace(RE_RISET, (utuh, badan) => (badan.trim() ? hasil[n++] : ''));
}

module.exports = { punyaRiset, resolveRiset };
```

- [ ] **Step 4: Jalankan uji, pastikan lolos**

Jalankan: `node --test scripts/lib/riset.test.js`
Harapan: LOLOS, 11 uji

- [ ] **Step 5: Jalankan seluruh uji**

Jalankan: `npm test`
Harapan: semua lolos

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/riset.js scripts/lib/riset.test.js
git commit -m "feat(template): blok {riset} digabung jadi satu panggilan AI"
```

---

### Task 5: routes/templates.js — API CRUD

**Files:**
- Create: `scripts/routes/templates.js`
- Create: `scripts/routes/templates.test.js`
- Modify: `scripts/server.js`

**Interfaces:**
- Consumes: `readTemplates`, `saveTemplate`, `deleteTemplate` dari `lib/template-store.js`; `resolveBlog`, `requireBlog` dari `lib/tenant.js`; `paths.templatesPath(id)`
- Produces:
  - `GET /api/templates` → `{ templates: [] }`
  - `POST /api/templates` → `{ success, created, id }` atau `{ error }` 400
  - `DELETE /api/templates` (body `{ id }`) → `{ success }` atau 404

- [ ] **Step 1: Tulis uji yang gagal**

Buat `scripts/routes/templates.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function setupApp() {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-route-'));
  fs.mkdirSync(path.join(skillDir, 'data', 'blogs', 'testblog'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'data', 'blogs', '_active'), 'testblog');
  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  require('./templates')(app, { paths });
  return { app, paths, skillDir };
}

function serve(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({
      server,
      url: `http://127.0.0.1:${server.address().port}`
    }));
  });
}

async function panggil(url, jalur, opts = {}) {
  const res = await fetch(url + jalur, opts);
  return { status: res.status, body: await res.json() };
}

test('GET mengembalikan daftar kosong saat file belum ada', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const r = await panggil(url, '/api/templates');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.templates, []);
  server.close();
});

test('POST membuat template dan GET mengembalikannya', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const buat = await panggil(url, '/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Transaksional', article_prompt: 'tulis {keyword}' })
  });
  assert.equal(buat.status, 200);
  assert.equal(buat.body.created, true);
  assert.match(buat.body.id, /^tpl_\d+$/);

  const daftar = await panggil(url, '/api/templates');
  assert.equal(daftar.body.templates.length, 1);
  assert.equal(daftar.body.templates[0].article_prompt, 'tulis {keyword}');
  server.close();
});

test('POST tanpa nama ditolak 400', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const r = await panggil(url, '/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article_prompt: 'x' })
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /nama/i);
  server.close();
});

test('POST kedua dengan id yang sama mengubah, tidak menggandakan', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const buat = await panggil(url, '/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Awal' })
  });
  const ubah = await panggil(url, '/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buat.body.id, name: 'Ubah' })
  });
  assert.equal(ubah.body.created, false);
  const daftar = await panggil(url, '/api/templates');
  assert.equal(daftar.body.templates.length, 1);
  assert.equal(daftar.body.templates[0].name, 'Ubah');
  server.close();
});

test('DELETE menghapus; id tak dikenal 404', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const buat = await panggil(url, '/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X' })
  });
  const hapus = await panggil(url, '/api/templates', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buat.body.id })
  });
  assert.equal(hapus.status, 200);
  const lagi = await panggil(url, '/api/templates', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: buat.body.id })
  });
  assert.equal(lagi.status, 404);
  server.close();
});

test('DELETE tanpa id ditolak 400', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const r = await panggil(url, '/api/templates', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  assert.equal(r.status, 400);
  server.close();
});

test('POST ke blog yang tidak ada ditolak 404, tidak membuat tenant baru', async () => {
  const { app, skillDir } = setupApp();
  const { server, url } = await serve(app);
  const r = await panggil(url, '/api/templates?blog=tidakada', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X' })
  });
  assert.equal(r.status, 404);
  assert.equal(fs.existsSync(path.join(skillDir, 'data', 'blogs', 'tidakada')), false);
  server.close();
});

test('template tersimpan ke file tenant yang benar', async () => {
  const { app, paths } = setupApp();
  const { server, url } = await serve(app);
  await panggil(url, '/api/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X' })
  });
  const isi = JSON.parse(fs.readFileSync(paths.templatesPath('testblog'), 'utf-8'));
  assert.equal(isi.templates.length, 1);
  server.close();
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Jalankan: `node --test scripts/routes/templates.test.js`
Harapan: GAGAL dengan `Cannot find module './templates'`

- [ ] **Step 3: Tulis implementasinya**

Buat `scripts/routes/templates.js`:

```js
'use strict';
const { readTemplates, saveTemplate, deleteTemplate } = require('../lib/template-store');
const { resolveBlog, requireBlog } = require('../lib/tenant');

module.exports = function registerTemplates(app, deps) {
  const { paths } = deps;

  // GET toleran: tenant baru belum punya templates.json, dan itu bukan galat.
  app.get('/api/templates', (req, res) => {
    try { res.json(readTemplates(paths.templatesPath(resolveBlog(req, paths)))); }
    catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  // POST memakai requireBlog: blog id yang salah ketik tidak boleh diam-diam
  // membuat tenant baru lewat mkdirSync di writeTemplates.
  app.post('/api/templates', (req, res) => {
    let file;
    try { file = paths.templatesPath(requireBlog(req, paths)); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    try {
      const { template, created } = saveTemplate(file, req.body || {});
      res.json({ success: true, created, id: template.id });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete('/api/templates', (req, res) => {
    let file;
    try { file = paths.templatesPath(requireBlog(req, paths)); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id wajib diisi' });
    if (!deleteTemplate(file, id)) return res.status(404).json({ error: 'Template tidak ditemukan' });
    res.json({ success: true });
  });
};
```

- [ ] **Step 4: Daftarkan di server.js**

Di `scripts/server.js`, setelah baris `require('./routes/knowledge-source')(app, deps);`, tambahkan:

```js
require('./routes/templates')(app, deps);
```

- [ ] **Step 5: Jalankan uji, pastikan lolos**

Jalankan: `node --test scripts/routes/templates.test.js`
Harapan: LOLOS, 8 uji

- [ ] **Step 6: Jalankan seluruh uji**

Jalankan: `npm test`
Harapan: semua lolos

- [ ] **Step 7: Commit**

```bash
git add scripts/routes/templates.js scripts/routes/templates.test.js scripts/server.js
git commit -m "feat(template): API /api/templates"
```

---

### Task 6: blog-config.js template <plan_id> — perangkai

**Files:**
- Modify: `scripts/blog-config.js`

**Interfaces:**
- Consumes: `findTemplate` (Task 1), `buildVars`+`resolveVars` (Task 2), `askOpenAI`+`envKeys().textKey` (Task 3), `punyaRiset`+`resolveRiset` (Task 4), `resolveKnowledgeBase`+`sourceType` dari `lib/knowledge.js`, `readBusinessAsset`+`findProduct`+`extractProductUrl` dari `lib/business-asset.js`
- Produces: keluaran JSON pada stdout
  ```json
  { "template_id": "tpl_...", "template_name": "...", "article_prompt": "...",
    "image_prompt": "...", "meta_title": "...", "meta_desc": "...", "warning": null }
  ```
  Kode keluar 0 untuk rencana tanpa template (dengan `template_id: null`); kode keluar 1 hanya untuk kegagalan riset/kredensial.

- [ ] **Step 1: Tulis subperintahnya**

Di `scripts/blog-config.js`, tambahkan `require` di bagian atas file (setelah require yang sudah ada):

```js
const { findTemplate } = require('./lib/template-store');
const { buildVars, resolveVars } = require('./lib/template-vars');
const { punyaRiset, resolveRiset } = require('./lib/riset');
const { askOpenAI } = require('./lib/openai-text');
const { envKeys } = require('./lib/env');
```

Lalu sisipkan blok berikut **sebelum** blok `if (arg === 'product-image')`:

```js
// Render template untuk satu rencana. Berbeda dari product-image yang selalu
// keluar 0: riset yang gagal menghasilkan artikel yang diam-diam lebih miskin,
// dan itu tidak terlihat di mana pun. Jadi gagalnya keras.
if (arg === 'template') {
  const planId = process.argv[3];
  if (!planId) {
    console.error('❌ Sebutkan id rencana: node scripts/blog-config.js template plan_123');
    process.exit(1);
  }

  const keluar = (obj) => { console.log(JSON.stringify(obj, null, 2)); process.exit(0); };
  const kosong = (warning) => keluar({
    template_id: null, template_name: '', article_prompt: '', image_prompt: '',
    meta_title: '', meta_desc: '', warning
  });

  let rencana;
  try {
    const data = JSON.parse(fs.readFileSync(paths.plansPath(id), 'utf-8'));
    rencana = (data.plans || []).find(p => p.id === planId);
  } catch (e) {
    console.error(`❌ Rencana tidak terbaca: ${e.message}`);
    process.exit(1);
  }
  if (!rencana) {
    console.error(`❌ Rencana "${planId}" tidak ada.`);
    process.exit(1);
  }

  // Rencana tanpa template BUKAN kegagalan: itu jalur normal untuk seluruh
  // artikel yang sudah ada. Agen melanjutkan dengan aturan bawaannya.
  if (!rencana.template_id) kosong(null);

  const template = findTemplate(paths.templatesPath(id), rencana.template_id);
  if (!template) {
    kosong(`Template "${rencana.template_id}" tidak ada lagi. Rencana ini ditulis dengan aturan bawaan.`);
  }

  // Produk diambil dari field `product` rencana, TIDAK ditambang dari notes:
  // notes berisi teks bebas dan menguraikannya berarti menebak.
  let produk = null;
  if (rencana.product && sourceType(cfg) === 'business_asset') {
    const ba = cfg.knowledge_source.business_asset || {};
    try {
      const { products } = readBusinessAsset(ba.root, ba.business_id);
      const found = findProduct(products, rencana.product);
      if (found) {
        produk = {
          ...found,
          // Prioritas URL sama dengan subperintah `product`: url yang diketik
          // pemilik menang atas hasil tambang dari konteks.
          url: String(found.url || '').trim() || extractProductUrl(found.konteks, cfg.wordpress?.url || '')
        };
      }
    } catch (e) {
      // Produk tidak terbaca tidak menggagalkan render: template masih berguna
      // tanpa variabel produk, dan sebabnya dilaporkan lewat warning.
      produk = null;
    }
  }

  const { knowledge_base } = resolveKnowledgeBase(cfg);
  const vars = buildVars(knowledge_base, rencana, produk);

  const bidang = {
    article_prompt: template.article_prompt || '',
    image_prompt: template.image_prompt || '',
    meta_title: template.meta_title_pattern || '',
    meta_desc: template.meta_desc_pattern || ''
  };

  // Substitusi variabel dulu, riset belakangan: blok {riset} sering memuat
  // {produkKonteks}, dan risetnya harus menerima konteks yang sudah terisi.
  for (const k of Object.keys(bidang)) bidang[k] = resolveVars(bidang[k], vars);

  const perluRiset = Object.values(bidang).some(punyaRiset);

  const cetak = () => keluar({
    template_id: template.id,
    template_name: template.name,
    ...bidang,
    warning: (rencana.product && !produk)
      ? `Produk "${rencana.product}" tidak ditemukan di business asset; variabel produk kosong.`
      : null
  });

  if (!perluRiset) cetak();

  // Konteks riset: profil bisnis + konteks produk bila ada. Tidak mengirim
  // riwayat artikel — hubungan antar-artikel sudah ditangani articles-cache
  // dan internal linking di lapisan lain.
  const konteksRiset = [
    `PROFIL BISNIS:`,
    `- Nama: ${vars.namaBisnis}`,
    `- Jenis usaha: ${vars.jenisUsaha || '-'}`,
    `- USP: ${vars.usp || '-'}`,
    `- Target market: ${vars.targetAudiens || '-'}`,
    `- Tone of voice: ${vars.nada || '-'}`,
    vars.produkNama ? `\nPRODUK: ${vars.produkNama}\n${vars.produkKonteks}` : ''
  ].filter(Boolean).join('\n');

  const kunciTeks = process.env[envKeys(id).textKey];
  const ask = (prompt) => askOpenAI(kunciTeks, prompt);

  (async () => {
    for (const k of Object.keys(bidang)) {
      bidang[k] = await resolveRiset(bidang[k], { ask, konteks: konteksRiset });
    }
    cetak();
  })().catch(e => {
    console.error(`❌ Riset gagal: ${e.message}`);
    console.error(`   Artikel TIDAK ditulis. Isi ${envKeys(id).textKey} di .env, atau hapus blok {riset} dari template.`);
    process.exit(1);
  });
  return;
}
```

Catatan: `return` di akhir blok wajib ada karena cabang riset bersifat asinkron — tanpa itu, eksekusi jatuh ke blok `product-image` di bawahnya sementara riset masih berjalan. `blog-config.js` adalah modul CommonJS tanpa pembungkus fungsi, dan `return` di tingkat teratas modul CommonJS sah serta menghentikan sisa file (sudah diverifikasi). Jangan menggantinya dengan IIFE.

- [ ] **Step 2: Muat .env sebelum memakai kunci**

`scripts/blog-config.js` belum memuat `.env` sama sekali (sudah diperiksa), jadi kunci teks tidak akan terbaca tanpa langkah ini. Ubah baris require `env` yang akan kamu tambahkan di Step 1 menjadi memuat keduanya:

```js
const { envKeys, loadDotEnv } = require('./lib/env');
```

lalu tambahkan tepat setelah baris `const paths = makePaths(path.join(__dirname, '..'));`:

```js
// Kunci teks untuk blok {riset} hanya ada di .env. Subperintah lain tidak
// membutuhkannya, tapi memuat di sini lebih murah daripada memuat bersyarat.
loadDotEnv(path.join(__dirname, '..', '.env'));
```

Verifikasi bahwa `loadDotEnv` benar-benar diekspor `lib/env.js` sebelum melanjutkan:

```bash
node -e "console.log(typeof require('./scripts/lib/env').loadDotEnv)"
```

Harapan: `function`

- [ ] **Step 3: Uji manual — rencana tanpa template**

Jalankan dari root project `G:/Project/Sikil Project/autoblog`:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js template plan_1776027660002_c3d4
```

Harapan: kode keluar 0, JSON dengan `"template_id": null`, `"warning": null`

- [ ] **Step 4: Uji manual — rencana dengan template tanpa riset**

Skrip di bawah mencari sendiri template bernama `UJI SEMENTARA`, jadi tidak ada id
yang perlu kamu salin antar-perintah. Jalankan dari folder skill:

```bash
cd "G:/Project/Sikil Project/autoblog/.claude/skills/blog-autopilot"
node -e "
const fs=require('fs');
const { saveTemplate } = require('./scripts/lib/template-store');
const { makePaths } = require('./scripts/lib/paths');
const p = makePaths('.');
const { template } = saveTemplate(p.templatesPath('perkapcom'), {
  name: 'UJI SEMENTARA',
  article_prompt: 'Tulis {jumlahKata} kata tentang {keyword} untuk {namaBisnis} di {kotaTarget}. Nada {nada}. Variabel salah: {tidakAda}',
  image_prompt: 'Foto {produkNama} di {kota}',
  meta_title_pattern: '{keyword} | {namaBisnis}'
});
const f='./data/blogs/perkapcom/article-plans.json';
const d=JSON.parse(fs.readFileSync(f,'utf-8'));
d.plans[0].template_id=template.id;
d.plans[0].product='Sewa HT';
fs.writeFileSync(f,JSON.stringify(d,null,2));
console.log('PLAN_ID=' + d.plans[0].id);
"
```

Catat `PLAN_ID` dari keluaran, lalu jalankan dari root project
`G:/Project/Sikil Project/autoblog`:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js template "<PLAN_ID>"
```

Harapan: kode keluar 0; `article_prompt` memuat `800`, `Perkap.com`, dan `{tidakAda}` **utuh**; `image_prompt` memuat nama produk dan `Malang`.

- [ ] **Step 5: Uji manual — template dengan riset tanpa kunci API**

Ubah template yang sama (dicari lewat namanya, bukan id yang disalin):

```bash
cd "G:/Project/Sikil Project/autoblog/.claude/skills/blog-autopilot"
node -e "
const { readTemplates, saveTemplate } = require('./scripts/lib/template-store');
const { makePaths } = require('./scripts/lib/paths');
const f = makePaths('.').templatesPath('perkapcom');
const t = readTemplates(f).templates.find(x => x.name === 'UJI SEMENTARA');
saveTemplate(f, { id: t.id, name: t.name,
  article_prompt: '{riset}Sebutkan 3 fakta tentang {produkNama}{/riset}' });
console.log('template diubah, sekarang memakai {riset}');
"
```

Pastikan `PERKAPCOM_TEXT_API_KEY` masih kosong di `.env`, lalu jalankan lagi
`template "<PLAN_ID>"` dari root project.

Harapan: kode keluar **1**, pesan menyebut `PERKAPCOM_TEXT_API_KEY`, tidak ada JSON di stdout.

- [ ] **Step 6: Bersihkan data uji**

```bash
cd "G:/Project/Sikil Project/autoblog/.claude/skills/blog-autopilot"
node -e "
const fs=require('fs');
const { readTemplates, deleteTemplate } = require('./scripts/lib/template-store');
const { makePaths } = require('./scripts/lib/paths');
const tf = makePaths('.').templatesPath('perkapcom');
const t = readTemplates(tf).templates.find(x => x.name === 'UJI SEMENTARA');
if (t) deleteTemplate(tf, t.id);
const f='./data/blogs/perkapcom/article-plans.json';
const d=JSON.parse(fs.readFileSync(f,'utf-8'));
delete d.plans[0].template_id; delete d.plans[0].product;
fs.writeFileSync(f,JSON.stringify(d,null,2));
console.log('bersih');
"
```

Verifikasi bahwa rencana hidup benar-benar kembali seperti semula:

```bash
git diff --stat data/blogs/perkapcom/article-plans.json
```

Harapan: tidak ada selisih. Bila ada, kembalikan dengan
`git checkout -- data/blogs/perkapcom/article-plans.json`.

- [ ] **Step 7: Jalankan seluruh uji**

Jalankan: `npm test`
Harapan: semua lolos

- [ ] **Step 8: Commit**

```bash
git add scripts/blog-config.js
git commit -m "feat(template): subperintah blog-config template <plan_id>"
```

---

### Task 7: plans.js — terima template_id

**Files:**
- Modify: `scripts/routes/plans.js`
- Create: `scripts/routes/plans-template.test.js`

**Interfaces:**
- Consumes: rute `POST /api/plans` yang sudah ada
- Produces: field `template_id` tersimpan di record rencana

`plan` di `POST /api/plans` disimpan lewat spread/`deepMerge`, jadi field baru
sebenarnya sudah ikut tersimpan tanpa perubahan kode. Task ini memastikannya
dengan uji, dan menambahkan pembersihan nilai supaya `template_id` yang bukan
string tidak masuk ke file.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `scripts/routes/plans-template.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function setupApp() {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-tpl-'));
  fs.mkdirSync(path.join(skillDir, 'data', 'blogs', 'testblog'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'data', 'blogs', '_active'), 'testblog');
  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  require('./plans')(app, { paths, broadcast: () => {} });
  return { app, paths };
}

function serve(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('template_id tersimpan dan terbaca kembali', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  await fetch(url + '/api/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'plan_x', keyword: 'sewa ht', template_id: 'tpl_123' })
  });
  const r = await (await fetch(url + '/api/plans')).json();
  assert.equal(r.plans[0].template_id, 'tpl_123');
  server.close();
});

test('rencana tanpa template_id tetap tersimpan tanpa field itu', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  await fetch(url + '/api/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'plan_y', keyword: 'sewa proyektor' })
  });
  const r = await (await fetch(url + '/api/plans')).json();
  assert.equal(r.plans[0].template_id, undefined);
  server.close();
});

test('template_id bukan string dinormalkan jadi string kosong', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  await fetch(url + '/api/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'plan_z', keyword: 'k', template_id: { jahat: true } })
  });
  const r = await (await fetch(url + '/api/plans')).json();
  assert.equal(r.plans[0].template_id, '');
  server.close();
});

test('mengosongkan template_id pada rencana yang sudah punya berhasil', async () => {
  const { app } = setupApp();
  const { server, url } = await serve(app);
  const kirim = (body) => fetch(url + '/api/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  await kirim({ id: 'plan_a', keyword: 'k', template_id: 'tpl_1' });
  await kirim({ id: 'plan_a', keyword: 'k', template_id: '' });
  const r = await (await fetch(url + '/api/plans')).json();
  assert.equal(r.plans[0].template_id, '');
  server.close();
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Jalankan: `node --test scripts/routes/plans-template.test.js`
Harapan: GAGAL pada uji ketiga (`template_id` objek tersimpan apa adanya)

- [ ] **Step 3: Normalkan template_id di plans.js**

Di `scripts/routes/plans.js`, di dalam `app.post('/api/plans', ...)`, tepat setelah baris `plan.slug = slug;`, tambahkan:

```js
  // template_id hanya boleh string. Nilai bertipe lain dari klien akan lolos
  // lewat deepMerge dan membuat findTemplate menerima objek — dinormalkan di
  // pintu masuk, bukan di setiap pembacanya.
  if (plan.template_id !== undefined) plan.template_id = String(plan.template_id || '').trim();
```

Perhatikan: `String({})` menghasilkan `'[object Object]'`, jadi urutannya penting —
`plan.template_id || ''` tidak menangkap objek. Pakai bentuk berikut agar objek
menjadi string kosong:

```js
  if (plan.template_id !== undefined) {
    plan.template_id = typeof plan.template_id === 'string' ? plan.template_id.trim() : '';
  }
```

Gunakan bentuk kedua. (Bentuk pertama ditampilkan hanya untuk menjelaskan
mengapa ia tidak dipakai.)

- [ ] **Step 4: Jalankan uji, pastikan lolos**

Jalankan: `node --test scripts/routes/plans-template.test.js`
Harapan: LOLOS, 4 uji

- [ ] **Step 5: Jalankan seluruh uji**

Jalankan: `npm test`
Harapan: semua lolos

- [ ] **Step 6: Commit**

```bash
git add scripts/routes/plans.js scripts/routes/plans-template.test.js
git commit -m "feat(template): rencana menyimpan template_id"
```

---

### Task 8: UI halaman Template

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/templates` (Task 5)
- Produces: fungsi global `templatesLoad()`, `templatesRender()`, `templateEdit(id)`, `templateSave()`, `templateDelete(id)`, `templateNew()`; variabel modul `templatesData`

- [ ] **Step 1: Tambah item sidebar**

Di `public/index.html`, di dalam `<nav class="sidebar-nav">`, tepat setelah blok `data-page="planning"` (yang berakhir sebelum `data-page="about"`), sisipkan:

```html
    <div class="nav-item" data-page="templates" onclick="showPage('templates', this)">
      <span class="nav-icon">🧩</span>
      <span>Template</span>
    </div>
```

- [ ] **Step 2: Tambah halaman Template**

Di `public/index.html`, tepat sebelum komentar `<!-- PLANNING PAGE -->`, sisipkan:

```html
  <!-- TEMPLATES PAGE -->
  <div id="page-templates" class="page">
    <div class="page-header">
      <h2>🧩 Template Artikel</h2>
      <p>Prompt artikel, prompt gambar, dan pola meta — dipilih per rencana</p>
    </div>

    <div class="plan-toolbar">
      <button class="btn btn-primary" onclick="templateNew()">+ Template Baru</button>
    </div>

    <div class="card">
      <div class="card-header"><h3>Daftar Template</h3></div>
      <div class="card-body">
        <div id="template-list"></div>
      </div>
    </div>

    <div class="card" id="template-editor" style="display:none;">
      <div class="card-header"><h3 id="template-editor-title">Template Baru</h3></div>
      <div class="card-body">
        <input type="hidden" id="tpl-id">
        <div class="form-group">
          <label>Nama Template</label>
          <input type="text" id="tpl-name" placeholder="mis. Transaksional Lokal">
        </div>
        <div class="form-group">
          <label>Prompt Artikel</label>
          <textarea id="tpl-article" rows="10" placeholder="Instruksi tambahan untuk penulis. Boleh memuat {keyword}, {kotaTarget}, dan blok {riset}...{/riset}"></textarea>
        </div>
        <div class="form-group">
          <label>Prompt Gambar</label>
          <textarea id="tpl-image" rows="5" placeholder="Gaya visual featured image. Boleh memuat {produkNama}, {namaBisnis}"></textarea>
        </div>
        <div class="form-group">
          <label>Pola Meta Title</label>
          <input type="text" id="tpl-meta-title" placeholder="{keyword} {kotaTarget} 2026 | {namaBisnis}">
        </div>
        <div class="form-group">
          <label>Pola Meta Description</label>
          <textarea id="tpl-meta-desc" rows="2" placeholder="Sewa {produkNama} di {kotaTarget}. {cta}"></textarea>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" onclick="templateSave()">Simpan</button>
          <button class="btn btn-secondary" onclick="templateEditorClose()">Batal</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>Variabel yang Tersedia</h3></div>
      <div class="card-body">
        <p style="font-size:13.5px; color:var(--text-secondary); line-height:1.7; margin-bottom:12px;">
          Variabel yang tidak dikenal <strong>dibiarkan apa adanya</strong> di prompt akhir —
          jadi salah ketik terlihat, bukan hilang diam-diam.
        </p>
        <p style="font-size:13px; line-height:2;">
          <strong>Bisnis:</strong>
          <code>{namaBisnis}</code> <code>{deskripsiBisnis}</code> <code>{tagline}</code>
          <code>{jenisUsaha}</code> <code>{targetAudiens}</code> <code>{nada}</code>
          <code>{usp}</code> <code>{kota}</code> <code>{alamat}</code> <code>{whatsapp}</code>
          <code>{email}</code> <code>{website}</code> <code>{jamOperasional}</code>
          <code>{cta}</code> <code>{kataKhas}</code> <code>{kataHindari}</code>
          <code>{dos}</code> <code>{donts}</code> <code>{topikTerlarang}</code>
        </p>
        <p style="font-size:13px; line-height:2;">
          <strong>Rencana:</strong>
          <code>{keyword}</code> <code>{judul}</code> <code>{lsi}</code> <code>{kotaTarget}</code>
          <code>{kategori}</code> <code>{tipeKonten}</code> <code>{jumlahKata}</code>
          <code>{slug}</code> <code>{catatan}</code> <code>{anchorUrl}</code> <code>{anchorText}</code>
        </p>
        <p style="font-size:13px; line-height:2;">
          <strong>Produk:</strong>
          <code>{produkNama}</code> <code>{produkHarga}</code> <code>{produkUrl}</code>
          <code>{produkKonteks}</code> <code>{produkFaq}</code> <code>{produkTargetMarket}</code>
        </p>
        <p style="font-size:13.5px; color:var(--text-secondary); line-height:1.7; margin-top:12px;">
          <strong>Blok riset:</strong> <code>{riset}tugas riset di sini{/riset}</code> dikerjakan AI
          sebelum artikel ditulis, dan hasilnya menggantikan blok itu. Butuh
          <code>{ID}_TEXT_API_KEY</code> di <code>.env</code>. Tanpa kunci itu, artikel
          <strong>tidak ditulis</strong> — bukan ditulis tanpa risetnya.
        </p>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Tambah pemuatan halaman di showPage**

Di `public/js/app.js`, fungsi `showPage` (baris 7), tepat sebelum baris penutup `}`, tambahkan:

```js
  if (pageId === 'templates') templatesLoad();
```

- [ ] **Step 4: Tambah logika template**

Di `public/js/app.js`, di akhir file, tambahkan:

```js
// ==================== TEMPLATE ====================
let templatesData = [];

async function templatesLoad() {
  try {
    const r = await fetch('/api/templates').then(x => x.json());
    templatesData = r.templates || [];
    templatesRender();
  } catch (e) { showToast('Gagal memuat template: ' + e.message, 'error'); }
}

function templatesRender() {
  const box = document.getElementById('template-list');
  if (!box) return;
  if (templatesData.length === 0) {
    box.innerHTML = '<p style="color:var(--text-secondary); font-size:14px;">Belum ada template. Klik "+ Template Baru".</p>';
    return;
  }
  // Kartu dibangun tanpa onclick inline: id template masuk data-attribute dan
  // dibaca lewat listener terdelegasi, supaya nilai apa pun di dalamnya tidak
  // pernah diperlakukan sebagai kode.
  box.innerHTML = templatesData.map(t => `
    <div class="produk-kartu" data-tpl="${escHtml(t.id)}" style="border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <div>
          <strong>${escHtml(t.name)}</strong>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
            ${t.article_prompt ? '📝 artikel' : ''}
            ${t.image_prompt ? ' · 🖼 gambar' : ''}
            ${t.meta_title_pattern || t.meta_desc_pattern ? ' · 🔖 meta' : ''}
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="plan-act" data-aksi="edit">✏️ Edit</button>
          <button class="plan-act" data-aksi="hapus">🗑 Hapus</button>
        </div>
      </div>
    </div>
  `).join('');
  pasangKlikTemplate(box);
}

let templateKlikTerpasang = false;
function pasangKlikTemplate(container) {
  if (templateKlikTerpasang) return;
  templateKlikTerpasang = true;
  container.addEventListener('click', (e) => {
    const tombol = e.target.closest('[data-aksi]');
    if (!tombol) return;
    const id = tombol.closest('[data-tpl]')?.dataset.tpl;
    if (!id) return;
    if (tombol.dataset.aksi === 'edit') templateEdit(id);
    else templateDelete(id);
  });
}

function templateNew() {
  document.getElementById('template-editor-title').textContent = 'Template Baru';
  document.getElementById('tpl-id').value = '';
  document.getElementById('tpl-name').value = '';
  document.getElementById('tpl-article').value = '';
  document.getElementById('tpl-image').value = '';
  document.getElementById('tpl-meta-title').value = '';
  document.getElementById('tpl-meta-desc').value = '';
  document.getElementById('template-editor').style.display = '';
}

function templateEdit(id) {
  const t = templatesData.find(x => x.id === id);
  if (!t) return;
  document.getElementById('template-editor-title').textContent = 'Edit Template';
  document.getElementById('tpl-id').value = t.id;
  document.getElementById('tpl-name').value = t.name || '';
  document.getElementById('tpl-article').value = t.article_prompt || '';
  document.getElementById('tpl-image').value = t.image_prompt || '';
  document.getElementById('tpl-meta-title').value = t.meta_title_pattern || '';
  document.getElementById('tpl-meta-desc').value = t.meta_desc_pattern || '';
  document.getElementById('template-editor').style.display = '';
}

function templateEditorClose() {
  document.getElementById('template-editor').style.display = 'none';
}

async function templateSave() {
  const body = {
    id: document.getElementById('tpl-id').value,
    name: document.getElementById('tpl-name').value.trim(),
    article_prompt: document.getElementById('tpl-article').value,
    image_prompt: document.getElementById('tpl-image').value,
    meta_title_pattern: document.getElementById('tpl-meta-title').value,
    meta_desc_pattern: document.getElementById('tpl-meta-desc').value
  };
  if (!body.name) { showToast('Nama template wajib diisi.', 'error'); return; }
  try {
    const data = await fetch('/api/templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(x => x.json());
    if (data.error) { showToast('Error: ' + data.error, 'error'); return; }
    showToast(data.created ? 'Template dibuat.' : 'Template diperbarui.', 'success');
    templateEditorClose();
    templatesLoad();
  } catch (e) { showToast('Gagal menyimpan: ' + e.message, 'error'); }
}

async function templateDelete(id) {
  const t = templatesData.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`Hapus template "${t.name}"?\n\nRencana yang memakainya akan ditulis dengan aturan bawaan.`)) return;
  try {
    const data = await fetch('/api/templates', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
    }).then(x => x.json());
    if (data.error) { showToast('Error: ' + data.error, 'error'); return; }
    showToast('Template dihapus.', 'success');
    templatesLoad();
  } catch (e) { showToast('Gagal menghapus: ' + e.message, 'error'); }
}
```

- [ ] **Step 5: Jalankan dashboard dan periksa manual**

Cari PID yang memakai port 3847 dan hentikan hanya PID itu bila server sudah jalan:

```bash
netstat -ano | grep :3847
# lalu, dengan PID dari keluaran di atas:
taskkill //PID <pid> //F
```

Jangan pernah memakai `Get-Process node | Stop-Process` — itu mematikan server Paperclip di port 3100.

Lalu jalankan: `npm start`

Buka `http://localhost:3847`, klik menu **Template**. Harapan: halaman terbuka, daftar kosong, tombol "+ Template Baru" membuka editor.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/js/app.js
git commit -m "feat(template): halaman Template di dashboard"
```

---

### Task 9: UI dropdown template di modal rencana

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

**Interfaces:**
- Consumes: `templatesData` (Task 8), `GET /api/templates`
- Produces: `planFillTemplateSelect(nilai)`; `template_id` ikut terkirim dari `planSave()`

- [ ] **Step 1: Tambah dropdown ke modal**

Di `public/index.html`, di dalam modal rencana, tepat sebelum blok yang memuat `id="pm-notes"` (grup "Catatan"), sisipkan:

```html
        <div class="form-group">
          <label>Template Artikel</label>
          <select id="pm-template">
            <option value="">— Tanpa template (aturan bawaan) —</option>
          </select>
          <small style="color:var(--text-secondary);">Kelola di menu Template. Tanpa template, artikel ditulis dengan aturan bawaan.</small>
        </div>
```

- [ ] **Step 2: Isi dropdown saat modal dibuka**

Di `public/js/app.js`, tambahkan fungsi ini di dekat `planFillProductSelect`:

```js
// Dropdown template selalu memuat ulang dari server: template bisa berubah di
// tab sebelah tanpa menutup dashboard, dan daftar basi akan menawarkan template
// yang sudah dihapus.
async function planFillTemplateSelect(nilai) {
  const sel = document.getElementById('pm-template');
  if (!sel) return;
  try {
    const r = await fetch('/api/templates').then(x => x.json());
    templatesData = r.templates || [];
  } catch { /* daftar gagal dimuat: biarkan hanya opsi "tanpa template" */ }
  sel.innerHTML = '<option value="">— Tanpa template (aturan bawaan) —</option>' +
    templatesData.map(t => `<option value="${escHtml(t.id)}">${escHtml(t.name)}</option>`).join('');
  // Template yang sudah dihapus tapi masih tertulis di rencana: tambahkan opsi
  // penanda supaya pemilik melihat bahwa rencananya menunjuk sesuatu yang hilang,
  // bukan diam-diam berpindah ke "tanpa template".
  if (nilai && !templatesData.some(t => t.id === nilai)) {
    sel.innerHTML += `<option value="${escHtml(nilai)}">⚠ Template sudah dihapus (${escHtml(nilai)})</option>`;
  }
  sel.value = nilai || '';
}
```

- [ ] **Step 3: Panggil saat modal dibuka**

Di `planModalOpen`, pada cabang **rencana baru** (`if (!id)`), tepat setelah baris `document.getElementById('pm-notes').value = '';`, tambahkan:

```js
    planFillTemplateSelect('');
```

Pada cabang **edit** (`else`), tepat setelah baris yang mengisi `pm-notes`, tambahkan:

```js
    planFillTemplateSelect(p.template_id || '');
```

- [ ] **Step 4: Kirim template_id saat menyimpan**

Di `planSave()`, di dalam objek `plan`, tambahkan satu baris setelah `content_type`:

```js
    template_id: document.getElementById('pm-template').value,
```

- [ ] **Step 5: Periksa manual**

Restart dashboard bila perlu (pakai PID-filter seperti Task 8, langkah 5), lalu:

1. Buka menu **Template**, buat template bernama "Uji Dropdown"
2. Buka menu **Perencanaan**, klik **+ Tambah Manual**
3. Harapan: dropdown "Template Artikel" memuat "Uji Dropdown"
4. Pilih template itu, isi keyword, simpan
5. Buka lagi rencana itu — harapan: dropdown masih menunjuk "Uji Dropdown"
6. Hapus template dari menu Template, buka lagi rencana — harapan: opsi "⚠ Template sudah dihapus"
7. Hapus rencana uji

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/js/app.js
git commit -m "feat(template): dropdown template di modal rencana"
```

---

### Task 10: Kontrak agen — article-writer & image-generator

**Files:**
- Modify: `agents/article-writer.md`
- Modify: `agents/image-generator.md`

**Interfaces:**
- Consumes: keluaran `blog-config.js template <plan_id>` (Task 6)
- Produces: kontrak tertulis untuk kedua agen

- [ ] **Step 1: Tambah langkah template di article-writer.md**

Di `agents/article-writer.md`, tepat setelah bagian `## Inputs` dan sebelum `## Article File Format`, sisipkan:

```markdown
## Template Artikel (kalau rencana memilihnya)

Sebelum menulis, kalau kamu punya `plan_id` rencana ini:

```bash
# dijalankan dari root project
node .claude/skills/blog-autopilot/scripts/blog-config.js template "{PLAN_ID}"
```

Keluarannya JSON:

- `article_prompt` terisi → perlakukan sebagai **instruksi tambahan di atas**
  aturan di bawah, bukan pengganti. Template mengatur gaya dan struktur.
- `template_id: null` → tidak ada template; tulis dengan aturan bawaan seperti biasa.
- `warning` terisi → sebutkan di laporan akhirmu, jangan diam-diam.
- Perintah keluar dengan kode **1** → riset gagal. **JANGAN menulis artikelnya.**
  Laporkan pesan galatnya dan berhenti; rencana tetap berstatus `planned`.

**Yang tidak boleh dikalahkan template**, apa pun isinya:

- Panjang Meta Title 50–60 karakter dan Meta Description 150–160 karakter
- Format berkas artikel (bagian "Article File Format" di bawah)
- Larangan `knowledge_base.prohibited_topics`

`meta_title` dan `meta_desc` dari keluaran itu adalah **saran**. Meta yang sudah
diketik pemilik di rencana menang; pola template dipakai hanya kalau field meta
rencana kosong. Perintah `template` sendiri tidak pernah menulis ke rencana.
```

- [ ] **Step 2: Tambah percabangan di image-generator.md**

Di `agents/image-generator.md`, di bagian `## Step 1: Craft the Image Prompt`, tepat setelah baris judulnya, sisipkan:

```markdown
**Kalau rencana memakai template**, jalankan lebih dulu:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js template "{PLAN_ID}"
```

Kalau `image_prompt` terisi, **pakai itu sebagai dasar prompt** — jangan menyusun
adegan dari nol. Kalau kosong atau `template_id: null`, susun sendiri dengan
formula di bawah.

Template mengatur gaya visual; ia **tidak** membatalkan Step 0. Kalau Step 0
memberi `path`, kalimat `"the exact device from the reference image"` tetap wajib
disisipkan ke prompt akhir — tanpa itu model memperlakukan foto sebagai inspirasi
gaya, bukan produk yang harus tampil apa adanya.
```

- [ ] **Step 3: Periksa konsistensi**

Jalankan:

```bash
grep -n "template" agents/article-writer.md agents/image-generator.md | head -20
```

Harapan: kedua file menyebut `blog-config.js template`, dan `image-generator.md`
masih memuat kalimat `the exact device from the reference image`.

- [ ] **Step 4: Commit**

```bash
git add agents/article-writer.md agents/image-generator.md
git commit -m "docs(agents): kontrak template untuk penulis dan penggambar"
```

---

### Task 11: Dokumentasi — SKILL.md dan AGENDA.md

**Files:**
- Modify: `SKILL.md`
- Modify: `docs/AGENDA.md`

**Interfaces:**
- Consumes: seluruh fitur dari Task 1–10
- Produces: dokumentasi pemakaian

- [ ] **Step 1: Tambah baris di tabel Command Routing**

Di `SKILL.md`, di tabel `## Command Routing`, tepat sebelum baris `generate`, sisipkan:

```markdown
| `/blog-autopilot templates` | → **[TEMPLATES]** kelola template artikel |
```

- [ ] **Step 2: Tambah bagian handler**

Di `SKILL.md`, tepat sebelum `## [GENERATE] — Batch article planner via natural language`, sisipkan:

```markdown
## [TEMPLATES] — Kelola template artikel

Template mengatur prompt artikel, prompt gambar, dan pola meta. Dipilih per
rencana di tab Perencanaan.

Buka dashboard (`npm start` di folder skill), lalu menu **Template**.

Untuk melihat hasil render satu rencana:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js template "<plan_id>"
```

Keluar kode 0 dengan `template_id: null` = rencana itu tanpa template (jalur
normal). Keluar kode 1 = riset gagal, dan artikel tidak boleh ditulis.

Blok `{riset}...{/riset}` di dalam template dikerjakan OpenAI sebelum artikel
ditulis. Butuh `{ID}_TEXT_API_KEY` di `.env` — hanya kalau template memakai blok
itu. Template tanpa `{riset}` jalan tanpa kunci sama sekali.

---
```

- [ ] **Step 3: Tambah ke daftar HELP**

Di `SKILL.md`, di blok teks `[HELP]`, tepat setelah bagian `AUDIT`, sisipkan:

```
TEMPLATE
  /blog-autopilot templates
    → Kelola template artikel (prompt artikel, gambar, pola meta)
    → Template dipilih per rencana di tab Perencanaan
```

- [ ] **Step 4: Catat di AGENDA.md**

Di `docs/AGENDA.md`, tepat sebelum baris `## 9. SERP tracker`, sisipkan:

```markdown
## 11. Template artikel + variabel — SELESAI (2026-09-03)

Dikerjakan lewat: `docs/superpowers/specs/2026-09-03-template-artikel-design.md`.

Template per blog di `data/blogs/{id}/templates.json`, dikelola di tab Template,
dipilih per rencana. Mengendalikan prompt artikel, prompt gambar, dan pola meta.
Variabel `{namaBisnis}`, `{keyword}`, `{produkNama}`, dst. di-resolve lewat
`node scripts/blog-config.js template "<plan_id>"`. Blok `{riset}...{/riset}`
dikerjakan OpenAI (`{ID}_TEXT_API_KEY`).

Yang SENGAJA tidak dikerjakan:
- **Template default dan pemilihan acak** — business-asset memilih style acak agar
  konten sosial media bervariasi; artikel blog ditulis untuk peringkat pencarian,
  dan hasil yang bisa diprediksi lebih berharga. Rencana tanpa template memakai
  aturan `article-writer.md`.
- **Versi/riwayat template** — mengedit menimpa. Artikel terbit tidak berubah.
- **Pratinjau render di dashboard** — tombol pratinjau berarti menjalankan riset
  berbiaya API dari klik yang mudah tak sengaja. Pakai CLI untuk melihat hasilnya.
- **Cache hasil riset** — blok riset mengolah konteks produk artikel ini;
  menyimpannya berarti artikel produk B memakai riset produk A.
```

- [ ] **Step 5: Sebut file template di SKILL.md**

Bagian `## Agent & Script Files` di `SKILL.md` mendaftar **folder**, bukan file
satu per satu — jangan mengubah polanya. Tambahkan satu baris saja di akhir daftar
itu:

```markdown
- `data/blogs/{id}/templates.json` — Template artikel per blog (dikelola di tab Template)
```

- [ ] **Step 6: Commit**

```bash
git add SKILL.md docs/AGENDA.md
git commit -m "docs(template): routing, help, dan agenda"
```

---

### Task 12: Verifikasi ujung-ke-ujung lewat dashboard

**Files:** tidak ada perubahan kode; task ini memverifikasi Task 1–11 bersama.

**Interfaces:**
- Consumes: seluruh fitur
- Produces: bukti bahwa alur lengkap bekerja dari UI

Aturan pengembangan fitur browser berlaku: **pakai sesi Playwright MCP yang sudah
terbuka**. Jangan membuka sesi baru — sesi baru selalu mulai dari kondisi logout
dan memaksa login ulang. Kalau tidak ada sesi terbuka, barulah buka satu.

- [ ] **Step 1: Pastikan dashboard jalan**

```bash
netstat -ano | grep :3847
```

Kalau kosong, jalankan `npm start` dari folder skill. Kalau sudah jalan dengan
kode lama, hentikan **hanya PID itu** dengan `taskkill //PID <pid> //F` lalu
jalankan ulang.

- [ ] **Step 2: Buat template dari UI**

Lewat Playwright MCP, buka `http://localhost:3847`, klik menu **Template**, klik
**+ Template Baru**, isi:

- Nama: `E2E Uji Template`
- Prompt Artikel: `Tulis {jumlahKata} kata tentang {keyword} untuk {namaBisnis}. Sasaran kota: {kotaTarget}. Nada: {nada}. Salah ketik sengaja: {tidakAdaVariabelIni}`
- Prompt Gambar: `Foto {produkNama} dipakai di acara, {kota}, professional photography, no text`
- Pola Meta Title: `{keyword} | {namaBisnis}`

Klik **Simpan**. Harapan: toast "Template dibuat", kartu muncul di daftar.

- [ ] **Step 3: Buat rencana yang memakai template itu**

Klik menu **Perencanaan** → **+ Tambah Manual**. Isi:

- Focus Keyword: `e2e uji template artikel`
- Kota: `Surabaya`
- Produk: pilih `Sewa HT` dari dropdown produk
- Template Artikel: pilih `E2E Uji Template`

Klik simpan. Harapan: rencana muncul di tabel.

- [ ] **Step 4: Verifikasi render dari CLI**

Ambil `plan_id` rencana itu:

```bash
node -e "
const d=require('./data/blogs/perkapcom/article-plans.json');
const p=d.plans.find(x=>x.keyword==='e2e uji template artikel');
console.log(p.id, '| template_id=', p.template_id, '| product=', p.product, '| city=', p.city);
"
```

Lalu, dari root project `G:/Project/Sikil Project/autoblog`:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js template "<plan_id>"
```

Harapan, semuanya harus benar sekaligus:

- kode keluar 0
- `article_prompt` memuat `Perkap.com` (dari `{namaBisnis}`)
- `article_prompt` memuat `Surabaya`, **bukan** `Malang` (`{kotaTarget}` ≠ `{kota}`)
- `article_prompt` memuat `{tidakAdaVariabelIni}` **utuh** — variabel tak dikenal tidak dikosongkan
- `image_prompt` memuat `Sewa HT` (dari `{produkNama}`) dan `Malang` (dari `{kota}`)
- `meta_title` memuat keyword dan nama bisnis
- `warning` bernilai `null`

- [ ] **Step 5: Verifikasi jalur riset gagal**

Edit template lewat UI, tambahkan di akhir Prompt Artikel:

```
{riset}Sebutkan 3 alasan orang menyewa {produkNama}{/riset}
```

Simpan, lalu jalankan lagi perintah `template` yang sama (dengan
`PERKAPCOM_TEXT_API_KEY` masih kosong di `.env`).

Harapan: kode keluar **1**, pesan menyebut `PERKAPCOM_TEXT_API_KEY`, dan **tidak
ada JSON** di stdout. Ini yang mencegah artikel ditulis tanpa risetnya.

- [ ] **Step 6: Verifikasi template terhapus tidak merusak rencana**

Hapus template `E2E Uji Template` lewat UI. Jalankan lagi perintah `template`.

Harapan: kode keluar **0**, `template_id: null`, `warning` menyebut template itu
tidak ada lagi. Artikel bisa tetap ditulis dengan aturan bawaan.

- [ ] **Step 7: Bersihkan data uji**

Hapus rencana `e2e uji template artikel` lewat UI. Verifikasi:

```bash
node -e "
const d=require('./data/blogs/perkapcom/article-plans.json');
console.log('sisa rencana:', d.plans.length, d.plans.map(p=>p.keyword));
const t=require('./data/blogs/perkapcom/templates.json');
console.log('sisa template:', t.templates.length);
"
```

Harapan: 2 rencana asli (`harga sewa stand partitur malang murah` dan satu lagi),
0 template. Kalau `templates.json` tidak ada setelah dihapus semua, itu wajar.

- [ ] **Step 8: Verifikasi server lain masih hidup**

```bash
netstat -ano | grep -E ":(3100|3101|3001|3847)" | head
```

Harapan: port 3100 (Paperclip) dan 3101 (sosmed content) masih mendengarkan.
Kalau salah satunya mati, itu berarti ada perintah yang mematikan node secara
menyeluruh — laporkan, jangan diamkan.

- [ ] **Step 9: Jalankan seluruh uji sekali lagi**

Jalankan: `npm test`
Harapan: semua lolos

- [ ] **Step 10: Commit bila ada perubahan tersisa**

```bash
git status --short
```

Kalau bersih, tidak ada yang perlu di-commit — task ini hanya verifikasi.
Kalau ada perbaikan yang muncul dari verifikasi, commit dengan pesan yang
menyebutkan apa yang diperbaiki.

---

## Catatan Penutup untuk Pelaksana

**Urutan tugas mengikat.** Task 6 memakai keluaran Task 1–4; Task 9 memakai Task 8;
Task 12 memverifikasi semuanya. Jangan melompat.

**Data hidup.** `data/blogs/perkapcom/` memuat 663 artikel di cache dan 2 rencana
nyata. Task 6 dan 12 menyentuhnya untuk uji manual — ikuti langkah pembersihannya
sampai selesai, dan verifikasi dengan `git status` bahwa tidak ada sisa.

**Yang paling mudah salah.** Tiga hal, semuanya sudah punya uji:

1. Variabel tak dikenal harus **utuh**, bukan kosong. Kalau ini terbalik, salah
   ketik di template hilang tanpa jejak.
2. `{kota}` dan `{kotaTarget}` harus berbeda. Kalau digabung, artikel Surabaya
   akan menyebut alamat Malang sebagai lokasi layanan.
3. Beberapa blok `{riset}` harus jadi **satu** panggilan. Satu panggilan per blok
   berarti biaya berlipat tanpa manfaat.
