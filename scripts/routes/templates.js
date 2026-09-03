'use strict';
const { readTemplates, saveTemplate, deleteTemplate } = require('../lib/template-store');
const { resolveBlog, requireBlog } = require('../lib/tenant');

module.exports = function registerTemplates(app, deps) {
  const { paths } = deps;

  // GET toleran: tenant baru belum punya templates.json, dan itu bukan galat.
  app.get('/api/templates', (req, res) => {
    try { res.json(readTemplates(paths.templatesPath(resolveBlog(req, paths)))); }
    catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  // POST memakai requireBlog: blog id yang salah ketik tidak boleh diam-diam
  // membuat tenant baru lewat mkdirSync di writeTemplates.
  app.post('/api/templates', (req, res) => {
    let file;
    try { file = paths.templatesPath(requireBlog(req, paths)); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    try {
      const { template, created } = saveTemplate(file, req.body || {});
      res.json({ success: true, created, id: template.id });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete('/api/templates', (req, res) => {
    let file;
    try { file = paths.templatesPath(requireBlog(req, paths)); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id wajib diisi' });
    if (!deleteTemplate(file, id)) return res.status(404).json({ error: 'Template tidak ditemukan' });
    res.json({ success: true });
  });
};
