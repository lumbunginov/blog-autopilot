# Knowledge Source: Manual atau Business Asset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Knowledge base tenant bisa dibaca langsung (live) dari data skill `business-asset` alih-alih diketik manual, lengkap dengan 45 produk + konteks + FAQ.

**Architecture:** Field `knowledge_source` baru di config tenant memilih `manual` atau `business_asset`. Satu resolver (`lib/knowledge.js`) jadi satu-satunya tempat yang memutuskan; pemetaan datanya di modul murni `lib/business-asset.js` yang bisa dites tanpa I/O. Route config memakai resolver saat membaca dan membuang `knowledge_base` kiriman browser saat mode business_asset, supaya hasil live tidak pernah tertulis balik jadi salinan beku.

**Tech Stack:** Node 24 (`node:test` + `node:assert`), Express 4, tanpa dependency baru.

**Spec:** `docs/superpowers/specs/2026-09-03-knowledge-source-business-asset-design.md`

## Global Constraints

- Bahasa komentar dan pesan error: **Indonesia**. Kode dan nama field: Inggris (ikut kode yang sudah ada).
- **Tanpa dependency npm baru.** Semua pakai stdlib + express yang sudah terpasang.
- Test pakai `node:test` + `node:assert`. Jalankan dengan `npm test` (glob-nya sudah mencakup `scripts/lib/*.test.js` dan `scripts/routes/*.test.js`) — jangan pernah `node --test <direktori>`, di Windows Node memperlakukan argumen direktori sebagai nama modul dan gagal.
- **Autoblog hanya MEMBACA business asset.** Tidak ada satu pun `fs.write*` yang menyentuh path di bawah `knowledge_source.business_asset.root`.
- Kredensial tetap hanya di `.env`. Jangan ada nilai rahasia di file yang dilacak git, di argv, atau di pesan commit.
- `business_id` selalu lewat `sanitizeId` dari `lib/paths.js` sebelum dipakai menyusun path.
- Path business asset untuk pengujian manual (bukan untuk ditulis ke test): `G:\Project\Paperclip\Perkap_com\project\sosmed_content\data\businesses`, berisi dua bisnis: `perkapcom` (45 produk) dan `karvaid` (7 produk). **Test otomatis tidak boleh bergantung pada folder ini** — test membuat fixture sendiri di `os.tmpdir()`.
- Tiap task berakhir dengan commit. Jalankan `npm test` sebelum commit; semua hijau.

---

### Task 1: `lib/business-asset.js` — pemetaan murni

**Files:**
- Create: `scripts/lib/business-asset.js`
- Test: `scripts/lib/business-asset.test.js`

**Interfaces:**
- Consumes: `sanitizeId` dari `./paths`
- Produces:
  - `toneFrom(toneOfVoice: string) → string`
  - `extractProductUrl(konteks: string, siteUrl: string) → string`
  - `mapProfile(profile: object) → { business_name, business_description, target_audience, tone, avoid_words }`
  - `mapProducts(products: array, siteUrl: string) → { products: array, internal_links: array }`
  - `findProduct(products: array, idOrName: string) → object | null`
  - `readBusinessAsset(root: string, businessId: string) → { profile, products }`

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/lib/business-asset.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  toneFrom, extractProductUrl, mapProfile, mapProducts, findProduct, readBusinessAsset
} = require('./business-asset');

const PROFILE = {
  id: 'perkapcom',
  nama: 'Perkap.com',
  tagline: 'Sewa Alat Panitia',
  deskripsi: '',
  jenisUsaha: 'Jasa Rental',
  kota: 'Malang',
  targetMarket: 'Panitia acara, Mahasiswa',
  toneOfVoice: 'santai',
  kataHindari: ['Termurah']
};

const PRODUCTS = [
  { id: 'bel-cerdas-cermat-custom', nama: 'Bel Cerdas Cermat Custom', harga: 'Rp 60.000 per hari',
    targetMarket: 'Panitia lomba',
    konteks: 'Lihat [di sini](https://perkap.com/bel-cerdas-cermat/) dan juga https://perkap.com/bel-cerdas-cermat/ lagi.',
    faq: '### Untuk berapa tim?\nSatu sampai enam tim.' },
  { id: 'proyektor', nama: 'Proyektor InFocus IN226', harga: 'Rp 150.000 per hari',
    targetMarket: 'Panitia acara',
    konteks: 'Rujukan luar https://tokopedia.com/x lalu https://www.perkap.com/sewa-proyektor/ .',
    faq: '' },
  { id: 'tanpa-url', nama: 'Kabel Roll', harga: '', targetMarket: '',
    konteks: 'Tidak ada tautan apa pun di sini.', faq: '' }
];

test('toneFrom memetakan tone Indonesia ke tone autoblog', () => {
  assert.strictEqual(toneFrom('santai'), 'casual');
  assert.strictEqual(toneFrom('Formal'), 'professional');
  assert.strictEqual(toneFrom('profesional'), 'professional');
  assert.strictEqual(toneFrom('edukatif'), 'educational');
});

test('toneFrom jatuh ke professional untuk nilai tak dikenal atau kosong', () => {
  assert.strictEqual(toneFrom('nyeleneh'), 'professional');
  assert.strictEqual(toneFrom(''), 'professional');
  assert.strictEqual(toneFrom(undefined), 'professional');
});

test('extractProductUrl hanya mengambil URL dari host situs sendiri', () => {
  assert.strictEqual(
    extractProductUrl(PRODUCTS[1].konteks, 'https://perkap.com'),
    'https://www.perkap.com/sewa-proyektor/'
  );
});

test('extractProductUrl mengambil kemunculan pertama', () => {
  assert.strictEqual(
    extractProductUrl(PRODUCTS[0].konteks, 'https://perkap.com'),
    'https://perkap.com/bel-cerdas-cermat/'
  );
});

test('extractProductUrl mengabaikan www dan beda huruf saat membandingkan host', () => {
  assert.strictEqual(
    extractProductUrl('lihat https://PERKAP.com/a/', 'https://www.perkap.com'),
    'https://PERKAP.com/a/'
  );
});

test('extractProductUrl kosong kalau tidak ada yang cocok atau siteUrl kosong', () => {
  assert.strictEqual(extractProductUrl(PRODUCTS[2].konteks, 'https://perkap.com'), '');
  assert.strictEqual(extractProductUrl(PRODUCTS[0].konteks, ''), '');
  assert.strictEqual(extractProductUrl('', 'https://perkap.com'), '');
});

test('mapProfile memetakan field profil', () => {
  const kb = mapProfile(PROFILE);
  assert.strictEqual(kb.business_name, 'Perkap.com');
  assert.strictEqual(kb.target_audience, 'Panitia acara, Mahasiswa');
  assert.strictEqual(kb.tone, 'casual');
  assert.deepStrictEqual(kb.avoid_words, ['Termurah']);
});

test('deskripsi kosong dirakit dari tagline, jenis usaha, dan kota', () => {
  const kb = mapProfile(PROFILE);
  assert.match(kb.business_description, /Sewa Alat Panitia/);
  assert.match(kb.business_description, /Jasa Rental/);
  assert.match(kb.business_description, /Malang/);
});

test('deskripsi yang sudah terisi dipakai apa adanya', () => {
  const kb = mapProfile({ ...PROFILE, deskripsi: 'Deskripsi asli.' });
  assert.strictEqual(kb.business_description, 'Deskripsi asli.');
});

test('mapProfile tidak pernah melempar untuk profil kosong', () => {
  const kb = mapProfile({});
  assert.strictEqual(kb.business_name, '');
  assert.deepStrictEqual(kb.avoid_words, []);
  assert.strictEqual(kb.tone, 'professional');
});

test('mapProducts membuat bentuk ringkas tanpa konteks dan faq', () => {
  const { products } = mapProducts(PRODUCTS, 'https://perkap.com');
  assert.strictEqual(products.length, 3);
  assert.deepStrictEqual(Object.keys(products[0]).sort(),
    ['id', 'name', 'price', 'target_market', 'url']);
  assert.strictEqual(products[0].name, 'Bel Cerdas Cermat Custom');
  assert.strictEqual(products[0].price, 'Rp 60.000 per hari');
});

test('produk tanpa URL tetap masuk daftar dengan url kosong', () => {
  const { products } = mapProducts(PRODUCTS, 'https://perkap.com');
  assert.strictEqual(products[2].name, 'Kabel Roll');
  assert.strictEqual(products[2].url, '');
});

