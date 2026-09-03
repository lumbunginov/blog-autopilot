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
//
// Kredensial TIDAK pernah ikut tercetak.

const fs = require('fs');
const path = require('path');
const { makePaths } = require('./lib/paths');
const { resolveKnowledgeBase, sourceType } = require('./lib/knowledge');
const { readBusinessAsset, findProduct, extractProductUrl } = require('./lib/business-asset');

const paths = makePaths(path.join(__dirname, '..'));
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
    url: extractProductUrl(found.konteks, cfg.wordpress?.url || ''),
    target_market: found.targetMarket || '',
    context: found.konteks || '',
    faq: found.faq || ''
  }, null, 2));
  process.exit(0);
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
