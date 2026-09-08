'use strict';
// Satu pembungkus HTTP untuk seluruh modul Rank Math. Berdiri sendiri supaya
// rankmath.js dan rankmath-redirect.js tidak menyimpan salinan yang bisa
// berbeda diam-diam.
const https = require('https');
const http = require('http');

// Di skill ini beredar dua bentuk kredensial: blog.js mengembalikan base64
// telanjang (pemanggil lama menambahkan "Basic " sendiri), sementara
// post-to-wp.js sudah menyimpan header lengkap. Base64 telanjang yang lolos apa
// adanya menghasilkan 401 rest_not_logged_in — pesan yang menuduh kredensial
// padahal formatnya yang salah, dan itu mengirim orang mencari di tempat keliru.
function headerAuth(auth) {
  const s = String(auth || '');
  return /^(Basic|Bearer)\s/i.test(s) ? s : 'Basic ' + s;
}

/**
 * @param {object} [opsi]
 * @param {boolean} [opsi.ikutiRedirect=true] false untuk MELIHAT redirect,
 *   bukan menurutinya — dipakai memverifikasi bahwa sebuah redirect bekerja.
 */
function request(base, auth, path, method, body, opsi = {}) {
  const url = new URL(base);
  const lib = url.protocol === 'http:' ? http : https;
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || undefined,
      path,
      method,
      headers: {
        Authorization: headerAuth(auth),
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(b); } catch { /* biarkan mentah */ }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: b });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = { request, headerAuth };
