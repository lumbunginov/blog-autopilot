'use strict';
// Deskriptor builder Elementor — lihat scripts/builders/index.js.
const path = require('path');

module.exports = {
  id: 'elementor',
  label: 'Elementor',
  icon: '📐',
  desc: 'Download JSON halaman, sunting, unggah kembali lewat REST',
  reference: 'references/builders/elementor/README.md',
  // Hasil extract-elementor.js: array section murni per halaman.
  pagesDir: (paths, blogId) => path.join(paths.blogDir(blogId), 'elementor', 'elementor'),
  blueprint: require('./lib/blueprint-store')
};
