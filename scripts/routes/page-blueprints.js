'use strict';
// Blueprint halaman: kerangka seksi yang harus diikuti halaman sejenis.
// Disimpan per-berkas di data/blogs/<id>/page-blueprints/, bukan di
// templates.json — isinya struktur, bukan prompt, dan bisa panjang.
const fs = require('fs');
const path = require('path');
const bp = require('../lib/blueprint-store');
const { resolveBlog, requireBlog } = require('../lib/tenant');

// Halaman yang bisa direkam/diperiksa = berkas hasil extract-elementor.js.
// .bak disaring: itu jejak suntingan, bukan halaman yang dikelola.
function daftarHalaman(paths, blogId) {
  const dir = path.join(paths.blogDir(blogId), 'elementor', 'elementor');
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('.bak')).sort(); }
  catch { return []; }
}

function bacaHalaman(paths, blogId, slugFile) {
  const p = path.join(paths.blogDir(blogId), 'elementor', 'elementor', slugFile);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

module.exports = function registerPageBlueprints(app, deps) {
  const { paths } = deps;

  // GET toleran: tenant yang belum merekam blueprint apa pun bukan galat.
  app.get('/api/page-blueprints', (req, res) => {
    try {
      const blogId = resolveBlog(req, paths);
      const dir = paths.blueprintsDir(blogId);
      const map = bp.readMap(dir);
      const halaman = daftarHalaman(paths, blogId);
      res.json({
        blueprints: bp.list(dir).map(b => ({
          ...b,
          pages: halaman.filter(h => map[h] === b.name)
        })),
        pages: halaman.map(h => ({ file: h, blueprint: map[h] || null }))
      });
    } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  // Rekam blueprint dari satu halaman yang sudah dianggap benar.
  app.post('/api/page-blueprints', (req, res) => {
    let blogId;
    try { blogId = requireBlog(req, paths); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const source = String(req.body?.source || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!source || !name) return res.status(400).json({ error: 'source dan name wajib diisi' });
    // source datang dari klien dan dipakai menyusun path: hanya nama berkas
    // yang memang ada di daftar yang boleh lewat.
    if (!daftarHalaman(paths, blogId).includes(source)) {
      return res.status(404).json({ error: `Halaman "${source}" tidak ada di elementor/` });
    }

    try {
      const blueprint = bp.capture(bacaHalaman(paths, blogId, source), {
        name, note: String(req.body?.note || '').trim(), source
      });
      const dir = paths.blueprintsDir(blogId);
      bp.write(dir, blueprint);
      bp.setMap(dir, source, blueprint.name); // halaman sumber otomatis terpetakan
      res.json({ success: true, name: blueprint.name, sections: blueprint.sections.length });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Periksa: tanpa body → semua halaman yang terpetakan; dengan {pages:[...]}
  // → hanya itu. Selalu balas 200 dengan hasil per halaman; halaman menyimpang
  // adalah temuan, bukan galat HTTP.
  app.post('/api/page-blueprints/check', (req, res) => {
    let blogId;
    try { blogId = requireBlog(req, paths); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const dir = paths.blueprintsDir(blogId);
    const map = bp.readMap(dir);
    const semua = daftarHalaman(paths, blogId);
    const diminta = Array.isArray(req.body?.pages) && req.body.pages.length
      ? req.body.pages.filter(p => semua.includes(p))
      : semua.filter(h => map[h]);

    const hasil = diminta.map(slugFile => {
      const nama = req.body?.blueprint || map[slugFile];
      if (!nama) return { page: slugFile, status: 'lewat', pesan: 'tanpa blueprint' };
      const blueprint = bp.read(dir, nama);
      if (!blueprint) return { page: slugFile, status: 'galat', pesan: `blueprint "${nama}" tidak ada` };
      try {
        const c = bp.compare(blueprint, bacaHalaman(paths, blogId, slugFile));
        return { page: slugFile, blueprint: nama, status: c.ok ? 'sesuai' : 'menyimpang', ...c };
      } catch (e) { return { page: slugFile, status: 'galat', pesan: e.message }; }
    });

    res.json({ hasil, menyimpang: hasil.filter(h => h.status === 'menyimpang').length });
  });

  // Petakan / lepas halaman dari blueprint.
  app.post('/api/page-blueprints/map', (req, res) => {
    let blogId;
    try { blogId = requireBlog(req, paths); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const page = String(req.body?.page || '').trim();
    const name = req.body?.blueprint == null ? null : String(req.body.blueprint).trim();
    if (!page) return res.status(400).json({ error: 'page wajib diisi' });
    if (!daftarHalaman(paths, blogId).includes(page)) {
      return res.status(404).json({ error: `Halaman "${page}" tidak ada di elementor/` });
    }

    const dir = paths.blueprintsDir(blogId);
    try {
      if (!name) { bp.unsetMap(dir, page); return res.json({ success: true, blueprint: null }); }
      if (!bp.read(dir, name)) return res.status(404).json({ error: `Blueprint "${name}" tidak ada` });
      bp.setMap(dir, page, name);
      res.json({ success: true, blueprint: bp.sanitizeName(name) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete('/api/page-blueprints', (req, res) => {
    let blogId;
    try { blogId = requireBlog(req, paths); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name wajib diisi' });
    const dir = paths.blueprintsDir(blogId);
    if (!bp.remove(dir, name)) return res.status(404).json({ error: 'Blueprint tidak ditemukan' });
    // Halaman yang menunjuk blueprint terhapus ikut dilepas, supaya check
    // tidak melapor "blueprint tidak ada" selamanya.
    const map = bp.readMap(dir);
    Object.keys(map).forEach(p => { if (map[p] === bp.sanitizeName(name)) bp.unsetMap(dir, p); });
    res.json({ success: true });
  });
};
