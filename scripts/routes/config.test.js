'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { makePaths } = require('../lib/paths');

function baRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgroute-ba-'));
  const dir = path.join(root, 'perkapcom');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({
    nama: 'Perkap.com', deskripsi: 'Sewa alat panitia.', targetMarket: 'Panitia',
    toneOfVoice: 'santai', kataHindari: ['Termurah']
  }));
  fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify([
    { id: 'ht', nama: 'Sewa HT', harga: 'Rp 35.000',
      konteks: 'Detail https://perkap.com/sewa-ht/', faq: 'tanya jawab' }
  ]));
  return root;
}

function setupApp(configObj) {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgroute-'));
  const blogDir = path.join(skillDir, 'data', 'blogs', 'testblog');
  fs.mkdirSync(blogDir, { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'config.json'), JSON.stringify(configObj, null, 2));
  const paths = makePaths(skillDir);
  const app = express();
  app.use(express.json());
  require('./config')(app, { paths });
  require('./blogs')(app, { paths });
  return { app, configFile: path.join(blogDir, 'config.json') };
}

async function withServer(configObj, fn) {
  const { app, configFile } = setupApp(configObj);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, configFile); } finally { server.close(); }
}

const MANUAL = {
  wordpress: { url: 'https://x.test', username: 'u' },
  knowledge_base: { business_name: 'Manual Inc', products: [{ name: 'A', url: '' }] }
};

function baConfig(root) {
  return {
    wordpress: { url: 'https://perkap.com', username: 'u' },
    knowledge_base: { business_name: 'Manual Inc', products: [{ name: 'A', url: '' }] },
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  };
}

test('GET /api/config mode manual tidak berubah perilakunya', async () => {
  await withServer(MANUAL, async (base) => {
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Manual Inc');
    assert.strictEqual(r._knowledge.source, 'manual');
    assert.strictEqual(r._knowledge.error, null);
  });
});

test('GET /api/config mode business_asset mengembalikan data live', async () => {
  await withServer(baConfig(baRoot()), async (base) => {
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
    assert.strictEqual(r.knowledge_base.products.length, 1);
    assert.strictEqual(r.knowledge_base.products[0].url, 'https://perkap.com/sewa-ht/');
    assert.strictEqual(r._knowledge.source, 'business_asset');
  });
});

test('GET /api/config tidak pernah mengirim konteks atau faq produk', async () => {
  await withServer(baConfig(baRoot()), async (base) => {
    const body = await (await fetch(`${base}/api/config`)).text();
    assert.ok(!body.includes('tanya jawab'), 'faq tidak boleh ikut');
    assert.ok(!body.includes('konteks'));
  });
});

test('POST /api/config mode business_asset TIDAK menulis knowledge_base ke disk', async () => {
  await withServer(baConfig(baRoot()), async (base, configFile) => {
    const res = await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: { business_name: 'DISUSUPI' }, workflow: { language: 'en' } })
    });
    const out = await res.json();
    assert.strictEqual(out.success, true);
    assert.ok(out.warning && out.warning.includes('knowledge_base'));
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_base.business_name, 'Manual Inc', 'cadangan manual harus utuh');
    assert.strictEqual(saved.workflow.language, 'en', 'field lain tetap tersimpan');
  });
});

test('POST /api/config mode manual tetap menyimpan knowledge_base', async () => {
  await withServer(MANUAL, async (base, configFile) => {
    await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: { business_name: 'Diubah' } })
    });
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_base.business_name, 'Diubah');
  });
});

test('POST /api/config bisa mengganti knowledge_source ke business_asset', async () => {
  const root = baRoot();
  await withServer(MANUAL, async (base, configFile) => {
    await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
      })
    });
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_source.type, 'business_asset');
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
  });
});

test('mode business_asset dengan folder salah: GET tetap 200 dan menyebut errornya', async () => {
  const cfg = baConfig(baRoot());
  cfg.knowledge_source.business_asset.business_id = 'tidakada';
  await withServer(cfg, async (base) => {
    const res = await fetch(`${base}/api/config`);
    assert.strictEqual(res.status, 200);
    const r = await res.json();
    assert.ok(r._knowledge.error.includes('tidakada'));
  });
});

