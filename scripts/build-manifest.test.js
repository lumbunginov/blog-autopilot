'use strict';
// Cek isi paket rilis TANPA menjalankan build penuh (obfuscate + zip lambat).
// Aturan yang dijaga: kapabilitas Elementor ikut satu paket, rahasia & data
// hidup tidak pernah ikut.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..');

// Ambil daftar exclude langsung dari build.js supaya test ini tidak
// mempunyai salinan aturan yang bisa basi diam-diam.
const buildSrc = fs.readFileSync(path.join(SKILL_DIR, 'build.js'), 'utf-8');
const EXCLUDE = new Set(
  (buildSrc.match(/const EXCLUDE = new Set\(\[([\s\S]*?)\]\);/)[1].match(/'([^']+)'/g) || [])
    .map(s => s.slice(1, -1))
);
const EXCLUDE_PATTERNS = (buildSrc.match(/const EXCLUDE_PATTERNS = \[([\s\S]*?)\];/)[1]
  .match(/\/\^.*?\$\//g) || []).map(s => new RegExp(s.slice(1, -1)));

function shouldExclude(name) {
  return EXCLUDE.has(name) || EXCLUDE_PATTERNS.some(p => p.test(name));
}

function manifest(dir = SKILL_DIR, prefix = '') {
  let out = [];
  for (const entry of fs.readdirSync(dir)) {
    if (shouldExclude(entry)) continue;
    const full = path.join(dir, entry);
    const rel = prefix + entry;
    if (fs.statSync(full).isDirectory()) out = out.concat(manifest(full, rel + '/'));
    else out.push(rel);
  }
  return out;
}

const files = manifest();

test('kapabilitas Elementor ikut dalam satu paket', () => {
  for (const f of [
    'references/elementor.md',
    'references/elementor-widgets.md',
    'references/elementor-troubleshooting.md',
    'scripts/elementor/download-page.js',
    'scripts/elementor/extract-elementor.js',
    'scripts/elementor/validate-elementor.js',
    'scripts/elementor/compress-elementor.js',
    'scripts/elementor/clone-template.js',
    'scripts/elementor/upload-page.js',
    'scripts/elementor/create-page.js',
    'scripts/elementor/lib/workspace.js',
  ]) {
    assert.ok(files.includes(f), `hilang dari paket: ${f}`);
  }
});

test('SKILL.md menyebut jalur Elementor supaya kapabilitasnya bisa ditemukan', () => {
  const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf-8');
  assert.match(skill, /\[PAGE\]/);
  assert.match(skill, /references\/elementor\.md/);
  assert.match(skill, /elementor/i);
});

test('rahasia dan data hidup tidak pernah masuk paket', () => {
  for (const f of files) {
    assert.ok(!/(^|\/)\.env$/.test(f), `.env ikut terpaket: ${f}`);
    assert.ok(!f.startsWith('data/'), `data tenant ikut terpaket: ${f}`);
    assert.ok(!/-config\.json$/.test(f), `config runtime ikut terpaket: ${f}`);
    assert.ok(!f.endsWith('.test.js'), `test ikut terpaket: ${f}`);
    assert.ok(!f.startsWith('node_modules/'), `node_modules ikut terpaket: ${f}`);
  }
});

test('tidak ada sisa rujukan ke skill edit-elementor yang lama', () => {
  const teks = files.filter(f => /\.(md|js|json|html)$/.test(f));
  const sisa = teks.filter(f =>
    fs.readFileSync(path.join(SKILL_DIR, f), 'utf-8').includes('skills/edit-elementor'));
  assert.deepStrictEqual(sisa, [], `masih menunjuk skill lama: ${sisa.join(', ')}`);
});
