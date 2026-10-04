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
    'scripts/builders/index.js',
    'references/builders/elementor/README.md',
    'references/builders/elementor/widgets.md',
    'references/builders/elementor/troubleshooting.md',
    'scripts/builders/elementor/index.js',
    'scripts/builders/elementor/download-page.js',
    'scripts/builders/elementor/extract-elementor.js',
    'scripts/builders/elementor/validate-elementor.js',
    'scripts/builders/elementor/compress-elementor.js',
    'scripts/builders/elementor/clone-template.js',
    'scripts/builders/elementor/upload-page.js',
    'scripts/builders/elementor/create-page.js',
    'scripts/builders/elementor/lib/workspace.js',
    'scripts/builders/elementor/lib/blueprint-store.js',
    'scripts/builders/elementor/lib/clone-leftovers.js',
    'scripts/builders/elementor/lib/render-check.js',
  ]) {
    assert.ok(files.includes(f), `hilang dari paket: ${f}`);
  }
});

test('kapabilitas Breakdance ikut dalam satu paket', () => {
  for (const f of [
    'scripts/lib/abilities.js',
    'references/builders/breakdance/README.md',
    'scripts/builders/breakdance/index.js',
    'scripts/builders/breakdance/lib/workspace.js',
    'scripts/builders/breakdance/lib/tree.js',
    'scripts/builders/breakdance/ability.js',
    'scripts/builders/breakdance/docs.js',
    'scripts/builders/breakdance/download-page.js',
    'scripts/builders/breakdance/create-page.js',
    'scripts/builders/breakdance/add-html.js',
    'scripts/builders/breakdance/edit-page.js',
    'scripts/builders/breakdance/preview-page.js',
  ]) {
    assert.ok(files.includes(f), `hilang dari paket: ${f}`);
  }
});

test('SKILL.md mengarahkan [PAGE] ke panduan builder aktif', () => {
  const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf-8');
  assert.match(skill, /\[PAGE\]/);
  assert.match(skill, /references\/builders\/<type>\/README\.md/);
  // Tiap builder terdaftar di tabel [PAGE] supaya bisa ditemukan.
  for (const b of require('./builders').list()) {
    assert.ok(skill.includes(b.reference), `SKILL.md tidak menyebut ${b.reference}`);
  }
});

// Folder keluaran per-tenant. `data/` bukan satu-satunya: `articles/` dan
// `images/` adalah SAUDARA-nya di root skill, bukan anaknya, jadi mengecualikan
// `data/` tidak menyentuh keduanya. Regresi: 3,5 MB PNG produk + 98 KB artikel
// milik satu tenant ikut terdistribusi ke tiap penerima ZIP, sementara
// test ini hijau 4/4 -- ia mengenumerasi prefix yang diketahuinya dan melewatkan
// dua. Tambahkan prefix baru DI SINI dan di `EXCLUDE` build.js sekaligus.
const TENANT_OUTPUT_PREFIXES = ['data/', 'articles/', 'images/'];

test('rahasia dan data hidup tidak pernah masuk paket', () => {
  for (const f of files) {
    assert.ok(!/(^|\/)\.env$/.test(f), `.env ikut terpaket: ${f}`);
    for (const pre of TENANT_OUTPUT_PREFIXES) {
      assert.ok(!f.startsWith(pre), `keluaran tenant ikut terpaket: ${f} (prefix ${pre})`);
    }
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

// Bacaan kedua, lepas dari isi disk: manifest di atas hanya bisa menuduh folder
// yang KEBETULAN ada saat test jalan. Di checkout bersih `images/` belum lahir,
// jadi test manifest akan hijau dan aturannya tidak terjaga. Ini mengunci
// daftarnya, bukan akibatnya.
test('setiap folder keluaran tenant terdaftar di EXCLUDE build.js', () => {
  for (const pre of TENANT_OUTPUT_PREFIXES) {
    const name = pre.replace(/\/$/, '');
    assert.ok(EXCLUDE.has(name),
      `'${name}' tidak ada di EXCLUDE build.js -- isinya akan ikut ke ZIP rilis`);
  }
});
