#!/usr/bin/env node
'use strict';
/**
 * Tambahkan seksi BARU (HTML + <style>) ke halaman Breakdance yang sudah ada.
 * html-to-page hanya MENAMBAH: untuk mengubah isi yang sudah ada, pakai
 * edit-page.js — menjalankan ini untuk "mengganti" seksi meninggalkan salinan
 * lama di tempatnya.
 *
 * Usage:
 *   node add-html.js <slug|pageId> <berkas.html> [--parent <id>] [--position <n>] [--blog <id>]
 */
const path = require('path');
const { resolveWorkspace, resolvePage, backupTree, saveTree, parseFlags, readText } = require('./lib/workspace');
const { outline, index } = require('./lib/tree');

async function main() {
  const w = resolveWorkspace();
  const { flags, rest } = parseFlags(w.args);
  const [target, file] = rest;
  if (!target || !file) {
    console.error('Usage: node add-html.js <slug|pageId> <berkas.html> [--parent <id>] [--position <n>] [--blog <id>]');
    process.exit(1);
  }
  const html = readText(file);
  const page = await resolvePage(w, target);
  const backup = await backupTree(w, page);

  const input = { post_id: page.id, html };
  if (flags.parent) {
    input.parent_id = Number(flags.parent);
    if (!index(backup.data.tree).has(input.parent_id)) throw new Error(`--parent ${input.parent_id} tidak ada di pohon halaman`);
  }
  if (flags.position !== undefined) input.position = Number(flags.position);

  const res = await w.bd('html-to-page', input);
  console.log(`✓ Cadangan sebelum tambah → ${path.relative(process.cwd(), backup.file)}`);
  console.log(`✓ html-to-page: elemen ${res.inserted_element_ids.join(', ')}, ${res.created_selectors} selector`);
  for (const warn of res.warnings || []) console.log(`! ${typeof warn === 'string' ? warn : JSON.stringify(warn)}`);

  const { data } = await saveTree(w, page);
  console.log(outline(data.tree));
}

main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
