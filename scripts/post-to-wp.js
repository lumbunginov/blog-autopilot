#!/usr/bin/env node
/**
 * post-to-wp.js — Create a WordPress post via REST API
 * Usage: node post-to-wp.js --data <converted.json> --wp-url <url> --username <user> [--blog <id>]
 *        [--status draft|publish] [--featured-media <id>] [--category <name>]
 * Password is read from .env (variable {ID}_WP_APP_PASSWORD), never from argv.
 * Output: <data-file>.post-result.json with post_id, admin_url, preview_url
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const { loadDotEnv, envKeys } = require('./lib/env');

loadDotEnv(path.join(__dirname, '..', '.env'));

// Parse args
const args = {};
process.argv.slice(2).forEach((arg, i, arr) => {
  if (arg.startsWith('--')) args[arg.slice(2)] = arr[i + 1];
});

const {
  data: dataFile,
  'wp-url': wpUrl,
  username,
  status: statusArg = 'draft',
  'featured-media': featuredMedia = '0',
  category = '',
  'schedule-date': scheduleDate = ''
} = args;

const blogId = args.blog || 'perkapcom';
const password = process.env[envKeys(blogId).wpPassword];
if (!password) {
  console.error(`❌ ${envKeys(blogId).wpPassword} belum diset di .env`);
  process.exit(1);
}

// If schedule-date provided, WordPress needs status='future' + date field
const status = scheduleDate ? 'future' : statusArg;

if (!dataFile || !wpUrl || !username) {
  console.error('Missing required: --data --wp-url --username');
  process.exit(1);
}

if (!fs.existsSync(dataFile)) {
  console.error('Data file not found: ' + dataFile);
  process.exit(1);
}

// Load app config for SEO plugin settings
const CONFIG_FILE = path.join(__dirname, '..', 'blog-autopilot-config.json');
const appConfig = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) : {};
const seoPlugin = appConfig.seo_plugin || { type: 'rankmath' };
const seoType = seoPlugin.type || 'rankmath';

const articleData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

const baseUrl = wpUrl.replace(/\/$/, '');
const apiBase = baseUrl + '/wp-json/wp/v2';
const parsed = url.parse(apiBase + '/posts');
const isHttps = parsed.protocol === 'https:';

function makeRequest(apiPath, method, body) {
  return new Promise((resolve, reject) => {
    const lib = isHttps ? https : http;
    const p = url.parse(apiBase + apiPath);
    const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : null;

    const options = {
      hostname: p.hostname,
      port: p.port || (isHttps ? 443 : 80),
      path: p.path,
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {})
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function getCategoryId(catName) {
  if (!catName) return null;
  const res = await makeRequest(`/categories?search=${encodeURIComponent(catName)}&per_page=5`, 'GET');
  if (res.status === 200 && Array.isArray(res.body) && res.body.length > 0) {
    return res.body[0].id;
  }
  return null;
}

async function createPost() {
  // Build post payload
  const payload = {
    title: articleData.title || 'Untitled',
    content: articleData.html || '',
    slug: articleData.slug || '',
    status: status,
    comment_status: 'closed',
    ping_status: 'open',
  };

  // WordPress scheduled post: status must be 'future' AND date must be set
  if (scheduleDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
      console.error('Invalid --schedule-date format. Expected: YYYY-MM-DD (e.g., 2026-04-20)');
      process.exit(1);
    }
    payload.date = scheduleDate + 'T07:00:00'; // publish at 07:00 server time
  }

  // SEO metadata — conditional per plugin type
  if (seoType !== 'none' && (articleData.meta_title || articleData.meta_description || articleData.focus_keyword)) {
    payload.meta = {};

    if (seoType === 'rankmath') {
      if (articleData.meta_title)       payload.meta.rank_math_title           = articleData.meta_title;
      if (articleData.meta_description) payload.meta.rank_math_description     = articleData.meta_description;
      if (articleData.focus_keyword)    payload.meta.rank_math_focus_keyword   = articleData.focus_keyword;
      const rm = seoPlugin.rankmath || {};
      if (rm.robots_meta)   payload.meta.rank_math_robots       = [rm.robots_meta];
      if (rm.content_type)  payload.meta.rank_math_content_type = rm.content_type;
    }

    if (seoType === 'yoast') {
      if (articleData.meta_title)       payload.meta._yoast_wpseo_title    = articleData.meta_title;
      if (articleData.meta_description) payload.meta._yoast_wpseo_metadesc = articleData.meta_description;
      if (articleData.focus_keyword)    payload.meta._yoast_wpseo_focuskw  = articleData.focus_keyword;
    }

    // seoType === 'none': leave payload.meta empty, then delete it
    if (!payload.meta || Object.keys(payload.meta).length === 0) delete payload.meta;
  }

  // Featured image
  const mediaId = parseInt(featuredMedia);
  if (mediaId && mediaId > 0) {
    payload.featured_media = mediaId;
  }

  // Category
  if (category) {
    const catId = await getCategoryId(category);
    if (catId) payload.categories = [catId];
  }

  // Create post
  const res = await makeRequest('/posts', 'POST', payload);

  if (res.status !== 201) {
    console.error('Post creation failed: ' + res.status);
    console.error(JSON.stringify(res.body, null, 2));
    process.exit(1);
  }

  const post = res.body;
  const postId = post.id;

  // Attach featured image to post (critical step!)
  if (mediaId && mediaId > 0) {
    await makeRequest(`/media/${mediaId}`, 'POST', { post: postId }).catch(() => {});
  }

  const result = {
    post_id: postId,
    post_url: post.link || `${baseUrl}/${post.slug}/`,
    admin_url: `${baseUrl}/wp-admin/post.php?post=${postId}&action=edit`,
    preview_url: `${baseUrl}/?p=${postId}&preview=true`,
    status: post.status,
    title: post.title?.rendered || payload.title,
    slug: post.slug
  };

  const outputFile = dataFile.replace('.converted.json', '.post-result.json');
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');

  console.log('CREATED:' + outputFile);
  console.log('POST_ID:' + postId);
  console.log('ADMIN:' + result.admin_url);
  console.log('PREVIEW:' + result.preview_url);
}

createPost().catch(e => {
  console.error('ERROR:' + e.message);
  process.exit(1);
});