test('internal_links berisi url unik dengan anchor nama produk', () => {
  const { internal_links } = mapProducts(PRODUCTS, 'https://perkap.com');
  assert.strictEqual(internal_links.length, 2);
  assert.deepStrictEqual(internal_links[0],
    { url: 'https://perkap.com/bel-cerdas-cermat/', anchor: 'Bel Cerdas Cermat Custom' });
  assert.ok(!internal_links.some(l => l.url === ''));
});

test('internal_links membuang url kembar', () => {
  const dua = [PRODUCTS[0], { ...PRODUCTS[0], id: 'lain', nama: 'Nama Lain' }];
  const { internal_links } = mapProducts(dua, 'https://perkap.com');
  assert.strictEqual(internal_links.length, 1);
});

test('siteUrl kosong membuat semua url kosong, produk tetap lengkap', () => {
  const { products, internal_links } = mapProducts(PRODUCTS, '');
  assert.strictEqual(products.length, 3);
  assert.ok(products.every(p => p.url === ''));
  assert.deepStrictEqual(internal_links, []);
});

test('mapProducts aman untuk masukan bukan array', () => {
  assert.deepStrictEqual(mapProducts(null, 'https://perkap.com'),
    { products: [], internal_links: [] });
});

test('findProduct cocok lewat id maupun nama, tanpa peduli huruf besar-kecil', () => {
  assert.strictEqual(findProduct(PRODUCTS, 'proyektor').nama, 'Proyektor InFocus IN226');
  assert.strictEqual(findProduct(PRODUCTS, 'bel cerdas cermat custom').id, 'bel-cerdas-cermat-custom');
  assert.strictEqual(findProduct(PRODUCTS, 'PROYEKTOR INFOCUS IN226').id, 'proyektor');
});

test('findProduct cocok sebagian kalau tidak ada yang persis', () => {
  assert.strictEqual(findProduct(PRODUCTS, 'Bel Cerdas Cermat').id, 'bel-cerdas-cermat-custom');
});

test('findProduct mengembalikan null kalau tidak ketemu', () => {
  assert.strictEqual(findProduct(PRODUCTS, 'kapal selam'), null);
  assert.strictEqual(findProduct(PRODUCTS, ''), null);
  assert.strictEqual(findProduct(null, 'apa saja'), null);
});

test('findProduct mengembalikan produk penuh berisi konteks dan faq', () => {
  const p = findProduct(PRODUCTS, 'proyektor');
  assert.ok('konteks' in p);
  assert.ok('faq' in p);
});

// --- readBusinessAsset: I/O, pakai fixture di tmpdir ---
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-test-'));
  const dir = path.join(root, 'perkapcom');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(PROFILE));
  fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify(PRODUCTS));
  return root;
}

test('readBusinessAsset membaca profile dan products', () => {
  const root = fixture();
  const { profile, products } = readBusinessAsset(root, 'perkapcom');
  assert.strictEqual(profile.nama, 'Perkap.com');
  assert.strictEqual(products.length, 3);
});

test('folder bisnis tidak ada: error menyebut path yang dicari', () => {
  const root = fixture();
  assert.throws(() => readBusinessAsset(root, 'tidakada'), (e) => {
    assert.ok(e.message.includes('tidakada'), 'pesan harus menyebut id bisnis');
    assert.ok(e.message.includes(root), 'pesan harus menyebut root');
    return true;
  });
});

test('products.json rusak: error menyebut nama berkasnya, bukan stack JSON mentah', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'perkapcom', 'products.json'), '{bukan json');
  assert.throws(() => readBusinessAsset(root, 'perkapcom'), /products\.json/);
});

test('products.json boleh tidak ada: produk jadi daftar kosong', () => {
  const root = fixture();
  fs.rmSync(path.join(root, 'perkapcom', 'products.json'));
  const { products } = readBusinessAsset(root, 'perkapcom');
  assert.deepStrictEqual(products, []);
});

test('business_id dengan ../ ditolak sebelum menyentuh disk', () => {
  const root = fixture();
  assert.throws(() => readBusinessAsset(root, '../rahasia'), /tidak valid/i);
  assert.throws(() => readBusinessAsset(root, 'a/b'), /tidak valid/i);
  assert.throws(() => readBusinessAsset(root, 'a\\b'), /tidak valid/i);
});

test('root kosong ditolak dengan pesan jelas', () => {
  assert.throws(() => readBusinessAsset('', 'perkapcom'), /root/i);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test`
Expected: FAIL — `Cannot find module './business-asset'`

- [ ] **Step 3: Tulis implementasinya**

Buat `scripts/lib/business-asset.js`:

```js
'use strict';
// Pemetaan data skill `business-asset` (agent sosmed content) ke bentuk
// knowledge_base autoblog. Modul ini HANYA MEMBACA — tidak pernah menulis
// apa pun ke folder business asset.
const fs = require('fs');
const path = require('path');
const { sanitizeId } = require('./paths');

const TONE_MAP = {
  santai: 'casual',
  casual: 'casual',
  formal: 'professional',
  profesional: 'professional',
  professional: 'professional',
  edukatif: 'educational',
  educational: 'educational',
  ramah: 'friendly',
  friendly: 'friendly',
  berwibawa: 'authoritative',
  authoritative: 'authoritative'
};

function toneFrom(toneOfVoice) {
  const key = String(toneOfVoice || '').trim().toLowerCase();
  return TONE_MAP[key] || 'professional';
}

// Host tanpa "www." dan tanpa beda huruf besar-kecil, supaya
// https://www.Perkap.com dan https://perkap.com dianggap sama.
function normHost(u) {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

const URL_RE = /https?:\/\/[^\s)<>\]"']+/g;

// URL pertama di `konteks` yang host-nya sama dengan host situs tenant.
// siteUrl kosong → '' : jangan menebak host dari URL pertama, sebab konteks
// juga memuat tautan ke situs lain (marketplace, sumber rujukan).
function extractProductUrl(konteks, siteUrl) {
  const wanted = normHost(siteUrl);
  if (!wanted || !konteks) return '';
  const found = String(konteks).match(URL_RE) || [];
  for (const raw of found) {
    const u = raw.replace(/[.,;:]+$/, '');
    if (normHost(u) === wanted) return u;
  }
  return '';
}

function mapProfile(profile) {
  const p = profile || {};
  let desc = String(p.deskripsi || '').trim();
  if (!desc) {
    // Deskripsi kosong itu lumrah di business asset; rakit dari potongan yang ada
    // supaya penulis artikel tetap tahu bisnisnya bergerak di bidang apa.
    desc = [p.tagline, p.jenisUsaha, p.kota && `di ${p.kota}`]
      .map(x => String(x || '').trim()).filter(Boolean).join(' — ');
  }
  return {
    business_name: String(p.nama || '').trim(),
    business_description: desc,
    target_audience: String(p.targetMarket || '').trim(),
    tone: toneFrom(p.toneOfVoice),
    avoid_words: Array.isArray(p.kataHindari) ? p.kataHindari.filter(Boolean) : []
  };
}

// Bentuk RINGKAS: tanpa konteks/faq. 143 KB konteks untuk 45 produk tidak
// boleh ikut ke GET /api/config — ambil per produk lewat findProduct.
function mapProducts(products, siteUrl) {
  const list = Array.isArray(products) ? products : [];
  const seen = new Set();
  const internal_links = [];
  const out = list.map(p => {
    const name = String(p?.nama || '').trim();
    const url = extractProductUrl(p?.konteks, siteUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      internal_links.push({ url, anchor: name });
    }
    return {
      id: String(p?.id || '').trim(),
      name,
      url,
      price: String(p?.harga || '').trim(),
      target_market: String(p?.targetMarket || '').trim()
    };
  });
  return { products: out, internal_links };
}

// Cocokkan id atau nama; persis dulu, baru cocok sebagian.
function findProduct(products, idOrName) {
  const list = Array.isArray(products) ? products : [];
  const q = String(idOrName || '').trim().toLowerCase();
  if (!q) return null;
  const exact = list.find(p =>
    String(p?.id || '').toLowerCase() === q || String(p?.nama || '').toLowerCase() === q);
  if (exact) return exact;
  return list.find(p =>
    String(p?.nama || '').toLowerCase().includes(q) ||
    String(p?.id || '').toLowerCase().includes(q)) || null;
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    throw new Error(`Gagal membaca ${label} (${file}): ${e.message}`);
  }
}

function readBusinessAsset(root, businessId) {
  const base = String(root || '').trim();
  if (!base) throw new Error('Folder root business asset belum diisi.');
  const id = sanitizeId(businessId);
  const dir = path.join(base, id);
  const profileFile = path.join(dir, 'profile.json');
  if (!fs.existsSync(profileFile)) {
    throw new Error(`Business asset "${id}" tidak ada di ${base} (mencari ${profileFile}).`);
  }
  const profile = readJson(profileFile, 'profile.json');
  const productsFile = path.join(dir, 'products.json');
  const products = fs.existsSync(productsFile) ? readJson(productsFile, 'products.json') : [];
  return { profile, products: Array.isArray(products) ? products : [] };
}

module.exports = {
  toneFrom, extractProductUrl, mapProfile, mapProducts, findProduct, readBusinessAsset
};
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npm test`
Expected: PASS, semua test business-asset hijau, test lama tetap hijau.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/business-asset.js scripts/lib/business-asset.test.js
git commit -m "feat(kb): pemetaan business asset ke knowledge base"
```

---

### Task 2: `lib/knowledge.js` — resolver manual vs business_asset

**Files:**
- Create: `scripts/lib/knowledge.js`
- Test: `scripts/lib/knowledge.test.js`

**Interfaces:**
- Consumes: `readBusinessAsset`, `mapProfile`, `mapProducts` dari `./business-asset`
- Produces:
  - `sourceType(config) → 'manual' | 'business_asset'`
  - `resolveKnowledgeBase(config) → { knowledge_base, source, error }` — `error` bernilai `null` kalau sukses; fungsi ini **tidak pernah melempar**

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/lib/knowledge.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveKnowledgeBase, sourceType } = require('./knowledge');

