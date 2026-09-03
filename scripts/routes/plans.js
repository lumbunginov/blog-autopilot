'use strict';
const fs = require('fs');
const { slugify, checkSlug, normalizeSlug } = require('../lib/slug-guard');
const { readArticlesCache } = require('../lib/articles-cache');
const { deepMerge } = require('../lib/config-merge');
const { resolveBlog, requireBlog } = require('../lib/tenant');

module.exports = function registerPlans(app, deps) {
  const { paths, broadcast } = deps;

  function readPlans(plansFile) {
    if (!fs.existsSync(plansFile)) return { plans: [] };
    try { return JSON.parse(fs.readFileSync(plansFile, 'utf-8')); }
    catch (e) { console.error('Failed to parse plans file:', e.message); return { plans: [] }; }
  }

  app.get('/api/plans', (req, res) => {
    try { res.json(readPlans(paths.plansPath(resolveBlog(req, paths)))); }
    catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  app.post('/api/plans', (req, res) => {
    let blogId, plansFile;
    try { blogId = requireBlog(req, paths); plansFile = paths.plansPath(blogId); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const plan = req.body || {};
    if (!plan.keyword) return res.status(400).json({ error: 'keyword is required' });

    const data = readPlans(plansFile);
    const idx = data.plans.findIndex(p => p.id === plan.id);
    const slug = plan.slug || slugify(plan.title || plan.keyword);

    // Duplicate check is only meaningful for a slug this plan does not
    // already own: a brand-new plan, or an existing plan whose slug is
    // being changed. Re-saving a plan with the slug it already has (the
    // normal state of a plan whose article was published) must not 409.
    const ownsSlug = idx !== -1 && normalizeSlug(data.plans[idx].slug) === normalizeSlug(slug);
    if (!ownsSlug) {
      const check = checkSlug(slug, readArticlesCache(paths.cachePath(blogId)));
      if (check.duplicate && plan.allow_duplicate !== true) {
        return res.status(409).json({
          error: `Slug "${slug}" sudah dipakai artikel lain.`,
          existing: check.existing
        });
      }
    }
    plan.slug = slug;

    const now = new Date().toISOString();
    let created = false;
    let saved;
    if (idx === -1) {
      saved = { ...plan, created_at: now, updated_at: now };
      data.plans.unshift(saved); created = true;
    } else {
      saved = deepMerge(data.plans[idx], plan);
      saved.created_at = data.plans[idx].created_at;
      saved.updated_at = now;
      data.plans[idx] = saved;
    }
    fs.writeFileSync(plansFile, JSON.stringify(data, null, 2));
    broadcast('plan_saved', { plan_id: saved.id, keyword: saved.keyword, title: saved.title || saved.keyword });
    res.json({ success: true, created, id: saved.id });
  });

  app.delete('/api/plans', (req, res) => {
    let plansFile;
    try { plansFile = paths.plansPath(requireBlog(req, paths)); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

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
