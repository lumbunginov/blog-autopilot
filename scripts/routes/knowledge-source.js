'use strict';
const fs = require('fs');
const path = require('path');
const { resolveKnowledgeBase, sourceType } = require('../lib/knowledge');
const { resolveBlog } = require('../lib/tenant');
const { assertBusinessId, readBusinessAsset, findProduct, hitungFaq, diDalamFolder } = require('../lib/business-asset');

module.exports = function registerKnowledgeSource(app, deps) {
  const { paths } = deps;

  // Endpoint ini menerima path sembarang dari browser, jadi ia sengaja dibatasi:
  // hanya nama subfolder yang memuat profile.json, nama bisnis, dan jumlah
  // produk. Tidak menuruni pohon direktori, tidak mengembalikan isi berkas lain.
  app.get('/api/business-assets', (req, res) => {
    const root = String(req.query.root || '').trim();
    if (!root) return res.status(400).json({ error: 'Parameter "root" wajib diisi.', businesses: [] });

    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      return res.json({ businesses: [], error: `Folder tidak terbaca: ${root} (${e.code || e.message})` });
    }

    const businesses = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      if (!fs.existsSync(path.join(dir, 'profile.json'))) continue;
      let name = entry.name;
      let productCount = 0;
      try {
        name = JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf-8')).nama || entry.name;
      } catch (e) { /* profil rusak: pakai nama folder */ }
      try {
        const list = JSON.parse(fs.readFileSync(path.join(dir, 'products.json'), 'utf-8'));
        productCount = Array.isArray(list) ? list.length : 0;
      } catch (e) { /* products hilang atau rusak: 0 */ }
      businesses.push({ id: entry.name, name, productCount });
    }

    businesses.sort((a, b) => a.id.localeCompare(b.id));
    const error = businesses.length ? null : `Tidak ada business asset di ${root}.`;
    res.json({ businesses, error });
  });

  app.get('/api/knowledge-preview', (req, res) => {
    try {
      const blogId = resolveBlog(req, paths);
      const file = paths.configPath(blogId);
      const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
      const { knowledge_base, source, error } = resolveKnowledgeBase(cfg);
      res.json({
        source,
        error,
        summary: {
          products: knowledge_base.products.length,
          internal_links: knowledge_base.internal_links.length,
          tone: knowledge_base.tone
        }
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message });
    }
  });

  // Hanya nama berkas polos. Tanpa pemisah path, tanpa titik ganda, tanpa NUL.
  const NAMA_BERKAS_RE = /^[A-Za-z0-9._-]+$/;
  const EKSTENSI_GAMBAR = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

  // Config tenant aktif, atau null kalau tenant bukan mode business_asset.
  function baTenantAktif(req) {
    const blogId = resolveBlog(req, paths);
    const file = paths.configPath(blogId);
    const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
    if (sourceType(cfg) !== 'business_asset') return null;
    return { cfg, ba: cfg.knowledge_source.business_asset || {} };
  }

  app.get('/api/business-asset-photo', (req, res) => {
    let ctx;
    try { ctx = baTenantAktif(req); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!ctx) return res.status(400).json({ error: 'Tenant aktif tidak memakai Business Asset.' });

    const nama = String(req.query.file || '');
    // Lapis 1: bentuk nama berkas. Menolak "/", "\", "..", NUL, dan spasi.
    if (!NAMA_BERKAS_RE.test(nama)) return res.status(400).json({ error: 'Nama berkas tidak valid.' });
    // Lapis 2: hanya ekstensi gambar. Config, .env, dan skrip tidak pernah tersaji.
    const ext = path.extname(nama).toLowerCase();
    if (!EKSTENSI_GAMBAR.has(ext)) return res.status(400).json({ error: 'Hanya berkas gambar.' });

    let dirFoto;
    try {
      // Lapis 3: root dari CONFIG, bukan dari query. Browser tidak pernah
      // menentukan direktori mana yang dibaca.
      dirFoto = path.resolve(String(ctx.ba.root || ''), assertBusinessId(ctx.ba.business_id), 'photos');
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // Lapis 4: jaring terakhir. Apa pun yang lolos tiga lapis di atas tetap
    // wajib berada di dalam folder photos.
    if (!diDalamFolder(dirFoto, nama)) {
      return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
    }
    const berkas = path.resolve(dirFoto, nama);
    if (!fs.existsSync(berkas) || !fs.statSync(berkas).isFile()) {
      // Pesan sengaja tidak menyebut path absolut: jangan bocorkan tata letak disk.
      return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
    }
    res.setHeader('Content-Type', MIME[ext]);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(berkas).pipe(res);
  });

  app.get('/api/business-asset-product', (req, res) => {
    let ctx;
    try { ctx = baTenantAktif(req); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!ctx) return res.status(400).json({ error: 'Tenant aktif tidak memakai Business Asset.' });

    const q = String(req.query.id || '').trim();
    if (!q) return res.status(400).json({ error: 'Parameter "id" wajib diisi.' });
    let found;
    try {
      const { products } = readBusinessAsset(ctx.ba.root, ctx.ba.business_id);
      found = findProduct(products, q);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (!found) return res.status(404).json({ error: `Produk "${q}" tidak ditemukan.` });

    // Satu produk, bukan katalog: membuka 45 kartu tidak pernah menarik 143 KB sekaligus.
    res.json({
      id: found.id || '',
      name: found.nama || '',
      url: found.url || '',
      price: found.harga || '',
      target_market: found.targetMarket || '',
      context: found.konteks || '',
      faq: found.faq || '',
      faq_count: hitungFaq(found.faq),
      troubleshooting: found.troubleshooting || '',
      care: found.care || '',
      image: found.foto || '',
      gallery: Array.isArray(found.gallery) ? found.gallery : []
    });
  });
};
