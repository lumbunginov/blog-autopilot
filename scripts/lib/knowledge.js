'use strict';
// Satu-satunya tempat yang memutuskan knowledge base datang dari mana.
// Semua route dan CLI lewat sini, supaya aturan manual vs business_asset
// tidak tersebar dan menyimpang antar pemanggil.
const { readBusinessAsset, mapProfile, mapProducts } = require('./business-asset');

const EMPTY_KB = {
  business_name: '',
  business_description: '',
  products: [],
  target_audience: '',
  tone: 'professional',
  prohibited_topics: [],
  internal_links: [],
  custom_entries: [],
  avoid_words: []
};

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
      knowledge_base: { ...EMPTY_KB, ...kb, avoid_words: kb.avoid_words || [] }
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
