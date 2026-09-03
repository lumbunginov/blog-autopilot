'use strict';
// Bagian-bagian pelaporan audit-links.js yang bisa diuji tanpa jaringan
// (crawl HTTP tetap di audit-links.js). Dipisah supaya C1 (katalog gagal
// dibaca tapi laporan menulis "0 produk tak tertaut") dan C2 (--limit
// menimpa laporan penuh tanpa penanda) punya jalur tes langsung.

const { produkTanpaTautan } = require('./link-report');

// --limit hanya boleh berupa bilangan bulat positif. `--limit abc` dulu jadi
// NaN -> slice(0, NaN) -> nol dokumen -> laporan penuh-nol tertulis dengan
// exit 0, seolah-olah itu hasil audit sungguhan. Ini kesalahan pemakaian,
// jadi ditolak di sini, bukan dibiarkan lolos sebagai angka.
function parseLimit(raw) {
  if (raw === undefined || raw === null) return Infinity;
  if (!/^[0-9]+$/.test(String(raw).trim()) || Number(raw) <= 0) {
    throw new Error(`--limit harus bilangan bulat positif, dapat: "${raw}"`);
  }
  return parseInt(raw, 10);
}

// Nama berkas laporan. Crawl --limit dulu memakai nama yang sama persis
// dengan crawl penuh (per-tanggal saja) sehingga menjalankan --limit di hari
// yang sama menimpa laporan penuh. Beri akhiran khusus saat parsial supaya
// keduanya tidak pernah berbagi nama berkas.
function outputPaths(auditDir, today, limit) {
  const path = require('path');
  const partial = limit !== Infinity;
  const base = partial ? `link-${today}-limit${limit}` : `link-${today}`;
  return {
    partial,
    md: path.join(auditDir, `${base}.md`),
    json: path.join(auditDir, `${base}.json`)
  };
}

// Peringatan di kepala laporan parsial, sebelum angka apa pun. Crawl --limit
// melewati seluruh `pages` dan cuma sebagian `posts`, jadi angka produk tak
// tertaut & artikel tanpa gambar di laporan ini TIDAK sahih — bukan hasil
// audit lengkap, cuma smoke test crawl.
function partialBanner(limit) {
  return [
    `> ⚠️ **CRAWL PARSIAL (--limit ${limit})** — hanya sebagian posts yang di-crawl,`,
    `> seluruh pages DILEWATI. Angka "Produk tidak pernah ditautkan" dan`,
    `> "Artikel tanpa gambar utama" di laporan ini TIDAK SAHIH — jangan dipakai`,
    `> untuk keputusan. Jalankan tanpa --limit untuk laporan penuh.`,
    ''
  ];
}

// C1: resolveKnowledgeBase() sengaja tidak melempar saat business asset gagal
// dibaca (dashboard harus tetap terbuka) — ia balikkan { error, knowledge_base:
// EMPTY_KB }. Kalau `error` dibuang di sini, products jadi [] dan laporan
// menulis "Produk tidak pernah ditautkan: 0", yang terbaca sebagai "semua
// produk sudah tertaut" padahal katalognya tidak pernah kebaca. Jangan pernah
// menulis angka produk kalau katalog gagal dibaca.
function produkSection(knowledgeBaseResult, urlTertaut) {
  const { error, knowledge_base } = knowledgeBaseResult;
  if (error) {
    return {
      produkTakTertaut: [],
      lines: [
        '- Produk tidak pernah ditautkan: **tidak diperiksa** — katalog produk gagal dibaca',
        `  - Galat: ${error}`,
        ''
      ]
    };
  }

  const produkTakTertaut = produkTanpaTautan(knowledge_base.products, urlTertaut);
  const lines = [`- Produk tidak pernah ditautkan: **${produkTakTertaut.length}**`, ''];

  if (produkTakTertaut.length) {
    lines.push('## URL produk yang tidak pernah ditautkan', '');
    lines.push('| Produk | URL | Artikel menautkan |');
    lines.push('|---|---|---|');
    for (const p of produkTakTertaut) {
      lines.push(`| ${p.name} | ${p.url || '(belum ada URL)'} | ${p.count === null ? '—' : p.count} |`);
    }
    lines.push('');
  }

  return { produkTakTertaut, lines };
}

module.exports = { parseLimit, outputPaths, partialBanner, produkSection };
