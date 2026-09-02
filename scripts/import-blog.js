#!/usr/bin/env node
'use strict';
// Impor instalasi blog-autopilot lama jadi satu tenant.
// Pemakaian: node scripts/import-blog.js "<folder-sumber>" <id-tenant>
//
// Password dan API key TIDAK ditulis ke berkas mana pun — dicetak ke layar
// supaya kamu sendiri yang menempelkannya ke .env.

const fs = require('fs');
const path = require('path');
const { makePaths, sanitizeId } = require('./lib/paths');

const [srcArg, idArg] = process.argv.slice(2);
if (!srcArg || !idArg) {
  console.error('Pemakaian: node scripts/import-blog.js "<folder-sumber>" <id-tenant>');
  process.exit(1);
}
if (!fs.existsSync(srcArg)) {
  console.error(`❌ Folder sumber tidak ada: ${srcArg}`);
  process.exit(1);
}

const id = sanitizeId(idArg);
const paths = makePaths(path.join(__dirname, '..'));

if (paths.listBlogs().includes(id)) {
  console.error(`❌ Tenant "${id}" sudah ada. Hapus dulu data/blogs/${id} kalau ingin impor ulang.`);
  process.exit(1);
}

const srcConfig = path.join(srcArg, 'blog-autopilot-config.json');
if (!fs.existsSync(srcConfig)) {
  console.error(`❌ Tidak ada blog-autopilot-config.json di ${srcArg}`);
  console.error('   Berkas ini ada di ROOT project instalasi lama, bukan di dalam .claude/skills/.');
  process.exit(1);
}

fs.mkdirSync(paths.blogDir(id), { recursive: true });

const cfg = JSON.parse(fs.readFileSync(srcConfig, 'utf-8'));
const prefix = id.toUpperCase().replace(/-/g, '_');
const secrets = [];

if (cfg.wordpress?.app_password) {
  secrets.push([`${prefix}_WP_APP_PASSWORD`, cfg.wordpress.app_password]);
  delete cfg.wordpress.app_password;
}
if (cfg.image_api?.api_key) {
  secrets.push([`${prefix}_IMAGE_API_KEY`, cfg.image_api.api_key]);
  delete cfg.image_api.api_key;
}

fs.writeFileSync(paths.configPath(id), JSON.stringify(cfg, null, 2), 'utf-8');
console.log(`✅ config.json  → data/blogs/${id}/config.json`);

const copies = [
  ['articles-cache.json', paths.cachePath(id)],
  ['article-plans.json', paths.plansPath(id)],
  ['agent-queue.json', paths.queuePath(id)]
];
for (const [name, dest] of copies) {
  const src = path.join(srcArg, name);
  if (!fs.existsSync(src)) { console.log(`⏭️  ${name} tidak ada di sumber, dilewati`); continue; }
  fs.copyFileSync(src, dest);
  let info = '';
  try {
    const d = JSON.parse(fs.readFileSync(dest, 'utf-8'));
    const n = (d.articles || d.plans || d.tasks || []).length;
    info = ` (${n} entri)`;
  } catch (e) { info = ' (tidak terbaca sebagai JSON)'; }
  console.log(`✅ ${name}${info}`);
}

if (!paths.activeBlog()) paths.setActiveBlog(id);

console.log(`\n📋 Tempelkan baris berikut ke .env (berkas ini TIDAK ditulis otomatis):\n`);
for (const [k, v] of secrets) console.log(`${k}=${v}`);
if (secrets.length === 0) console.log('(tidak ada kredensial di config sumber)');
console.log(`\nSelesai. Tenant aktif: ${paths.activeBlog()}`);
