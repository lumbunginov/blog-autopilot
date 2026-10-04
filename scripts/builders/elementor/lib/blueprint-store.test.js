#!/usr/bin/env node
'use strict';
// Bukti bahwa blueprint menangkap kesalahan yang sebenarnya pernah terjadi:
// halaman produk webcam keluar 9 seksi (ada seksi prosa ekstra) sementara
// tiga saudaranya 8 seksi, dan validate-elementor.js meloloskan semuanya.
const assert = require('assert');
const bp = require('./blueprint-store');

// Seksi tiruan sependek mungkin: yang dibandingkan cuma widgetType, jadi
// tidak perlu memuat halaman asli untuk membuktikan aturannya.
const seksi = (...w) => ({
  id: 'x', elType: 'section',
  elements: w.map((t, i) => ({ id: 'w' + i, elType: 'widget', widgetType: t, settings: { title: t.toUpperCase() } }))
});

const halamanBaku = [seksi('heading'), seksi('heading', 'text-editor', 'button', 'image'), seksi('heading', 'divider'), seksi('image', 'heading'), seksi('heading', 'button'), seksi('posts')];
const blueprint = bp.capture(halamanBaku, { name: 'Produk Sewa', source: 'baku.json' });

assert.strictEqual(blueprint.name, 'produk-sewa', 'nama dinormalkan jadi slug');
assert.strictEqual(blueprint.sections.length, 6);

// 1. Halaman kembar: isi teks/gambar berbeda, bentuk sama → harus lolos.
const kembar = JSON.parse(JSON.stringify(halamanBaku));
kembar[0].elements[0].settings.title = 'Judul lain sama sekali';
assert.ok(bp.compare(blueprint, kembar).ok, 'beda teks saja tidak boleh dianggap menyimpang');

// 2. Seksi ekstra disisipkan di tengah — kesalahan halaman webcam.
const ekstra = JSON.parse(JSON.stringify(halamanBaku));
ekstra.splice(3, 0, seksi('heading', 'text-editor'));
const h2 = bp.compare(blueprint, ekstra);
assert.ok(!h2.ok, 'seksi ekstra harus ketahuan');
assert.strictEqual(h2.sectionCount.halaman, 7);
// SATU penyimpangan, bukan empat. Perbandingan per-indeks melaporkan seksi
// ekstra plus setiap seksi sesudahnya yang tergeser — pembacanya lalu mengira
// ada empat hal yang harus dibetulkan padahal sebabnya satu.
assert.strictEqual(h2.diffs.length, 1, 'seksi ekstra tidak boleh melaporkan seksi tergeser sebagai penyimpangan terpisah');
assert.strictEqual(h2.diffs[0].kind, 'lebih');
assert.strictEqual(h2.diffs[0].index, 3, 'ditunjuk di posisi sisipannya');

// 3. Seksi hilang — mis. blog list terhapus saat menyunting.
const kurang = halamanBaku.slice(0, 5);
const h3 = bp.compare(blueprint, kurang);
assert.ok(!h3.ok && h3.diffs.some(d => d.kind === 'kurang'), 'seksi hilang harus ketahuan');

// 4. Widget di dalam seksi berubah (FAQ menggantikan blog list) pada posisi sama.
const tukar = JSON.parse(JSON.stringify(halamanBaku));
tukar[5] = seksi('accordion');
const h4 = bp.compare(blueprint, tukar);
assert.ok(!h4.ok && h4.diffs[0].kind === 'beda', 'susunan widget beda harus ketahuan');
assert.deepStrictEqual(h4.diffs[0].expected, ['posts']);
assert.deepStrictEqual(h4.diffs[0].actual, ['accordion']);

// 5. Format halaman WordPress (hasil clone-template) dibaca sama dengan array.
assert.ok(bp.compare(blueprint, { content: halamanBaku, title: 'x', type: 'page' }).ok,
  'format halaman WordPress harus diterima');

// 6. Bentuk yang bukan keduanya ditolak dengan pesan, bukan diam-diam lolos.
assert.throws(() => bp.compare(blueprint, { salah: true }), /Bukan array section/);

// 7. list() mengabaikan _map.json. Dulu berkas itu ikut terbaca, name-nya
// undefined, localeCompare melempar, dan SELURUH daftar jadi kosong di
// dashboard walau blueprint-nya ada di disk.
const os = require('os');
const fs = require('fs');
const path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-'));
bp.write(dir, blueprint);
bp.setMap(dir, 'halaman.json', 'produk-sewa');
fs.writeFileSync(path.join(dir, 'rusak.json'), '{bukan json', 'utf-8');
const daftar = bp.list(dir);
assert.strictEqual(daftar.length, 1, '_map.json dan berkas rusak tidak boleh mengosongkan daftar');
assert.strictEqual(daftar[0].name, 'produk-sewa');
assert.strictEqual(bp.readMap(dir)['halaman.json'], 'produk-sewa');
assert.ok(bp.unsetMap(dir, 'halaman.json'));
assert.strictEqual(bp.readMap(dir)['halaman.json'], undefined);
fs.rmSync(dir, { recursive: true, force: true });

console.log('blueprint-store OK — 7 kasus');
