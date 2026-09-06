#!/usr/bin/env node
'use strict';
/**
 * Buat halaman Elementor BARU di WordPress dari berkas di elementor/.
 *
 * Usage:
 *   node create-page.js <file.json> "Judul Halaman" [--slug <slug>]
 *                       [--status draft|publish|pending] [--blog <id>]
 *
 * Menerima dua bentuk masukan:
 *   - array section Elementor          (hasil extract-elementor.js)
 *   - format halaman WordPress         (hasil clone-template.js)
 */
const fs = require('fs');
const path = require('path');
const { resolveWorkspace } = require('./lib/workspace');
const { basicAuth, httpPost } = require('../lib/wp-client');

const VALID_STATUS = ['draft', 'publish', 'pending', 'private'];

// Satu berkas bisa datang dari extract (array) atau dari clone-template
// (objek berpembungkus). Menormalkan di sini supaya pemanggil tidak perlu tahu
// bedanya — dan supaya objek yang bukan keduanya ditolak sebelum menyentuh
// WordPress, bukan jadi halaman kosong yang sudah terlanjur dibuat.
function readSource(dir, file) {
  const name = file.endsWith('.json') ? file : `${file}.json`;
  const full = path.isAbsolute(file) ? file : path.join(dir, name);
  if (!fs.existsSync(full)) {
    throw new Error(`Berkas sumber tidak ada: ${full}`);
  }
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(full, 'utf-8')); }
  catch (e) { throw new Error(`${name} bukan JSON valid: ${e.message}`); }

  if (Array.isArray(parsed)) return { sections: parsed, pageSettings: null, from: full };
  if (parsed && Array.isArray(parsed.content)) {
    return { sections: parsed.content, pageSettings: parsed.page_settings || null, from: full };
  }
  throw new Error(
    `${name} bukan array section Elementor maupun format halaman WordPress ` +
    `(objek dengan field "content").`
  );
}

// Cek minimum yang sama dengan validate-elementor.js: section tanpa id/elType
// membuat Elementor menolak memuat halaman, dan halaman sudah terlanjur ada.
function assertSections(sections) {
  if (sections.length === 0) throw new Error('Sumber tidak berisi satu section pun.');
  sections.forEach((s, i) => {
    if (!s || !s.id || !s.elType) {
      throw new Error(`Section ke-${i} tidak punya field wajib (id, elType).`);
    }
  });
}

function parseFlags(args) {
  const rest = [];
  let slug = null, status = 'draft';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--slug') { slug = args[++i]; continue; }
    if (a.startsWith('--slug=')) { slug = a.slice(7); continue; }
    if (a === '--status') { status = args[++i]; continue; }
    if (a.startsWith('--status=')) { status = a.slice(9); continue; }
    rest.push(a);
  }
  if (!VALID_STATUS.includes(status)) {
    throw new Error(`--status "${status}" tidak dikenal. Pilih: ${VALID_STATUS.join(', ')}`);
  }
  return { slug, status, rest };
}

function buildPayload({ title, slug, status, sections, pageSettings }) {
  const meta = {
    _elementor_data: JSON.stringify(sections),
    // Tanpa dua penanda ini WordPress menyimpan datanya tapi Elementor
    // memperlakukan halaman sebagai halaman biasa dan tidak merendernya.
    _elementor_edit_mode: 'builder',
    _elementor_template_type: 'wp-page'
  };
  if (pageSettings) meta._elementor_page_settings = pageSettings;
  const payload = { title, status, meta };
  if (slug) payload.slug = slug;
  return payload;
}

async function main() {
  const { blogId, cfg, args, dirs } = resolveWorkspace();
  const { slug, status, rest } = parseFlags(args);
  const [file, title] = rest;
  if (!file || !title) {
    console.error('Usage: node create-page.js <file.json> "Judul Halaman" [--slug <slug>] [--status draft|publish] [--blog <id>]');
    process.exit(1);
  }

  const { sections, pageSettings, from } = readSource(dirs.elementor, file);
  assertSections(sections);

  const base = cfg.wordpress.url.replace(/\/$/, '');
  const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
  console.log(`Blog: ${blogId} (${base})`);
  console.log(`Sumber: ${from} — ${sections.length} section, status "${status}"`);

  const { statusCode, body } = await httpPost(
    `${base}/wp-json/wp/v2/pages`, auth,
    buildPayload({ title, slug, status, sections, pageSettings })
  );

  if (statusCode !== 201 && statusCode !== 200) {
    throw new Error(`WordPress menolak (HTTP ${statusCode}): ${body?.message || JSON.stringify(body).slice(0, 200)}`);
  }

  // Simpan respons ke pages/ supaya slug baru langsung punya page id, dan
  // siklus edit berikutnya (extract → compress → upload) bisa jalan tanpa
  // download ulang.
  const savedSlug = body.slug || String(body.id);
  fs.writeFileSync(path.join(dirs.pages, `${savedSlug}.json`), JSON.stringify(body, null, 2), 'utf-8');

  console.log(`✓ Halaman dibuat: id ${body.id}, slug "${savedSlug}", status ${body.status}`);
  console.log(`  Tersimpan: pages/${savedSlug}.json`);
  if (body.link) console.log(`  ${body.link}`);
  if (!body.meta?._elementor_data) {
    console.warn('⚠ Respons tidak memuat _elementor_data — periksa halaman di editor Elementor.');
  }
  console.log(`\nEdit berikutnya: node extract-elementor.js ${savedSlug}.json`);
}

if (require.main === module) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
module.exports = { readSource, assertSections, parseFlags, buildPayload };
