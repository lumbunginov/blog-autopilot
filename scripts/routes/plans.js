'use strict';
const fs = require('fs');
const { slugify, checkSlug } = require('../lib/slug-guard');
const { readArticlesCache } = require('../lib/articles-cache');

module.exports = function registerPlans(app, deps) {
  const { paths, broadcast } = deps;

  function resolveBlog(req) {
    const id = req.query.blog || req.body?.blog || paths.activeBlog();
    if (!id) throw new Error('Belum ada blog. Buat dulu lewat POST /api/blogs.');
    return id;
  }

  function readPlans(plansFile) {
    if (!fs.existsSync(plansFile)) return { plans: [] };
    try { return JSON.parse(fs.readFileSync(plansFile, 'utf-8')); }
    catch (e) { return { plans: [] }; }
  }

  app.get('/api/plans', (req, res) => {
    try { res.json(readPlans(paths.plansPath(resolveBlog(req)))); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/plans', (req, res) => {
    let blogId, plansFile;
    try { blogId = resolveBlog(req); plansFile = paths.plansPath(blogId); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    const plan = req.body || {};
    if (!plan.keyword) return res.status(400).json({ error: 'keyword is required' });

    const slug = plan.slug || slugify(plan.title || plan.keyword);
    const check = checkSlug(slug, readArticlesCache(paths.cachePath(blogId)));
    if (check.duplicate && !plan.allow_duplicate) {
      return res.status(409).json({
        error: `Slug "${slug}" sudah dipakai artikel lain.`,
        existing: check.existing
      });
    }
    plan.slug = slug;

    const data = readPlans(plansFile);
    const now = new Date().toISOString();
    const idx = data.plans.findIndex(p => p.id === plan.id);
    let created = false;
    if (idx === -1) {
      plan.created_at = now; plan.updated_at = now;
      data.plans.unshift(plan); created = true;
    } else {
      plan.created_at = data.plans[idx].created_at;
      plan.updated_at = now;
      data.plans[idx] = plan;
    }
    fs.writeFileSync(plansFile, JSON.stringify(data, null, 2));
    broadcast('plan_saved', { plan_id: plan.id, keyword: plan.keyword, title: plan.title || plan.keyword });
    res.json({ success: true, created, id: plan.id });
  });

  app.delete('/api/plans', (req, res) => {
    let plansFile;
    try { plansFile = paths.plansPath(resolveBlog(req)); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const data = readPlans(plansFile);
    const before = data.plans.length;
    data.plans = data.plans.filter(p => p.id !== id);
    if (data.plans.length === before) return res.status(404).json({ error: 'Plan not found' });
    fs.writeFileSync(plansFile, JSON.stringify(data, null, 2));
    res.json({ success: true });
  });
};