const MANUAL_KB = {
  business_name: 'Manual Inc',
  business_description: 'Ditulis tangan',
  products: [{ name: 'Produk A', url: '' }],
  target_audience: 'siapa saja',
  tone: 'professional',
  prohibited_topics: ['judi'],
  internal_links: [{ url: 'https://x.test/a/', anchor: 'a' }],
  custom_entries: [{ title: 'catatan', body: 'isi' }]
};

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kn-test-'));
  const dir = path.join(root, 'perkapcom');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({
    nama: 'Perkap.com', tagline: 'Sewa Alat Panitia', jenisUsaha: 'Jasa Rental',
    kota: 'Malang', deskripsi: '', targetMarket: 'Panitia acara',
    toneOfVoice: 'santai', kataHindari: ['Termurah']
  }));
  fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify([
    { id: 'ht', nama: 'Sewa HT', harga: 'Rp 35.000', targetMarket: 'Panitia',
      konteks: 'Detail di https://perkap.com/sewa-ht/', faq: '### Berapa lama?\nSehari.' }
  ]));
  return root;
}

function baConfig(root) {
  return {
    wordpress: { url: 'https://perkap.com', username: 'u' },
    knowledge_base: MANUAL_KB,
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  };
}

test('config tanpa knowledge_source dianggap manual', () => {
  assert.strictEqual(sourceType({ knowledge_base: MANUAL_KB }), 'manual');
  assert.strictEqual(sourceType({}), 'manual');
  assert.strictEqual(sourceType(null), 'manual');
});

test('type tak dikenal jatuh ke manual, bukan melempar', () => {
  assert.strictEqual(sourceType({ knowledge_source: { type: 'entah' } }), 'manual');
});

test('mode manual mengembalikan knowledge_base tersimpan apa adanya', () => {
  const r = resolveKnowledgeBase({ knowledge_base: MANUAL_KB });
  assert.strictEqual(r.source, 'manual');
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.knowledge_base.business_name, 'Manual Inc');
  assert.deepStrictEqual(r.knowledge_base.prohibited_topics, ['judi']);
});

test('mode manual selalu memberi avoid_words berupa array', () => {
  const r = resolveKnowledgeBase({ knowledge_base: MANUAL_KB });
  assert.deepStrictEqual(r.knowledge_base.avoid_words, []);
});

test('mode manual tanpa knowledge_base sama sekali tetap memberi objek', () => {
  const r = resolveKnowledgeBase({});
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.knowledge_base.products, []);
  assert.deepStrictEqual(r.knowledge_base.avoid_words, []);
});

test('mode business_asset membaca live dari folder', () => {
  const r = resolveKnowledgeBase(baConfig(fixtureRoot()));
  assert.strictEqual(r.source, 'business_asset');
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
  assert.strictEqual(r.knowledge_base.products.length, 1);
  assert.strictEqual(r.knowledge_base.products[0].url, 'https://perkap.com/sewa-ht/');
  assert.deepStrictEqual(r.knowledge_base.avoid_words, ['Termurah']);
});

test('business_asset tidak membocorkan konteks dan faq ke knowledge_base', () => {
  const r = resolveKnowledgeBase(baConfig(fixtureRoot()));
  const p = r.knowledge_base.products[0];
  assert.ok(!('konteks' in p) && !('context' in p));
  assert.ok(!('faq' in p));
});

test('business_asset mengabaikan knowledge_base manual tersimpan', () => {
  const r = resolveKnowledgeBase(baConfig(fixtureRoot()));
  assert.notStrictEqual(r.knowledge_base.business_name, 'Manual Inc');
  assert.deepStrictEqual(r.knowledge_base.prohibited_topics, []);
  assert.deepStrictEqual(r.knowledge_base.custom_entries, []);
});

test('folder salah: mengembalikan error, TIDAK melempar, dan tetap memberi kb kosong', () => {
  const cfg = baConfig(fixtureRoot());
  cfg.knowledge_source.business_asset.business_id = 'tidakada';
  const r = resolveKnowledgeBase(cfg);
  assert.strictEqual(r.source, 'business_asset');
  assert.ok(r.error, 'error harus terisi');
  assert.ok(r.error.includes('tidakada'));
  assert.deepStrictEqual(r.knowledge_base.products, []);
});

test('business_id berbahaya: error, bukan lemparan', () => {
  const cfg = baConfig(fixtureRoot());
  cfg.knowledge_source.business_asset.business_id = '../../rahasia';
  const r = resolveKnowledgeBase(cfg);
  assert.ok(r.error);
  assert.match(r.error, /tidak valid/i);
});

