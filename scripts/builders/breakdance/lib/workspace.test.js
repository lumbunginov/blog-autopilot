'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { abilityName, parseFlags, dirs } = require('./workspace');

test('nama pendek milik breakdance, nama bernamespace dipakai apa adanya', () => {
  assert.strictEqual(abilityName('get-post-tree'), 'breakdance/get-post-tree');
  assert.strictEqual(abilityName('rank-math/get-settings'), 'rank-math/get-settings');
});

test('parseFlags: nilai terpisah, nilai dengan =, dan boolean', () => {
  const { flags, rest } = parseFlags(['a.html', 'Judul', '--slug', 'x', '--status=draft', '--dry-run'], ['dry-run']);
  assert.deepStrictEqual(rest, ['a.html', 'Judul']);
  assert.deepStrictEqual(flags, { slug: 'x', status: 'draft', 'dry-run': true });
});

test('parseFlags: JSON ber-"=" di nilai tidak terpotong', () => {
  assert.strictEqual(parseFlags(['--out=a=b.json']).flags.out, 'a=b.json');
});

test('folder kerja per tenant di data/blogs/<id>/breakdance', () => {
  const d = dirs('contoh');
  assert.ok(d.trees.endsWith(path.join('contoh', 'breakdance', 'trees')));
  assert.ok(d.backups.endsWith(path.join('contoh', 'breakdance', 'backups')));
});
