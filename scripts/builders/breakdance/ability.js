#!/usr/bin/env node
'use strict';
/**
 * Jalankan ability Breakdance (atau ability plugin lain) apa adanya — pintu
 * umum untuk semua yang tidak punya script alur sendiri.
 *
 * Usage:
 *   node ability.js list [namespace|all]           # default: breakdance
 *   node ability.js describe <nama>                # skema input/output
 *   node ability.js run <nama> ['<json>'|@berkas.json] [--out berkas] [--blog <id>]
 *
 * Nama pendek ("get-post-tree") = breakdance/get-post-tree. Ability baca-saja
 * otomatis dikirim GET, ability tulis POST.
 */
const fs = require('fs');
const { resolveWorkspace, abilityName, parseFlags, readText, NS } = require('./lib/workspace');

function parseInput(arg) {
  if (!arg) return {};
  const raw = arg.startsWith('@') ? readText(arg.slice(1)) : arg;
  try { return JSON.parse(raw); }
  catch (e) { throw new Error(`Input bukan JSON yang sah: ${e.message}`); }
}

async function main() {
  const w = resolveWorkspace();
  const { flags, rest } = parseFlags(w.args);
  const [cmd, name, input] = rest;

  if (cmd === 'list') {
    const ns = name === 'all' ? null : (name || NS);
    for (const a of await w.client.list(ns)) {
      const ro = a.meta && a.meta.annotations && a.meta.annotations.readonly;
      console.log(`${ro ? 'baca ' : 'TULIS'}  ${a.name}  — ${String(a.description || '').split('\n')[0].slice(0, 110)}`);
    }
    return;
  }

  if (cmd === 'describe' && name) {
    const a = await w.client.describe(abilityName(name));
    console.log(JSON.stringify({
      name: a.name,
      readonly: !!(a.meta && a.meta.annotations && a.meta.annotations.readonly),
      destructive: !!(a.meta && a.meta.annotations && a.meta.annotations.destructive),
      description: a.description,
      input_schema: a.input_schema,
      output_schema: a.output_schema
    }, null, 2));
    return;
  }

  if (cmd === 'run' && name) {
    const out = await w.bd(name, parseInput(input));
    const text = JSON.stringify(out, null, 2);
    if (flags.out) { fs.writeFileSync(flags.out, text, 'utf-8'); console.log(`✓ ${abilityName(name)} → ${flags.out} (${text.length} byte)`); }
    else console.log(text);
    return;
  }

  console.error('Usage: node ability.js list [namespace|all] | describe <nama> | run <nama> [\'<json>\'|@berkas] [--out berkas] [--blog <id>]');
  process.exit(1);
}

main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