test('business_asset tanpa root: error menyebut root', () => {
  const r = resolveKnowledgeBase({
    knowledge_source: { type: 'business_asset', business_asset: { business_id: 'perkapcom' } }
  });
  assert.ok(r.error);
  assert.match(r.error, /root/i);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test`
Expected: FAIL — `Cannot find module './knowledge'`

- [ ] **Step 3: Tulis implementasinya**

Buat `scripts/lib/knowledge.js`:

```js
'use strict';
// Satu-satunya tempat yang memutuskan knowledge base datang dari mana.
// Semua route dan CLI lewat sini, supaya aturan manual vs business_asset
// tidak tersebar dan menyimpang antar pemanggil.
const { readBusinessAsset, mapProfile, mapProducts } = require('./business-asset');

const EMPTY_KB = {
  business_name: '',
  business_description: '',
  products: [],
  target_audience: '',
  tone: 'professional',
  prohibited_topics: [],
  internal_links: [],
  custom_entries: [],
  avoid_words: []
};

function sourceType(config) {
  return config?.knowledge_source?.type === 'business_asset' ? 'business_asset' : 'manual';
}

function resolveKnowledgeBase(config) {
  const source = sourceType(config);

  if (source === 'manual') {
    const kb = config?.knowledge_base || {};
    return {
      source,
      error: null,
      // avoid_words baru ada di mode business_asset; tenant manual belum punya.
      // Selalu kirim array supaya penulis artikel tidak perlu menjaga dua bentuk.
      knowledge_base: { ...EMPTY_KB, ...kb, avoid_words: kb.avoid_words || [] }
    };
  }

  const ba = config?.knowledge_source?.business_asset || {};
  try {
    const { profile, products } = readBusinessAsset(ba.root, ba.business_id);
    const mapped = mapProducts(products, config?.wordpress?.url || '');
    return {
      source,
      error: null,
      knowledge_base: {
        ...EMPTY_KB,
        ...mapProfile(profile),
        products: mapped.products,
        internal_links: mapped.internal_links
      }
    };
  } catch (e) {
    // Sengaja tidak melempar: dashboard harus tetap terbuka dan menampilkan
    // masalahnya, bukan mati dengan 500 tanpa petunjuk path mana yang salah.
    return { source, error: e.message, knowledge_base: { ...EMPTY_KB } };
  }
}

module.exports = { sourceType, resolveKnowledgeBase, EMPTY_KB };
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/knowledge.js scripts/lib/knowledge.test.js
git commit -m "feat(kb): resolver sumber knowledge base"
```

---

### Task 3: `stripKnowledgeBase` di `lib/config-merge.js`

**Files:**
- Modify: `scripts/lib/config-merge.js`
- Modify: `scripts/lib/config-merge.test.js`

**Interfaces:**
- Consumes: —
- Produces: `stripKnowledgeBase(body, source) → { clean, ignored }` — `ignored` berisi `['knowledge_base']` kalau dibuang, `[]` kalau tidak. Bentuknya sengaja sama dengan `stripCredentials` supaya route bisa menggabungkan dua daftar `ignored`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `scripts/lib/config-merge.test.js`:

```js
const { stripKnowledgeBase } = require('./config-merge');

test('mode business_asset membuang knowledge_base kiriman browser', () => {
  const body = { wordpress: { url: 'https://x.test' }, knowledge_base: { business_name: 'Palsu' } };
  const { clean, ignored } = stripKnowledgeBase(body, 'business_asset');
  assert.ok(!('knowledge_base' in clean));
  assert.deepStrictEqual(ignored, ['knowledge_base']);
  assert.strictEqual(clean.wordpress.url, 'https://x.test');
});

test('mode manual membiarkan knowledge_base lewat', () => {
  const body = { knowledge_base: { business_name: 'Asli' } };
  const { clean, ignored } = stripKnowledgeBase(body, 'manual');
  assert.strictEqual(clean.knowledge_base.business_name, 'Asli');
  assert.deepStrictEqual(ignored, []);
});

test('business_asset tanpa knowledge_base di body tidak melaporkan apa-apa', () => {
  const { ignored } = stripKnowledgeBase({ workflow: { language: 'id' } }, 'business_asset');
  assert.deepStrictEqual(ignored, []);
});

test('stripKnowledgeBase tidak mengubah objek asal', () => {
  const body = { knowledge_base: { business_name: 'Palsu' } };
  stripKnowledgeBase(body, 'business_asset');
  assert.strictEqual(body.knowledge_base.business_name, 'Palsu');
});

test('knowledge_source di body tetap lewat di kedua mode', () => {
  const body = { knowledge_source: { type: 'manual' }, knowledge_base: { business_name: 'x' } };
  assert.ok(stripKnowledgeBase(body, 'business_asset').clean.knowledge_source);
  assert.ok(stripKnowledgeBase(body, 'manual').clean.knowledge_source);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test`
Expected: FAIL — `stripKnowledgeBase is not a function`

- [ ] **Step 3: Tulis implementasinya**

Di `scripts/lib/config-merge.js`, sebelum `module.exports`, tambahkan:

```js
// Di mode business_asset, knowledge_base dihitung ulang dari file business
// asset tiap kali dibaca. Kalau kiriman browser dibiarkan tertulis, hasil
// live langsung membeku jadi salinan di config.json dan berhenti mengikuti
// sumbernya — persis yang mau dihindari mode ini.
// knowledge_source SENGAJA tidak dibuang: user harus tetap bisa berpindah
// mode dan mengganti bisnis lewat POST yang sama.
function stripKnowledgeBase(body, source) {
  const clean = JSON.parse(JSON.stringify(body || {}));
  const ignored = [];
  if (source === 'business_asset' && 'knowledge_base' in clean) {
    delete clean.knowledge_base;
    ignored.push('knowledge_base');
  }
  return { clean, ignored };
}
```

Ubah baris terakhir menjadi:

```js
module.exports = { deepMerge, stripCredentials, stripKnowledgeBase };
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/config-merge.js scripts/lib/config-merge.test.js
git commit -m "feat(kb): buang knowledge_base kiriman browser di mode business_asset"
```

---

### Task 4: Route config memakai resolver

**Files:**
- Modify: `scripts/routes/config.js`
- Modify: `scripts/routes/blogs.js:40-70` (handler `GET`/`PUT /api/blogs/:id/config`)
- Test: `scripts/routes/config.test.js` (buat baru)

**Interfaces:**
- Consumes: `resolveKnowledgeBase`, `sourceType` dari `../lib/knowledge`; `stripKnowledgeBase` dari `../lib/config-merge`
- Produces: `GET /api/config` dan `GET /api/blogs/:id/config` menambah field `_knowledge` berbentuk `{ source: 'manual'|'business_asset', error: string|null }` di sebelah `_credentials`

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/routes/config.test.js` (pola diambil dari `scripts/routes/plans.test.js`):

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function baRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgroute-ba-'));
  const dir = path.join(root, 'perkapcom');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({
    nama: 'Perkap.com', deskripsi: 'Sewa alat panitia.', targetMarket: 'Panitia',
    toneOfVoice: 'santai', kataHindari: ['Termurah']
  }));
  fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify([
    { id: 'ht', nama: 'Sewa HT', harga: 'Rp 35.000',
      konteks: 'Detail https://perkap.com/sewa-ht/', faq: 'tanya jawab' }
  ]));
  return root;
}

function setupApp(configObj) {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgroute-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), JSON.stringify(configObj, null, 2));
  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  require('./config')(app, { paths });
  require('./blogs')(app, { paths });
  return { app, configFile: path.join(blogDir, 'config.json') };
}

async function withServer(configObj, fn) {
  const { app, configFile } = setupApp(configObj);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, configFile); } finally { server.close(); }
}

const MANUAL = {
  wordpress: { url: 'https://x.test', username: 'u' },
  knowledge_base: { business_name: 'Manual Inc', products: [{ name: 'A', url: '' }] }
};

function baConfig(root) {
  return {
    wordpress: { url: 'https://perkap.com', username: 'u' },
    knowledge_base: { business_name: 'Manual Inc', products: [{ name: 'A', url: '' }] },
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  };
}

test('GET /api/config mode manual tidak berubah perilakunya', async () => {
  await withServer(MANUAL, async (base) => {
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Manual Inc');
    assert.strictEqual(r._knowledge.source, 'manual');
    assert.strictEqual(r._knowledge.error, null);
  });
});

test('GET /api/config mode business_asset mengembalikan data live', async () => {
  await withServer(baConfig(baRoot()), async (base) => {
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
    assert.strictEqual(r.knowledge_base.products.length, 1);
    assert.strictEqual(r.knowledge_base.products[0].url, 'https://perkap.com/sewa-ht/');
    assert.strictEqual(r._knowledge.source, 'business_asset');
  });
});

test('GET /api/config tidak pernah mengirim konteks atau faq produk', async () => {
  await withServer(baConfig(baRoot()), async (base) => {
    const body = await (await fetch(`${base}/api/config`)).text();
    assert.ok(!body.includes('tanya jawab'), 'faq tidak boleh ikut');
    assert.ok(!body.includes('konteks'));
  });
});

test('POST /api/config mode business_asset TIDAK menulis knowledge_base ke disk', async () => {
  await withServer(baConfig(baRoot()), async (base, configFile) => {
    const res = await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: { business_name: 'DISUSUPI' }, workflow: { language: 'en' } })
    });
    const out = await res.json();
    assert.strictEqual(out.success, true);
    assert.ok(out.warning && out.warning.includes('knowledge_base'));
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_base.business_name, 'Manual Inc', 'cadangan manual harus utuh');
    assert.strictEqual(saved.workflow.language, 'en', 'field lain tetap tersimpan');
  });
});

test('POST /api/config mode manual tetap menyimpan knowledge_base', async () => {
  await withServer(MANUAL, async (base, configFile) => {
    await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: { business_name: 'Diubah' } })
    });
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_base.business_name, 'Diubah');
  });
});

test('POST /api/config bisa mengganti knowledge_source ke business_asset', async () => {
  const root = baRoot();
  await withServer(MANUAL, async (base, configFile) => {
    await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
      })
    });
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_source.type, 'business_asset');
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
  });
});

