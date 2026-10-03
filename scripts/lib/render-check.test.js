'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { checkRender, tokens } = require('./render-check');

const w = (id, widgetType, settings) => ({ id, elType: 'widget', widgetType, settings });
const page = (...widgets) => [{ id: 'sec1', elType: 'section', settings: {}, elements: [
  { id: 'col1', elType: 'column', settings: {}, elements: widgets }] }];

// Potongan HTML seperti yang dirender Elementor: data-id per elemen, teks di dalam tag.
const html = (...parts) => `<html><body><div class="elementor">${parts.join('')}</div></body></html>`;
const el = (id, inner = '') => `<div class="elementor-element" data-id="${id}">${inner}</div>`;

const LAMA = page(
  w('h1', 'heading', { title: 'Harga 15K / unit' }),
  w('t1', 'text-editor', { editor: '<p>Spesifikasi lama: daya 300 watt dan berat 4 kg.</p>' }),
  w('i1', 'image', { image: { id: 1, url: 'https://x.test/lama.png' } }),
);
const BARU = page(
  w('h1', 'heading', { title: 'Harga 25K / unit' }),
  w('t1', 'text-editor', { editor: '<p>Spesifikasi baru: daya 500 watt dan berat 6 kg.</p>' }),
  w('i1', 'image', { image: { id: 2, url: 'https://x.test/baru.webp' } }),
);

test('tampilan sudah memuat perubahan → segar', () => {
  const live = html(el('sec1'), el('col1'), el('h1', '<h2>Harga 25K / unit</h2>'),
    el('t1', '<p>Spesifikasi baru: daya 500 watt dan berat 6 kg.</p>'),
    el('i1', '<img src="https://x.test/baru.webp">'));
  const r = checkRender(LAMA, BARU, live);
  assert.strictEqual(r.stale, false);
  assert.ok(r.checked >= 4, `checked=${r.checked}`);
});

test('tampilan masih versi lama → basi, dengan rincian yang hilang dan yang masih tampil', () => {
  const live = html(el('sec1'), el('col1'), el('h1', '<h2>Harga 15K / unit</h2>'),
    el('t1', '<p>Spesifikasi lama: daya 300 watt dan berat 4 kg.</p>'),
    el('i1', '<img src="https://x.test/lama.png">'));
  const r = checkRender(LAMA, BARU, live);
  assert.strictEqual(r.stale, true);
  assert.ok(r.missing.some(m => /25K/.test(m)));
  assert.ok(r.lingering.some(m => /lama\.png/.test(m)));
});

test('id elemen baru tidak ada di HTML (cache memegang struktur lama) → basi', () => {
  const baruIdBaru = JSON.parse(JSON.stringify(BARU).replace(/"h1"/, '"h9"'));
  const live = html(el('sec1'), el('col1'), el('h1', '<h2>Harga 25K / unit</h2>'),
    el('t1', '<p>Spesifikasi baru: daya 500 watt dan berat 6 kg.</p>'),
    el('i1', '<img src="https://x.test/baru.webp">'));
  const r = checkRender(LAMA, baruIdBaru, live);
  assert.strictEqual(r.stale, true);
  assert.ok(r.missing.some(m => /h9/.test(m)));
});

test('tanpa versi sebelumnya: semua id dan teks halaman baru harus tampil', () => {
  const live = html(el('sec1'), el('col1'), el('h1', '<h2>Harga 25K / unit</h2>'),
    el('t1', '<p>Spesifikasi baru: daya 500 watt dan berat 6 kg.</p>'),
    el('i1', '<img src="https://x.test/baru.webp">'));
  assert.strictEqual(checkRender(null, BARU, live).stale, false);
  assert.strictEqual(checkRender(null, BARU, html(el('sec1'))).stale, true);
});

test('teks dicocokkan per kata: entitas, tag, dan tanda baca hasil render tidak menggagalkan', () => {
  const baru = page(w('t', 'text-editor', { editor: '<p>Nggak perlu driver &amp; install — "colok" saja.</p>' }));
  const live = html(el('sec1'), el('col1'), el('t', '<p>Nggak perlu <strong>driver</strong> &#038; install &#8212; &#8220;colok&#8221; saja.</p>'));
  assert.strictEqual(checkRender(null, baru, live).stale, false);
});

test('tidak ada perubahan yang terlihat → tidak ada yang bisa diperiksa, bukan basi', () => {
  const r = checkRender(LAMA, LAMA, html());
  assert.strictEqual(r.checked, 0);
  assert.strictEqual(r.stale, false);
});

test('tokens memakai huruf aksara apa pun', () => {
  assert.strictEqual(tokens('Équipement <b>vérifié</b>, 50 m'), 'équipement vérifié 50 m');
});
