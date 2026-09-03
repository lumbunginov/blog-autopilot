#!/usr/bin/env node
'use strict';
// Cetak config tenant aktif sebagai JSON. Dipakai SKILL.md dan agent
// supaya markdown tidak perlu tahu letak berkasnya.
//
// Pemakaian:
//   node scripts/blog-config.js                 → seluruh config
//   node scripts/blog-config.js knowledge_base  → satu bagian saja
//   node scripts/blog-config.js --id            → id tenant aktif
//
// Kredensial TIDAK pernah ikut tercetak.

const fs = require('fs');
const path = require('path');
const { makePaths } = require('./lib/paths');

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

if (arg && !(arg in cfg)) {
  console.error(`❌ Bagian "${arg}" tidak ada. Bagian tersedia: ${Object.keys(cfg).join(', ')}`);
  process.exit(1);
}

console.log(JSON.stringify(arg ? cfg[arg] : cfg, null, 2));
