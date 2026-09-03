'use strict';
// Murni: tanpa I/O, tanpa jaringan. Semua yang dibutuhkan datang lewat argumen,
// supaya aturan substitusi bisa diuji tanpa tenant, tanpa file, tanpa API.

const teks = (v) => String(v == null ? '' : v);

// Array knowledge base → satu teks. Newline untuk yang berupa kalimat utuh
// (cta, dos, donts), koma untuk yang berupa daftar kata.
const gabungBaris = (a) => (Array.isArray(a) ? a : []).map(teks).filter(Boolean).join('\n');
const gabungKoma = (a) => (Array.isArray(a) ? a : []).map(teks).filter(Boolean).join(', ');

// lsi_keywords tersimpan sebagai string di article-plans.json, tapi app.js
// menyimpannya sebagai array. Dua-duanya diterima — memaksa satu bentuk di sini
// berarti rencana lama kehilangan LSI-nya tanpa jejak.
function lsiTeks(v) {
  if (Array.isArray(v)) return gabungKoma(v);
  return teks(v);
}

function buildVars(kb, plan, produk) {
  const k = kb || {};
  const p = plan || {};
  const d = produk || {};
  return {
    // ── Knowledge base: identitas & profil bisnis
    namaBisnis:      teks(k.business_name),
    deskripsiBisnis: teks(k.business_description),
    tagline:         teks(k.tagline),
    jenisUsaha:      teks(k.business_type),
    targetAudiens:   teks(k.target_audience),
    nada:            teks(k.tone),
    usp:             teks(k.usp),
    // ── Knowledge base: kontak & lokasi bisnis
    kota:            teks(k.city),
    alamat:          teks(k.address),
    whatsapp:        teks(k.whatsapp),
    email:           teks(k.email),
    website:         teks(k.website),
    jamOperasional:  teks(k.hours),
    // ── Knowledge base: gaya menulis
    cta:             gabungBaris(k.cta),
    kataKhas:        gabungKoma(k.signature_words),
    kataHindari:     gabungKoma(k.avoid_words),
    dos:             gabungBaris(k.dos),
    donts:           gabungBaris(k.donts),
    topikTerlarang:  gabungKoma(k.prohibited_topics),
    // ── Rencana artikel ini
    keyword:      teks(p.keyword),
    judul:        teks(p.title),
    lsi:          lsiTeks(p.lsi_keywords),
    // kotaTarget SENGAJA terpisah dari kota: bisnis berkantor di Malang tapi
    // menulis artikel untuk Surabaya. Menggabungkannya menghasilkan artikel
    // Surabaya yang menyebut alamat Malang sebagai lokasi layanan.
    kotaTarget:   teks(p.city),
    kategori:     teks(p.category_name),
    tipeKonten:   teks(p.content_type),
    jumlahKata:   teks(p.target_words),
    slug:         teks(p.slug),
    catatan:      teks(p.notes),
    anchorUrl:    teks(p.anchor_url),
    anchorText:   teks(p.anchor_text),
    // ── Produk (kosong bila rencana tidak menyebut produk)
    produkNama:         teks(d.nama),
    produkHarga:        teks(d.harga),
    produkUrl:          teks(d.url),
    produkKonteks:      teks(d.konteks),
    produkFaq:          teks(d.faq),
    produkTargetMarket: teks(d.targetMarket)
  };
}

// Variabel TAK DIKENAL dibiarkan utuh — meniru resolveVars di business-asset
// (lib/io.js:247). Salah ketik {namaBisnsi} muncul apa adanya di prompt akhir
// sehingga terlihat pemilik template; dikosongkan berarti hilang diam-diam.
function resolveVars(text, vars) {
  const v = vars || {};
  return teks(text).replace(/\{(\w+)\}/g, (cocok, key) =>
    Object.prototype.hasOwnProperty.call(v, key) ? teks(v[key]) : cocok
  );
}

module.exports = { buildVars, resolveVars };
