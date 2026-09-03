'use strict';
// Pemetaan data skill `business-asset` (agent sosmed content) ke bentuk
// knowledge_base autoblog. Modul ini HANYA MEMBACA — tidak pernah menulis
// apa pun ke folder business asset.
const fs = require('fs');
const path = require('path');
// sanitizeId dari paths.js SENGAJA tidak dipakai di sini: ia untuk id blog yang
// kita cetak sendiri, sehingga huruf besar, titik, dan underscore dibuang. Nama
// folder business asset datang dari disk milik skill lain — "karva.id" dan
// "Sosmed_Test" itu sah, dan me-mangling-nya membuat folder yang jelas-jelas ada
// jadi tak pernah ketemu. Yang dibutuhkan di sini cuma penolakan traversal.
function assertBusinessId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s === '.' || s.includes('..') || s.includes('/') || s.includes('\\') || s.includes('\0')) {
    throw new Error(s
      ? `ID business asset tidak valid: "${raw}"`
      : 'Bisnis belum dipilih. Tekan "Muat" lalu pilih salah satu di dropdown Bisnis.');
  }
  return s;
}

const TONE_MAP = {
  santai: 'casual',
  casual: 'casual',
  formal: 'professional',
  profesional: 'professional',
  professional: 'professional',
  edukatif: 'educational',
  educational: 'educational',
  ramah: 'friendly',
  friendly: 'friendly',
  berwibawa: 'authoritative',
  authoritative: 'authoritative'
};

function toneFrom(toneOfVoice) {
  const key = String(toneOfVoice || '').trim().toLowerCase();
  return TONE_MAP[key] || 'professional';
}

// Host tanpa "www." dan tanpa beda huruf besar-kecil, supaya
// https://www.Perkap.com dan https://perkap.com dianggap sama.
function normHost(u) {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

const URL_RE = /https?:\/\/[^\s)<>\]"']+/g;

// URL pertama di `konteks` yang host-nya sama dengan host situs tenant.
// siteUrl kosong → '' : jangan menebak host dari URL pertama, sebab konteks
// juga memuat tautan ke situs lain (marketplace, sumber rujukan).
function extractProductUrl(konteks, siteUrl) {
  const wanted = normHost(siteUrl);
  if (!wanted || !konteks) return '';
  const found = String(konteks).match(URL_RE) || [];
  for (const raw of found) {
    const u = raw.replace(/[.,;:]+$/, '');
    if (normHost(u) === wanted) return u;
  }
  return '';
}

function mapProfile(profile) {
  const p = profile || {};
  let desc = String(p.deskripsi || '').trim();
  if (!desc) {
    // Deskripsi kosong itu lumrah di business asset; rakit dari potongan yang ada
    // supaya penulis artikel tetap tahu bisnisnya bergerak di bidang apa.
    desc = [p.tagline, p.jenisUsaha, p.kota && `di ${p.kota}`]
      .map(x => String(x || '').trim()).filter(Boolean).join(' — ');
  }
  const teks = (v) => String(v == null ? '' : v).trim();
  const daftar = (v) => (Array.isArray(v) ? v.map(teks).filter(Boolean) : []);

  return {
    business_name: teks(p.nama),
    business_description: desc,
    target_audience: teks(p.targetMarket),
    tone: toneFrom(p.toneOfVoice),
    avoid_words: daftar(p.kataHindari),

    // Identitas
    tagline: teks(p.tagline),
    business_type: teks(p.jenisUsaha),
    // tahunBerdiri tersimpan sebagai angka di business asset; dijadikan teks
    // supaya bentuknya sama dengan isian manual di dashboard.
    founded_year: teks(p.tahunBerdiri),

    // Kontak & lokasi — city dan address dipakai penulis artikel untuk SEO lokal
    // ("Sewa HT Malang"), jadi jangan sampai ia menebaknya dari judul.
    address: teks(p.alamat),
    city: teks(p.kota),
    whatsapp: teks(p.whatsapp),
    email: teks(p.email),
    hours: teks(p.jamOperasional),
    website: teks(p.website),

    // Gaya menulis
    usp: teks(p.usp),
    signature_words: daftar(p.kataKataKhas),
    cta: daftar(p.cta),
    dos: daftar(p.dos),
    donts: daftar(p.donts)
  };
}

