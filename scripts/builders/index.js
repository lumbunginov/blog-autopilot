'use strict';
// Daftar page builder yang didukung skill. Tiap builder = satu folder di
// scripts/builders/<id>/ dengan index.js berisi deskriptornya, plus panduan di
// references/builders/<id>/README.md. Kode dan panduan builder lain tidak
// pernah dimuat, jadi menambah builder tidak menambah beban builder yang sudah
// ada — cukup tambah folder, tidak ada daftar yang perlu disunting di sini.
//
// Deskriptor:
//   id, label, icon, desc   — tampil di Settings → Page Builder
//   reference               — panduan utama, relatif ke root skill
//   pagesDir(paths, blogId) — folder halaman yang bisa direkam/diperiksa
//                             blueprint (opsional)
//   blueprint               — modul blueprint: capture/compare (opsional;
//                             tanpa ini fitur blueprint halaman tidak aktif)
const fs = require('fs');
const path = require('path');

const DIR = __dirname;

function list() {
  return fs.readdirSync(DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(DIR, d.name, 'index.js')))
    .map(d => require(path.join(DIR, d.name)))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function get(id) {
  if (!id || id === 'none') return null;
  return list().find(b => b.id === id) || null;
}

// Builder yang aktif untuk satu config blog; null bila 'none' atau tidak dikenal.
function active(cfg) {
  return get(cfg && cfg.page_builder && cfg.page_builder.type);
}

// Versi yang aman dikirim ke UI (tanpa fungsi/modul).
function describe(b) {
  return { id: b.id, label: b.label, icon: b.icon, desc: b.desc, reference: b.reference, blueprint: !!b.blueprint };
}

module.exports = { list, get, active, describe };
