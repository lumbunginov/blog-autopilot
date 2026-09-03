'use strict';
// Memilih produk yang relevan untuk sebuah artikel, supaya gambar artikel
// bisa memakai foto produk asli. Fungsi murni: tanpa I/O, tanpa jaringan.
//
// Tidak menemukan kecocokan adalah hasil yang SAH dan sering. Artikel umum
// tidak bicara tentang satu produk, dan memaksakan tebakan berarti artikel
// tentang Yamaha memakai foto Ashley — salah yang tidak terlihat salah
// sampai ada yang memperhatikan.

const KATA_UMUM = new Set([
  'sewa', 'rental', 'harga', 'jual', 'untuk', 'dengan', 'yang', 'dari', 'pada',
  'custom', 'set', 'paket', 'unit', 'buah', 'audio', 'sistem', 'alat'
]);

const PANJANG_KATA_MIN = 4;
const KATA_COCOK_MIN = 2;

function normal(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function kataBermakna(s) {
  return normal(s).split(/[^a-z0-9]+/)
    .filter(w => w.length >= PANJANG_KATA_MIN && !KATA_UMUM.has(w));
}

function matchProduct(products, opsi) {
  const list = Array.isArray(products) ? products : [];
  const o = opsi || {};
  if (!list.length) return null;

  const productName = normal(o.productName);
  const title = normal(o.title);
  const keyword = normal(o.keyword);

  // 1. Nama produk eksplisit. Ini jalur normal: alur artikel perkap sudah
  //    membawa nama produk, jadi tidak perlu menebak apa pun.
  if (productName) {
    const persis = list.find(p => normal(p.id) === productName || normal(p.name) === productName);
    if (persis) return { product: persis, reason: 'nama-eksplisit' };
    // Nama eksplisit yang tidak dikenal berarti pemanggil salah ketik atau
    // produknya memang tidak ada. Menebak dari judul di sini akan menyamarkan
    // kesalahan itu, jadi berhenti.
    return null;
  }

  // 2 & 3. Judul atau kata kunci memuat nama produk utuh.
  for (const sumber of [{ teks: title, reason: 'judul' }, { teks: keyword, reason: 'kata-kunci' }]) {
    if (!sumber.teks) continue;
    const cocok = list.filter(p => {
      const n = normal(p.name);
      return n && sumber.teks.includes(n);
    });
    // Kalau dua produk sama-sama termuat (mis. satu nama adalah awalan nama
    // lain), pilih yang namanya paling panjang — itu yang paling spesifik.
    if (cocok.length) {
      cocok.sort((a, b) => normal(b.name).length - normal(a.name).length);
      return { product: cocok[0], reason: sumber.reason };
    }
  }

  // 4. Kecocokan kata. Hanya berlaku bila TEPAT SATU produk mencapai skor
  //    tertinggi; seri berarti tidak ada kecocokan.
  const teks = new Set(kataBermakna(`${title} ${keyword}`));
  if (!teks.size) return null;

  let terbaik = [];
  let skorTerbaik = 0;
  for (const p of list) {
    const skor = kataBermakna(p.name).filter(w => teks.has(w)).length;
    if (skor < KATA_COCOK_MIN) continue;
    if (skor > skorTerbaik) { skorTerbaik = skor; terbaik = [p]; }
    else if (skor === skorTerbaik) terbaik.push(p);
  }
  if (terbaik.length !== 1) return null;
  return { product: terbaik[0], reason: `kata-cocok-${skorTerbaik}` };
}

module.exports = { matchProduct, kataBermakna };
