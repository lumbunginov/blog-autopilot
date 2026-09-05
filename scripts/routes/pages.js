'use strict';
const fs = require('fs');
const cacheLib = require('../lib/articles-cache');
const { basicAuth } = require('../lib/wp-client');
const wpSync = require('../lib/wp-sync');
const { resolveCredentials } = require('../lib/env');
const { resolveBlog: resolveBlogTenant } = require('../lib/tenant');

// Page WordPress: baca saja. Sinkron dan cari, tanpa ubah status.
module.exports = function registerPages(app, deps) {
  const { paths } = deps;

  function syncState() {
    if (!deps.state.pagesSyncState) {
      deps.state.pagesSyncState = { done: true, updated: 0, lastSync: null };
    }
    return deps.state.pagesSyncState;
  }

  async function doFullSync(cfg, cachePath) {
    deps.state.pagesSyncState = { done: false, updated: 0, lastSync: null };
    const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
    const cache = await wpSync.fullSync({ wpUrl: cfg.wordpress.url, auth, cachePath, resource: 'pages' });
    deps.state.pagesSyncState = { done: true, updated: cache.totalCount, lastSync: cache.lastSync };
  }

  async function doIncrementalSync(cfg, existingCache, cachePath) {
    deps.state.pagesSyncState = { done: false, updated: 0, lastSync: existingCache.lastSync };
    const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
    const { cache, updated } = await wpSync.incrementalSync({
      wpUrl: cfg.wordpress.url, auth, cachePath, existingCache, resource: 'pages'
    });
    deps.state.pagesSyncState = { done: true, updated, lastSync: cache.lastSync };
  }

  app.get('/api/pages', (req, res) => {
    let blogId;
    try { blogId = resolveBlogTenant(req, paths); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    const configFile = paths.configPath(blogId);
    const cachePath = paths.pagesCachePath(blogId);
    const force = req.query.force === 'true';
    const nosync = req.query.nosync === 'true';

    if (force && fs.existsSync(cachePath)) {
      if (!syncState().done) {
        return res.status(409).json({ error: 'Sync already in progress. Try again shortly.' });
      }
      fs.unlinkSync(cachePath);
    }

    const cache = cacheLib.readArticlesCache(cachePath);

    let cfg;
    try {
      if (!fs.existsSync(configFile)) throw new Error('Config not found');
      const raw = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (!raw.wordpress?.url || !raw.wordpress?.username) throw new Error('WordPress not configured');
      cfg = resolveCredentials(blogId, raw);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    if (!cache) {
      res.json({ articles: [], totalCount: 0, lastSync: null, syncing: true });
      doFullSync(cfg, cachePath).catch(e => {
        deps.state.pagesSyncState = { done: true, updated: 0, lastSync: null, error: e.message };
      });
      return;
    }

    if (nosync) {
      return res.json({ ...cache, syncing: false });
    }

    res.json({ ...cache, syncing: true });
    if (syncState().done) {
      doIncrementalSync(cfg, cache, cachePath).catch(e => {
        deps.state.pagesSyncState = { done: true, updated: 0, lastSync: cache.lastSync, error: e.message };
      });
    }
  });

  app.get('/api/pages/sync-status', (req, res) => {
    res.json(syncState());
  });
};
