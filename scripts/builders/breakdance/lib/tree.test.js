'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { outline, validateOps, index } = require('./tree');

// Bentuk persis keluaran get-post-tree untuk satu seksi hasil html-to-page.
const TREE = {
  root: { id: 1, data: { type: 'root', properties: [] }, children: [
    { id: 103, data: { type: 'EssentialElements\\Container', properties: { settings: { advanced: { tag: 'section' } } } }, children: [
      { id: 100, data: { type: 'EssentialElements\\FText', properties: { content: { content: { text: 'Judul Halaman' } }, settings: { advanced: { tag: 'h1' } } } }, children: [] },
      { id: 101, data: { type: 'EssentialElements\\FText', properties: { content: { content: { text: 'Paragraf' } } } }, children: [] },
      { id: 102, data: { type: 'EssentialElements\\FTextLink', properties: { content: { content: { text: 'Pesan', url: 'https://contoh.test/' } } } }, children: [] }
    ] }
  ] },
  _nextNodeId: 104
};

test('outline: satu baris per elemen, dengan tag, teks, dan url', () => {
  const o = outline(TREE).split('\n');
  assert.strictEqual(o[0], '103  Container <section>');
  assert.strictEqual(o[1], '  100  FText <h1>  "Judul Halaman"');
  assert.strictEqual(o[3], '  102  FTextLink  "Pesan"  → https://contoh.test/');
});

test('outline menerima berkas unduhan berpembungkus {tree}', () => {
  assert.match(outline({ post_id: 9, tree: TREE }), /103  Container/);
});

test('validateOps: batch sah lolos', () => {
  assert.deepStrictEqual(validateOps(TREE, [
    { op: 'update', payload: { element_id: 101, properties: { content: { content: { text: 'Baru' } } } } },
    { op: 'duplicate', payload: { element_id: 102 } },
    { op: 'move', payload: { element_id: 102, parent_id: 1, position: 0 } }
  ]), []);
});

test('validateOps: id yang tidak ada ditolak sebelum dikirim', () => {
  const e = validateOps(TREE, [
    { op: 'delete', payload: { element_id: 101 } },
    { op: 'update', payload: { element_id: 999, properties: {} } }
  ]);
  assert.strictEqual(e.length, 1);
  assert.match(e[0], /#1 element_id 999 tidak ada/);
});

test('validateOps: merujuk elemen yang sudah dihapus di batch yang sama ditolak', () => {
  const e = validateOps(TREE, [
    { op: 'delete', payload: { element_id: 103 } },
    { op: 'update', payload: { element_id: 100, properties: {} } }
  ]);
  assert.match(e[0], /#1 element_id 100/);
});

test('validateOps: root tidak bisa dihapus, move ke anak sendiri ditolak', () => {
  assert.match(validateOps(TREE, [{ op: 'delete', payload: { element_id: 1 } }])[0], /root/);
  assert.match(validateOps(TREE, [{ op: 'move', payload: { element_id: 103, parent_id: 100 } }])[0], /dirinya sendiri/);
});

test('validateOps: op tak dikenal, insert tanpa tipe, dan batch kosong', () => {
  assert.match(validateOps(TREE, [{ op: 'replace', payload: {} }])[0], /tidak dikenal/);
  assert.match(validateOps(TREE, [{ op: 'insert', payload: { parent_id: 103 } }])[0], /element_type/);
  assert.match(validateOps(TREE, [])[0], /kosong/);
});

test('index memetakan id ke node dan induknya', () => {
  const m = index(TREE);
  assert.strictEqual(m.get(100).parent.id, 103);
  assert.strictEqual(m.get(1).parent, null);
});
