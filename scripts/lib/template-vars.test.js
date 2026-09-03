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
