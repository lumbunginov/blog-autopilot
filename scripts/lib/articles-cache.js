'use strict';
const fs = require('fs');
const path = require('path');

function readArticlesCache(cachePath) {
  if (!fs.existsSync(cachePath)) return null;
  try { return JSON.parse(fs.readFileSync(cachePath, 'utf-8')); }
  catch (e) { return null; }
}

function writeArticlesCache(cachePath, data) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[articles-cache] write failed:', e.message);
  }
}

function decodeWpEntities(s) {
  return s
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&amp;/g, '&').replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '');
}

function mapPost(post, categoryMap) {
  const catId = Array.isArray(post.categories) && post.categories[0];
  return {
    id: post.id,
    title: decodeWpEntities(post.title && post.title.rendered || ''),
    status: post.status,
    date: post.date ? post.date.split('T')[0] : '',
    modified: post.modified ? post.modified.split('T')[0] : '',
    category: catId && categoryMap[catId] ? categoryMap[catId] : 'Uncategorized',
    slug: post.slug,
    url: post.link
  };
}

module.exports = { readArticlesCache, writeArticlesCache, decodeWpEntities, mapPost };
