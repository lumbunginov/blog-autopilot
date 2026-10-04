'use strict';
const test = require('node:test');
const assert = require('node:assert');
const builders = require('./index');

test('elementor terdaftar lewat foldernya sendiri', () => {
  const ids = builders.list().map(b => b.id);
  assert.ok(ids.includes('elementor'));
});

test('none dan builder tak dikenal = tidak ada builder aktif', () => {
  assert.strictEqual(builders.active({ page_builder: { type: 'none' } }), null);
  assert.strictEqual(builders.active({}), null);
  assert.strictEqual(builders.active({ page_builder: { type: 'tidak-ada' } }), null);
  assert.strictEqual(builders.active({ page_builder: { type: 'elementor' } }).id, 'elementor');
});

test('tiap builder punya panduan yang benar-benar ada', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', '..');
  for (const b of builders.list()) {
    assert.ok(b.id && b.label && b.reference, `deskriptor ${b.id} tidak lengkap`);
    assert.ok(fs.existsSync(path.join(root, b.reference)), `panduan ${b.reference} hilang`);
    assert.deepStrictEqual(Object.keys(builders.describe(b)).sort(),
      ['blueprint', 'desc', 'icon', 'id', 'label', 'reference']);
  }
});
