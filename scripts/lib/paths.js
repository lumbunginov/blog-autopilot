'use strict';
const fs = require('fs');
const path = require('path');

function sanitizeId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.includes('..') || s.includes('/') || s.includes('\\')) {
    throw new Error(`ID blog tidak valid: "${raw}"`);
  }
  const id = s.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!id) throw new Error(`ID blog tidak valid: "${raw}"`);
  return id;
}

function makePaths(skillDir) {
  const blogsDir = () => path.join(skillDir, 'data', 'blogs');
  const blogDir = (id) => path.join(blogsDir(), sanitizeId(id));
  const activeFile = () => path.join(blogsDir(), '_active');

  function listBlogs() {
    const dir = blogsDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  }

  function activeBlog() {
    const blogs = listBlogs();
    if (blogs.length === 0) return null;
    const f = activeFile();
    if (fs.existsSync(f)) {
      const id = fs.readFileSync(f, 'utf-8').trim();
      if (blogs.includes(id)) return id;
    }
    // _active hilang atau menunjuk tenant yang sudah dihapus: jatuh ke tenant pertama.
    fs.writeFileSync(f, blogs[0], 'utf-8');
    return blogs[0];
  }

  function setActiveBlog(id) {
    const clean = sanitizeId(id);
    if (!listBlogs().includes(clean)) throw new Error(`Blog "${clean}" tidak ditemukan`);
    fs.mkdirSync(blogsDir(), { recursive: true });
    fs.writeFileSync(activeFile(), clean, 'utf-8');
  }

  return {
    skillDir,
    blogsDir, blogDir, listBlogs, activeBlog, setActiveBlog,
    configPath: (id) => path.join(blogDir(id), 'config.json'),
    cachePath: (id) => path.join(blogDir(id), 'articles-cache.json'),
    pagesCachePath: (id) => path.join(blogDir(id), 'pages-cache.json'),
    plansPath: (id) => path.join(blogDir(id), 'article-plans.json'),
    templatesPath: (id) => path.join(blogDir(id), 'templates.json'),
    queuePath: (id) => path.join(blogDir(id), 'agent-queue.json'),
    blueprintsDir: (id) => path.join(blogDir(id), 'page-blueprints')
  };
}

module.exports = { sanitizeId, makePaths };
