'use strict';

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Deep-merge `incoming` onto `stored`: nested plain objects merge key by
// key (so a partial `workflow: {...}` in the body does not wipe sibling
// fields like `workflow.saved_categories` that the body never mentioned).
// Arrays and primitives from `incoming` replace the stored value wholesale
// — arrays have no natural per-item merge semantics here (e.g. replacing
// `saved_categories` itself is a valid, deliberate save), so "incoming
// array wins outright" is the simplest rule that does not silently drop
// data the caller never sent.
function deepMerge(stored, incoming) {
  const base = isPlainObject(stored) ? stored : {};
  if (!isPlainObject(incoming)) return { ...base };
  const out = { ...base };
  for (const key of Object.keys(incoming)) {
    const iv = incoming[key];
    const sv = base[key];
    out[key] = (isPlainObject(iv) && isPlainObject(sv)) ? deepMerge(sv, iv) : iv;
  }
  return out;
}

// Strip credential fields the browser must never persist to config.json.
// Credentials live only in .env. Returns { clean, ignored } where `ignored`
// lists the dotted field names that were dropped (empty if none were sent).
function stripCredentials(body) {
  const clean = JSON.parse(JSON.stringify(body || {}));
  const ignored = [];
  if (isPlainObject(clean.wordpress) && 'app_password' in clean.wordpress) {
    delete clean.wordpress.app_password;
    ignored.push('wordpress.app_password');
  }
  if (isPlainObject(clean.image_api) && 'api_key' in clean.image_api) {
    delete clean.image_api.api_key;
    ignored.push('image_api.api_key');
  }
  return { clean, ignored };
}

// Di mode business_asset, knowledge_base dihitung ulang dari file business
// asset tiap kali dibaca. Kalau kiriman browser dibiarkan tertulis, hasil
// live langsung membeku jadi salinan di config.json dan berhenti mengikuti
// sumbernya — persis yang mau dihindari mode ini.
// knowledge_source SENGAJA tidak dibuang: user harus tetap bisa berpindah
// mode dan mengganti bisnis lewat POST yang sama.
function stripKnowledgeBase(body, source, sourceSebelumnya) {
  const clean = JSON.parse(JSON.stringify(body || {}));
  const ignored = [];
  if (source === 'business_asset' && 'knowledge_base' in clean) {
    delete clean.knowledge_base;
    ignored.push('knowledge_base');
  }
  // Saat kembali dari business_asset ke manual, knowledge_base yang dikirim
  // browser adalah hasil baca live yang sedang tampil di layar — bukan suntingan
  // user. Menuliskannya berarti menimpa cadangan manual dengan data business
  // asset, dan prohibited_topics + custom_entries (yang tidak pernah dipetakan
  // dari business asset) hilang permanen tanpa jalan pulih lewat dashboard.
  if (source === 'manual' && sourceSebelumnya === 'business_asset' && 'knowledge_base' in clean) {
    delete clean.knowledge_base;
    ignored.push('knowledge_base');
  }
  return { clean, ignored };
}

module.exports = { deepMerge, stripCredentials, stripKnowledgeBase };
