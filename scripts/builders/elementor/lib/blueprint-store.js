'use strict';
// Satu-satunya tempat yang tahu bentuk blueprint halaman. capture/check, route,
// dan UI lewat sini supaya aturan "apa yang dianggap sama" tidak tersebar.
//
// Blueprint merekam KERANGKA halaman: urutan seksi dan widget di dalamnya.
// Yang TIDAK direkam: teks, gambar, warna, ukuran — itu isi, dan memang harus
// beda antar halaman. Yang direkam cuma bentuknya, karena bentuk itulah yang
// bikin satu halaman terasa "beda format" dari saudaranya.
const fs = require('fs');
const path = require('path');

function sanitizeName(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) throw new Error(`Nama blueprint tidak valid: "${raw}"`);
  return s;
}

// Section boleh array (hasil extract) atau format halaman WordPress (hasil
// clone-template). Keduanya beredar di folder elementor/, jadi pembacanya satu.
function sections(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.content)) return data.content;
  throw new Error('Bukan array section Elementor maupun format halaman WordPress');
}

// Urutan widget di dalam satu seksi, rata (bukan pohon). Rata sudah cukup:
// kesalahan yang pernah terjadi adalah seksi ekstra/tertukar, bukan kolom yang
// bersarang beda — dan sidik jari yang rata jauh lebih enak dibaca saat gagal.
function widgets(section) {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.widgetType) out.push(o.widgetType);
    if (Array.isArray(o.elements)) o.elements.forEach(walk);
  })(section);
  return out;
}

// Teks pertama di seksi, dipakai HANYA sebagai label supaya pesan gagal bisa
// menyebut "seksi harga" alih-alih "seksi 6". Tidak pernah ikut dibandingkan.
function label(section) {
  let found = '';
  (function walk(o) {
    if (found || !o || typeof o !== 'object') return;
    const s = o.settings || {};
    const t = s.title || s.editor || '';
    if (t) { found = String(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); return; }
    if (Array.isArray(o.elements)) o.elements.forEach(walk);
  })(section);
  return found;
}

function capture(data, { name, note = '', source = '' } = {}) {
  const secs = sections(data);
  return {
    name: sanitizeName(name),
    note,
    captured_from: source,
    captured_at: new Date().toISOString(),
    sections: secs.map(s => ({ label: label(s), widgets: widgets(s), note: '' }))
  };
}

// Hasil: { ok, diffs:[{index, kind, expected, actual, label}] }
// kind: 'kurang' (blueprint punya, halaman tidak), 'lebih' (sebaliknya),
// 'beda' (posisi sama, susunan widget beda).
function compare(blueprint, data) {
  const actual = sections(data).map(s => ({ label: label(s), widgets: widgets(s) }));
  const expect = (blueprint.sections || []).map(s => ({ label: s.label, widgets: s.widgets }));

  // Dibandingkan sebagai urutan, bukan posisi-per-posisi. Satu seksi ekstra
  // yang disisipkan di tengah menggeser semua seksi sesudahnya; membandingkan
  // per-indeks membuat satu sebab dilaporkan sebagai lima penyimpangan, dan
  // yang membaca akan mengira ada lima hal yang harus dibetulkan.
  const sidik = s => s.widgets.join(',');
  const diffs = [];
  let i = 0, j = 0;
  while (i < expect.length || j < actual.length) {
    const e = expect[i], a = actual[j];
    if (e && a && sidik(e) === sidik(a)) { i++; j++; continue; }
    // Seksi halaman ini muncul lagi nanti di blueprint → yang sekarang ekstra.
    const nantiDiBlueprint = a ? expect.findIndex((x, k) => k >= i && sidik(x) === sidik(a)) : -1;
    // Seksi blueprint ini muncul lagi nanti di halaman → yang sekarang hilang.
    const nantiDiHalaman = e ? actual.findIndex((x, k) => k >= j && sidik(x) === sidik(e)) : -1;

    if (a && nantiDiBlueprint === -1 && (nantiDiHalaman !== -1 || !e)) {
      diffs.push({ index: j, kind: 'lebih', expected: null, actual: a.widgets, label: a.label });
      j++;
    } else if (e && nantiDiHalaman === -1 && (nantiDiBlueprint !== -1 || !a)) {
      diffs.push({ index: i, kind: 'kurang', expected: e.widgets, actual: null, label: e.label });
      i++;
    } else {
      diffs.push({ index: j, kind: 'beda', expected: e.widgets, actual: a.widgets, label: a.label || e.label });
      i++; j++;
    }
  }
  return { ok: diffs.length === 0, diffs, sectionCount: { blueprint: expect.length, halaman: actual.length } };
}

function file(dir, name) { return path.join(dir, `${sanitizeName(name)}.json`); }

function read(dir, name) {
  try { return JSON.parse(fs.readFileSync(file(dir, name), 'utf-8')); }
  catch { return null; }
}

function write(dir, blueprint) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(dir, blueprint.name), JSON.stringify(blueprint, null, 2), 'utf-8');
  return blueprint;
}

// Folder belum ada bukan galat: tenant yang belum merekam blueprint apa pun
// harus tetap membuka dashboard.
function list(dir) {
  try {
    return fs.readdirSync(dir)
      // _map.json tinggal sekamar dengan blueprint tapi bukan blueprint. Tanpa
      // saringan ini ia ikut terbaca, `name`-nya undefined, dan localeCompare
      // melempar — yang membuat SELURUH daftar jadi kosong, bukan cuma satu
      // berkas yang hilang.
      .filter(f => f.endsWith('.json') && f !== '_map.json')
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { return null; } })
      .filter(b => b && typeof b.name === 'string' && Array.isArray(b.sections))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

function remove(dir, name) {
  const f = file(dir, name);
  if (!fs.existsSync(f)) return false;
  fs.unlinkSync(f); return true;
}


// Peta slug → nama blueprint. Berkas terpisah karena elementor/<slug>.json
// adalah array section murni: menyelipkan field penanda ke dalamnya justru
// ditolak validate-elementor.js ("Root should be an array of sections").
function mapFile(dir) { return path.join(dir, '_map.json'); }

function readMap(dir) {
  try {
    const m = JSON.parse(fs.readFileSync(mapFile(dir), 'utf-8'));
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch { return {}; }
}

function setMap(dir, slugFile, name) {
  const m = readMap(dir);
  m[slugFile] = sanitizeName(name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(mapFile(dir), JSON.stringify(m, null, 2), 'utf-8');
  return m;
}

function unsetMap(dir, slugFile) {
  const m = readMap(dir);
  if (!(slugFile in m)) return false;
  delete m[slugFile];
  fs.writeFileSync(mapFile(dir), JSON.stringify(m, null, 2), 'utf-8');
  return true;
}

module.exports = { sanitizeName, sections, widgets, label, capture, compare, read, write, list, remove, file, readMap, setMap, unsetMap, mapFile };
