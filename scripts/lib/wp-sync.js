'use strict';
const { httpGet, fetchCategoryMap } = require('./wp-client');
const { mapPost, writeArticlesCache } = require('./articles-cache');

const FIELDS = '_fields=id,title,status,date,modified,slug,link,categories';

async function fullSync({ wpUrl, auth, cachePath }) {
  const base = (wpUrl || '').replace(/\/$/, '');
  const categoryMap = await fetchCategoryMap(base, auth);
  let allArticles = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { body, totalPages: tp } = await httpGet(
      `${base}/wp-json/wp/v2/posts?${FIELDS}&status=publish,draft&per_page=100&page=${page}&orderby=date&order=desc`,
      auth
    );
    totalPages = tp || 1;
    if (Array.isArray(body)) allArticles = allArticles.concat(body.map(p => mapPost(p, categoryMap)));
    page++;
  } while (page <= totalPages);

  const cache = {
    lastSync: new Date().toISOString(),
    totalCount: allArticles.length,
    articles: allArticles
  };
  writeArticlesCache(cachePath, cache);
  return cache;
}

async function incrementalSync({ wpUrl, auth, cachePath, existingCache }) {
  const base = (wpUrl || '').replace(/\/$/, '');
  const after = existingCache.lastSync;
  const categoryMap = await fetchCategoryMap(base, auth);

  const { body, totalPages } = await httpGet(
    `${base}/wp-json/wp/v2/posts?${FIELDS}&status=publish,draft&per_page=100&orderby=modified&order=desc&modified_after=${after}`,
    auth
  );

  if (!Array.isArray(body) || body.length === 0) {
    return { cache: existingCache, updated: 0 };
  }

  // Lebih dari 100 post berubah: cache parsial tidak bisa dipercaya, ulang penuh.
  if (totalPages > 1) {
    const cache = await fullSync({ wpUrl, auth, cachePath });
    return { cache, updated: cache.totalCount };
  }

  const existingArticles = Array.isArray(existingCache.articles) ? existingCache.articles : [];
  const idMap = new Map(existingArticles.map(a => [a.id, a]));
  body.forEach(p => {
    const mapped = mapPost(p, categoryMap);
    if (mapped.status === 'publish' || mapped.status === 'draft') idMap.set(p.id, mapped);
    else idMap.delete(p.id); // post yang dibuang/hapus keluar dari cache
  });
  const updated = Array.from(idMap.values());

  const cache = {
    lastSync: new Date().toISOString(),
    totalCount: updated.length,
    articles: updated
  };
  writeArticlesCache(cachePath, cache);
  return { cache, updated: body.length };
}

module.exports = { fullSync, incrementalSync };
