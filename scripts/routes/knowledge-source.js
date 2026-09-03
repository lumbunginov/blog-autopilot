'use strict';
const fs = require('fs');
const path = require('path');
const { resolveKnowledgeBase } = require('../lib/knowledge');
const { resolveBlog } = require('../lib/tenant');

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
};
