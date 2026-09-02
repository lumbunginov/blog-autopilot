#!/usr/bin/env node
/**
 * Blog Autopilot - Dashboard Server
 * Pure Node.js, no npm dependencies required.
 * Serves the dashboard UI and handles config read/write.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { extractFromHtml } = require('../scripts/lib/html-extract');
const cacheLib = require('../scripts/lib/articles-cache');
const { decodeWpEntities, mapPost } = cacheLib;
const readArticlesCache = () => cacheLib.readArticlesCache(ARTICLES_CACHE_FILE);
const writeArticlesCache = (data) => cacheLib.writeArticlesCache(ARTICLES_CACHE_FILE, data);
const { basicAuth, fetchCategories } = require('../scripts/lib/wp-client');
const wpSync = require('../scripts/lib/wp-sync');

const PORT = 3847;
const SKILL_DIR = path.join(__dirname, '..');
const CONFIG_FILE = path.join(SKILL_DIR, 'blog-autopilot-config.json');
const ARTICLES_CACHE_FILE = path.join(SKILL_DIR, 'articles-cache.json');
const PLANS_FILE = path.join(SKILL_DIR, 'article-plans.json');
const QUEUE_FILE = path.join(SKILL_DIR, 'agent-queue.json');
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(msg); } catch(e) { sseClients.delete(client); }
  });
}

let syncState = { done: true, updated: 0, lastSync: null };
const DASHBOARD_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function doFullSync(cfg) {
  syncState = { done: false, updated: 0, lastSync: null };
  const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
  const cache = await wpSync.fullSync({ wpUrl: cfg.wordpress.url, auth, cachePath: ARTICLES_CACHE_FILE });
  syncState = { done: true, updated: cache.totalCount, lastSync: cache.lastSync };
}

async function doIncrementalSync(cfg, existingCache) {
  syncState = { done: false, updated: 0, lastSync: existingCache.lastSync };
  const auth = basicAuth(cfg.wordpress.username, cfg.wordpress.app_password);
  const { cache, updated } = await wpSync.incrementalSync({
    wpUrl: cfg.wordpress.url, auth, cachePath: ARTICLES_CACHE_FILE, existingCache
  });
  syncState = { done: true, updated, lastSync: cache.lastSync };
}

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

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // --- API: GET /api/events (SSE stream) ---
  if (pathname === '/api/events' && req.method === 'GET') {
    cors(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('event: connected\ndata: {}\n\n');
    sseClients.add(res);
    res.on('error', () => sseClients.delete(res));
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // --- API: GET config ---
  if (pathname === '/api/config' && req.method === 'GET') {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        withSeoDefaults(cfg);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(cfg, null, 2));
      } else {
        // Return template as starting point
        const templatePath = path.join(__dirname, '..', 'config.template.json');
        let template = '{}';
        if (fs.existsSync(templatePath)) {
          const raw = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
          delete raw._instructions;
          // Remove meta fields
          withSeoDefaults(raw);
          const clean = JSON.stringify(raw, (k, v) => k.startsWith('_') ? undefined : v, 2);
          template = clean;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(template);
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: POST config ---
  if (pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      JSON.parse(body); // Validate JSON
      fs.writeFileSync(CONFIG_FILE, body, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, path: CONFIG_FILE }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: GET categories from WordPress ---
  if (pathname === '/api/categories' && req.method === 'GET') {
    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Config not found. Save your WordPress credentials first.' }));
      }
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      const { url: wpUrl, username, app_password } = cfg.wordpress || {};
      if (!wpUrl || !username || !app_password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'WordPress credentials not configured.' }));
      }

      const result = await fetchCategories(wpUrl, basicAuth(username, app_password));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: GET scrape website for knowledge base ---
  if (pathname === '/api/scrape' && req.method === 'GET') {
    const targetUrl = parsed.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing url parameter' }));
    }

    let parsedTarget;
    try { parsedTarget = new URL(targetUrl); }
    catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid URL: ' + targetUrl }));
    }

    const https = require('https');
    const httpMod = require('http');
    const protocol = parsedTarget.protocol === 'https:' ? https : httpMod;
    const options = {
      hostname: parsedTarget.hostname,
      port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
      path: parsedTarget.pathname + parsedTarget.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BlogAutopilot/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 10000
    };

    const scrapeReq = protocol.get(options, (scrapeRes) => {
      // Follow one redirect
      if ((scrapeRes.statusCode === 301 || scrapeRes.statusCode === 302) && scrapeRes.headers.location) {
        scrapeRes.resume();
        const redir = new URL(scrapeRes.headers.location, targetUrl);
        const rProtocol = redir.protocol === 'https:' ? https : httpMod;
        const rOptions = {
          hostname: redir.hostname,
          port: redir.port || (redir.protocol === 'https:' ? 443 : 80),
          path: redir.pathname + redir.search,
          headers: options.headers,
          timeout: 10000
        };
        const rReq = rProtocol.get(rOptions, (rRes) => {
          let html = '';
          rRes.on('data', chunk => html += chunk);
          rRes.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(extractFromHtml(html, targetUrl)));
          });
        });
        rReq.on('error', e => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Fetch failed: ' + e.message }));
        });
        return;
      }
      if (scrapeRes.statusCode !== 200) {
        scrapeRes.resume();
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Site returned status ' + scrapeRes.statusCode }));
      }
      const ct = scrapeRes.headers['content-type'] || '';
      if (!ct.includes('html')) {
        scrapeRes.resume();
        res.writeHead(415, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'URL is not an HTML page (got: ' + ct + ')' }));
      }
      let html = '';
      scrapeRes.on('data', chunk => html += chunk);
      scrapeRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(extractFromHtml(html, targetUrl)));
      });
    });

    scrapeReq.on('timeout', () => {
      scrapeReq.destroy();
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Connection timeout — site did not respond in 10 seconds' }));
    });
    scrapeReq.on('error', e => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Connection failed: ' + e.message }));
    });
    return;
  }

  // --- API: GET articles list ---
  if (pathname === '/api/articles' && req.method === 'GET') {
    const force = parsed.query.force === 'true';
    const nosync = parsed.query.nosync === 'true';

    if (force && fs.existsSync(ARTICLES_CACHE_FILE)) {
      if (!syncState.done) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Sync already in progress. Try again shortly.' }));
      }
      fs.unlinkSync(ARTICLES_CACHE_FILE);
    }

    const cache = readArticlesCache();

    let cfg;
    try {
      if (!fs.existsSync(CONFIG_FILE)) throw new Error('Config not found');
      cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (!cfg.wordpress?.url || !cfg.wordpress?.username) throw new Error('WordPress not configured');
    } catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }

    if (!cache) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ articles: [], totalCount: 0, lastSync: null, syncing: true }));
      doFullSync(cfg).catch(e => {
        syncState = { done: true, updated: 0, lastSync: null, error: e.message };
      });
      return;
    }

    if (nosync) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ...cache, syncing: false }));
    }

    // Return cache immediately, trigger background incremental sync (if not already running)
    if (!syncState.done) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ...cache, syncing: true }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...cache, syncing: true }));
    doIncrementalSync(cfg, cache).catch(e => {
      syncState = { done: true, updated: 0, lastSync: cache.lastSync, error: e.message };
    });
    return;
  }

  // --- API: GET articles sync status ---
  if (pathname === '/api/articles/sync-status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(syncState));
  }

  // --- API: POST toggle article status ---
  if (pathname === '/api/articles/toggle' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(body.id);
      const { status } = body;
      if (!id || isNaN(id) || !status || !['publish', 'draft'].includes(status)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid id or status. Status must be "publish" or "draft".' }));
      }

      if (!fs.existsSync(CONFIG_FILE)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Config not found' }));
      }
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      const { url: wpUrl, username, app_password } = cfg.wordpress || {};
      if (!wpUrl || !username || !app_password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'WordPress credentials not configured' }));
      }

      const auth = Buffer.from(`${username}:${app_password}`).toString('base64');
      const base = wpUrl.replace(/\/$/, '');
      let parsed2;
      try { parsed2 = new URL(`${base}/wp-json/wp/v2/posts/${id}`); }
      catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid WordPress URL' }));
      }

      const protocol = parsed2.protocol === 'https:' ? https : http;
      const payload = JSON.stringify({ status });
      const options = {
        hostname: parsed2.hostname,
        port: parsed2.port || (parsed2.protocol === 'https:' ? 443 : 80),
        path: parsed2.pathname,
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + auth,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'BlogAutopilot/1.0'
        },
        timeout: 10000
      };

      let responded = false;
      const wpReq = protocol.request(options, (wpRes) => {
        let data = '';
        wpRes.on('data', chunk => data += chunk);
        wpRes.on('end', () => {
          try {
            const post = JSON.parse(data);
            if (post.id) {
              const cache = readArticlesCache();
              if (cache) {
                const idx = cache.articles ? cache.articles.findIndex(a => a.id === id) : -1;
                if (idx !== -1) {
                  cache.articles[idx].status = post.status;
                  cache.articles[idx].modified = post.modified ? post.modified.split('T')[0] : cache.articles[idx].modified;
                  writeArticlesCache(cache);
                }
              }
              if (responded) return; responded = true;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, id: post.id, status: post.status }));
            } else if (wpRes.statusCode >= 400) {
              if (responded) return; responded = true;
              res.writeHead(wpRes.statusCode, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: post.message || 'WP API error', code: post.code }));
            } else {
              if (responded) return; responded = true;
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unexpected WP response: ' + data.substring(0, 200) }));
            }
          } catch(e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Parse error: ' + e.message }));
          }
        });
      });

      wpReq.on('error', (e) => {
        if (responded) return;
        responded = true;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'WP connection failed: ' + e.message }));
      });
      wpReq.on('timeout', () => {
        wpReq.destroy();
        if (responded) return;
        responded = true;
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Connection timeout' }));
      });
      wpReq.write(payload);
      wpReq.end();
      return;
    } catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: GET /api/agent-queue ---
  if (pathname === '/api/agent-queue' && req.method === 'GET') {
    cors(res);
    let data = { tasks: [] };
    if (fs.existsSync(QUEUE_FILE)) {
      try { data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); } catch(e) { console.error('Failed to parse queue file:', e.message); }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data));
  }

  // --- API: POST /api/agent-queue (create task) ---
  if (pathname === '/api/agent-queue' && req.method === 'POST') {
    cors(res);
    try {
      const task = JSON.parse(await readBody(req));
      if (!task.type || !task.input) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'type and input are required' }));
      }
      let data = { tasks: [] };
      if (fs.existsSync(QUEUE_FILE)) {
        try { data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); } catch(e) { console.error('Failed to parse queue file:', e.message); }
      }
      const now = new Date().toISOString();
      task.id = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      task.status = 'pending';
      if (task.type === 'auto_generate') {
        task.progress = { current: 0, total: task.input.count || 5 };
      } else {
        task.progress = task.progress || { current: 0, total: 0 };
      }
      task.results = [];
      task.error = null;
      task.created_at = now;
      task.updated_at = now;
      data.tasks.unshift(task);
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
      broadcast('queue_updated', { id: task.id, status: task.status, progress: task.progress, input: task.input });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, id: task.id }));
    } catch(e) {
      console.error('[agent-queue POST] error:', e.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: PATCH /api/agent-queue (update task status/progress) ---
  if (pathname === '/api/agent-queue' && req.method === 'PATCH') {
    cors(res);
    try {
      const update = JSON.parse(await readBody(req));
      if (!update.id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'id is required' }));
      }
      let data = { tasks: [] };
      if (fs.existsSync(QUEUE_FILE)) {
        try { data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); } catch(e) { console.error('Failed to parse queue file:', e.message); }
      }
      const idx = data.tasks.findIndex(t => t.id === update.id);
      if (idx === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Task not found' }));
      }
      if (update.status !== undefined) data.tasks[idx].status = update.status;
      if (update.progress !== undefined) data.tasks[idx].progress = update.progress;
      if (update.results !== undefined) data.tasks[idx].results = update.results;
      if (update.error !== undefined) data.tasks[idx].error = update.error;
      data.tasks[idx].updated_at = new Date().toISOString();
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
      broadcast('queue_updated', { id: update.id, status: data.tasks[idx].status, progress: data.tasks[idx].progress });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    } catch(e) {
      console.error('[agent-queue PATCH] error:', e.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: GET /api/plans ---
  if (pathname === '/api/plans' && req.method === 'GET') {
    cors(res);
    let data = { plans: [] };
    if (fs.existsSync(PLANS_FILE)) {
      try { data = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf-8')); } catch(e) {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data));
  }

  // --- API: POST /api/plans (create or update) ---
  if (pathname === '/api/plans' && req.method === 'POST') {
    cors(res);
    try {
      const plan = JSON.parse(await readBody(req));
      if (!plan.keyword) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'keyword is required' }));
      }
      let data = { plans: [] };
      if (fs.existsSync(PLANS_FILE)) {
        try { data = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf-8')); } catch(e) {}
      }
      const now = new Date().toISOString();
      const idx = data.plans.findIndex(p => p.id === plan.id);
      let created = false;
      if (idx === -1) {
        plan.created_at = now;
        plan.updated_at = now;
        data.plans.unshift(plan);
        created = true;
      } else {
        plan.created_at = data.plans[idx].created_at;
        plan.updated_at = now;
        data.plans[idx] = plan;
      }
      fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2));
      broadcast('plan_saved', { plan_id: plan.id, keyword: plan.keyword, title: plan.title || plan.keyword });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, created, id: plan.id }));
    } catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: DELETE /api/plans ---
  if (pathname === '/api/plans' && req.method === 'DELETE') {
    cors(res);
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'id is required' }));
      }
      let data = { plans: [] };
      if (fs.existsSync(PLANS_FILE)) {
        try { data = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf-8')); } catch(e) {}
      }
      const before = data.plans.length;
      data.plans = data.plans.filter(p => p.id !== body.id);
      if (data.plans.length === before) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Plan not found' }));
      }
      fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    } catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- Static files ---
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    return res.end(fs.readFileSync(filePath));
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  const dashboardUrl = `http://localhost:${PORT}`;
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║        Blog Autopilot Dashboard        ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`🌐 Dashboard: ${dashboardUrl}`);
  console.log(`📁 Config   : ${CONFIG_FILE}`);
  console.log('\nPress Ctrl+C to stop\n');

  // Open in browser
  const { exec } = require('child_process');
  const openCmd = process.platform === 'win32'
    ? `start ${dashboardUrl}`
    : process.platform === 'darwin'
      ? `open ${dashboardUrl}`
      : `xdg-open ${dashboardUrl}`;
  exec(openCmd);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} already in use.`);
    console.error(`Try: http://localhost:${PORT} — it may already be running.\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\nDashboard stopped.');
  process.exit(0);
});
