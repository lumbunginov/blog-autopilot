'use strict';
const fs = require('fs');
const path = require('path');
const { envKeys } = require('../lib/env');
const { deepMerge, stripCredentials, stripKnowledgeBase } = require('../lib/config-merge');
const { sanitizeId } = require('../lib/paths');
const { resolveKnowledgeBase, sourceType } = require('../lib/knowledge');

module.exports = function registerBlogs(app, deps) {
  const { paths } = deps;

  app.get('/api/blogs', (req, res) => {
    const blogs = paths.listBlogs().map(id => {
      let name = id;
      try {
        const cfg = JSON.parse(fs.readFileSync(paths.configPath(id), 'utf-8'));
        // Nama yang BERLAKU, bukan isi mentah config: tenant business_asset
        // menyimpan knowledge_base manual sebagai cadangan, dan memakainya di sini
        // membuat sidebar menampilkan nama lama sementara tab Knowledge Base
        // menampilkan nama live.
        const kb = resolveKnowledgeBase(cfg).knowledge_base;
        name = kb?.business_name || cfg.wordpress?.url || id;
      } catch (e) { /* config belum ada atau rusak: pakai id */ }
      return { id, name };
    });
    res.json({ blogs, active: paths.activeBlog() });
  });

  app.post('/api/blogs', (req, res) => {
    try {
      const id = sanitizeId(req.body?.id);
      if (paths.listBlogs().includes(id)) {
        return res.status(409).json({ error: `Blog "${id}" sudah ada` });
      }
      const tplPath = path.join(paths.skillDir, 'config.template.json');
      const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf-8'));
      const clean = JSON.parse(JSON.stringify(tpl, (k, v) => k.startsWith('_') ? undefined : v));
      fs.mkdirSync(paths.blogDir(id), { recursive: true });
      fs.writeFileSync(paths.configPath(id), JSON.stringify(clean, null, 2), 'utf-8');
      if (!paths.activeBlog()) paths.setActiveBlog(id);
      res.json({ success: true, id });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/blogs/:id/config', (req, res) => {
    try {
      const p = paths.configPath(req.params.id);
      if (!fs.existsSync(p)) return res.status(404).json({ error: 'Config tidak ditemukan' });
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const { clean } = stripCredentials(raw);
      const { knowledge_base, source, error } = resolveKnowledgeBase(clean);
      const credMarker = { wpPasswordSet: !!process.env[envKeys(req.params.id).wpPassword] };
      res.json({ ...clean, knowledge_base, _knowledge: { source, error }, _credentials: credMarker });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.put('/api/blogs/:id/config', (req, res) => {
    try {
      const p = paths.configPath(req.params.id);
      if (!fs.existsSync(path.dirname(p))) return res.status(404).json({ error: 'Blog tidak ditemukan' });
      const stored = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : {};
      const effective = req.body?.knowledge_source ? req.body : stored;
      const { clean: noCred, ignored } = stripCredentials(req.body);
      const { clean, ignored: kbIgnored } = stripKnowledgeBase(noCred, sourceType(effective), sourceType(stored));
      const merged = deepMerge(stored, clean);
      fs.writeFileSync(p, JSON.stringify(merged, null, 2), 'utf-8');
      const out = { success: true };
      const notes = [];
      if (ignored.length) {
        notes.push(`Kredensial (${ignored.join(', ')}) diabaikan — set lewat .env, bukan lewat dashboard.`);
      }
      if (kbIgnored.length) {
        notes.push(sourceType(effective) === 'manual'
          ? 'knowledge_base diabaikan — isinya masih data Business Asset yang tampil di layar. Cadangan manualmu dibiarkan utuh; sunting lalu simpan lagi kalau mau mengubahnya.'
          : 'knowledge_base diabaikan — sumbernya Business Asset, jadi datanya dibaca langsung dari sana.');
      }
      if (notes.length) out.warning = notes.join(' ');
      res.json(out);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/blogs/active', (req, res) => {
    try {
      paths.setActiveBlog(req.body?.id);
      res.json({ success: true, active: paths.activeBlog() });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
};
