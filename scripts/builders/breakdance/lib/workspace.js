'use strict';
// Folder kerja Breakdance per tenant + klien Abilities yang sudah terautentikasi.
// Breakdance tidak menyimpan halamannya di REST wp/v2 biasa; semua baca/tulis
// lewat ability "breakdance/*" di WordPress Abilities API (lib/abilities.js).
const fs = require('fs');
const path = require('path');
const blog = require('../../../lib/blog');
const { makeClient } = require('../../../lib/abilities');
const { httpGet } = require('../../../lib/wp-client');

const NS = 'breakdance';
const paths = blog.paths;

function dirs(blogId) {
  const root = path.join(paths.blogDir(blogId), 'breakdance');
  return {
    root,
    trees: path.join(root, 'trees'),       // pohon terakhir per halaman (hasil unduh)
    backups: path.join(root, 'backups'),   // pohon SEBELUM tiap suntingan
    docs: path.join(root, 'docs')          // panduan builder yang diambil dari situs
  };
}

function ensureDirs(d) {
  for (const k of ['trees', 'backups', 'docs']) fs.mkdirSync(d[k], { recursive: true });
  return d;
}

// Nama pendek ("get-post-tree") dianggap milik Breakdance; nama berawalan
// namespace lain ("rank-math/...") dipakai apa adanya.
function abilityName(name) {
  return String(name).includes('/') ? String(name) : `${NS}/${name}`;
}

function resolveWorkspace(argv = process.argv.slice(2)) {
  const w = blog.resolveBlog(argv);
  const client = makeClient({ site: w.site, auth: w.auth });
  return {
    ...w,
    dirs: ensureDirs(dirs(w.blogId)),
    client,
    bd: (name, input) => client.run(abilityName(name), input)
  };
}

// <slug|id> → { id, slug }. Status apa pun (draft ikut), karena halaman baru
// selalu dibuat sebagai draft dan harus bisa disunting sebelum terbit.
async function resolvePage(w, target) {
  if (/^\d+$/.test(String(target))) {
    const id = Number(target);
    const { body, statusCode } = await httpGet(`${w.api}/pages/${id}?context=edit&_fields=id,slug`, w.auth);
    return { id, slug: statusCode === 200 && body.slug ? body.slug : String(id) };
  }
  const { body } = await httpGet(`${w.api}/pages?slug=${encodeURIComponent(target)}&status=any&context=edit&_fields=id,slug`, w.auth);
  if (!Array.isArray(body) || body.length === 0) throw new Error(`Halaman dengan slug "${target}" tidak ditemukan`);
  return { id: body[0].id, slug: body[0].slug };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function fetchTree(w, page) {
  const tree = await w.bd('get-post-tree', { post_id: page.id });
  return { post_id: page.id, slug: page.slug, saved_at: new Date().toISOString(), tree };
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  return file;
}

async function saveTree(w, page) {
  const data = await fetchTree(w, page);
  const file = writeJson(path.join(w.dirs.trees, `${page.slug}.json`), data);
  return { data, file };
}

async function backupTree(w, page) {
  const data = await fetchTree(w, page);
  const file = writeJson(path.join(w.dirs.backups, `${page.slug}-${stamp()}.json`), data);
  return { data, file };
}

// Flag sederhana: --nama nilai, --nama=nilai, atau --nama (boolean).
function parseFlags(args, booleans = []) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { rest.push(a); continue; }
    const [k, v] = a.slice(2).split(/=(.*)/s);
    if (v !== undefined) flags[k] = v;
    else if (booleans.includes(k)) flags[k] = true;
    else flags[k] = args[++i];
  }
  return { flags, rest };
}

function readText(file) {
  if (!fs.existsSync(file)) throw new Error(`Berkas tidak ada: ${file}`);
  return fs.readFileSync(file, 'utf-8');
}

module.exports = {
  NS, dirs, abilityName, resolveWorkspace, resolvePage,
  fetchTree, saveTree, backupTree, writeJson, parseFlags, readText
};
