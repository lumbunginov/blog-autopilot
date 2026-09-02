'use strict';
const http = require('http');
const https = require('https');
const { extractFromHtml } = require('../lib/html-extract');

module.exports = function registerScrape(app, deps) {
  app.get('/api/scrape', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'Missing url parameter' });

    let parsedTarget;
    try { parsedTarget = new URL(targetUrl); }
    catch (e) { return res.status(400).json({ error: 'Invalid URL: ' + targetUrl }); }

    const protocol = parsedTarget.protocol === 'https:' ? https : http;
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
      if ((scrapeRes.statusCode === 301 || scrapeRes.statusCode === 302) && scrapeRes.headers.location) {
        scrapeRes.resume();
        const redir = new URL(scrapeRes.headers.location, targetUrl);
        const rProtocol = redir.protocol === 'https:' ? https : http;
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
          rRes.on('end', () => res.json(extractFromHtml(html, targetUrl)));
        });
        rReq.on('error', e => res.status(500).json({ error: 'Fetch failed: ' + e.message }));
        return;
      }
      if (scrapeRes.statusCode !== 200) {
        scrapeRes.resume();
        return res.status(502).json({ error: 'Site returned status ' + scrapeRes.statusCode });
      }
      const ct = scrapeRes.headers['content-type'] || '';
      if (!ct.includes('html')) {
        scrapeRes.resume();
        return res.status(415).json({ error: 'URL is not an HTML page (got: ' + ct + ')' });
      }
      let html = '';
      scrapeRes.on('data', chunk => html += chunk);
      scrapeRes.on('end', () => res.json(extractFromHtml(html, targetUrl)));
    });

    scrapeReq.on('timeout', () => {
      scrapeReq.destroy();
      res.status(504).json({ error: 'Connection timeout — site did not respond in 10 seconds' });
    });
    scrapeReq.on('error', e => res.status(500).json({ error: 'Connection failed: ' + e.message }));
  });
};
