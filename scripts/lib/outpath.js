'use strict';
const path = require('path');

// Template `node -e` di agents/image-generator.md menaruh path tujuan
// ke dalam string literal JS ber-quote tunggal: `const outputPath = '{OUTPUT_PATH}';`
// Kalau yang disubstitusi adalah path Windows ber-backslash, JS membuang setiap
// backslash sebagai escape yang tidak dikenal:
//
//   'C:\site\...\images\foo.png'  ->  "C:site...imagesfoo.png"
//
// Sisa `C:` adalah prefiks drive-relative Windows, jadi berkas mendarat di cwd
// drive G dengan nama path yang dipipihkan - dan tidak ada yang error:
// `mkdirSync('C:', { recursive: true })` sukses, `writeFileSync` sukses. Gagalnya
// diam. Guard ini yang membuatnya berisik.

function assertOutPath(raw, label = 'output path') {
  const s = String(raw == null ? '' : raw);
  if (!s.trim()) {
    throw new Error(`${label} kosong.`);
  }
  if (/[{}]/.test(s)) {
    throw new Error(`${label} masih berisi placeholder yang belum disubstitusi: "${s}"`);
  }
  // `C:foo` (drive tanpa separator sesudahnya) = drive-relative. Selalu tanda rusak.
  if (/^[A-Za-z]:(?![\\/])/.test(s)) {
    throw new Error(
      `${label} drive-relative: "${s}". Backslash-nya kemungkinan hilang dimakan ` +
      'escape JS. Pakai forward slash: C:/path/... bukan C:\\path\\...'
    );
  }
  // Path tujuan gambar selalu berada di dalam sebuah direktori. Tanpa separator
  // sama sekali berarti separatornya sudah dibuang.
  if (!/[\\/]/.test(s)) {
    throw new Error(
      `${label} tidak punya separator direktori: "${s}". ` +
      'Separatornya kemungkinan hilang dimakan escape JS. Pakai forward slash.'
    );
  }
  return path.resolve(s);
}

module.exports = { assertOutPath };
