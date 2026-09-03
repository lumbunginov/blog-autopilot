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

test('profile.json sah sebagai JSON tapi bukan objek ditolak, bukan lolos senyap', () => {
  const root = fixture();
  for (const isi of ['"cuma teks"', '[]', 'null', '42']) {
    fs.writeFileSync(path.join(root, 'perkapcom', 'profile.json'), isi);
    assert.throws(() => readBusinessAsset(root, 'perkapcom'), /profile\.json bukan objek/,
      `isi ${isi} seharusnya ditolak`);
  }
});

test('products.json berupa objek ditolak, bukan diam-diam jadi daftar kosong', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'perkapcom', 'products.json'), '{"nama":"x"}');
  assert.throws(() => readBusinessAsset(root, 'perkapcom'), /products\.json bukan daftar/);
});