// Jumlah pertanyaan FAQ = jumlah heading "### ". Dipakai untuk lencana di
// dashboard; teks FAQ sendiri TIDAK pernah ikut tingkat ringkas.
const FAQ_HEADING_RE = /^###\s+\S/gm;

function hitungFaq(teks) {
  const s = String(teks == null ? '' : teks);
  if (!s.trim()) return 0;
  return (s.match(FAQ_HEADING_RE) || []).length;
}

// Bentuk RINGKAS: tanpa konteks/faq. 143 KB konteks untuk 45 produk tidak
// boleh ikut ke GET /api/config — ambil per produk lewat findProduct.
function mapProducts(products, siteUrl) {
  const list = Array.isArray(products) ? products : [];
  const seen = new Set();
  const internal_links = [];
  const out = list.map(p => {
    const name = String(p?.nama || '').trim();
    // URL yang diketik pemilik di form lebih otoritatif daripada yang ditambang
    // dari markdown konteks. Ekstraksi tetap jadi jaring pengaman untuk 35
    // produk yang URL-nya sudah benar tanpa pernah diketik ulang.
    const url = String(p?.url || '').trim() || extractProductUrl(p?.konteks, siteUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      internal_links.push({ url, anchor: name });
    }
    return {
      id: String(p?.id || '').trim(),
      name,
      url,
      price: String(p?.harga || '').trim(),
      target_market: String(p?.targetMarket || '').trim(),
      // Ringkasan berukuran tetap: nama berkas, dua angka, satu boolean.
      // Teks panjang (konteks, faq, troubleshooting, care) TIDAK pernah ke sini —
      // 45 produk x ~3 KB akan membuat GET /api/config membengkak 143 KB.
      image: String(p?.foto || '').trim(),
      gallery_count: Array.isArray(p?.gallery) ? p.gallery.length : 0,
      has_context: Boolean(String(p?.konteks || '').trim()),
      faq_count: hitungFaq(p?.faq)
    };
  });
  return { products: out, internal_links };
}

// Cocokkan id atau nama; persis dulu, baru cocok sebagian.
function findProduct(products, idOrName) {
  const list = Array.isArray(products) ? products : [];
  const q = String(idOrName || '').trim().toLowerCase();
  if (!q) return null;
  const exact = list.find(p =>
    String(p?.id || '').toLowerCase() === q || String(p?.nama || '').toLowerCase() === q);
  if (exact) return exact;
  return list.find(p =>
    String(p?.nama || '').toLowerCase().includes(q) ||
    String(p?.id || '').toLowerCase().includes(q)) || null;
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    throw new Error(`Gagal membaca ${label} (${file}): ${e.message}`);
  }
}

function readBusinessAsset(root, businessId) {
  const base = String(root || '').trim();
  if (!base) throw new Error('Folder root business asset belum diisi.');
  const id = assertBusinessId(businessId);
  const dir = path.join(base, id);
  const profileFile = path.join(dir, 'profile.json');
  if (!fs.existsSync(profileFile)) {
    throw new Error(`Business asset "${id}" tidak ada di ${base} (mencari ${profileFile}).`);
  }
  const profile = readJson(profileFile, 'profile.json');
  // JSON yang sah belum tentu bentuk yang benar. Tanpa cek ini, profile.json
  // berisi array atau teks lolos senyap jadi knowledge base kosong, dan
  // dashboard menampilkan status hijau untuk data yang sebenarnya rusak.
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`Isi profile.json bukan objek (${profileFile}).`);
  }
  const productsFile = path.join(dir, 'products.json');
  if (!fs.existsSync(productsFile)) return { profile, products: [] };
  const products = readJson(productsFile, 'products.json');
  if (!Array.isArray(products)) {
    throw new Error(`Isi products.json bukan daftar produk (${productsFile}).`);
  }
  return { profile, products };
}

module.exports = {
  assertBusinessId, toneFrom, extractProductUrl, mapProfile, mapProducts, findProduct, readBusinessAsset, hitungFaq
};
