#!/usr/bin/env node
'use strict';
// Cetak config tenant aktif sebagai JSON. Dipakai SKILL.md dan agent
// supaya markdown tidak perlu tahu letak berkasnya.
//
// Pemakaian:
//   node scripts/blog-config.js                    → seluruh config
//   node scripts/blog-config.js knowledge_base     → satu bagian saja
//   node scripts/blog-config.js --id               → id tenant aktif
//   node scripts/blog-config.js product "Sewa HT"  → satu produk LENGKAP
//                                                    (harga, konteks, faq)
//   node scripts/blog-config.js product-image "judul artikel"
//                                                    → foto referensi produk,
//                                                      dicocokkan dari JUDUL
//                                                      (selalu keluar kode 0)
//   node scripts/blog-config.js product-image --produk "Nama Produk Persis"
//                                                    → sama, tapi nama produk
//                                                      eksplisit (tidak menebak)
//
// Kredensial TIDAK pernah ikut tercetak.

const fs = require('fs');
const path = require('path');
const { makePaths } = require('./lib/paths');
const { resolveKnowledgeBase, sourceType } = require('./lib/knowledge');
const { readBusinessAsset, findProduct, extractProductUrl, mapProducts } = require('./lib/business-asset');
const { matchProduct } = require('./lib/product-match');
const { findTemplate } = require('./lib/template-store');
const { buildVars, resolveVars } = require('./lib/template-vars');
const { punyaRiset, resolveRiset } = require('./lib/riset');
const { askOpenAI } = require('./lib/openai-text');
const { envKeys, loadDotEnv } = require('./lib/env');

const paths = makePaths(path.join(__dirname, '..'));
// Kunci teks untuk blok {riset} hanya ada di .env. Subperintah lain tidak
// membutuhkannya, tapi memuat di sini lebih murah daripada memuat bersyarat.
loadDotEnv(path.join(__dirname, '..', '.env'));
const id = paths.activeBlog();
if (!id) {
  console.error('❌ Belum ada blog. Buka dashboard lalu buat satu, atau jalankan scripts/import-blog.js.');
  process.exit(1);
}

const arg = process.argv[2];
if (arg === '--id') { console.log(id); process.exit(0); }

const cfgPath = paths.configPath(id);
if (!fs.existsSync(cfgPath)) {
  console.error(`❌ Config tenant "${id}" tidak ada: ${cfgPath}`);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
if (cfg.wordpress) delete cfg.wordpress.app_password;
if (cfg.image_api) delete cfg.image_api.api_key;

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
  process.exit(0);
}

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

// Cari foto referensi untuk artikel. SELALU keluar dengan kode 0 dan JSON
// yang bisa dibaca: gambar hilang tidak boleh menggagalkan penulisan artikel.
if (arg === 'product-image') {
  const keluar = (obj) => { console.log(JSON.stringify(obj)); process.exit(0); };

  // `--produk "Nama Persis"` = nama produk eksplisit (jalur eksak, tidak
  // menebak). Tanpa flag itu, argumennya JUDUL ARTIKEL (jalur pencocokan
  // judul/kata). Dua field ini beda arti bagi matchProduct — mengisi
  // productName dengan judul artikel membuat aturan "tak dikenal → null"
  // menggigit duluan dan jalur judul tidak pernah tercapai (lihat commit
  // fix berikutnya: itu yang terjadi sebelum pemisahan ini).
  let opsiCocok;
  if (process.argv[3] === '--produk') {
    opsiCocok = { productName: process.argv[4] || '' };
  } else {
    opsiCocok = { title: process.argv[3] || '' };
  }

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
  const cocok = matchProduct(ringkas, opsiCocok);
  const q = opsiCocok.productName ?? opsiCocok.title;
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

// knowledge_base yang dicetak harus hasil resolusi, bukan isi mentah config:
// di mode business_asset, isi mentahnya cadangan lama yang sudah tidak dipakai.
//
// Kegagalan membaca business asset HANYA mematikan permintaan yang memang butuh
// knowledge base. `blog-config.js wordpress` dipakai SKILL.md untuk mendiagnosis
// kesehatan config — kalau ia ikut mati saat business asset rusak, agent membaca
// kegagalan itu sebagai "tenant belum disiapkan" dan menyesatkan diagnosisnya
// justru saat paling dibutuhkan.
const resolved = resolveKnowledgeBase(cfg);
const butuhKb = !arg || arg === 'knowledge_base';
if (resolved.error && butuhKb) {
  console.error(`❌ Knowledge base tidak terbaca: ${resolved.error}`);
  process.exit(1);
}
cfg.knowledge_base = resolved.knowledge_base;

if (arg && !(arg in cfg)) {
  console.error(`❌ Bagian "${arg}" tidak ada. Bagian tersedia: ${Object.keys(cfg).join(', ')}`);
  process.exit(1);
}

console.log(JSON.stringify(arg ? cfg[arg] : cfg, null, 2));
