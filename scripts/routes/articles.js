'use strict';
const fs = require('fs');
const cacheLib = require('../lib/articles-cache');
const { basicAuth, httpPost } = require('../lib/wp-client');
const wpSync = require('../lib/wp-sync');

module.exports = function registerArticles(app, deps) {
  const { paths } = deps;

  function resolveBlog(req) {
    const id = req.query.blog || req.body?.blog || paths.activeBlog();
    if (!id) throw new Error('Belum ada blog. Buat dulu lewat POST /api/blogs.');
    return id;
  }

  async function doFullSync(cfg, cachePath) {
    deps.state.syncState = { done: false, updated: 0, lastSync: null };
    const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
    const cache = await wpSync.fullSync({ wpUrl: cfg.wordpress.url, auth, cachePath });
    deps.state.syncState = { done: true, updated: cache.totalCount, lastSync: cache.lastSync };
  }

  async function doIncrementalSync(cfg, existingCache, cachePath) {
    deps.state.syncState = { done: false, updated: 0, lastSync: existingCache.lastSync };
    const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
    const { cache, updated } = await wpSync.incrementalSync({
      wpUrl: cfg.wordpress.url, auth, cachePath, existingCache
    });
    deps.state.syncState = { done: true, updated, lastSync: cache.lastSync };
  }

  app.get('/api/articles', (req, res) => {
    let blogId;
    try { blogId = resolveBlog(req); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    const configFile = paths.configPath(blogId);
    const cachePath = paths.cachePath(blogId);
    const force = req.query.force === 'true';
    const nosync = req.query.nosync === 'true';

    if (force && fs.existsSync(cachePath)) {
      if (!deps.state.syncState.done) {
        return res.status(409).json({ error: 'Sync already in progress. Try again shortly.' });
      }
      fs.unlinkSync(cachePath);
    }

    const cache = cacheLib.readArticlesCache(cachePath);

    let cfg;
    try {
      if (!fs.existsSync(configFile)) throw new Error('Config not found');
      cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (!cfg.wordpress?.url || !cfg.wordpress?.username) throw new Error('WordPress not configured');
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    if (!cache) {
      res.json({ articles: [], totalCount: 0, lastSync: null, syncing: true });
      doFullSync(cfg, cachePath).catch(e => {
        deps.state.syncState = { done: true, updated: 0, lastSync: null, error: e.message };
      });
      return;
    }

    if (nosync) {
      return res.json({ ...cache, syncing: false });
    }

    res.json({ ...cache, syncing: true });
    if (deps.state.syncState.done) {
      doIncrementalSync(cfg, cache, cachePath).catch(e => {
        deps.state.syncState = { done: true, updated: 0, lastSync: cache.lastSync, error: e.message };
      });
    }
  });

  app.get('/api/articles/sync-status', (req, res) => {
    res.json(deps.state.syncState);
  });

  app.post('/api/articles/toggle', async (req, res) => {
    try {
      const body = req.body || {};
      const id = Number(body.id);
      const { status } = body;
      if (!id || isNaN(id) || !status || !['publish', 'draft'].includes(status)) {
        return res.status(400).json({ error: 'Invalid id or status. Status must be "publish" or "draft".' });
      }

      const blogId = resolveBlog(req);
      const configFile = paths.configPath(blogId);
      const cachePath = paths.cachePath(blogId);

      if (!fs.existsSync(configFile)) {
        return res.status(400).json({ error: 'Config not found' });
      }
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      const { url: wpUrl, username, app_password } = cfg.wordpress || {};
      if (!wpUrl || !username || !app_password) {
        return res.status(400).json({ error: 'WordPress credentials not configured' });
      }

      const auth = basicAuth(username, app_password);
      const base = wpUrl.replace(/\/$/, '');
      let postUrl;
      try { postUrl = new URL(`${base}/wp-json/wp/v2/posts/${id}`).toString(); }
      catch (e) { return res.status(400).json({ error: 'Invalid WordPress URL' }); }

      let result;
      try {
        result = await httpPost(postUrl, auth, { status });
      } catch (e) {
        return res.status(500).json({ error: 'WP connection failed: ' + e.message });
      }

      const post = result.body;
      if (post.id) {
        const cache = cacheLib.readArticlesCache(cachePath);
        if (cache) {
          const idx = cache.articles ? cache.articles.findIndex(a => a.id === id) : -1;
          if (idx !== -1) {
            cache.articles[idx].status = post.status;
            cache.articles[idx].modified = post.modified ? post.modified.split('T')[0] : cache.articles[idx].modified;
            cacheLib.writeArticlesCache(cachePath, cache);
          }
        }
        return res.json({ success: true, id: post.id, status: post.status });
      }
      if (result.statusCode >= 400) {
        return res.status(result.statusCode).json({ error: post.message || 'WP API error', code: post.code });
      }
      return res.status(500).json({ error: 'Unexpected WP response' });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
};
