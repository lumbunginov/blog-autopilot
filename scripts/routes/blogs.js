'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function registerBlogs(app, deps) {
  const { paths } = deps;
  const { sanitizeId } = require('../lib/paths');

  app.get('/api/blogs', (req, res) => {
    const blogs = paths.listBlogs().map(id => {
      let name = id;
      try {
        const cfg = JSON.parse(fs.readFileSync(paths.configPath(id), 'utf-8'));
        name = cfg.knowledge_base?.business_name || cfg.wordpress?.url || id;
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
      res.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.put('/api/blogs/:id/config', (req, res) => {
    try {
      const p = paths.configPath(req.params.id);
      if (!fs.existsSync(path.dirname(p))) return res.status(404).json({ error: 'Blog tidak ditemukan' });
      fs.writeFileSync(p, JSON.stringify(req.body, null, 2), 'utf-8');
      res.json({ success: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/blogs/active', (req, res) => {
    try {
      paths.setActiveBlog(req.body?.id);
      res.json({ success: true, active: paths.activeBlog() });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
};
