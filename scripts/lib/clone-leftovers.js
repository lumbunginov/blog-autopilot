'use strict';
// Cari isi halaman SUMBER yang masih tertinggal di halaman hasil clone.
//
// clone-template.js mengganti teks lewat --replace dan meregenerasi id elemen,
// tapi gambar, kueri kategori, dan teks yang tidak disebut di --replace ikut
// tersalin apa adanya. validate-elementor (JSON sehat) dan check-blueprint
// (susunan seksi) sama-sama meloloskannya, jadi halaman produk baru bisa terbit
// dengan harga, spesifikasi, dan foto produk lain.
//
// Pembandingnya ISI, bukan id: clone meregenerasi semua id, jadi yang dicari
// adalah nilai yang identik dengan sumber.
const { sections } = require('./blueprint-store');

// Kunci setting Elementor yang berisi teks tampil. Repeater (icon_list,
// tabs, dll.) ikut tersapu karena penelusuran masuk ke array.
const TEXT_KEYS = new Set([
  'title', 'editor', 'text', 'description', 'description_text', 'title_text',
  'caption', 'html', 'testimonial_content', 'tab_title', 'tab_content',
  'item_description', 'alert_title', 'alert_description', 'prefix', 'suffix',
  'before_text', 'highlighted_text', 'rotating_text', 'after_text', 'inner_text',
  'link_text', 'heading', 'sub_heading', 'content',
]);

const IMAGE_KEY = /image|gallery|background|photo|logo|media|thumbnail/i;

function normalize(s) {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// Label seksi ("Harga sewa", "Spesifikasi.", "Kontak admin") memang sama di
// semua halaman sejenis. Tapi "15K / unit" juga pendek — angka yang membedakan:
// label tidak memuat angka, harga dan spesifikasi hampir selalu memuatnya.
function isLabel(t) {
  return t.split(' ').length <= 3 && !/\d/.test(t);
}

// --replace hanya mengganti nama produk; sisa kalimatnya tetap milik produk
// sumber. Teks yang tidak identik tapi sebagian besar katanya sama itulah
// sisa yang paling sering — dan yang paling lolos dari pemeriksaan persis.
const MIRIP_MIN_KATA = 8;
const MIRIP_AMBANG = 0.6;

function kata(t) {
  // \p{L}/\p{N}: huruf & angka aksara apa pun — skill ini dipakai lintas bahasa.
  return new Set(t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

function jaccard(a, b) {
  let sama = 0;
  for (const x of a) if (b.has(x)) sama++;
  return sama / (a.size + b.size - sama);
}

function isImage(key, o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if ('is_external' in o) return false; // objek tautan, bukan gambar
  const url = typeof o.url === 'string' ? o.url : '';
  if (/placeholder/i.test(url)) return false;
  const hasId = o.id !== undefined && o.id !== null && o.id !== '';
  if (!url && !hasId) return false;
  return ('id' in o && 'url' in o) || IMAGE_KEY.test(key);
}

// Telusuri semua elemen (section/column/widget) dan setting-nya, panggil
// visit(jenis, data) untuk tiap teks, gambar, dan kueri yang ditemukan.
function scan(data, visit) {
  (function walkEl(el) {
    if (!el || typeof el !== 'object') return;
    const widget = el.widgetType || el.elType || '?';
    (function walkSet(v, key) {
      if (Array.isArray(v)) {
        if (/_ids$/.test(key) && v.length && v.every(x => typeof x !== 'object')) {
          visit('kueri', { widget, key, nilai: v.map(String).sort().join(',') });
          return;
        }
        v.forEach(x => walkSet(x, key));
        return;
      }
      if (v && typeof v === 'object') {
        if (isImage(key, v)) {
          visit('gambar', { widget, key, id: v.id, url: v.url || '' });
          return;
        }
        for (const k of Object.keys(v)) walkSet(v[k], k);
        return;
      }
      if (typeof v === 'string' && TEXT_KEYS.has(key)) {
        const t = normalize(v);
        if (t) visit('teks', { widget, key, nilai: t });
      }
    })(el.settings || {}, '');
    (el.elements || []).forEach(walkEl);
  })({ elements: sections(data) });
}

/**
 * @param source  halaman sumber (array section atau {content: [...]})
 * @param result  halaman hasil clone, bentuk yang sama
 * @param opts.keep  daftar potongan teks/url (tanpa beda huruf besar) yang
 *                   memang sengaja dipertahankan
 * @returns daftar sisa: {jenis: 'teks'|'gambar'|'kueri', widget, key, nilai}
 */
function findLeftovers(source, result, opts = {}) {
  const keep = (opts.keep || []).map(k => String(k).toLowerCase()).filter(Boolean);
  const kept = s => keep.some(k => String(s).toLowerCase().includes(k));

  const src = { teks: new Set(), url: new Set(), id: new Set(), kueri: new Set() };
  scan(source, (jenis, d) => {
    if (jenis === 'teks') src.teks.add(d.nilai);
    else if (jenis === 'kueri') src.kueri.add(`${d.key}=${d.nilai}`);
    else {
      if (d.url) src.url.add(d.url);
      if (d.id !== undefined && d.id !== null && d.id !== '') src.id.add(String(d.id));
    }
  });

  const srcPanjang = [...src.teks].map(t => kata(t)).filter(k => k.size >= MIRIP_MIN_KATA);

  const out = [];
  scan(result, (jenis, d) => {
    if (jenis === 'teks') {
      if (isLabel(d.nilai) || kept(d.nilai)) return;
      if (src.teks.has(d.nilai)) { out.push({ jenis, ...d }); return; }
      const k = kata(d.nilai);
      if (k.size < MIRIP_MIN_KATA) return;
      const mirip = Math.max(0, ...srcPanjang.map(s => jaccard(k, s)));
      if (mirip >= MIRIP_AMBANG) out.push({ jenis, ...d, mirip: Math.round(mirip * 100) / 100 });
    } else if (jenis === 'kueri') {
      if (src.kueri.has(`${d.key}=${d.nilai}`) && !kept(d.nilai)) out.push({ jenis, ...d });
    } else {
      const sama = (d.url && src.url.has(d.url)) ||
        (d.id !== undefined && d.id !== null && d.id !== '' && src.id.has(String(d.id)));
      if (sama && !kept(d.url)) {
        out.push({ jenis, widget: d.widget, key: d.key, nilai: d.url || `id ${d.id}` });
      }
    }
  });
  return out;
}

module.exports = { findLeftovers, normalize, isLabel };
