'use strict';
// Folder kerja Elementor per tenant. Resolusi tenant + kredensial sendiri ada
// di lib/blog.js supaya seluruh skill (bukan cuma Elementor) memakai jalur
// yang sama; berkas ini tinggal menambahkan tiga folder kerjanya.
const fs = require('fs');
const path = require('path');
const blog = require('../../lib/blog');

const AUTOPILOT_DIR = blog.SKILL_DIR;
const paths = blog.paths;

// Tiga folder kerja per tenant, sejajar dengan cache blog-autopilot lain.
function dirs(blogId) {
  const root = path.join(paths.blogDir(blogId), 'elementor');
  return {
    root,
    pages: path.join(root, 'pages'),
    elementor: path.join(root, 'elementor'),
    compress: path.join(root, 'compress')
  };
}

function ensureDirs(d) {
  for (const key of ['pages', 'elementor', 'compress']) {
    fs.mkdirSync(d[key], { recursive: true });
  }
  return d;
}

function resolveWorkspace(argv = process.argv.slice(2)) {
  const w = blog.resolveBlog(argv);
  return { blogId: w.blogId, cfg: w.cfg, args: w.args, dirs: ensureDirs(dirs(w.blogId)), paths };
}

// Untuk script murni-file (extract/compress/validate/clone): tidak butuh
// kredensial, jadi tidak boleh gagal cuma karena .env belum diisi.
function resolveWorkspaceOffline(argv = process.argv.slice(2)) {
  const w = blog.resolveBlogOffline(argv);
  return { blogId: w.blogId, args: w.args, dirs: ensureDirs(dirs(w.blogId)), paths };
}

module.exports = {
  resolveWorkspace, resolveWorkspaceOffline,
  parseBlogArg: blog.parseBlogArg, dirs, AUTOPILOT_DIR
};
