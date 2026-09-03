'use strict';
// Satu-satunya tempat yang tahu bentuk templates.json. Route dan CLI lewat sini
// supaya aturan "id dibuat server" dan "field asing dibuang" tidak tersebar.
const fs = require('fs');
const path = require('path');

// Field yang boleh datang dari klien. Apa pun di luar daftar ini dibuang —
// id, created_at, dan updated_at milik server, bukan milik pengirim.
const FIELD_TEMPLATE = ['name', 'article_prompt', 'image_prompt', 'meta_title_pattern', 'meta_desc_pattern'];

function readTemplates(file) {
  // File belum ada / rusak bukan galat: tenant baru memang belum punya template,
  // dan dashboard harus tetap terbuka saat file-nya kacau.
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return { templates: Array.isArray(data?.templates) ? data.templates : [] };
  } catch { return { templates: [] }; }
}

function writeTemplates(file, data) {
  const templates = Array.isArray(data?.templates) ? data.templates : [];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ templates }, null, 2));
}

function bersihkan(input) {
  const out = {};
  for (const k of FIELD_TEMPLATE) out[k] = String(input?.[k] ?? '').trim();
  return out;
}

function saveTemplate(file, input) {
  const bersih = bersihkan(input);
  if (!bersih.name) throw new Error('Nama template wajib diisi.');

  const data = readTemplates(file);
  const id = String(input?.id || '').trim();
  const idx = id ? data.templates.findIndex(t => t.id === id) : -1;
  const now = new Date().toISOString();

  let template, created;
  if (idx === -1) {
    // id dari klien SELALU diabaikan untuk template baru: itu jalur yang bisa
    // dipakai menyuntik id sembarang (mis. "../../x") ke dalam file.
    // Suffix acak wajib ada: Date.now() saja bisa sama untuk dua panggilan
    // dalam milidetik yang sama, yang berarti dua template baru bisa bentrok id.
    template = { id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...bersih, created_at: now, updated_at: now };
    data.templates.unshift(template);
    created = true;
  } else {
    template = { ...data.templates[idx], ...bersih, updated_at: now };
    data.templates[idx] = template;
    created = false;
  }
  writeTemplates(file, data);
  return { template, created };
}

function deleteTemplate(file, id) {
  const data = readTemplates(file);
  const sebelum = data.templates.length;
  data.templates = data.templates.filter(t => t.id !== id);
  if (data.templates.length === sebelum) return false;
  writeTemplates(file, data);
  return true;
}

function findTemplate(file, id) {
  if (!id) return null;
  return readTemplates(file).templates.find(t => t.id === id) || null;
}

module.exports = { readTemplates, writeTemplates, saveTemplate, deleteTemplate, findTemplate, FIELD_TEMPLATE };
