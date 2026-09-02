'use strict';
const fs = require('fs');

module.exports = function registerPlans(app, deps) {
  const { PLANS_FILE } = deps.paths;
  const { broadcast } = deps;

  function readPlans() {
    if (!fs.existsSync(PLANS_FILE)) return { plans: [] };
    try { return JSON.parse(fs.readFileSync(PLANS_FILE, 'utf-8')); }
    catch (e) { return { plans: [] }; }
  }

  app.get('/api/plans', (req, res) => res.json(readPlans()));

  app.post('/api/plans', (req, res) => {
    const plan = req.body || {};
    if (!plan.keyword) return res.status(400).json({ error: 'keyword is required' });
    const data = readPlans();
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
    fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2));
    broadcast('plan_saved', { plan_id: plan.id, keyword: plan.keyword, title: plan.title || plan.keyword });
    res.json({ success: true, created, id: plan.id });
  });

  app.delete('/api/plans', (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const data = readPlans();
    const before = data.plans.length;
    data.plans = data.plans.filter(p => p.id !== id);
    if (data.plans.length === before) return res.status(404).json({ error: 'Plan not found' });
    fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
  });
};
