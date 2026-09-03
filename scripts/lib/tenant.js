'use strict';
const fs = require('fs');

// Resolusi id blog dari request (?blog= / body.blog / tenant aktif).
// Tidak memvalidasi bahwa direktorinya ada — dipakai oleh route GET yang
// sudah toleran terhadap file yang belum ada (mis. plans/queue kosong).
function resolveBlog(req, paths) {
  const id = req.query.blog || req.body?.blog || paths.activeBlog();
  if (!id) {
    const e = new Error('Belum ada blog. Buat dulu lewat POST /api/blogs.');
    e.status = 400;
    throw e;
  }
  return id;
}

// Sama seperti resolveBlog, tapi menolak tenant yang direktorinya belum
// ada — dipakai route yang MENULIS (POST/PATCH), supaya blog id yang salah
// ketik tidak diam-diam membuat tenant baru atau menabrak ENOENT saat
// fs.writeFileSync ke direktori yang tidak pernah dibuat.
function requireBlog(req, paths) {
  const id = resolveBlog(req, paths);
  if (!fs.existsSync(paths.blogDir(id))) {
    const e = new Error(`Blog "${id}" tidak ditemukan`);
    e.status = 404;
    throw e;
  }
  return id;
}

module.exports = { resolveBlog, requireBlog };
