'use strict';
const fs = require('fs');
const path = require('path');
const { basicAuth, fetchCategories } = require('../lib/wp-client');
const { resolveCredentials, envKeys } = require('../lib/env');

function withSeoDefaults(cfg) {
  if (!cfg.seo_plugin) {
    const bizName = cfg.knowledge_base?.business_name;
    cfg.seo_plugin = {
      type: 'rankmath',
      rankmath: {
        title_suffix: bizName ? `| ${bizName}` : '| Bisnis Saya',
        robots_meta: 'index,follow',
        content_type: 'article'
      },
      yoast: { title_separator: '|' }
    };
  }
  return cfg;
}

module.exports = function registerConfig(app, deps) {
  const { paths } = deps;

  function resolveBlog(req) {
    const id = req.query.blog || req.body?.blog || paths.activeBlog();
    if (!id) throw new Error('Belum ada blog. Buat dulu lewat POST /api/blogs.');
    return id;
  }

  app.get('/api/config', (req, res) => {
    try {
      const blogId = resolveBlog(req);
      const configFile = paths.configPath(blogId);
      const credMarker = { wpPasswordSet: !!process.env[envKeys(blogId).wpPassword] };
      if (fs.existsSync(configFile)) {
        const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        withSeoDefaults(cfg);
        return res.json({ ...cfg, _credentials: credMarker });
      }
      const templatePath = path.join(paths.skillDir, 'config.template.json');
      if (fs.existsSync(templatePath)) {
        const raw = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
        delete raw._instructions;
        withSeoDefaults(raw);
        const clean = JSON.parse(JSON.stringify(raw, (k, v) => k.startsWith('_') ? undefined : v));
        return res.json({ ...clean, _credentials: credMarker });
      }
      res.json({ _credentials: credMarker });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/config', (req, res) => {
    try {
      const configFile = paths.configPath(resolveBlog(req));
      fs.mkdirSync(path.dirname(configFile), { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify(req.body, null, 2), 'utf-8');
      res.json({ success: true, path: configFile });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/categories', async (req, res) => {
    let cfg;
    try {
      const blogId = resolveBlog(req);
      const configFile = paths.configPath(blogId);
      if (!fs.existsSync(configFile)) {
        return res.status(400).json({ error: 'Config not found. Save your WordPress credentials first.' });
      }
      cfg = resolveCredentials(blogId, JSON.parse(fs.readFileSync(configFile, 'utf-8')));
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    try {
      const { url: wpUrl, username, app_password } = cfg.wordpress || {};
      if (!wpUrl || !username) {
        return res.status(400).json({ error: 'WordPress credentials not configured.' });
      }
      const result = await fetchCategories(wpUrl, basicAuth(username, app_password));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
