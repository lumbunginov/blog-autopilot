'use strict';
// Normalisasi dan ekstraksi tautan internal dari HTML artikel.
// Murni: tanpa jaringan, tanpa berkas — supaya bisa dites tanpa memanggil situs.

const HREF_RE = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

function hostBersih(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function normalizeLink(raw, siteUrl) {
  const host = hostBersih(siteUrl);
  if (!host) return null;
  const s = String(raw || '').trim();
  if (!s || s.startsWith('#')) return null; // anchor ke halaman yang sama, bukan tautan
  let u;
  try { u = new URL(s, siteUrl); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.hostname.toLowerCase().replace(/^www\./, '') !== host) return null;

  // Artefak REST. Elementor membangun paginasi dengan paginate_links(), yang
  // memakai URL permintaan saat itu sebagai dasar — lewat REST, itu endpoint
  // REST-nya sendiri. Halaman aslinya menampilkan /slug/2/ yang benar. Audit
  // pertama melaporkan 55 "tautan mati" yang tidak bisa dijangkau siapa pun.
  if (u.pathname.startsWith('/wp-json/')) return null;

  u.protocol = 'https:';
  u.hostname = host;
  u.hash = '';
  return u.toString();
}

function extractLinks(html, siteUrl) {
  const out = [];
  const s = String(html == null ? '' : html);
  HREF_RE.lastIndex = 0;
  let m;
  while ((m = HREF_RE.exec(s)) !== null) {
    const url = normalizeLink(m[1], siteUrl);
    if (!url) continue;
    const anchor = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    out.push({ url, anchor });
  }
  return out;
}

module.exports = { normalizeLink, extractLinks };
