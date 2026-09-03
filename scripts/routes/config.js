'use strict';
const fs = require('fs');
const path = require('path');
const { basicAuth, fetchCategories } = require('../lib/wp-client');
const { resolveCredentials, envKeys } = require('../lib/env');
const { deepMerge, stripCredentials } = require('../lib/config-merge');
const { resolveBlog, requireBlog } = require('../lib/tenant');

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

  app.get('/api/config', (req, res) => {
    try {
      const blogId = resolveBlog(req, paths);
      const configFile = paths.configPath(blogId);
      const credMarker = { wpPasswordSet: !!process.env[envKeys(blogId).wpPassword] };
      if (fs.existsSync(configFile)) {
        const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        withSeoDefaults(cfg);
        const { clean: cfgClean } = stripCredentials(cfg);
        return res.json({ ...cfgClean, _credentials: credMarker });
      }
      const templatePath = path.join(paths.skillDir, 'config.template.json');
      if (fs.existsSync(templatePath)) {
        const raw = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
        delete raw._instructions;
        withSeoDefaults(raw);
        const clean = JSON.parse(JSON.stringify(raw, (k, v) => k.startsWith('_') ? undefined : v));
        const { clean: templateClean } = stripCredentials(clean);
        return res.json({ ...templateClean, _credentials: credMarker });
      }
      res.json({ _credentials: credMarker });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/config', (req, res) => {
    try {
      const configFile = paths.configPath(requireBlog(req, paths));
      const stored = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf-8')) : {};
      const { clean, ignored } = stripCredentials(req.body);
      const merged = deepMerge(stored, clean);
      fs.writeFileSync(configFile, JSON.stringify(merged, null, 2), 'utf-8');
      const out = { success: true, path: configFile };
      if (ignored.length) {
        out.warning = `Kredensial (${ignored.join(', ')}) diabaikan — set lewat .env, bukan lewat dashboard.`;
      }
      res.json(out);
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message });
    }
  });

  app.get('/api/categories', async (req, res) => {
    let cfg;
    try {
      const blogId = resolveBlog(req, paths);
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
