'use strict';
// Operasi massal atas post WordPress: pindai, ubah, tulis balik — dengan
// cadangan dan mode kering.
//
// Ada di sini supaya penyuntingan massal tidak lagi ditulis dari nol setiap
// kali dibutuhkan. Menulisnya sekali pakai berarti mengulang tiga kesalahan
// yang sama: tidak ada cadangan, tidak ada langkah kering, dan seluruh isi
// HTML tiap post ikut terbaca padahal yang dicari cuma satu pola.
const fs = require('fs');
const path = require('path');
const { httpGet, httpPost } = require('./wp-client');

// context=edit mengembalikan content.raw (markup sebenarnya di editor).
// content.rendered TIDAK bisa dipakai untuk menulis balik: shortcode sudah
// dieksekusi, blok Gutenberg sudah hilang komentarnya — menyimpannya kembali
// merusak post.
const EDIT_FIELDS = 'id,title,status,date,slug,link,content';

async function fetchPage({ api, auth, status, page, perPage = 100, fields = EDIT_FIELDS }) {
  const url = `${api}/posts?status=${encodeURIComponent(status)}&per_page=${perPage}&page=${page}` +
    `&context=edit&_fields=${fields}`;
  return httpGet(url, auth, 30000);
}

// Pindai post dan kembalikan HANYA yang cocok. `match(raw, post)` menerima
// markup mentah; yang tidak cocok tidak pernah ikut keluar, jadi pemanggil
// tidak menahan ratusan post di memori (atau di konteks) tanpa perlu.
async function scanPosts({ api, auth, statuses = ['publish', 'draft'], match, onProgress }) {
  const hits = [];
  let scanned = 0;
  for (const status of statuses) {
    for (let page = 1; ; page++) {
      let res;
      try {
        res = await fetchPage({ api, auth, status, page });
      } catch (e) {
        throw new Error(`Gagal membaca ${status} halaman ${page}: ${e.message}`);
      }
      // Halaman melewati batas membalas 400 (kode rest_post_invalid_page_number),
      // bukan array kosong — itu akhir yang normal, bukan kegagalan.
      if (res.statusCode === 400) break;
      const body = res.body;
      if (!Array.isArray(body) || body.length === 0) break;
      scanned += body.length;
      for (const p of body) {
        const raw = (p.content && p.content.raw) || '';
        if (match(raw, p)) {
          hits.push({
            id: p.id,
            status: p.status,
            date: p.date,
            slug: p.slug,
            link: p.link,
            title: (p.title && (p.title.raw || p.title.rendered)) || '',
            raw
          });
        }
      }
      if (onProgress) onProgress({ status, page, scanned, hits: hits.length });
    }
  }
  return { scanned, hits };
}

async function fetchPost({ api, auth, id, fields = EDIT_FIELDS }) {
  const res = await httpGet(`${api}/posts/${id}?context=edit&_fields=${fields}`, auth, 30000);
  const p = res.body || {};
  if (!p.id) throw new Error(`Post ${id} tidak terbaca (status ${res.statusCode})`);
  return { ...p, raw: (p.content && p.content.raw) || '' };
}

// Terapkan `transform(raw, post)` ke tiap post. Mengembalikan laporan; hanya
// menulis kalau apply=true.
//
// backupDir wajib saat apply: menulis konten tanpa salinan sebelum-edit
// membuat kesalahan regex tidak punya jalan pulang, dan WordPress tidak
// menyimpan revisi untuk pembaruan lewat REST di semua konfigurasi.
async function transformPosts({
  api, auth, posts, transform, apply = false, backupDir = null, verify = null, onEach
}) {
  if (apply && !backupDir) {
    throw new Error('backupDir wajib diisi saat apply=true (cadangan sebelum-edit).');
  }
  if (apply) fs.mkdirSync(backupDir, { recursive: true });

  const report = [];
  for (const post of posts) {
    const raw = post.raw !== undefined ? post.raw : (await fetchPost({ api, auth, id: post.id })).raw;
    let out, notes;
    try {
      const r = transform(raw, post);
      out = typeof r === 'string' ? r : r.out;
      notes = (typeof r === 'object' && r.notes) || [];
    } catch (e) {
      report.push({ id: post.id, title: post.title, error: e.message, changed: false });
      continue;
    }

    const changed = out !== raw;
    // verify() memutuskan hasilnya layak ditulis. Post yang gagal verifikasi
    // dilewati, bukan ditulis lalu diperbaiki nanti.
    const leftover = verify ? !verify(out, raw, post) : false;
    const rec = { id: post.id, title: post.title, notes, changed, leftover };

    if (apply && changed && !leftover) {
      fs.writeFileSync(path.join(backupDir, `${post.id}.html`), raw, 'utf-8');
      try {
        const res = await httpPost(`${api}/posts/${post.id}`, auth, { content: out });
        if (!res.body || !res.body.id) {
          rec.failed = true;
          rec.error = `WordPress menolak (status ${res.statusCode})`;
        }
      } catch (e) {
        rec.failed = true;
        rec.error = e.message;
      }
    }
    report.push(rec);
    if (onEach) onEach(rec);
  }

  return {
    total: report.length,
    changed: report.filter(r => r.changed).length,
    written: report.filter(r => r.changed && !r.leftover && !r.failed && apply).length,
    leftover: report.filter(r => r.leftover).length,
    failed: report.filter(r => r.failed).length,
    errors: report.filter(r => r.error).length,
    report
  };
}

// Kembalikan post dari berkas cadangan yang dibuat transformPosts.
async function restoreFromBackup({ api, auth, backupDir, ids = null }) {
  if (!fs.existsSync(backupDir)) throw new Error(`Folder cadangan tidak ada: ${backupDir}`);
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.html'));
  const restored = [];
  const failed = [];
  for (const f of files) {
    const id = Number(path.basename(f, '.html'));
    if (ids && !ids.includes(id)) continue;
    const content = fs.readFileSync(path.join(backupDir, f), 'utf-8');
    try {
      const res = await httpPost(`${api}/posts/${id}`, auth, { content });
      if (res.body && res.body.id) restored.push(id);
      else failed.push({ id, error: `status ${res.statusCode}` });
    } catch (e) {
      failed.push({ id, error: e.message });
    }
  }
  return { restored, failed };
}

module.exports = { scanPosts, fetchPost, transformPosts, restoreFromBackup, EDIT_FIELDS };
