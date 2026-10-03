'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { findLeftovers, normalize } = require('./clone-leftovers');

// Bentuk ini meniru kasus nyata: halaman produk baru di-clone dari halaman
// produk lain, judulnya diganti, tapi harga, spek, foto, dan kategori artikel
// terkait ikut tersalin — dan semuanya lolos validate + check-blueprint.
function page({ title, harga, spek, image, term, label = 'Harga sewa', cakupan }) {
  const w = (id, widgetType, settings) => ({ id, elType: 'widget', widgetType, settings });
  return [{
    id: 's1', elType: 'section', settings: {},
    elements: [{
      id: 'c1', elType: 'column', settings: {},
      elements: [
        w('a', 'heading', { title }),
        w('b', 'heading', { title: label }),
        w('c', 'heading', { title: harga }),
        w('d', 'text-editor', { editor: spek }),
        w('e', 'text-editor', { editor: cakupan }),
        w('f', 'image', { image: image }),
        w('g', 'posts', { posts_include_term_ids: term }),
      ]
    }]
  }];
}

const SUMBER = page({
  title: 'Sewa Produk Lama Kota A',
  harga: '15K / unit',
  spek: '<ul><li>Daya 300 watt</li><li>Berat 4 kg</li></ul>',
  image: { id: 11824, url: 'https://assets.example.com/2026/09/lama.png', alt: 'Produk lama' },
  term: ['953'],
  cakupan: '<p>Area layanan : Kota A, Kota B, Kampus C, Kampus D</p>',
});

test('halaman yang hanya diganti judulnya: harga, spek, gambar, kategori tertangkap', () => {
  const hasil = page({
    title: 'Sewa Produk Baru Kota A',
    harga: '15K / unit',
    spek: '<ul><li>Daya 300 watt</li><li>Berat 4 kg</li></ul>',
    image: { id: 11824, url: 'https://assets.example.com/2026/09/lama.png', alt: 'Produk baru' },
    term: ['953'],
    cakupan: '<p>Area layanan : Kota A, Kota B, Kampus C, Kampus D</p>',
  });
  const r = findLeftovers(SUMBER, hasil);
  const jenis = r.map(x => `${x.jenis}:${x.widget}`).sort();
  assert.deepStrictEqual(jenis, [
    'gambar:image', 'kueri:posts', 'teks:heading', 'teks:text-editor', 'teks:text-editor',
  ]);
  // Alt yang diganti tidak menyelamatkan gambar lama: yang tampil adalah url-nya.
  assert.ok(r.some(x => x.jenis === 'gambar' && /lama\.png/.test(x.nilai)));
});

test('label pendek tanpa angka bukan sisa — memang sama di semua halaman sejenis', () => {
  const hasil = page({
    title: 'Sewa Produk Baru Kota A',
    harga: '25K / unit',
    spek: '<ul><li>Jarak 50 meter</li></ul>',
    image: { id: 11999, url: 'https://assets.example.com/2026/10/baru.webp' },
    term: ['951'],
    cakupan: '<p>Area: Kota A</p>',
  });
  assert.deepStrictEqual(findLeftovers(SUMBER, hasil), []);
});

test('label pendek BERANGKA tetap sisa — harga lama tidak boleh lolos sebagai "label"', () => {
  const hasil = page({
    title: 'X', harga: '15K / unit', spek: 'baru', cakupan: 'baru',
    image: { id: 1, url: 'https://x/baru.png' }, term: ['1'],
  });
  const r = findLeftovers(SUMBER, hasil);
  assert.deepStrictEqual(r.map(x => x.nilai), ['15K / unit']);
});

test('--keep membebaskan teks yang memang sengaja dipertahankan', () => {
  const hasil = page({
    title: 'X', harga: '25K / unit', spek: 'baru',
    cakupan: '<p>Area layanan : Kota A, Kota B, Kampus C, Kampus D</p>',
    image: { id: 1, url: 'https://x/baru.png' }, term: ['1'],
  });
  assert.strictEqual(findLeftovers(SUMBER, hasil).length, 1);
  assert.deepStrictEqual(findLeftovers(SUMBER, hasil, { keep: ['area layanan'] }), []);
});

test('--keep juga berlaku untuk kueri yang memang sengaja sama', () => {
  const hasil = page({
    title: 'X', harga: '25K', spek: 'baru', cakupan: 'baru',
    image: { id: 1, url: 'https://x/baru.png' }, term: ['953'],
  });
  assert.deepStrictEqual(findLeftovers(SUMBER, hasil).map(x => x.jenis), ['kueri']);
  assert.deepStrictEqual(findLeftovers(SUMBER, hasil, { keep: ['953'] }), []);
});

test('gambar dengan url baru tapi id lama tetap tertangkap', () => {
  const hasil = page({
    title: 'X', harga: '25K', spek: 'baru', cakupan: 'baru',
    image: { id: 11824, url: 'https://x/baru.png' }, term: ['1'],
  });
  const r = findLeftovers(SUMBER, hasil);
  assert.deepStrictEqual(r.map(x => x.jenis), ['gambar']);
});