test('mode business_asset dengan folder salah: GET tetap 200 dan menyebut errornya', async () => {
  const cfg = baConfig(baRoot());
  cfg.knowledge_source.business_asset.business_id = 'tidakada';
  await withServer(cfg, async (base) => {
    const res = await fetch(`${base}/api/config`);
    assert.strictEqual(res.status, 200);
    const r = await res.json();
    assert.ok(r._knowledge.error.includes('tidakada'));
  });
});

test('GET /api/blogs/:id/config ikut memakai resolver', async () => {
  await withServer(baConfig(baRoot()), async (base) => {
    const r = await (await fetch(`${base}/api/blogs/testblog/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
    assert.strictEqual(r._knowledge.source, 'business_asset');
  });
});

test('PUT /api/blogs/:id/config juga menolak knowledge_base di mode business_asset', async () => {
  await withServer(baConfig(baRoot()), async (base, configFile) => {
    const out = await (await fetch(`${base}/api/blogs/testblog/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: { business_name: 'DISUSUPI' } })
    })).json();
    assert.ok(out.warning && out.warning.includes('knowledge_base'));
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_base.business_name, 'Manual Inc');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test`
Expected: FAIL — `_knowledge` undefined, dan `knowledge_base` palsu tertulis ke disk.

- [ ] **Step 3: Ubah `scripts/routes/config.js`**

Tambahkan require di bagian atas berkas:

```js
const { resolveKnowledgeBase, sourceType } = require('../lib/knowledge');
```

dan ubah `stripCredentials` di baris require `config-merge` menjadi:

```js
const { deepMerge, stripCredentials, stripKnowledgeBase } = require('../lib/config-merge');
```

Tambahkan helper di bawah `withSeoDefaults`:

```js
// Ganti knowledge_base tersimpan dengan hasil resolusi (manual apa adanya,
// business_asset dibaca live), lalu lampirkan penanda sumber untuk UI.
function withResolvedKnowledge(cfg) {
  const { knowledge_base, source, error } = resolveKnowledgeBase(cfg);
  return { ...cfg, knowledge_base, _knowledge: { source, error } };
}
```

Di handler `GET /api/config`, pada cabang berkas config ADA, ganti:

```js
        const { clean: cfgClean } = stripCredentials(cfg);
        return res.json({ ...cfgClean, _credentials: credMarker });
```

menjadi:

```js
        const { clean: cfgClean } = stripCredentials(cfg);
        return res.json({ ...withResolvedKnowledge(cfgClean), _credentials: credMarker });
```

Pada cabang template, ganti:

```js
        const { clean: templateClean } = stripCredentials(clean);
        return res.json({ ...templateClean, _credentials: credMarker });
```

menjadi:

```js
        const { clean: templateClean } = stripCredentials(clean);
        return res.json({ ...withResolvedKnowledge(templateClean), _credentials: credMarker });
```

Di handler `POST /api/config`, ganti isi `try` menjadi:

```js
      const configFile = paths.configPath(requireBlog(req, paths));
      const stored = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf-8')) : {};
      // Mode ditentukan oleh knowledge_source yang DIKIRIM kalau ada, kalau
      // tidak oleh yang tersimpan — supaya perpindahan mode dan penyimpanan
      // knowledge_base bisa terjadi dalam satu POST tanpa saling menjegal.
      const effective = req.body?.knowledge_source ? req.body : stored;
      const { clean: noCred, ignored: credIgnored } = stripCredentials(req.body);
      const { clean, ignored: kbIgnored } = stripKnowledgeBase(noCred, sourceType(effective));
      const merged = deepMerge(stored, clean);
      fs.writeFileSync(configFile, JSON.stringify(merged, null, 2), 'utf-8');
      const out = { success: true, path: configFile };
      const notes = [];
      if (credIgnored.length) {
        notes.push(`Kredensial (${credIgnored.join(', ')}) diabaikan — set lewat .env, bukan lewat dashboard.`);
      }
      if (kbIgnored.length) {
        notes.push('knowledge_base diabaikan — sumbernya Business Asset, jadi datanya dibaca langsung dari sana.');
      }
      if (notes.length) out.warning = notes.join(' ');
      res.json(out);
```

- [ ] **Step 4: Ubah `scripts/routes/blogs.js`**

Tambahkan require:

```js
const { resolveKnowledgeBase, sourceType } = require('../lib/knowledge');
```

dan ubah require `config-merge` menjadi:

```js
const { deepMerge, stripCredentials, stripKnowledgeBase } = require('../lib/config-merge');
```

Di `GET /api/blogs/:id/config`, ganti:

```js
      const { clean } = stripCredentials(raw);
      const credMarker = { wpPasswordSet: !!process.env[envKeys(req.params.id).wpPassword] };
      res.json({ ...clean, _credentials: credMarker });
```

menjadi:

```js
      const { clean } = stripCredentials(raw);
      const { knowledge_base, source, error } = resolveKnowledgeBase(clean);
      const credMarker = { wpPasswordSet: !!process.env[envKeys(req.params.id).wpPassword] };
      res.json({ ...clean, knowledge_base, _knowledge: { source, error }, _credentials: credMarker });
```

Di `PUT /api/blogs/:id/config`, ganti:

```js
      const { clean, ignored } = stripCredentials(req.body);
      const merged = deepMerge(stored, clean);
```

menjadi:

```js
      const effective = req.body?.knowledge_source ? req.body : stored;
      const { clean: noCred, ignored } = stripCredentials(req.body);
      const { clean, ignored: kbIgnored } = stripKnowledgeBase(noCred, sourceType(effective));
      const merged = deepMerge(stored, clean);
```

Lalu di perakitan `out` pada handler yang sama, setelah baris yang mengisi `out.warning` dari `ignored`, tambahkan penggabungan pesan `knowledge_base`. Baca kode sekitarnya dan sesuaikan bentuknya; syaratnya: kalau `kbIgnored.length`, `out.warning` harus memuat kata `knowledge_base`.

- [ ] **Step 5: Jalankan test, pastikan lolos**

Run: `npm test`
Expected: PASS, termasuk test route lama.

- [ ] **Step 6: Commit**

```bash
git add scripts/routes/config.js scripts/routes/blogs.js scripts/routes/config.test.js
git commit -m "feat(kb): route config memakai resolver sumber knowledge base"
```

---

### Task 5: `routes/knowledge-source.js` — daftar bisnis

**Files:**
- Create: `scripts/routes/knowledge-source.js`
- Modify: `scripts/server.js` (daftarkan route)
- Test: `scripts/routes/knowledge-source.test.js`

**Interfaces:**
- Consumes: `resolveKnowledgeBase` dari `../lib/knowledge`; `resolveBlog` dari `../lib/tenant`
- Produces:
  - `GET /api/business-assets?root=<path>` → `{ businesses: [{ id, name, productCount }], error: string|null }`
  - `GET /api/knowledge-preview[?blog=<id>]` → `{ source, error, summary: { products, internal_links, tone } }`

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/routes/knowledge-source.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function baRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-ba-'));
  for (const [id, nama, n] of [['perkapcom', 'Perkap.com', 2], ['karvaid', 'Karva.id', 1]]) {
    const dir = path.join(root, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ nama, toneOfVoice: 'santai' }));
    fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify(
      Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nama: `Produk ${i}`, konteks: '' }))
    ));
  }
  // Folder yang BUKAN business asset — tidak boleh ikut terdaftar.
  fs.mkdirSync(path.join(root, 'bukan-bisnis'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bukan-bisnis', 'catatan.txt'), 'rahasia');
  return root;
}

function setupApp(configObj) {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), JSON.stringify(configObj, null, 2));
  const app = express();
  app.use(express.json());
  require('./knowledge-source')(app, { paths: makePaths(skillDir) });
  return app;
}

async function withServer(configObj, fn) {
  const app = setupApp(configObj);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('daftar bisnis hanya folder yang punya profile.json', async () => {
  const root = baRoot();
  await withServer({}, async (base) => {
    const r = await (await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`)).json();
    const ids = r.businesses.map(b => b.id).sort();
    assert.deepStrictEqual(ids, ['karvaid', 'perkapcom']);
    assert.ok(!ids.includes('bukan-bisnis'));
  });
});

