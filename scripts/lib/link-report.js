'use strict';
// Menyilangkan katalog produk dengan tautan yang benar-benar ada di artikel.
// Menjawab: halaman produk mana yang tidak pernah mendapat tautan internal?

function kunci(u) {
  try {
    const x = new URL(String(u || ''));
    return x.hostname.toLowerCase().replace(/^www\./, '') + x.pathname.replace(/\/+$/, '');
  } catch { return ''; }
}

function produkTanpaTautan(products, urlTertaut) {
  const peta = new Map();
  for (const [u, n] of (urlTertaut instanceof Map ? urlTertaut : new Map())) {
    const k = kunci(u);
    if (k) peta.set(k, (peta.get(k) || 0) + n);
  }
  const out = [];
  for (const p of (Array.isArray(products) ? products : [])) {
    const url = String(p?.url || '').trim();
    if (!url) {
      // Tanpa URL, "berapa kali ditautkan" tidak punya arti — bukan nol.
      out.push({ name: p?.name || '', url: '', count: null });
      continue;
    }
    const n = peta.get(kunci(url)) || 0;
    if (n === 0) out.push({ name: p?.name || '', url, count: 0 });
  }
  return out;
}

module.exports = { produkTanpaTautan };
