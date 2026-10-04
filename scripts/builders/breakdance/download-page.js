#!/usr/bin/env node
'use strict';
/**
 * Unduh pohon elemen Breakdance satu halaman ke trees/<slug>.json dan cetak
 * ringkasannya (id, tipe, tag, teks) — dipakai untuk mencari id yang mau
 * disunting dengan edit-page.js.
 *
 * Usage: node download-page.js <slug|pageId> [--json] [--blog <id>]
 */
const path = require('path');
const { resolveWorkspace, resolvePage, saveTree, parseFlags } = require('./lib/workspace');
const { outline } = require('./lib/tree');

async function main() {
  const w = resolveWorkspace();
  const { flags, rest } = parseFlags(w.args, ['json']);
  if (!rest[0]) {
    console.error('Usage: node download-page.js <slug|pageId> [--json] [--blog <id>]');
    process.exit(1);
  }
  const page = await resolvePage(w, rest[0]);
  const details = await w.bd('get-post-details', { post_id: page.id });
  if (!details.is_builder) {
    console.error(`✗ ${page.slug} (id ${page.id}) tidak dibangun dengan Breakdance — sunting dengan builder aslinya.`);
    process.exit(2);
  }
  const { data, file } = await saveTree(w, page);
  console.log(`✓ ${page.slug} (id ${page.id}, ${details.status}) → ${path.relative(process.cwd(), file)}`);
  if (flags.json) console.log(JSON.stringify(data.tree, null, 2));
  else console.log(outline(data.tree));
}

main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
