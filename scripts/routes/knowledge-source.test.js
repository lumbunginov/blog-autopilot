'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function baRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-ba-'));
  for (const [id, nama, n] of [['perkapcom', 'Perkap.com', 2], ['karvaid', 'Karva.id', 1]]) {
    const dir = path.join(root, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ nama, toneOfVoice: 'santai' }));
    fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify(
      Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nama: `Produk ${i}`, konteks: '' }))
    ));
  }
  // Folder yang BUKAN business asset — tidak boleh ikut terdaftar.
  fs.mkdirSync(path.join(root, 'bukan-bisnis'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bukan-bisnis', 'catatan.txt'), 'rahasia');
  // Foto sah untuk tes rute /api/business-asset-photo.
  fs.mkdirSync(path.join(root, 'perkapcom', 'photos'), { recursive: true });
  fs.writeFileSync(path.join(root, 'perkapcom', 'photos', 'sah.png'), 'PNG-PALSU-UNTUK-TES');
  // Berkas non-gambar yang BENAR-BENAR ADA di photos/ — supaya tes ekstensi
  // menggigit allowlist (lapis 2), bukan cuma 404-karena-tidak-ada.
  fs.writeFileSync(path.join(root, 'perkapcom', 'photos', 'config.json'), 'PENANDA-CONFIG-RAHASIA');
  fs.writeFileSync(path.join(root, 'perkapcom', 'photos', 'catatan.txt'), 'PENANDA-CATATAN-RAHASIA');
  return root;
}

function setupApp(configObj) {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), JSON.stringify(configObj, null, 2));
  const app = express();
  app.use(express.json());
  require('./knowledge-source')(app, { paths: makePaths(skillDir) });
  return app;
}

async function withServer(configObj, fn) {
  const app = setupApp(configObj);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('daftar bisnis hanya folder yang punya profile.json', async () => {
  const root = baRoot();
  await withServer({}, async (base) => {
    const r = await (await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`)).json();
    const ids = r.businesses.map(b => b.id).sort();
    assert.deepStrictEqual(ids, ['karvaid', 'perkapcom']);
    assert.ok(!ids.includes('bukan-bisnis'));
  });
});

test('daftar bisnis menyertakan nama dan jumlah produk', async () => {
  const root = baRoot();
  await withServer({}, async (base) => {
    const r = await (await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`)).json();
    const p = r.businesses.find(b => b.id === 'perkapcom');
    assert.strictEqual(p.name, 'Perkap.com');
    assert.strictEqual(p.productCount, 2);
  });
});

test('root tidak ada: 200, daftar kosong, pesan menyebut path', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/business-assets?root=${encodeURIComponent('Z:/tidak/ada')}`);
    assert.strictEqual(res.status, 200);
    const r = await res.json();
    assert.deepStrictEqual(r.businesses, []);
    assert.ok(r.error && r.error.includes('tidak/ada'));
  });
});

test('root kosong: 400 dengan pesan, bukan membaca direktori kerja', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/business-assets`);
    assert.strictEqual(res.status, 400);
  });
});

test('daftar bisnis tidak pernah membocorkan isi berkas lain', async () => {
  const root = baRoot();
  await withServer({}, async (base) => {
    const body = await (await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`)).text();
    assert.ok(!body.includes('rahasia'));
  });
});

test('preview melaporkan ringkasan tenant aktif', async () => {
  const root = baRoot();
  await withServer({
    wordpress: { url: 'https://perkap.com' },
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  }, async (base) => {
    const r = await (await fetch(`${base}/api/knowledge-preview`)).json();
    assert.strictEqual(r.source, 'business_asset');
    assert.strictEqual(r.error, null);
    assert.strictEqual(r.summary.products, 2);
    assert.strictEqual(r.summary.tone, 'casual');
  });
});

test('preview mode manual tetap menjawab tanpa error', async () => {
  await withServer({ knowledge_base: { business_name: 'Manual', products: [{ name: 'A' }] } },
    async (base) => {
      const r = await (await fetch(`${base}/api/knowledge-preview`)).json();
      assert.strictEqual(r.source, 'manual');
      assert.strictEqual(r.summary.products, 1);
    });
});

test('respons hanya memuat id, name, productCount — bukan field lain dari profile.json', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-bocor-'));
  const dir = path.join(root, 'bisnisku');
  fs.mkdirSync(dir, { recursive: true });
  // Profil bisnis yang SAH tapi memuat data yang tidak boleh ikut tersiar.
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({
    nama: 'Bisnis Sah',
    whatsapp: '0812RAHASIA',
    fbBusinessId: 'TOKEN-RAHASIA-JANGAN-BOCOR',
    paletWarna: 'panjang sekali dan tidak relevan'
  }));
  fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify([{ id: 'a', nama: 'Produk' }]));

  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/business-assets?root=${encodeURIComponent(root)}`);
    const body = await res.text();
    assert.ok(!body.includes('RAHASIA'), 'field profil di luar nama tidak boleh ikut tersiar');
    assert.ok(!body.includes('paletWarna'));
    const j = JSON.parse(body);
    assert.deepStrictEqual(Object.keys(j.businesses[0]).sort(), ['id', 'name', 'productCount'],
      'bentuk baris harus persis 3 field — kalau bertambah, ini harus merah');
  });
});