test('daftar bisnis menyertakan nama dan jumlah produk', async () => {
  const root = baRoot();
  await withServer({}, async (base) => {
    const r = await (await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`)).json();
    const p = r.businesses.find(b => b.id === 'perkapcom');
    assert.strictEqual(p.name, 'Perkap.com');
    assert.strictEqual(p.productCount, 2);
  });
});

test('root tidak ada: 200, daftar kosong, pesan menyebut path', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/business-assets?root=${encodeURIComponent('Z:/tidak/ada')}`);
    assert.strictEqual(res.status, 200);
    const r = await res.json();
    assert.deepStrictEqual(r.businesses, []);
    assert.ok(r.error && r.error.includes('tidak/ada'));
  });
});

test('root kosong: 400 dengan pesan, bukan membaca direktori kerja', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/business-assets`);
    assert.strictEqual(res.status, 400);
  });
});

test('daftar bisnis tidak pernah membocorkan isi berkas lain', async () => {
  const root = baRoot();
  await withServer({}, async (base) => {
    const body = await (await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`)).text();
    assert.ok(!body.includes('rahasia'));
  });
});

test('preview melaporkan ringkasan tenant aktif', async () => {
  const root = baRoot();
  await withServer({
    wordpress: { url: 'https://perkap.com' },
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  }, async (base) => {
    const r = await (await fetch(`${base}/api/knowledge-preview`)).json();
    assert.strictEqual(r.source, 'business_asset');
    assert.strictEqual(r.error, null);
    assert.strictEqual(r.summary.products, 2);
    assert.strictEqual(r.summary.tone, 'casual');
  });
});

test('preview mode manual tetap menjawab tanpa error', async () => {
  await withServer({ knowledge_base: { business_name: 'Manual', products: [{ name: 'A' }] } },
    async (base) => {
      const r = await (await fetch(`${base}/api/knowledge-preview`)).json();
      assert.strictEqual(r.source, 'manual');
      assert.strictEqual(r.summary.products, 1);
    });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test`
Expected: FAIL — `Cannot find module './knowledge-source'`

- [ ] **Step 3: Tulis implementasinya**

Buat `scripts/routes/knowledge-source.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { resolveKnowledgeBase } = require('../lib/knowledge');
const { resolveBlog } = require('../lib/tenant');

module.exports = function registerKnowledgeSource(app, deps) {
  const { paths } = deps;

  // Endpoint ini menerima path sembarang dari browser, jadi ia sengaja dibatasi:
  // hanya nama subfolder yang memuat profile.json, nama bisnis, dan jumlah
  // produk. Tidak menuruni pohon direktori, tidak mengembalikan isi berkas lain.
  app.get('/api/business-assets', (req, res) => {
    const root = String(req.query.root || '').trim();
    if (!root) return res.status(400).json({ error: 'Parameter "root" wajib diisi.', businesses: [] });

    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      return res.json({ businesses: [], error: `Folder tidak terbaca: ${root} (${e.code || e.message})` });
    }

    const businesses = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      if (!fs.existsSync(path.join(dir, 'profile.json'))) continue;
      let name = entry.name;
      let productCount = 0;
      try {
        name = JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf-8')).nama || entry.name;
      } catch (e) { /* profil rusak: pakai nama folder */ }
      try {
        const list = JSON.parse(fs.readFileSync(path.join(dir, 'products.json'), 'utf-8'));
        productCount = Array.isArray(list) ? list.length : 0;
      } catch (e) { /* products hilang atau rusak: 0 */ }
      businesses.push({ id: entry.name, name, productCount });
    }

    businesses.sort((a, b) => a.id.localeCompare(b.id));
    const error = businesses.length ? null : `Tidak ada business asset di ${root}.`;
    res.json({ businesses, error });
  });

  app.get('/api/knowledge-preview', (req, res) => {
    try {
      const blogId = resolveBlog(req, paths);
      const file = paths.configPath(blogId);
      const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
      const { knowledge_base, source, error } = resolveKnowledgeBase(cfg);
      res.json({
        source,
        error,
        summary: {
          products: knowledge_base.products.length,
          internal_links: knowledge_base.internal_links.length,
          tone: knowledge_base.tone
        }
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message });
    }
  });
};
```

- [ ] **Step 4: Daftarkan di `scripts/server.js`**

Setelah baris `require('./routes/blogs')(app, deps);`, tambahkan:

```js
require('./routes/knowledge-source')(app, deps);
```

- [ ] **Step 5: Jalankan test, pastikan lolos**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/routes/knowledge-source.js scripts/routes/knowledge-source.test.js scripts/server.js
git commit -m "feat(kb): endpoint daftar business asset dan pratinjau"
```

---

### Task 6: `blog-config.js` — subperintah `product`

**Files:**
- Modify: `scripts/blog-config.js`

**Interfaces:**
- Consumes: `resolveKnowledgeBase`, `sourceType` dari `./lib/knowledge`; `readBusinessAsset`, `findProduct`, `extractProductUrl` dari `./lib/business-asset`
- Produces: CLI `node scripts/blog-config.js product "<id-atau-nama>"` mencetak JSON `{ id, name, price, url, target_market, context, faq }`

- [ ] **Step 1: Ubah `scripts/blog-config.js`**

Tambahkan require di bawah require `paths`:

```js
const { resolveKnowledgeBase, sourceType } = require('./lib/knowledge');
const { readBusinessAsset, findProduct, extractProductUrl } = require('./lib/business-asset');
```

Perbarui blok komentar pemakaian di bagian atas berkas menjadi:

```js
// Pemakaian:
//   node scripts/blog-config.js                    → seluruh config
//   node scripts/blog-config.js knowledge_base     → satu bagian saja
//   node scripts/blog-config.js --id               → id tenant aktif
//   node scripts/blog-config.js product "Sewa HT"  → satu produk LENGKAP
//                                                    (harga, konteks, faq)
//
// Kredensial TIDAK pernah ikut tercetak.
```

Setelah baris yang membaca `cfg` dari disk dan menghapus kredensial, dan **sebelum** blok `if (arg && !(arg in cfg))`, sisipkan:

```js
// Produk LENGKAP: hanya lewat subperintah ini, tidak pernah lewat
// knowledge_base — konteks 45 produk berukuran ratusan kilobita.
if (arg === 'product') {
  const q = process.argv[3];
  if (!q) {
    console.error('❌ Sebutkan produknya: node scripts/blog-config.js product "Sewa HT"');
    process.exit(1);
  }
  if (sourceType(cfg) !== 'business_asset') {
    console.error('❌ Detail produk hanya tersedia kalau knowledge base bersumber dari Business Asset.');
    process.exit(1);
  }
  const ba = cfg.knowledge_source.business_asset || {};
  let found;
  try {
    const { products } = readBusinessAsset(ba.root, ba.business_id);
    found = findProduct(products, q);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  if (!found) {
    console.error(`❌ Produk "${q}" tidak ditemukan di business asset "${ba.business_id}".`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    id: found.id || '',
    name: found.nama || '',
    price: found.harga || '',
    url: extractProductUrl(found.konteks, cfg.wordpress?.url || ''),
    target_market: found.targetMarket || '',
    context: found.konteks || '',
    faq: found.faq || ''
  }, null, 2));
  process.exit(0);
}

// knowledge_base yang dicetak harus hasil resolusi, bukan isi mentah config:
// di mode business_asset, isi mentahnya cadangan lama yang sudah tidak dipakai.
const resolved = resolveKnowledgeBase(cfg);
if (resolved.error) {
  console.error(`❌ Knowledge base tidak terbaca: ${resolved.error}`);
  process.exit(1);
}
cfg.knowledge_base = resolved.knowledge_base;
```

- [ ] **Step 2: Verifikasi manual mode manual (tenant perkap masih manual pada titik ini)**

```bash
node scripts/blog-config.js knowledge_base
```
Expected: JSON knowledge base tercetak seperti sebelumnya, ditambah `avoid_words: []`.

```bash
node scripts/blog-config.js product "apa saja"
```
Expected: keluar dengan kode 1 dan pesan bahwa detail produk butuh sumber Business Asset.

- [ ] **Step 3: Jalankan test**

Run: `npm test`
Expected: PASS (tidak ada test baru di task ini; pastikan tidak ada yang rusak).

- [ ] **Step 4: Commit**

```bash
git add scripts/blog-config.js
git commit -m "feat(kb): subperintah product untuk detail produk lengkap"
```

---

### Task 7: UI pemilih sumber knowledge base

**Files:**
- Modify: `public/index.html` (sisipkan kartu sebelum kartu "Auto-fill from Website" di `#page-knowledge`)
- Modify: `public/js/app.js`

