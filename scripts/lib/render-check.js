'use strict';
// Apakah halaman publik sudah menampilkan data Elementor yang baru diunggah?
//
// upload-page.js menulis `_elementor_data` lewat REST. Itu tidak memicu hook
// simpan milik Elementor, jadi cache elemen Elementor (Element Caching) tetap
// menyajikan render lama — termasuk id elemen lama — walau meta sudah baru dan
// cache halaman server melaporkan "miss". Halaman yang belum pernah dirender
// aman; halaman yang sudah pernah tampil (mis. sempat di-preview) tidak.
// Tidak ada endpoint REST untuk membersihkannya, jadi yang bisa dilakukan skill
// adalah MEMBUKTIKAN hasilnya dan memberi tahu kalau belum berubah.
//
// Yang dibandingkan adalah PERUBAHAN antara versi sebelum dan sesudah: penanda
// yang baru (teks, url gambar, id elemen) harus muncul di HTML, penanda yang
// dibuang tidak boleh masih muncul. Perubahan yang tidak terlihat sebagai teks
// (mis. id kategori kueri widget posts) tidak bisa dibuktikan dengan cara ini.
const { scan } = require('./clone-leftovers');

function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

// Teks jadi deret kata huruf kecil. Tanda baca, entitas, dan tag hilang — render
// WordPress mengubah kutip, tanda pisah, dan & tanpa mengubah katanya.
function tokens(s) {
  return decode(String(s).replace(/<[^>]*>/g, ' '))
    .toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ');
}

function markers(sections) {
  // Map penanda -> teks tampilan untuk pesan (penanda teks berupa deret kata huruf kecil).
  const m = { id: new Map(), teks: new Map(), gambar: new Map() };
  if (!sections) return m;
  const list = Array.isArray(sections) ? sections : sections.content;
  (function walk(n) {
    for (const e of n || []) {
      if (e.id) m.id.set(String(e.id), String(e.id));
      walk(e.elements);
    }
  })(list);
  scan(sections, (jenis, d) => {
    if (jenis === 'teks') { const t = tokens(d.nilai); if (t) m.teks.set(t, d.nilai); }
    else if (jenis === 'gambar' && d.url) m.gambar.set(d.url, d.url);
  });
  return m;
}

function corpus(html) {
  return {
    ids: new Set([...String(html).matchAll(/data-id="([^"]+)"/g)].map(x => x[1])),
    teks: ` ${tokens(html)} `,
    raw: String(html),
  };
}

function hadir(c, jenis, v) {
  if (jenis === 'id') return c.ids.has(v);
  if (jenis === 'teks') return c.teks.includes(` ${v} `);
  return c.raw.includes(v);
}

/**
 * @param prev  data Elementor sebelum upload (array section / {content}), atau null
 * @param next  data Elementor yang diunggah
 * @param html  HTML halaman publik
 * @returns {stale, checked, missing[], lingering[]}
 */
function checkRender(prev, next, html) {
  const a = markers(prev), b = markers(next), c = corpus(html);
  const missing = [], lingering = [];
  let checked = 0;
  for (const jenis of ['id', 'teks', 'gambar']) {
    for (const [v, tampil] of b[jenis]) {
      if (prev && a[jenis].has(v)) continue;
      checked++;
      if (!hadir(c, jenis, v)) missing.push(`${jenis}: ${tampil.slice(0, 90)}`);
    }
    if (!prev) continue;
    for (const [v, tampil] of a[jenis]) {
      if (b[jenis].has(v)) continue;
      checked++;
      if (hadir(c, jenis, v)) lingering.push(`${jenis}: ${tampil.slice(0, 90)}`);
    }
  }
  return { stale: missing.length > 0 || lingering.length > 0, checked, missing, lingering };
}

module.exports = { checkRender, tokens, markers };