test('foto: berkas sah dilayani dengan content-type gambar', async () => {
  const root = baRoot();
  await withServer({
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  }, async (base) => {
    const res = await fetch(`${base}/api/business-asset-photo?file=sah.png`);
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type'), /^image\/png/);
  });
});

test('foto: path traversal ditolak dan tidak membocorkan isi berkas', async () => {
  const root = baRoot();
  await withServer({
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  }, async (base) => {
    const jahat = [
      '../../../../.env',
      '..%2f..%2fconfig.json',
      '....//....//rahasia.png',
      'sub/dir/foto.png',
      'sah.png\u0000.txt'
    ];
    for (const f of jahat) {
      const res = await fetch(`${base}/api/business-asset-photo?file=` + encodeURIComponent(f));
      const body = await res.text();
      assert.ok(res.status === 400 || res.status === 404, `harus ditolak: ${f} (dapat ${res.status})`);
      assert.ok(!/PNG-PALSU-UNTUK-TES/i.test(body), `tidak boleh membocorkan isi: ${f}`);
    }
  });
});

test('foto: ekstensi selain gambar ditolak', async () => {
  const root = baRoot();
  await withServer({
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  }, async (base) => {
    for (const f of ['config.json', 'catatan.txt', 'skrip.js', 'tanpaekstensi']) {
      const res = await fetch(`${base}/api/business-asset-photo?file=` + f);
      assert.ok(res.status === 400 || res.status === 404, `harus ditolak: ${f}`);
    }
    // config.json dan catatan.txt BENAR-BENAR ADA di photos/ (lihat baRoot()) —
    // jadi penolakannya wajib datang dari allowlist ekstensi (lapis 2), bukan
    // dari "berkas tidak ada". Kalau lapis 2 bocor, isi berkas akan tersaji.
    const resConfig = await fetch(`${base}/api/business-asset-photo?file=config.json`);
    assert.ok(!/PENANDA-CONFIG-RAHASIA/.test(await resConfig.text()), 'lapis 2 harus menahan isi config.json');
    const resCatatan = await fetch(`${base}/api/business-asset-photo?file=catatan.txt`);
    assert.ok(!/PENANDA-CATATAN-RAHASIA/.test(await resCatatan.text()), 'lapis 2 harus menahan isi catatan.txt');
  });
});

test('lapis 4 (diDalamFolder): menolak nama yang resolve keluar folder, menerima yang di dalam', () => {
  const { diDalamFolder } = require('../lib/business-asset');
  const dirIzin = path.join(os.tmpdir(), 'ks-dirizin-uji');
  assert.strictEqual(diDalamFolder(dirIzin, 'sah.png'), true, 'berkas sah di dalam folder harus diterima');
  assert.strictEqual(diDalamFolder(dirIzin, '../../rahasia.png'), false, 'harus tertolak: naik dua folder');
  assert.strictEqual(diDalamFolder(dirIzin, '../x.png'), false, 'harus tertolak: naik satu folder');
  assert.strictEqual(diDalamFolder(dirIzin, 'sub/dir/x.png'), true, 'subfolder di DALAM dirIzin tetap sah untuk fungsi ini (lapis 1 di rute yang menolak "/", bukan lapis 4)');
});

test('foto: mode manual menolak, karena tidak punya sumber gambar', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/business-asset-photo?file=sah.png`);
    assert.strictEqual(res.status, 400);
  });
});

test('foto: berkas yang tidak ada memberi 404 tanpa menyebut path absolut', async () => {
  const root = baRoot();
  await withServer({
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  }, async (base) => {
    const res = await fetch(`${base}/api/business-asset-photo?file=tidakada.png`);
    assert.strictEqual(res.status, 404);
    const body = await res.text();
    assert.ok(!body.includes('C:\\') && !body.includes('G:/'), 'jangan bocorkan path disk');
  });
});

test('detail produk: mengembalikan satu produk penuh, bukan katalog', async () => {
  const root = baRoot();
  await withServer({
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  }, async (base) => {
    const res = await fetch(`${base}/api/business-asset-product?id=p0`);
    assert.strictEqual(res.status, 200);
    const p = await res.json();
    assert.strictEqual(p.id, 'p0');
    assert.ok('context' in p && 'faq' in p);
    assert.strictEqual(Array.isArray(p), false, 'jangan kirim seluruh katalog');
  });
});

test('detail produk: produk tidak dikenal memberi 404, bukan 500', async () => {
  const root = baRoot();
  await withServer({
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  }, async (base) => {
    const res = await fetch(`${base}/api/business-asset-product?id=tidak-ada-produk-ini`);
    assert.strictEqual(res.status, 404);
  });
});
