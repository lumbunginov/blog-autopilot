'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readTemplates, writeTemplates, saveTemplate, deleteTemplate, findTemplate } = require('./template-store');

function berkasSementara() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-store-'));
  return path.join(dir, 'templates.json');
}

test('file belum ada → daftar kosong, bukan lemparan', () => {
  assert.deepEqual(readTemplates(berkasSementara()), { templates: [] });
});

test('file rusak → daftar kosong, bukan lemparan', () => {
  const f = berkasSementara();
  fs.writeFileSync(f, '{ bukan json');
  assert.deepEqual(readTemplates(f), { templates: [] });
});

test('simpan template baru membuat id dan created_at', () => {
  const f = berkasSementara();
  const { template, created } = saveTemplate(f, { name: 'Transaksional' });
  assert.equal(created, true);
  assert.match(template.id, /^tpl_\d+_[a-z0-9]+$/);
  assert.equal(template.name, 'Transaksional');
  assert.ok(template.created_at);
  assert.equal(template.updated_at, template.created_at);
  assert.equal(readTemplates(f).templates.length, 1);
});

test('id dari klien diabaikan saat membuat template baru', () => {
  const f = berkasSementara();
  const { template } = saveTemplate(f, { id: '../../jahat', name: 'X' });
  assert.match(template.id, /^tpl_\d+_[a-z0-9]+$/);
});

test('dua template dibuat berturut-turut tidak menimpa satu sama lain', () => {
  const f = berkasSementara();
  const a = saveTemplate(f, { name: 'Pertama' }).template;
  const b = saveTemplate(f, { name: 'Kedua' }).template;
  assert.notEqual(a.id, b.id);
  assert.equal(readTemplates(f).templates.length, 2);
});

test('menyimpan ulang dengan id yang ada = update, bukan duplikat', () => {
  const f = berkasSementara();
  const { template } = saveTemplate(f, { name: 'Awal', article_prompt: 'A' });
  const hasil = saveTemplate(f, { id: template.id, name: 'Ubah', article_prompt: 'B' });
  assert.equal(hasil.created, false);
  assert.equal(hasil.template.name, 'Ubah');
  assert.equal(hasil.template.created_at, template.created_at);
  assert.equal(readTemplates(f).templates.length, 1);
});

test('nama kosong ditolak', () => {
  assert.throws(() => saveTemplate(berkasSementara(), { name: '   ' }), /nama/i);
});

test('semua field prompt boleh kosong', () => {
  const { template } = saveTemplate(berkasSementara(), { name: 'Cuma gambar', image_prompt: 'gaya X' });
  assert.equal(template.article_prompt, '');
  assert.equal(template.meta_title_pattern, '');
  assert.equal(template.image_prompt, 'gaya X');
});

test('field asing dari klien tidak ikut tersimpan', () => {
  const { template } = saveTemplate(berkasSementara(), { name: 'X', jahat: 'nilai' });
  assert.equal(template.jahat, undefined);
});

test('hapus template yang ada mengembalikan true; yang tidak ada false', () => {
  const f = berkasSementara();
  const { template } = saveTemplate(f, { name: 'X' });
  assert.equal(deleteTemplate(f, template.id), true);
  assert.equal(deleteTemplate(f, template.id), false);
  assert.equal(readTemplates(f).templates.length, 0);
});

test('findTemplate mengembalikan null untuk id tak dikenal', () => {
  const f = berkasSementara();
  saveTemplate(f, { name: 'X' });
  assert.equal(findTemplate(f, 'tpl_tidak_ada'), null);
});

test('writeTemplates menormalkan bentuk yang bukan array', () => {
  const f = berkasSementara();
  writeTemplates(f, { templates: 'bukan array' });
  assert.deepEqual(readTemplates(f), { templates: [] });
});
