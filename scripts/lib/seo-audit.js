'use strict';
// Aturan penilaian meta SEO. Dipisah dari pengambilan data supaya bisa diuji
// tanpa menyentuh jaringan — dan supaya ambangnya ada di satu tempat, bukan
// tersebar di skrip.
//
// Ambang mengikuti references/seo-standards.md. Yang dinilai hanya hal yang
// benar-benar bisa dilihat dari halaman tersaji; skor Rank Math sengaja TIDAK
// dipakai karena selalu 0/100 untuk halaman Elementor (analyzer membaca editor
// Gutenberg yang memang kosong), jadi ia bukan sinyal mutu di situs seperti ini.

const AMBANG = {
  title: { min: 30, max: 60 },
  description: { min: 120, max: 160 }
};

// Panjang yang dihitung adalah panjang setelah entitas HTML dipulihkan:
// "&amp;" tampil sebagai satu karakter "&" di hasil pencarian, bukan lima.
function panjang(s) {
  return s == null ? 0 : String(s).length;
}

/**
 * Nilai satu halaman.
 * @param {{url:string, id?:number, jenis?:string, title:string, description:string, canonical:string, robots:string}} h
 * @returns {{url, temuan:[{aturan, tingkat, pesan}], berat:number}}
 */
function nilai(h) {
  const temuan = [];
  const t = (aturan, tingkat, pesan) => temuan.push({ aturan, tingkat, pesan });

  const jt = panjang(h.title);
  if (!h.title) t('title-kosong', 'berat', 'Tanpa meta title.');
  else if (jt > AMBANG.title.max) t('title-panjang', 'sedang', `Meta title ${jt} karakter (maks ${AMBANG.title.max}) — ujungnya terpotong di hasil pencarian.`);
  else if (jt < AMBANG.title.min) t('title-pendek', 'ringan', `Meta title ${jt} karakter (min ${AMBANG.title.min}) — ruang yang tersedia belum terpakai.`);

  const jd = panjang(h.description);
  if (!h.description) t('desc-kosong', 'berat', 'Tanpa meta description — mesin pencari akan mengarang cuplikannya sendiri.');
  else if (jd > AMBANG.description.max) t('desc-panjang', 'sedang', `Meta description ${jd} karakter (maks ${AMBANG.description.max}) — ujungnya terpotong.`);
  else if (jd < AMBANG.description.min) t('desc-pendek', 'ringan', `Meta description ${jd} karakter (min ${AMBANG.description.min}).`);

  if (!h.canonical) t('canonical-kosong', 'sedang', 'Tanpa canonical.');
  else if (h.url && !samaUrl(h.canonical, h.url)) {
    // Canonical yang menunjuk ke tempat lain adalah instruksi agar halaman ini
    // TIDAK diindeks atas namanya sendiri. Kadang disengaja, sering tidak.
    t('canonical-beda', 'berat', `Canonical menunjuk ke ${h.canonical}, bukan ke halaman ini.`);
  }

  if (h.robots && /\bnoindex\b/i.test(h.robots)) {
    t('noindex', 'berat', 'Bertanda noindex — tidak akan muncul di hasil pencarian.');
  }

  // Judul kembar antar halaman ditangani di pemanggil (butuh melihat semua
  // halaman sekaligus), bukan di sini.
  return { ...h, temuan, berat: temuan.filter(x => x.tingkat === 'berat').length };
}

function samaUrl(a, b) {
  const bersih = s => String(s || '').replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  return bersih(a) === bersih(b);
}

/**
 * Temuan yang hanya terlihat saat semua halaman dilihat bersama:
 * meta title/description yang sama persis di beberapa halaman membuat mereka
 * bersaing satu sama lain di hasil pencarian.
 */
function temuanKembar(daftar) {
  const out = [];
  for (const [medan, aturan] of [['title', 'title-kembar'], ['description', 'desc-kembar']]) {
    const peta = new Map();
    daftar.forEach(h => {
      const v = (h[medan] || '').trim();
      if (!v) return;
      if (!peta.has(v)) peta.set(v, []);
      peta.get(v).push(h.url);
    });
    for (const [nilai, urls] of peta) {
      if (urls.length > 1) out.push({ aturan, tingkat: 'sedang', nilai, urls });
    }
  }
  return out;
}

function ringkas(hasil) {
  const hitung = {};
  hasil.forEach(h => h.temuan.forEach(t => { hitung[t.aturan] = (hitung[t.aturan] || 0) + 1; }));
  return {
    total: hasil.length,
    bersih: hasil.filter(h => h.temuan.length === 0).length,
    berat: hasil.filter(h => h.berat > 0).length,
    perAturan: hitung
  };
}

module.exports = { nilai, temuanKembar, ringkas, samaUrl, panjang, AMBANG };
