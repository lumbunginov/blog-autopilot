#!/usr/bin/env node
'use strict';
/**
 * Buat halaman Breakdance BARU dari satu berkas HTML (+ <style>) lewat
 * html-to-page. Halaman selalu draft kecuali --status diberikan.
 *
 * Usage:
 *   node create-page.js <berkas.html> "Judul Halaman" [--slug <slug>] [--status draft|pending|private|publish] [--blog <id>]
 *
 * Aturan HTML (dicek server, bukan di sini): @media harus disalin persis dari
 * get-breakpoints, inline style="" dibuang, dan setiap aturan <style> menjadi
 * selector GLOBAL situs — pakai awalan kelas khas per halaman/komponen.
 */
const path = require('path');
const { resolveWorkspace, saveTree, parseFlags, readText } = require('./lib/workspace');
const { outline } = require('./lib/tree');
const { httpGet, httpPost } = require('../../lib/wp-client');

const VALID_STATUS = ['draft', 'pending', 'private', 'publish'];

async function main() {
  const w = resolveWorkspace();
  const { flags, rest } = parseFlags(w.args);
  const [file, title] = rest;
  const status = flags.status || 'draft';
  if (!file || !title) {
    console.error('Usage: node create-page.js <berkas.html> "Judul Halaman" [--slug <slug>] [--status draft|pending|private|publish] [--blog <id>]');
    process.exit(1);
  }
  if (!VALID_STATUS.includes(status)) throw new Error(`--status harus salah satu dari: ${VALID_STATUS.join(', ')}`);
  const html = readText(file);

  // Slug dicek dulu: WordPress diam-diam menambah "-2" bila sudah dipakai,
  // dan halaman kembar itu baru ketahuan setelah terbit.
  if (flags.slug) {
    const { body } = await httpGet(`${w.api}/pages?slug=${encodeURIComponent(flags.slug)}&status=any&context=edit&_fields=id`, w.auth);
    if (Array.isArray(body) && body.length) throw new Error(`Slug "${flags.slug}" sudah dipakai halaman id ${body[0].id}`);
  }

  const created = await w.bd('create-post', { title, status, post_type: 'page' });
  const page = { id: created.post_id, slug: flags.slug || String(created.post_id) };
  console.log(`✓ Halaman dibuat: id ${page.id} (${status})`);

  if (flags.slug) {
    const r = await httpPost(`${w.api}/pages/${page.id}`, w.auth, { slug: flags.slug });
    if (r.statusCode !== 200) console.error(`! Slug gagal dipasang (${r.body && r.body.message}); halaman tetap ada dengan slug bawaan`);
    else page.slug = r.body.slug;
  }

  let res;
  try {
    res = await w.bd('html-to-page', { post_id: page.id, html });
  } catch (e) {
    console.error(`✗ html-to-page gagal: ${e.message}`);
    console.error(`  Halaman ${page.id} sudah dibuat tapi KOSONG. Perbaiki HTML lalu: node add-html.js ${page.id} ${file}`);
    console.error(`  atau buang: node ability.js run change-post-status '{"post_id":${page.id},"status":"trash"}'`);
    process.exit(2);
  }
  console.log(`✓ html-to-page: ${res.inserted_element_ids.length} seksi, ${res.created_selectors} selector, ${res.created_variables} variabel`);
  for (const warn of res.warnings || []) console.log(`! ${typeof warn === 'string' ? warn : JSON.stringify(warn)}`);

  const { data, file: treeFile } = await saveTree(w, page);
  console.log(`✓ Pohon → ${path.relative(process.cwd(), treeFile)}`);
  console.log(outline(data.tree));
  console.log(`\nURL: ${created.url}`);
}

main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