test('GET /api/blogs/:id/config ikut memakai resolver', async () => {
  await withServer(baConfig(baRoot()), async (base) => {
    const r = await (await fetch(`${base}/api/blogs/testblog/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
    assert.strictEqual(r._knowledge.source, 'business_asset');
  });
});

test('PUT /api/blogs/:id/config juga menolak knowledge_base di mode business_asset', async () => {
  await withServer(baConfig(baRoot()), async (base, configFile) => {
    const out = await (await fetch(`${base}/api/blogs/testblog/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: { business_name: 'DISUSUPI' } })
    })).json();
    assert.ok(out.warning && out.warning.includes('knowledge_base'));
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(saved.knowledge_base.business_name, 'Manual Inc');
  });
});

test('PUT /api/blogs/:id/config tetap menolak kredensial, dan dua peringatan bisa muncul bersamaan', async () => {
  await withServer(baConfig(baRoot()), async (base, configFile) => {
    const out = await (await fetch(`${base}/api/blogs/testblog/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wordpress: { app_password: 'rahasia-jangan-tersimpan' },
        knowledge_base: { business_name: 'DISUSUPI' }
      })
    })).json();
    assert.ok(out.warning.includes('app_password'), 'peringatan kredensial harus tetap ada');
    assert.ok(out.warning.includes('knowledge_base'), 'peringatan knowledge_base harus ikut');
    const disk = fs.readFileSync(configFile, 'utf-8');
    assert.ok(!disk.includes('rahasia-jangan-tersimpan'), 'kredensial tidak boleh mendarat di disk');
    assert.ok(!disk.includes('DISUSUPI'));
  });
});

test('POST /api/config juga menolak kredensial berbarengan dengan knowledge_base', async () => {
  await withServer(baConfig(baRoot()), async (base, configFile) => {
    const out = await (await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_api: { api_key: 'kunci-rahasia-xyz' },
        knowledge_base: { business_name: 'DISUSUPI' }
      })
    })).json();
    assert.ok(out.warning.includes('api_key'));
    assert.ok(out.warning.includes('knowledge_base'));
    assert.ok(!fs.readFileSync(configFile, 'utf-8').includes('kunci-rahasia-xyz'));
  });
});

// Siklus penuh dengan body seperti yang SUNGGUHAN dikirim browser: collectForm()
// selalu memanen knowledge_base dari DOM, dan di mode business_asset DOM itu berisi
// data live. Test lama memakai body ringkas buatan tangan, sehingga jalur ini lolos.
test('siklus manual → business_asset → manual tidak menghapus cadangan manual', async () => {
  const root = baRoot();
  const AWAL = {
    wordpress: { url: 'https://perkap.com', username: 'u' },
    knowledge_base: {
      business_name: 'CADANGAN MANUAL',
      business_description: 'ditulis user',
      products: [{ name: 'P1', url: '' }, { name: 'P2', url: '' }],
      target_audience: 'pelanggan lama',
      tone: 'professional',
      prohibited_topics: ['judi', 'rokok'],
      internal_links: [{ url: 'https://x.test/a/', anchor: 'a' }],
      custom_entries: [{ title: 'catatan penting', body: 'isi' }],
      // Profil lengkap ikut diuji: kalau suatu saat strip diubah jadi allowlist
      // per-field dan field baru terlupa, test ini yang menangkapnya.
      city: 'Surabaya',
      whatsapp: '0812345',
      tagline: 'Slogan Manual',
      cta: ['Hubungi kami'],
      signature_words: ['khas']
    },
    workflow: { language: 'id', saved_categories: [{ id: 9, name: 'kat' }] }
  };

  await withServer(AWAL, async (base, configFile) => {
    const post = (body) => fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(r => r.json());

    await post({ knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } } });

    // Yang tampil di layar sekarang data business asset.
    const tampil = (await (await fetch(`${base}/api/config`)).json()).knowledge_base;
    assert.strictEqual(tampil.business_name, 'Perkap.com', 'prasyarat: mode BA aktif');

    // User memindahkan radio ke manual lalu menekan Save. collectForm() ikut
    // mengirim knowledge_base hasil panen DOM — yaitu data BA di atas.
    const out = await post({
      knowledge_source: { type: 'manual' },
      knowledge_base: {
        business_name: tampil.business_name,
        business_description: tampil.business_description,
        products: tampil.products,
        target_audience: tampil.target_audience,
        tone: tampil.tone,
        prohibited_topics: [],
        internal_links: tampil.internal_links,
        custom_entries: []
      }
    });
    assert.ok(out.warning && out.warning.includes('knowledge_base'),
      'user harus diberi tahu kenapa suntingannya tidak tersimpan');

    const disk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(disk.knowledge_source.type, 'manual', 'perpindahan mode tetap tersimpan');
    assert.strictEqual(disk.knowledge_base.business_name, 'CADANGAN MANUAL');
    assert.strictEqual(disk.knowledge_base.products.length, 2);
    assert.deepStrictEqual(disk.knowledge_base.prohibited_topics, ['judi', 'rokok'],
      'prohibited_topics tidak pernah dipetakan dari business asset — kalau tertimpa, hilang permanen');
    assert.strictEqual(disk.knowledge_base.custom_entries.length, 1);
    assert.strictEqual(disk.workflow.saved_categories.length, 1);
    // Profil lengkap juga harus selamat, bukan tertimpa data business asset.
    assert.strictEqual(disk.knowledge_base.city, 'Surabaya');
    assert.strictEqual(disk.knowledge_base.whatsapp, '0812345');
    assert.strictEqual(disk.knowledge_base.tagline, 'Slogan Manual');
    assert.deepStrictEqual(disk.knowledge_base.cta, ['Hubungi kami']);
    assert.deepStrictEqual(disk.knowledge_base.signature_words, ['khas']);
  });
});

test('sumber business asset rusak lalu user kembali ke manual: cadangan tetap bisa dipulihkan', async () => {
  const AWAL = {
    wordpress: { url: 'https://perkap.com' },
    knowledge_base: {
      business_name: 'CADANGAN MANUAL', products: [{ name: 'P1', url: '' }],
      prohibited_topics: ['judi'], custom_entries: [{ title: 'c', body: 'i' }]
    },
    knowledge_source: { type: 'business_asset', business_asset: { root: 'Z:/hilang', business_id: 'x' } }
  };
  await withServer(AWAL, async (base, configFile) => {
    // Layar menampilkan field kosong karena sumbernya tidak terbaca.
    const layar = await (await fetch(`${base}/api/config`)).json();
    assert.ok(layar._knowledge.error, 'prasyarat: sumber memang rusak');
    assert.strictEqual(layar.knowledge_base.products.length, 0);

    // User panik, kembali ke manual, menekan Save — mengirim field kosong itu.
    await fetch(`${base}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_source: { type: 'manual' }, knowledge_base: layar.knowledge_base })
    });

    const disk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    assert.strictEqual(disk.knowledge_base.business_name, 'CADANGAN MANUAL',
      'cadangan tidak boleh tertimpa knowledge base kosong');
    assert.deepStrictEqual(disk.knowledge_base.prohibited_topics, ['judi']);
    assert.strictEqual(disk.knowledge_base.custom_entries.length, 1);
  });
});

