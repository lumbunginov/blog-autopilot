#!/usr/bin/env node
'use strict';
/**
 * Ambil panduan builder dari situs ke docs/ tenant, lalu cetak daftar isinya
 * (judul + nomor baris) supaya cukup bagian yang relevan yang dibaca.
 * Panduan berasal dari plugin yang terpasang, jadi selalu sesuai versinya —
 * itu sebabnya tidak disalin ke dalam skill.
 *
 * Usage:
 *   node docs.js                       # get-instructions (wajib sebelum build/edit)
 *   node docs.js --ecommerce           # get-ecommerce-instructions (sebelum kerja toko)
 *   node docs.js --skill <nama>        # satu sub-skill, mis. building-sites
 *   node docs.js --skill <nama> --path <berkas>   # berkas lampiran sub-skill
 *   node docs.js --list                # daftar sub-skill
 */
const fs = require('fs');
const path = require('path');
const { resolveWorkspace, parseFlags } = require('./lib/workspace');

function toc(text) {
  return text.split('\n').map((l, i) => (/^#{1,3} /.test(l) ? `${String(i + 1).padStart(5)}  ${l}` : null))
    .filter(Boolean).join('\n');
}

async function main() {
  const w = resolveWorkspace();
  const { flags } = parseFlags(w.args, ['ecommerce', 'list']);

  if (flags.list) {
    const res = await w.bd('get-skill', {});
    for (const s of res.skills || []) console.log(`${s.name}  — ${String(s.description).slice(0, 120)}…`);
    return;
  }

  let text, name;
  if (flags.skill) {
    const input = flags.path ? { name: flags.skill, path: flags.path } : { name: flags.skill };
    const res = await w.bd('get-skill', input);
    text = res.content || res.instructions || res.text || JSON.stringify(res, null, 2);
    name = `skill-${flags.skill}${flags.path ? '-' + flags.path.replace(/[\\/]/g, '_') : ''}`.replace(/\.md$/, '');
  } else if (flags.ecommerce) {
    text = (await w.bd('get-ecommerce-instructions', {})).instructions;
    name = 'ecommerce-instructions';
  } else {
    text = (await w.bd('get-instructions', {})).instructions;
    name = 'instructions';
  }

  const file = path.join(w.dirs.docs, `${name}.md`);
  fs.writeFileSync(file, text, 'utf-8');
  console.log(`✓ ${file} (${text.split('\n').length} baris)\n`);
  console.log(toc(text));
}

main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
