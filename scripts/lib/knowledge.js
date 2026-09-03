'use strict';
// Satu-satunya tempat yang memutuskan knowledge base datang dari mana.
// Semua route dan CLI lewat sini, supaya aturan manual vs business_asset
// tidak tersebar dan menyimpang antar pemanggil.
const { readBusinessAsset, mapProfile, mapProducts } = require('./business-asset');

// Bentuk kanonik knowledge base. Semua field SELALU ada — penulis artikel tidak
// perlu menjaga dua kemungkinan bentuk, dan mode manual dapat kolom yang sama
// dengan mode business_asset.
const EMPTY_KB = {
  business_name: '',
  business_description: '',
  products: [],
  target_audience: '',
  tone: 'professional',
  prohibited_topics: [],
  internal_links: [],
  custom_entries: [],
  avoid_words: [],
  // Identitas
  tagline: '',
  business_type: '',
  founded_year: '',
  // Kontak & lokasi
  address: '',
  city: '',
  whatsapp: '',
  email: '',
  hours: '',
  website: '',
  // Gaya menulis
  usp: '',
  signature_words: [],
  cta: [],
  dos: [],
  donts: []
};

// Field yang kontraknya array harus benar-benar array, apa pun isi config lama.
const FIELD_ARRAY = ['products', 'prohibited_topics', 'internal_links', 'custom_entries',
  'avoid_words', 'signature_words', 'cta', 'dos', 'donts'];

function normalkanBentuk(kb) {
  const out = { ...kb };
  for (const k of FIELD_ARRAY) if (!Array.isArray(out[k])) out[k] = [];
  return out;
}

function sourceType(config) {
  return config?.knowledge_source?.type === 'business_asset' ? 'business_asset' : 'manual';
}

function resolveKnowledgeBase(config) {
  const source = sourceType(config);

  if (source === 'manual') {
    const kb = config?.knowledge_base || {};
    return {
      source,
      error: null,
      // avoid_words baru ada di mode business_asset; tenant manual belum punya.
      // Selalu kirim array supaya penulis artikel tidak perlu menjaga dua bentuk.
      // Spread EMPTY_KB lebih dulu menjamin field baru selalu ada untuk tenant
      // lama; nilai dari kb menang. Field array yang tersimpan `null` di config
      // lama dikembalikan ke array kosong supaya bentuknya tetap terjaga.
      knowledge_base: normalkanBentuk({ ...EMPTY_KB, ...kb })
    };
  }

  const ba = config?.knowledge_source?.business_asset || {};
  try {
    const { profile, products } = readBusinessAsset(ba.root, ba.business_id);
    const mapped = mapProducts(products, config?.wordpress?.url || '');
    return {
      source,
      error: null,
      knowledge_base: {
        ...EMPTY_KB,
        ...mapProfile(profile),
        products: mapped.products,
        internal_links: mapped.internal_links
      }
    };
  } catch (e) {
    // Sengaja tidak melempar: dashboard harus tetap terbuka dan menampilkan
    // masalahnya, bukan mati dengan 500 tanpa petunjuk path mana yang salah.
    return { source, error: e.message, knowledge_base: { ...EMPTY_KB } };
  }
}

module.exports = { sourceType, resolveKnowledgeBase, EMPTY_KB };
