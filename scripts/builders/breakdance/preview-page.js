#!/usr/bin/env node
'use strict';
/**
 * Render HTML halaman Breakdance (tanpa header/footer & stylesheet global)
 * untuk memverifikasi hasil suntingan — bekerja juga untuk draft.
 *
 * Usage: node preview-page.js <slug|pageId> [--css] [--out berkas.html] [--blog <id>]
 */
const fs = require('fs');
const { resolveWorkspace, resolvePage, parseFlags } = require('./lib/workspace');

async function main() {
  const w = resolveWorkspace();
  const { flags, rest } = parseFlags(w.args, ['css']);
  if (!rest[0]) {
    console.error('Usage: node preview-page.js <slug|pageId> [--css] [--out berkas.html] [--blog <id>]');
    process.exit(1);
  }
  const page = await resolvePage(w, rest[0]);
  const res = await w.bd('preview-post', { post_id: page.id, include_css: !!flags.css });
  const out = flags.css ? `<style>\n${res.element_default_css || ''}\n${res.css || ''}\n</style>\n${res.html}` : res.html;
  if (flags.out) { fs.writeFileSync(flags.out, out, 'utf-8'); console.log(`✓ ${page.slug} → ${flags.out} (${out.length} byte)`); }
  else console.log(out);
}

main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