**Interfaces:**
- Consumes: `GET /api/config` (`_knowledge`), `GET /api/business-assets?root=`, `POST /api/config`
- Produces: —

- [ ] **Step 1: Tambahkan kartu di `public/index.html`**

Cari komentar `<!-- Scrape from Website -->` di dalam `<div id="page-knowledge" class="page">` dan sisipkan **tepat sebelumnya**:

```html
    <!-- Sumber Knowledge Base -->
    <div class="card">
      <div class="card-header">
        <h3>📚 Sumber Knowledge Base</h3>
      </div>
      <div class="card-body">
        <div class="radio-group" id="ks-type-group" style="display:flex; gap:10px; margin-bottom:14px;">
          <label class="radio-btn selected">
            <input type="radio" name="ks-type" value="manual" checked onchange="onKsTypeChange('manual')">
            <span>✍️ Input manual</span>
          </label>
          <label class="radio-btn">
            <input type="radio" name="ks-type" value="business_asset" onchange="onKsTypeChange('business_asset')">
            <span>📦 Business Asset</span>
          </label>
        </div>

        <div id="ks-ba-fields" style="display:none;">
          <div class="form-group">
            <label>Folder root data bisnis</label>
            <div style="display:flex; gap:8px;">
              <input type="text" id="ks-root" style="flex:1;"
                     placeholder="G:\Project\...\sosmed_content\data\businesses">
              <button class="btn btn-secondary" onclick="ksLoadBusinesses()" style="white-space:nowrap;">Muat</button>
            </div>
          </div>
          <div class="form-group">
            <label>Bisnis</label>
            <select id="ks-business" onchange="ksOnBusinessChange()"></select>
          </div>
          <div id="ks-status" style="font-size:13px; margin-top:8px;"></div>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Tambahkan logika di `public/js/app.js`**

Tambahkan di bagian bawah berkas:

```js
// ==================== SUMBER KNOWLEDGE BASE ====================
function ksCurrentType() {
  return document.querySelector('#ks-type-group input:checked')?.value || 'manual';
}

function onKsTypeChange(type) {
  document.querySelectorAll('#ks-type-group .radio-btn').forEach(el => {
    el.classList.toggle('selected', el.querySelector('input')?.value === type);
  });
  document.getElementById('ks-ba-fields').style.display = type === 'business_asset' ? '' : 'none';
  applyKnowledgeReadonly(type === 'business_asset');
  markChanged();
}

// Di mode business_asset seluruh field knowledge base dikunci: isinya hasil
// baca live, dan menyimpan hasil bacaan itu balik ke config akan membekukannya.
function applyKnowledgeReadonly(readonly) {
  const page = document.getElementById('page-knowledge');
  if (!page) return;
  page.querySelectorAll('input, textarea, select, button').forEach(el => {
    if (el.closest('#ks-type-group') || el.closest('#ks-ba-fields')) return;
    // Tombol di save-bar diurus terpisah di bawah — jangan ikut dimatikan di sini.
    if (el.closest('.save-bar')) return;
    if (el.tagName === 'BUTTON') el.disabled = readonly;
    else if (el.type === 'radio' || el.type === 'checkbox') el.disabled = readonly;
    else { el.readOnly = readonly; el.disabled = readonly; }
  });
  const scrapeCard = document.getElementById('scrape-url')?.closest('.card');
  if (scrapeCard) scrapeCard.style.display = readonly ? 'none' : '';
  // Tombol Save TETAP hidup: ia satu-satunya jalan menyimpan knowledge_source
  // (pilihan mode dan bisnis). Yang dikunci cuma field knowledge base-nya.
  // Server sudah membuang knowledge_base kiriman browser di mode ini, jadi
  // menekan Save aman — labelnya diganti supaya jelas apa yang tersimpan.
  const saveBtn = document.querySelector('#page-knowledge .save-bar .btn-primary');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = readonly ? '💾 Simpan Sumber' : '💾 Save Knowledge Base';
  }
}

async function ksLoadBusinesses(selectId) {
  const root = getVal('ks-root');
  const sel = document.getElementById('ks-business');
  const status = document.getElementById('ks-status');
  if (!root) { status.innerHTML = '<span style="color:var(--danger)">Isi folder root dulu.</span>'; return; }
  try {
    const r = await (await fetch('/api/business-assets?root=' + encodeURIComponent(root))).json();
    sel.innerHTML = (r.businesses || []).map(b =>
      `<option value="${escHtml(b.id)}">${escHtml(b.name)} (${b.productCount} produk)</option>`).join('');
    if (selectId) sel.value = selectId;
    status.innerHTML = r.error
      ? `<span style="color:var(--danger)">${escHtml(r.error)}</span>`
      : `<span style="color:var(--text-secondary)">${r.businesses.length} bisnis ditemukan.</span>`;
  } catch (e) {
    status.innerHTML = `<span style="color:var(--danger)">${escHtml(e.message)}</span>`;
  }
}

function ksOnBusinessChange() { markChanged(); }

// Dipanggil dari populateForm(): pasang keadaan UI dari config yang dimuat.
function populateKnowledgeSource(c) {
  const type = c.knowledge_source?.type === 'business_asset' ? 'business_asset' : 'manual';
  const radio = document.querySelector(`#ks-type-group input[value="${type}"]`);
  if (radio) radio.checked = true;
  setVal('ks-root', c.knowledge_source?.business_asset?.root || '');
  onKsTypeChange(type);

  const status = document.getElementById('ks-status');
  if (type === 'business_asset') {
    ksLoadBusinesses(c.knowledge_source?.business_asset?.business_id);
    if (c._knowledge?.error) {
      status.innerHTML = `<span style="color:var(--danger)">⚠️ ${escHtml(c._knowledge.error)}</span>`;
    } else {
      const kb = c.knowledge_base || {};
      status.innerHTML = `<span style="color:var(--success, green)">✅ Terbaca: ` +
        `${(kb.products || []).length} produk · ${(kb.internal_links || []).length} internal link · ` +
        `tone ${escHtml(kb.tone || '')}</span>`;
    }
  }
}

// Bagian knowledge_source yang ikut dikirim saat Save.
function collectKnowledgeSource() {
  const type = ksCurrentType();
  if (type !== 'business_asset') return { type: 'manual' };
  return {
    type: 'business_asset',
    business_asset: {
      root: getVal('ks-root'),
      business_id: document.getElementById('ks-business')?.value || ''
    }
  };
}
```

Di `populateForm`, setelah baris `renderCustomEntries(...)`, tambahkan:

```js
  populateKnowledgeSource(c);
```

Di `collectForm`, di dalam objek yang dikembalikan, tambahkan setelah blok `knowledge_base: { ... },`:

```js
    knowledge_source: collectKnowledgeSource(),
```

Di `updateStatusDot(c)`, ganti baris `const hasKB = ...` menjadi:

```js
  const hasKB = c.knowledge_base?.business_name && !c._knowledge?.error;
```

Di `saveConfig`, setelah `const result = await res.json();` dan di dalam cabang `if (result.success)`, ganti baris `config = { ...data, _credentials: config._credentials };` menjadi:

```js
      // Muat ulang dari server, bukan memakai `data` mentah: di mode
      // business_asset knowledge_base yang dikirim memang dibuang server,
      // jadi kalau dipakai apa adanya layar menampilkan data yang tidak tersimpan.
      await loadConfig();
```

- [ ] **Step 3: Verifikasi manual di dashboard**

```bash
npm start
```

Buka `http://localhost:3847` → tab Knowledge Base. Yang harus terjadi:

1. Kartu "Sumber Knowledge Base" muncul di paling atas, "Input manual" terpilih.
2. Field knowledge base masih bisa diketik; tombol Save aktif.
3. Pilih "Business Asset" → field root + dropdown muncul, seluruh field di bawahnya redup, kartu Auto-fill hilang, tombol Save berubah jadi "Sumber: Business Asset" dan mati.
4. Isi root dengan `G:\Project\Paperclip\Perkap_com\project\sosmed_content\data\businesses`, tekan Muat → dropdown berisi **Perkap.com (45 produk)** dan **Karva.id (7 produk)**.
5. Pilih Perkap.com, tekan **💾 Simpan Sumber** di save-bar. Tombol ini harus hidup —
   kalau mati, mode business_asset tidak bisa disimpan sama sekali dan itu cacat yang
   dilaporkan sebagai BLOCKED, bukan didiamkan.