test('suffix judul SEO memakai nama bisnis yang berlaku, bukan cadangan manual basi', async () => {
  const root = baRoot();
  const cfg = {
    wordpress: { url: 'https://perkap.com', username: 'u' },
    knowledge_base: { business_name: 'NAMA LAMA MANUAL', products: [] },
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
    // sengaja tanpa seo_plugin supaya withSeoDefaults yang mengisinya
  };
  await withServer(cfg, async (base) => {
    const r = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(r.knowledge_base.business_name, 'Perkap.com');
    assert.strictEqual(r.seo_plugin.rankmath.title_suffix, '| Perkap.com',
      'suffix mendarat di meta title tiap artikel — kalau memakai nama basi, salahnya senyap');
  });
});

test('label tenant di daftar blog memakai nama yang berlaku', async () => {
  const root = baRoot();
  const cfg = {
    wordpress: { url: 'https://perkap.com' },
    knowledge_base: { business_name: 'NAMA LAMA MANUAL', products: [] },
    knowledge_source: { type: 'business_asset', business_asset: { root, business_id: 'perkapcom' } }
  };
  await withServer(cfg, async (base) => {
    const r = await (await fetch(`${base}/api/blogs`)).json();
    const t = r.blogs.find(b => b.id === 'testblog');
    assert.strictEqual(t.name, 'Perkap.com',
      'sidebar dan tab Knowledge Base harus menyebut nama yang sama');
  });
});