test('gambar di dalam repeater dan galeri ikut diperiksa', () => {
  const src = [{ id: 's', elType: 'section', settings: { background_image: { id: 5, url: 'https://x/bg.jpg' } }, elements: [
    { id: 'w', elType: 'widget', widgetType: 'image-gallery', settings: { gallery: [{ id: 7, url: 'https://x/g1.jpg' }] } },
  ] }];
  const hasil = JSON.parse(JSON.stringify(src));
  const r = findLeftovers(src, hasil);
  assert.deepStrictEqual(r.map(x => x.jenis).sort(), ['gambar', 'gambar']);
});

test('kueri kosong tidak dihitung sisa', () => {
  const src = page({ title: 'A', harga: 'a', spek: 'a', cakupan: 'a', image: {}, term: [] });
  const hasil = page({ title: 'B', harga: 'b', spek: 'b', cakupan: 'b', image: {}, term: [] });
  assert.deepStrictEqual(findLeftovers(src, hasil), []);
});

test('format halaman WordPress (hasil clone-template) diterima di kedua sisi', () => {
  const hasil = { content: page({
    title: 'X', harga: '15K / unit', spek: 'baru', cakupan: 'baru',
    image: { id: 1, url: 'https://x/baru.png' }, term: ['1'],
  }), title: 'X', type: 'page' };
  assert.strictEqual(findLeftovers({ content: SUMBER }, hasil).length, 1);
});

test('paragraf yang cuma diganti nama produknya tetap tertangkap sebagai mirip', () => {
  // Pola --replace "Merek Lama:Merek Baru": kalimat lain tak tersentuh.
  const lama = '<p>Ruangan besar sering butuh suara yang lebih kuat dari speaker biasa. Speaker Merek Lama ini yang menjawab kebutuhan itu, biar acara tetap terdengar sampai belakang.</p>';
  const baru = '<p>Ruangan besar sering butuh suara yang lebih kuat dari speaker biasa. Speaker Merek Baru ini yang menjawab kebutuhan itu, biar acara tetap terdengar sampai belakang.</p>';
  const src = page({ title: 'A', harga: 'a', spek: lama, cakupan: 'a', image: {}, term: [] });
  const hasil = page({ title: 'B', harga: 'b', spek: baru, cakupan: 'b', image: {}, term: [] });
  const r = findLeftovers(src, hasil);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].jenis, 'teks');
  assert.ok(r[0].mirip >= 0.6 && r[0].mirip < 1, `mirip=${r[0].mirip}`);
});

test('dua paragraf berbeda topik dengan kosakata umum yang sama tidak dianggap mirip', () => {
  const a = '<p>Tidak perlu setting rumit. Colok kabel ke mixer, nyalakan speaker, atur volume dari mixer, lalu tes suara sebelum acara dimulai.</p>';
  const b = '<p>Tidak perlu setting rumit. Pasang tripod di lantai rata, kunci ketiga kakinya, lalu atur tinggi kepala tripod sesuai posisi kamera yang diinginkan.</p>';
  const src = page({ title: 'A', harga: 'a', spek: a, cakupan: 'a', image: {}, term: [] });
  const hasil = page({ title: 'B', harga: 'b', spek: b, cakupan: 'b', image: {}, term: [] });
  assert.deepStrictEqual(findLeftovers(src, hasil), []);
});

test('kemiripan bekerja untuk huruf beraksen dan aksara non-Latin', () => {
  // Pemecah kata a-z memotong "équipement" jadi "quipement" dan membuang aksara
  // non-Latin seluruhnya — paragraf yang jelas sama jadi tak terdeteksi.
  const fr = (nom) => `<p>Location de ${nom} pour événements à Paris. Équipement vérifié, livraison rapide, réglage sur place, assistance téléphonique incluse.</p>`;
  const jp = (nom) => `<p>${nom} の レンタル。 イベント 用 の 機材 を 迅速 に 配達 し、 現地 で 設定 と サポート を 行い ます。</p>`;
  for (const [lama, baru] of [[fr('enceinte A'), fr('enceinte B')], [jp('スピーカーA'), jp('スピーカーB')]]) {
    const src = page({ title: 'A', harga: 'a', spek: lama, cakupan: 'a', image: {}, term: [] });
    const hasil = page({ title: 'B', harga: 'b', spek: baru, cakupan: 'b', image: {}, term: [] });
    const r = findLeftovers(src, hasil);
    assert.strictEqual(r.length, 1, baru);
    assert.ok(r[0].mirip >= 0.6, `mirip=${r[0].mirip}`);
  }
});

test('normalize membuang tag, entitas, dan spasi berlebih', () => {
  assert.strictEqual(normalize('<p>Halo&nbsp; <b>dunia</b> &amp; kamu</p>'), 'Halo dunia & kamu');
});
