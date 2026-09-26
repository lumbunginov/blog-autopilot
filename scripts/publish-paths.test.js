'use strict';
// SEMUA jalur yang bisa menaikkan post ke situs harus mengambil keputusan soal kuota harian.
//
// Dua kali berturut-turut penjaga di repo ini menjaga 1 dari N:
//   - Perbaikan pertama memasang penjaga di `publish-drafts.js` dan menyebut masalahnya selesai.
//     `post-to-wp.js` — yang melayani `--status publish` dan `--schedule-date` — tidak pernah
//     ikut dijaga, dan justru itu yang pernah menerbitkan 4 post dalam 54 detik.
//   - Perbaikan berikutnya menulis test yang mengenumerasi prefix yang DIKETAHUINYA, melewatkan dua
//     saudaranya, dan tetap hijau 4/4.
// Pola kegagalannya satu dan sama: daftar jalur ditulis dengan tangan pada saat seseorang
// kebetulan tahu isinya, lalu tidak pernah ikut tumbuh bersama direktorinya.
//
// Karena itu test ini tidak menyebut satu nama berkas pun di dalam aturannya. Ia membaca ISI
// `scripts/` dari disk tiap kali dijalankan, memilih sendiri mana yang MENULIS ke endpoint post
// WordPress, lalu menuntut tiap berkas itu mengambil keputusan yang TERLIHAT:
//
//   a. me-`require` `daily-quota-guard`, atau
//   b. menyandang penanda `@publish-quota: exempt — <alasan>` beserta alasannya.
//
// Berkas baru yang menulis ke endpoint post tanpa salah satu dari keduanya membuat test ini
// merah. Itulah satu-satunya tugasnya: memaksa jalur berikutnya diputuskan dengan sadar,
// bukan diam-diam lolos karena tidak ada yang ingat menambahkannya ke sebuah daftar.
//
// Kenapa penanda, bukan "wajib require tanpa kecuali": ada penulis yang memang tidak bisa
// menerbitkan — `wp-bulk.js` menulis ulang `content` post yang sudah ada dan tidak pernah
// mengirim `status`. Memaksanya me-require penjaga menghasilkan kabel mati yang menyesatkan
// pembaca berikutnya. Penanda membuat pengecualian itu terlihat di kodenya sendiri (dan ikut
// terbaca saat review), bukan tersembunyi di daftar-putih di dalam test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = __dirname;

// Menulis ke koleksi/item post WordPress. Bentuk URL-nya bermacam-macam di repo ini:
// literal penuh (`wp-json/wp/v2/posts/${id}`), path relatif terhadap apiBase (`'/posts'`),
// atau template di atas variabel `api` (`${api}/posts/${id}`). Ketiganya dicakup.
// `wp/v2/pages` TIDAK dicakup: halaman bukan post blog dan tidak dihitung kuota harian.
const POSTS_ENDPOINT = /(?:wp\/v2\/posts|\/posts\/\$\{|['"]\/posts['"]|\/posts\?)/;
const WRITES = /httpPost\s*\(|['"]POST['"]/;
const REQUIRES_GUARD = /require\(\s*['"][^'"]*daily-quota-guard['"]\s*\)/;
const EXEMPT = /@publish-quota:\s*exempt\s*[—-]\s*([^\n]*\S)/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(p, out);
    } else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) {
      out.push(p);
    }
  }
  return out;
}

// Daftar penulis endpoint post, dihitung ulang dari disk pada tiap pemanggilan.
function findPostWriters() {
  return walk(SCRIPTS_DIR).map((file) => {
    const src = fs.readFileSync(file, 'utf-8');
    return { file, rel: path.relative(SCRIPTS_DIR, file).replace(/\\/g, '/'), src };
  }).filter(f => POSTS_ENDPOINT.test(f.src) && WRITES.test(f.src));
}

test('setiap penulis endpoint post WordPress me-require penjaga kuota, atau menyatakan pengecualiannya', () => {
  const undecided = findPostWriters()
    .filter(f => !REQUIRES_GUARD.test(f.src) && !EXEMPT.test(f.src))
    .map(f => f.rel);

  assert.deepStrictEqual(undecided, [],
    'Berkas ini menulis ke endpoint post WordPress tanpa memutuskan apa pun soal kuota harian.\n' +
    'Tambahkan require(\'./lib/daily-quota-guard\') dan panggil checkDailyQuota sebelum menulis,\n' +
    'atau — kalau berkas ini memang tidak bisa menaikkan post ke situs — tulis alasannya:\n' +
    '  // @publish-quota: exempt — <kenapa berkas ini tidak bisa menerbitkan>\n' +
    'Berkas: ' + JSON.stringify(undecided));
});

test('pengecualian harus punya alasan yang terbaca, bukan penanda kosong', () => {
  for (const f of findPostWriters()) {
    if (REQUIRES_GUARD.test(f.src)) continue;
    const m = f.src.match(EXEMPT);
    assert.ok(m, `${f.rel}: tidak dijaga dan tidak ada penanda pengecualian`);
    assert.ok(m[1].trim().length >= 20,
      `${f.rel}: alasan pengecualian terlalu pendek untuk bisa diperiksa: "${m[1]}"`);
  }
});

// Anti-vakum. Test di atas hijau juga kalau detektornya tidak menemukan apa pun —
// salah ketik satu regex dan ia berhenti menjaga tanpa pernah merah. Tiga jalur di bawah
// SUDAH diketahui menulis ke endpoint post; kalau detektor berhenti melihat salah satunya,
// yang rusak adalah detektornya, dan itu harus terbaca di sini.
test('detektornya tidak tumpul: jalur yang sudah diketahui tetap terdeteksi', () => {
  const found = findPostWriters().map(f => f.rel);
  for (const known of ['post-to-wp.js', 'publish-drafts.js', 'routes/articles.js']) {
    assert.ok(found.includes(known),
      `detektor berhenti melihat ${known}. Perbaiki regexnya, jangan hapus assertion ini. ` +
      `Yang terdeteksi: ${JSON.stringify(found)}`);
  }
});

test('membaca endpoint post bukan menulis: penjaganya sendiri tidak ikut terhitung', () => {
  // daily-quota-guard.js dan queue-sync.js menyebut endpoint yang sama untuk MENGHITUNG
  // (httpGet). Kalau keduanya ikut terhitung sebagai penulis, detektornya terlalu lebar dan
  // aturan di atas berubah jadi ritual yang ditempeli ke berkas yang tidak menerbitkan.
  const found = findPostWriters().map(f => f.rel);
  assert.ok(!found.includes('lib/daily-quota-guard.js'), JSON.stringify(found));
  assert.ok(!found.includes('lib/queue-sync.js'), JSON.stringify(found));
});
