'use strict';

function slugify(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalize(slug) {
  return String(slug == null ? '' : slug).trim().toLowerCase().replace(/^\/+|\/+$/g, '');
}

function checkSlug(slug, cache) {
  const target = normalize(slug);
  if (!target) return { duplicate: false, existing: null };
  const articles = cache && Array.isArray(cache.articles) ? cache.articles : [];
  const hit = articles.find(a => normalize(a.slug) === target);
  return hit
    ? { duplicate: true, existing: { id: hit.id, title: hit.title, slug: hit.slug, url: hit.url, status: hit.status } }
    : { duplicate: false, existing: null };
}

module.exports = { slugify, checkSlug, normalizeSlug: normalize };
