'use strict';
// Satu-satunya tempat skill ini memutuskan "folder kerja blog mana".
// Semua script lain memanggil resolveWorkspace() supaya download, extract,
// compress, dan upload tidak pernah berselisih soal tenant aktif.
const fs = require('fs');
const path = require('path');

const AUTOPILOT_DIR = path.join(__dirname, '..', '..', '..');
const { makePaths } = require(path.join(AUTOPILOT_DIR, 'scripts', 'lib', 'paths'));
const { loadDotEnv, resolveCredentials } = require(path.join(AUTOPILOT_DIR, 'scripts', 'lib', 'env'));

const paths = makePaths(AUTOPILOT_DIR);

// --blog <id> menang atas tenant aktif; sisanya dikembalikan apa adanya supaya
// tiap script bebas menafsirkan argumen positional-nya sendiri.
function parseBlogArg(argv) {
  const rest = [];
  let blogId = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--blog') { blogId = argv[++i]; continue; }
    if (argv[i].startsWith('--blog=')) { blogId = argv[i].slice(7); continue; }
    rest.push(argv[i]);
  }
  return { blogId, rest };
}

function resolveBlogId(explicitId) {
  const id = explicitId || paths.activeBlog();
  if (!id) {
    throw new Error(
      'Tidak ada blog terdaftar di blog-autopilot. Buat blog dulu lewat dashboard, ' +
      'atau sebutkan --blog <id>.'
    );
  }
  if (!paths.listBlogs().includes(id)) {
    throw new Error(`Blog "${id}" tidak ditemukan. Tersedia: ${paths.listBlogs().join(', ') || '(kosong)'}`);
  }
  return id;
}

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

function readConfig(blogId) {
  const file = paths.configPath(blogId);
  if (!fs.existsSync(file)) {
    throw new Error(`Config blog "${blogId}" tidak ada di ${file}. Isi Settings di dashboard dulu.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// Kredensial WP tidak pernah tersimpan di config.json — resolveCredentials
// membacanya dari .env dan melempar pesan yang menyebutkan nama variabelnya,
// jadi kegagalan di sini terbaca jelas alih-alih jadi 401 diam-diam.
function resolveWorkspace(argv = process.argv.slice(2)) {
  const { blogId: explicit, rest } = parseBlogArg(argv);
  loadDotEnv(path.join(AUTOPILOT_DIR, '.env'));
  const blogId = resolveBlogId(explicit);
  const cfg = resolveCredentials(blogId, readConfig(blogId));
  if (!cfg.wordpress?.url || !cfg.wordpress?.username) {
    throw new Error(`WordPress untuk blog "${blogId}" belum dikonfigurasi (url/username kosong).`);
  }
  return { blogId, cfg, args: rest, dirs: ensureDirs(dirs(blogId)), paths };
}

// Untuk script murni-file (extract/compress/validate/clone): tidak butuh
// kredensial, jadi tidak boleh gagal cuma karena .env belum diisi.
function resolveWorkspaceOffline(argv = process.argv.slice(2)) {
  const { blogId: explicit, rest } = parseBlogArg(argv);
  const blogId = resolveBlogId(explicit);
  return { blogId, args: rest, dirs: ensureDirs(dirs(blogId)), paths };
}

module.exports = { resolveWorkspace, resolveWorkspaceOffline, parseBlogArg, dirs, AUTOPILOT_DIR };
