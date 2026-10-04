'use strict';
// Klien WordPress Abilities API (/wp-json/wp-abilities/v1). Plugin yang
// mendaftarkan "ability" — page builder, plugin SEO, dsb. — bisa dipanggil
// langsung lewat REST dengan Application Password yang sama dengan skill ini,
// tanpa sesi MCP atau OAuth.
//
// Tiga perilaku server yang tidak terlihat dari dokumentasi ability-nya:
//   - Ability baca-saja WAJIB GET ("Read-only abilities require GET method"),
//     ability tulis WAJIB POST {"input": {...}}.
//   - Input GET dikirim berupa notasi kurung siku (input[post_id]=5). JSON
//     string di ?input= ditolak "input is not of type object"; input kosong
//     tetap harus ada sebagai `input=`.
//   - GET bisa dilayani cache server/CDN walau header-nya no-store: pohon
//     halaman yang dibaca tepat setelah disunting kembali versi LAMA. Tiap GET
//     karena itu membawa parameter pemecah cache (_nc) yang diabaikan WordPress.

function flatten(value, prefix, out) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, `${prefix}[${k}]`, out);
  } else if (value !== undefined) {
    out.push([prefix, typeof value === 'boolean' ? (value ? '1' : '0') : String(value)]);
  }
  return out;
}

function queryString(input) {
  const pairs = input && Object.keys(input).length ? flatten(input, 'input', []) : [];
  return pairs.length ? new URLSearchParams(pairs).toString() : 'input=';
}

function abilityError(name, status, body, raw) {
  const code = body && body.code ? body.code : `HTTP ${status}`;
  const msg = body && body.message ? body.message : String(raw).slice(0, 300);
  const e = new Error(`${name}: ${code} — ${msg}`);
  e.status = status;
  e.code = body && body.code;
  e.data = body && body.data;
  return e;
}

function makeClient({ site, auth, fetchImpl = globalThis.fetch }) {
  const base = `${String(site).replace(/\/+$/, '')}/wp-json/wp-abilities/v1/abilities`;
  const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', 'User-Agent': 'BlogAutopilot/1.0' };
  const described = new Map();

  async function request(name, url, opt = {}) {
    const res = await fetchImpl(url, { headers, ...opt });
    const raw = await res.text();
    let body;
    try { body = JSON.parse(raw); } catch { body = null; }
    if (res.status >= 300) throw abilityError(name, res.status, body, raw);
    if (body === null) throw abilityError(name, res.status, null, `Respons bukan JSON: ${raw}`);
    return body;
  }

  async function describe(name) {
    if (!described.has(name)) {
      described.set(name, await request(name, `${base}/${name}`));
    }
    return described.get(name);
  }

  async function list(namespace) {
    const all = [];
    for (let page = 1; ; page++) {
      const batch = await request('list', `${base}?per_page=100&page=${page}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return namespace ? all.filter(a => a.name.startsWith(`${namespace}/`)) : all;
  }

  async function run(name, input = {}) {
    const a = await describe(name);
    const readonly = !!(a.meta && a.meta.annotations && a.meta.annotations.readonly);
    if (readonly) return request(name, `${base}/${name}/run?${queryString(input)}&_nc=${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
    return request(name, `${base}/${name}/run`, { method: 'POST', body: JSON.stringify({ input }) });
  }

  return { list, describe, run };
}

module.exports = { makeClient, queryString };
