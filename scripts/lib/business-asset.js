'use strict';
// Pemetaan data skill `business-asset` (agent sosmed content) ke bentuk
// knowledge_base autoblog. Modul ini HANYA MEMBACA — tidak pernah menulis
// apa pun ke folder business asset.
const fs = require('fs');
const path = require('path');
const { sanitizeId } = require('./paths');

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
  return {
    business_name: String(p.nama || '').trim(),
    business_description: desc,
    target_audience: String(p.targetMarket || '').trim(),
    tone: toneFrom(p.toneOfVoice),
    avoid_words: Array.isArray(p.kataHindari) ? p.kataHindari.filter(Boolean) : []
  };
}

// Bentuk RINGKAS: tanpa konteks/faq. 143 KB konteks untuk 45 produk tidak
// boleh ikut ke GET /api/config — ambil per produk lewat findProduct.
function mapProducts(products, siteUrl) {
  const list = Array.isArray(products) ? products : [];
  const seen = new Set();
  const internal_links = [];
  const out = list.map(p => {
    const name = String(p?.nama || '').trim();
    const url = extractProductUrl(p?.konteks, siteUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      internal_links.push({ url, anchor: name });
    }
    return {
      id: String(p?.id || '').trim(),
      name,
      url,
      price: String(p?.harga || '').trim(),
      target_market: String(p?.targetMarket || '').trim()
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
  const id = sanitizeId(businessId);
  const dir = path.join(base, id);
  const profileFile = path.join(dir, 'profile.json');
  if (!fs.existsSync(profileFile)) {
    throw new Error(`Business asset "${id}" tidak ada di ${base} (mencari ${profileFile}).`);
  }
  const profile = readJson(profileFile, 'profile.json');
  const productsFile = path.join(dir, 'products.json');
  const products = fs.existsSync(productsFile) ? readJson(productsFile, 'products.json') : [];
  return { profile, products: Array.isArray(products) ? products : [] };
}

module.exports = {
  toneFrom, extractProductUrl, mapProfile, mapProducts, findProduct, readBusinessAsset
};
