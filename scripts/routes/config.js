'use strict';
const fs = require('fs');
const path = require('path');
const { basicAuth, fetchCategories } = require('../lib/wp-client');
const { resolveCredentials, envKeys } = require('../lib/env');
const { deepMerge, stripCredentials, stripKnowledgeBase } = require('../lib/config-merge');
const { resolveBlog, requireBlog } = require('../lib/tenant');
const { resolveKnowledgeBase, sourceType } = require('../lib/knowledge');

// Dijalankan SETELAH knowledge base diresolusi: suffix judul SEO memakai nama
// bisnis yang berlaku sekarang, bukan nama dari cadangan manual yang sudah tidak
// dipakai. Salah di sini mendarat diam-diam di meta title tiap artikel.
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

// Page builder ikut default 'none': situs tanpa builder adalah kasus umum, dan
// menebak 'elementor' akan membuat skill edit-elementor tampak berlaku di situs
// yang halamannya sebenarnya HTML biasa.
function withPageBuilderDefaults(cfg) {
  if (!cfg.page_builder) cfg.page_builder = { type: 'none' };
  return cfg;
}

// Ganti knowledge_base tersimpan dengan hasil resolusi (manual apa adanya,
// business_asset dibaca live), lalu lampirkan penanda sumber untuk UI.
function withResolvedKnowledge(cfg) {
  const { knowledge_base, source, error } = resolveKnowledgeBase(cfg);
  return { ...cfg, knowledge_base, _knowledge: { source, error } };
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
        const { clean: cfgClean } = stripCredentials(cfg);
        return res.json({ ...withPageBuilderDefaults(withSeoDefaults(withResolvedKnowledge(cfgClean))), _credentials: credMarker });
      }
      const templatePath = path.join(paths.skillDir, 'config.template.json');
      if (fs.existsSync(templatePath)) {
        const raw = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
        delete raw._instructions;
        const clean = JSON.parse(JSON.stringify(raw, (k, v) => k.startsWith('_') ? undefined : v));
        const { clean: templateClean } = stripCredentials(clean);
        return res.json({ ...withPageBuilderDefaults(withSeoDefaults(withResolvedKnowledge(templateClean))), _credentials: credMarker });
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
      // Mode ditentukan oleh knowledge_source yang DIKIRIM kalau ada, kalau
      // tidak oleh yang tersimpan — supaya perpindahan mode dan penyimpanan
      // knowledge_base bisa terjadi dalam satu POST tanpa saling menjegal.
      const effective = req.body?.knowledge_source ? req.body : stored;
      const { clean: noCred, ignored: credIgnored } = stripCredentials(req.body);
      const { clean, ignored: kbIgnored } = stripKnowledgeBase(noCred, sourceType(effective), sourceType(stored));
      const merged = deepMerge(stored, clean);
      fs.writeFileSync(configFile, JSON.stringify(merged, null, 2), 'utf-8');
      const out = { success: true, path: configFile };
      const notes = [];
      if (credIgnored.length) {
        notes.push(`Kredensial (${credIgnored.join(', ')}) diabaikan — set lewat .env, bukan lewat dashboard.`);
      }
      if (kbIgnored.length) {
        notes.push(sourceType(effective) === 'manual'
          ? 'knowledge_base diabaikan — isinya masih data Business Asset yang tampil di layar. Cadangan manualmu dibiarkan utuh; sunting lalu simpan lagi kalau mau mengubahnya.'
          : 'knowledge_base diabaikan — sumbernya Business Asset, jadi datanya dibaca langsung dari sana.');
      }
      if (notes.length) out.warning = notes.join(' ');
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
