'use strict';
// Satu pintu untuk "blog mana, dan kredensial apa" — dipakai script mana pun
// di skill ini, bukan cuma Elementor.
//
// Tanpa ini tiap script (dan tiap agent yang menulis skrip sekali pakai)
// merakit ulang: baca .env, cocokkan nama variabel bertenant, susun Basic
// auth. Perakitan ulang itu gagal diam-diam dengan cara yang sama berulang
// kali — nama variabel salah tebak, lalu 401 tanpa penjelasan.
const fs = require('fs');
const path = require('path');
const { makePaths } = require('./paths');
const { loadDotEnv, resolveCredentials } = require('./env');
const { basicAuth } = require('./wp-client');

const SKILL_DIR = path.join(__dirname, '..', '..');
const paths = makePaths(SKILL_DIR);

// --blog <id> menang atas tenant aktif; argumen lain dikembalikan apa adanya
// supaya tiap script bebas menafsirkan posisionalnya sendiri.
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
      'Tidak ada blog terdaftar. Buat dulu lewat dashboard, atau sebutkan --blog <id>.'
    );
  }
  if (!paths.listBlogs().includes(id)) {
    throw new Error(`Blog "${id}" tidak ditemukan. Tersedia: ${paths.listBlogs().join(', ') || '(kosong)'}`);
  }
  return id;
}

function readConfig(blogId) {
  const file = paths.configPath(blogId);
  if (!fs.existsSync(file)) {
    throw new Error(`Config blog "${blogId}" tidak ada di ${file}. Isi Settings di dashboard dulu.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// Tenant + kredensial + endpoint siap pakai. Kredensial tidak pernah tersimpan
// di config.json; resolveCredentials membacanya dari .env dan melempar pesan
// yang MENYEBUTKAN nama variabelnya, jadi kegagalan terbaca jelas alih-alih
// jadi 401 diam-diam.
function resolveBlog(argv = process.argv.slice(2)) {
  const { blogId: explicit, rest } = parseBlogArg(argv);
  loadDotEnv(path.join(SKILL_DIR, '.env'));
  const blogId = resolveBlogId(explicit);
  const cfg = resolveCredentials(blogId, readConfig(blogId));
  const wp = cfg.wordpress || {};
  if (!wp.url || !wp.username) {
    throw new Error(`WordPress untuk blog "${blogId}" belum dikonfigurasi (url/username kosong).`);
  }
  const site = String(wp.url).replace(/\/+$/, '');
  return {
    blogId,
    cfg,
    args: rest,
    paths,
    site,
    api: `${site}/wp-json/wp/v2`,
    auth: basicAuth(wp.username, wp.app_password)
  };
}

// Untuk script murni-file yang tidak menyentuh WordPress: tidak boleh gagal
// hanya karena .env belum diisi.
function resolveBlogOffline(argv = process.argv.slice(2)) {
  const { blogId: explicit, rest } = parseBlogArg(argv);
  const blogId = resolveBlogId(explicit);
  return { blogId, cfg: readConfig(blogId), args: rest, paths };
}

module.exports = { resolveBlog, resolveBlogOffline, parseBlogArg, readConfig, paths, SKILL_DIR };
