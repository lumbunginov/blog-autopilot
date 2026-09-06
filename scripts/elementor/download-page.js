#!/usr/bin/env node
'use strict';
/**
 * Download halaman WordPress ke pages/{slug}.json
 *
 * Usage:
 *   node download-page.js <slug|pageId> [--blog <id>]
 *   node download-page.js all [--blog <id>]
 */
const fs = require('fs');
const path = require('path');
const { resolveWorkspace } = require('./lib/workspace');
const { basicAuth, httpGet } = require('../lib/wp-client');

// context=edit wajib: tanpa itu WordPress tidak mengirim meta._elementor_data
// sama sekali, dan file yang tersimpan akan tampak valid tapi kosong isinya.
// status=any sama wajibnya: default REST hanya mengembalikan halaman publish,
// sehingga draft — termasuk yang baru saja dibuat create-page.js — dilaporkan
// "tidak ditemukan" padahal ada.
const EDIT = 'context=edit&status=any';

async function fetchBySlug(base, auth, slug) {
  const { body } = await httpGet(`${base}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&${EDIT}`, auth);
  if (!Array.isArray(body) || body.length === 0) throw new Error(`Halaman dengan slug "${slug}" tidak ditemukan`);
  return body[0];
}

async function fetchById(base, auth, id) {
  const { body, statusCode } = await httpGet(`${base}/wp-json/wp/v2/pages/${id}?${EDIT}`, auth);
  if (statusCode !== 200) throw new Error(`Gagal mengambil page ${id}: ${body?.message || statusCode}`);
  return body;
}

async function fetchAll(base, auth) {
  const out = [];
  let page = 1, totalPages = 1;
  do {
    const r = await httpGet(`${base}/wp-json/wp/v2/pages?per_page=100&page=${page}&${EDIT}`, auth);
    if (!Array.isArray(r.body)) throw new Error('Respons tidak terduga: ' + JSON.stringify(r.body).slice(0, 200));
    out.push(...r.body);
    totalPages = r.totalPages || 1;
    page++;
  } while (page <= totalPages);
  return out;
}

function save(dir, page) {
  const slug = page.slug || String(page.id);
  const file = path.join(dir, `${slug}.json`);
  fs.writeFileSync(file, JSON.stringify(page, null, 2), 'utf-8');
  const hasElementor = !!page.meta?._elementor_data;
  console.log(`✓ ${slug} (id ${page.id}) → pages/${slug}.json${hasElementor ? '' : '  [tanpa data Elementor]'}`);
  return file;
}

async function main() {
  const { blogId, cfg, args, dirs } = resolveWorkspace();
  const target = args[0];
  if (!target) {
    console.error('Usage: node download-page.js <slug|pageId|all> [--blog <id>]');
    process.exit(1);
  }
  const base = cfg.wordpress.url.replace(/\/$/, '');
  const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
  console.log(`Blog: ${blogId} (${base})`);

  if (target === 'all') {
    const pages = await fetchAll(base, auth);
    pages.forEach(p => save(dirs.pages, p));
    console.log(`\n${pages.length} halaman tersimpan di ${dirs.pages}`);
    return;
  }

  const page = /^\d+$/.test(target)
    ? await fetchById(base, auth, target)
    : await fetchBySlug(base, auth, target);
  save(dirs.pages, page);
  console.log(`\nBerikutnya: node extract-elementor.js ${page.slug || page.id}.json`);
}

if (require.main === module) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
module.exports = { fetchBySlug, fetchById, fetchAll };