6. Muat ulang halaman → daftar produk berisi 45 baris, status hijau menyebut jumlah produk
   dan internal link, dan pilihan Business Asset tetap terpilih setelah muat ulang.

Catat hasilnya di laporan.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/js/app.js
git commit -m "feat(kb): pemilih sumber knowledge base di dashboard"
```

---

### Task 8: Agent, SKILL.md, template, dan agenda

**Files:**
- Modify: `agents/article-writer.md`
- Modify: `agents/topic-researcher.md`
- Modify: `config.template.json`
- Modify: `docs/AGENDA.md`

**Interfaces:**
- Consumes: CLI `node scripts/blog-config.js product "<nama>"` dari Task 6
- Produces: —

- [ ] **Step 1: Tambahkan bagian detail produk di `agents/article-writer.md`**

Tepat sebelum bagian `### Prohibited Content`, sisipkan:

```markdown
### Detail Produk (kalau artikel membahas satu produk)

`knowledge_base.products` sengaja ringkas: nama, URL, harga, target market. Spesifikasi
lengkap, cara pakai, dan FAQ TIDAK ikut di sana karena ukurannya ratusan kilobita untuk
seluruh katalog.

Kalau artikel yang ditulis membahas satu produk tertentu, ambil detailnya:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js product "Sewa HT"
```

Hasilnya: `{ id, name, price, url, target_market, context, faq }`.

- `context` — spesifikasi, varian, cara kerja. Pakai untuk bagian teknis artikel.
- `faq` — pertanyaan yang benar-benar sering ditanya pembeli. Boleh diangkat jadi bagian
  FAQ di artikel, tapi tulis ulang dengan gaya artikel, jangan disalin mentah.
- `price` — harga asli. Sebutkan kalau relevan; jangan mengarang harga sendiri.

Perintah ini hanya bekerja kalau knowledge base bersumber dari Business Asset. Kalau ia
menjawab bahwa sumbernya bukan Business Asset, lanjutkan menulis dengan `knowledge_base`
yang ada — itu bukan kegagalan.

### Kata yang Dihindari

Jangan pakai kata mana pun yang ada di `knowledge_base.avoid_words`, termasuk bentuk
berimbuhannya. Ini soal pilihan kata, bukan soal topik — topik yang mengandungnya tetap
boleh ditulis, hanya katanya yang diganti dengan padanan lain.
```

- [ ] **Step 2: Perbarui `agents/topic-researcher.md`**

Cari baris `  - \`products\` — their offerings (mention these naturally in ideas)` dan ganti menjadi:

```markdown
  - `products` — their offerings (mention these naturally in ideas). Daftarnya bisa
    panjang (puluhan produk kalau bersumber dari Business Asset) — pilih yang relevan
    dengan keyword, jangan menyebut semuanya.
```

- [ ] **Step 3: Tambahkan `knowledge_source` di `config.template.json`**

Tepat sebelum kunci `"knowledge_base"`, sisipkan:

```json
  "knowledge_source": {
    "type": "manual",
    "_type_options": [
      "manual",
      "business_asset"
    ],
    "_note": "manual = isi knowledge_base di bawah lewat dashboard. business_asset = dibaca langsung dari data skill business-asset; knowledge_base di bawah diabaikan dan disimpan sebagai cadangan.",
    "business_asset": {
      "root": "",
      "business_id": ""
    }
  },
```

- [ ] **Step 4: Tandai fitur 8 selesai di `docs/AGENDA.md`**

Ganti seluruh bagian `## 8. Product knowledge` menjadi:

```markdown
## 8. Product knowledge — SELESAI (2026-09-03)

Dikerjakan lewat sumber knowledge base Business Asset:
`docs/superpowers/specs/2026-09-03-knowledge-source-business-asset-design.md`.

Produk lengkap (spesifikasi, harga, FAQ) diambil per produk lewat
`node scripts/blog-config.js product "<nama>"`, bukan disimpan ulang di autoblog.
```

- [ ] **Step 5: Verifikasi tidak ada rujukan yang telanjur salah**

```bash
grep -rn "blog-config.js product" agents/ SKILL.md docs/
grep -rn "avoid_words" agents/ scripts/
```
Expected: perintah `product` disebut di `article-writer.md`; `avoid_words` muncul di `article-writer.md`, `lib/knowledge.js`, dan `lib/business-asset.js`.

- [ ] **Step 6: Commit**

```bash
git add agents/article-writer.md agents/topic-researcher.md config.template.json docs/AGENDA.md
git commit -m "docs(kb): agent memakai detail produk dan avoid_words"
```

---

### Task 9: Verifikasi ujung-ke-ujung dengan data perkap sungguhan

**Files:**
- Modify: `data/blogs/perkapcom/config.json` (lewat dashboard, bukan editor)

**Interfaces:**
- Consumes: seluruh task sebelumnya
- Produces: laporan hasil verifikasi

**Catatan:** task ini mengubah data tenant hidup. Sebelum mulai, salin `data/blogs/perkapcom/config.json` ke `config.json.bak-<tanggal>` **di luar repo** (folder ini tidak dilacak git, jadi tidak ada jaring pengaman lain).

- [ ] **Step 1: Cadangkan config tenant**

```bash
cp data/blogs/perkapcom/config.json "$TEMP/perkapcom-config-backup.json"
```

- [ ] **Step 2: Jalankan server dan ganti sumber lewat dashboard**

```bash
npm start
```

Di tab Knowledge Base: pilih Business Asset, root
`G:\Project\Paperclip\Perkap_com\project\sosmed_content\data\businesses`, bisnis Perkap.com, simpan.

- [ ] **Step 3: Kumpulkan bukti**

```bash
curl -s http://localhost:3847/api/config > /tmp/kb-check.json
node -e "const c=require('/tmp/kb-check.json'); console.log('produk:',c.knowledge_base.products.length); console.log('links:',c.knowledge_base.internal_links.length); console.log('nama:',c.knowledge_base.business_name); console.log('tone:',c.knowledge_base.tone); console.log('avoid:',JSON.stringify(c.knowledge_base.avoid_words)); console.log('sumber:',c._knowledge.source, c._knowledge.error);"
grep -c "yourblog.com" /tmp/kb-check.json || echo "yourblog.com: 0 (benar)"
grep -c "konteks" /tmp/kb-check.json || echo "konteks: 0 (benar)"
```

Expected: 45 produk, 27 internal link (sudah dedup — beberapa produk berbagi satu halaman), nama `Perkap.com`, tone `casual`, `avoid_words` berisi `Termurah`, sumber `business_asset` tanpa error, tidak ada `yourblog.com`, tidak ada `konteks`.

- [ ] **Step 4: Uji live read**

Ubah `tagline` di
`G:\Project\Paperclip\Perkap_com\project\sosmed_content\data\businesses\perkapcom\profile.json`
(mis. tambahkan ` TES`), lalu muat ulang dashboard. Nama/deskripsi harus ikut berubah **tanpa** import apa pun. **Kembalikan nilainya seperti semula setelah diuji** — ini data hidup milik agent sosmed content.

- [ ] **Step 5: Uji detail produk**

```bash
node scripts/blog-config.js product "Bel Cerdas Cermat"
```
Expected: JSON memuat `context` panjang dan `faq`; `price` terisi.

- [ ] **Step 6: Uji bahwa business asset tidak pernah ditulis**

```bash
cd "G:/Project/Paperclip/Perkap_com/project/sosmed_content/data/businesses/perkapcom"
ls -la --time-style=full-iso profile.json products.json
```
Expected: waktu ubah tidak berubah oleh langkah-langkah di atas (selain perubahan sengaja di Step 4 yang sudah dikembalikan).

- [ ] **Step 7: Uji Playwright dari UI**

Pakai **sesi browser Playwright yang sudah terbuka** — jangan membuka sesi baru. Ambil tangkapan layar tab Knowledge Base yang memperlihatkan: pemilih sumber di mode Business Asset, dropdown berisi Perkap.com, status hijau, dan daftar 45 produk dalam keadaan terkunci.

- [ ] **Step 8: Jalankan seluruh test sekali lagi**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore(kb): tenant perkapcom memakai sumber business asset"
```

Kalau `git status` tidak menunjukkan apa pun untuk dicommit (config tenant tidak dilacak git), lewati commit dan catat itu di laporan.
