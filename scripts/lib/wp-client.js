'use strict';
const http = require('http');
const https = require('https');

function basicAuth(username, password) {
  return Buffer.from(`${username}:${password}`).toString('base64');
}

function httpGet(reqUrl, auth, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(reqUrl); } catch (e) { return reject(e); }
    const protocol = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: { 'Authorization': 'Basic ' + auth, 'User-Agent': 'BlogAutopilot/1.0' },
      timeout
    };
    const req = protocol.get(options, (resp) => {
      const total = parseInt(resp.headers['x-wp-total'] || '0');
      const totalPages = parseInt(resp.headers['x-wp-totalpages'] || '1');
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve({ body: JSON.parse(data), total, totalPages, statusCode: resp.statusCode }); }
        catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 100))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function httpPost(reqUrl, auth, payloadObj, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(reqUrl); } catch (e) { return reject(e); }
    const protocol = parsed.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(payloadObj);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'BlogAutopilot/1.0'
      },
      timeout
    };
    const req = protocol.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve({ statusCode: resp.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timeout')); });
    req.write(payload);
    req.end();
  });
}

async function fetchCategoryMap(wpUrl, auth) {
  const base = wpUrl.replace(/\/$/, '');
  try {
    const { body } = await httpGet(`${base}/wp-json/wp/v2/categories?per_page=100`, auth);
    const map = {};
    if (Array.isArray(body)) body.forEach(c => { map[c.id] = c.name; });
    return map;
  } catch (e) {
    console.error('[fetchCategoryMap] failed:', e.message);
    return {};
  }
}

async function fetchCategories(wpUrl, auth) {
  const base = wpUrl.replace(/\/$/, '');
  const { body } = await httpGet(
    `${base}/wp-json/wp/v2/categories?per_page=100&orderby=count&order=desc`, auth, 10000);
  if (!Array.isArray(body)) {
    throw new Error('Unexpected response from WordPress: ' + JSON.stringify(body).substring(0, 200));
  }
  return body.filter(c => c.count >= 0).map(c => ({ id: c.id, name: c.name, slug: c.slug, count: c.count }));
}

module.exports = { basicAuth, httpGet, httpPost, fetchCategoryMap, fetchCategories };
