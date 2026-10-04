'use strict';
// Satu berkas cek untuk alur skill: resolver tenant, round-trip
// extract→compress, dan aturan berbahaya di upload (format compress salah /
// page id hilang). Yang menyentuh jaringan tidak diuji di sini.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPTS = __dirname;
const AUTOPILOT = path.join(SCRIPTS, '..', '..', '..');
const upload = require('./upload-page');
const { parseBlogArg } = require('./lib/workspace');

const SAMPLE = [{
  id: 'sec1', elType: 'section', settings: { padding: '10' },
  elements: [{
    id: 'col1', elType: 'column', settings: {},
    elements: [{ id: 'h1', elType: 'widget', widgetType: 'heading', settings: { title: 'Sewa HT Bandung' } }]
  }]
}];

// Blog sungguhan di data/blogs dipakai apa adanya supaya test tidak menulis ke
// tenant produksi: semua yang ditulis masuk ke folder sementara milik test.
function tmpDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elementor-'));
  const d = {
    root,
    pages: path.join(root, 'pages'),
    elementor: path.join(root, 'elementor'),
    compress: path.join(root, 'compress')
  };
  for (const k of ['pages', 'elementor', 'compress']) fs.mkdirSync(d[k], { recursive: true });
  return d;
}

test('parseBlogArg memisahkan --blog dari argumen posisional', () => {
  assert.deepStrictEqual(parseBlogArg(['home.json', '--blog', 'examplecom']),
    { blogId: 'examplecom', rest: ['home.json'] });
  assert.deepStrictEqual(parseBlogArg(['--blog=lain', 'a.json', 'b.json']),
    { blogId: 'lain', rest: ['a.json', 'b.json'] });
  assert.deepStrictEqual(parseBlogArg(['a.json']), { blogId: null, rest: ['a.json'] });
});

test('resolveWorkspaceOffline memakai blog aktif dan membuat tiga folder', () => {
  const { makePaths } = require(path.join(AUTOPILOT, 'scripts', 'lib', 'paths'));
  const paths = makePaths(AUTOPILOT);
  const active = paths.activeBlog();
  if (!active) return; // tidak ada tenant terdaftar: tidak ada yang bisa diuji
  const { resolveWorkspaceOffline } = require('./lib/workspace');
  const ws = resolveWorkspaceOffline([]);
  assert.strictEqual(ws.blogId, active);
  for (const k of ['pages', 'elementor', 'compress']) {
    assert.ok(fs.existsSync(ws.dirs[k]), `${k} tidak dibuat`);
  }
});

test('round-trip: extract dari pages lalu compress menghasilkan data yang identik', () => {
  const d = tmpDirs();
  const slug = 'uji.json';
  // Bentuk berkas pages/ persis seperti respons WordPress context=edit.
  fs.writeFileSync(path.join(d.pages, slug), JSON.stringify({
    id: 123, slug: 'uji', meta: { _elementor_data: JSON.stringify(SAMPLE) }
  }));

  // Jalankan langkah extract & compress sebagaimana script melakukannya.
  const page = JSON.parse(fs.readFileSync(path.join(d.pages, slug), 'utf-8'));
  const extracted = JSON.parse(page.meta._elementor_data);
  fs.writeFileSync(path.join(d.elementor, slug), JSON.stringify(extracted, null, 2));

  const edited = JSON.parse(fs.readFileSync(path.join(d.elementor, slug), 'utf-8'));
  fs.writeFileSync(path.join(d.compress, slug), JSON.stringify(edited));

  const compressed = upload.readCompressed(d.compress, 'uji');
  assert.strictEqual(compressed, JSON.stringify(SAMPLE));
  assert.deepStrictEqual(JSON.parse(compressed), SAMPLE);
});

test('readCompressed menolak berkas yang bukan array section', () => {
  const d = tmpDirs();
  fs.writeFileSync(path.join(d.compress, 'x.json'), JSON.stringify({ content: SAMPLE }));
  assert.throws(() => upload.readCompressed(d.compress, 'x'), /array section/);
});

test('readCompressed menolak JSON rusak, bukan mengirimnya ke WordPress', () => {
  const d = tmpDirs();
  fs.writeFileSync(path.join(d.compress, 'y.json'), '[{"id":"a",}]');
  assert.throws(() => upload.readCompressed(d.compress, 'y'), /bukan JSON valid/);
});

test('readCompressed menyebut langkah compress bila berkasnya belum ada', () => {
  const d = tmpDirs();
  assert.throws(() => upload.readCompressed(d.compress, 'hilang'), /compress-elementor/);
});

test('readPageId mengambil id dari pages/ dan menolak berkas tanpa id', () => {
  const d = tmpDirs();
  fs.writeFileSync(path.join(d.pages, 'a.json'), JSON.stringify({ id: 999, slug: 'a' }));
  assert.strictEqual(upload.readPageId(d.pages, 'a'), 999);

  fs.writeFileSync(path.join(d.pages, 'b.json'), JSON.stringify({ slug: 'b' }));
  assert.throws(() => upload.readPageId(d.pages, 'b'), /field "id"/);
  assert.throws(() => upload.readPageId(d.pages, 'c'), /--page-id/);
});

test('parseFlags upload memisahkan --page-id dari slug', () => {
  assert.deepStrictEqual(upload.parseFlags(['home', '--page-id', '42']),
    { pageId: '42', rest: ['home'], noVerify: false, verifyOnly: false });
  assert.deepStrictEqual(upload.parseFlags(['home']),
    { pageId: null, rest: ['home'], noVerify: false, verifyOnly: false });
});

test('parseFlags upload mengenali --no-verify dan --verify-only', () => {
  assert.deepStrictEqual(upload.parseFlags(['home', '--verify-only']),
    { pageId: null, rest: ['home'], noVerify: false, verifyOnly: true });
  assert.deepStrictEqual(upload.parseFlags(['--no-verify', 'home', '--page-id=7']),
    { pageId: '7', rest: ['home'], noVerify: true, verifyOnly: false });
});

test('readPrevious hanya memakai salinan pages/ milik halaman yang sama', () => {
  const d = tmpDirs();
  const data = JSON.stringify(SAMPLE);
  fs.writeFileSync(path.join(d.pages, 'a.json'), JSON.stringify({ id: 5, meta: { _elementor_data: data } }));
  assert.deepStrictEqual(upload.readPrevious(d.pages, 'a', 5), SAMPLE);
  // --page-id ke halaman lain: salinan pages/ bukan "versi sebelum" halaman itu.
  assert.strictEqual(upload.readPrevious(d.pages, 'a', 6), null);
  assert.strictEqual(upload.readPrevious(d.pages, 'hilang', 5), null);
  fs.writeFileSync(path.join(d.pages, 'b.json'), JSON.stringify({ id: 5, meta: {} }));
  assert.strictEqual(upload.readPrevious(d.pages, 'b', 5), null);
});

test('liveUrl menambah penanda anti-cache tanpa merusak query yang ada', () => {
  assert.match(upload.liveUrl('https://x.test/halaman/', 9), /^https:\/\/x\.test\/halaman\/\?render_check=9$/);
  assert.match(upload.liveUrl('https://x.test/?page_id=4', 9), /^https:\/\/x\.test\/\?page_id=4&render_check=9$/);
});

test('clone-template menghasilkan JSON valid dengan id baru dan teks tergantikan', () => {
  const { makePaths } = require(path.join(AUTOPILOT, 'scripts', 'lib', 'paths'));
  const active = makePaths(AUTOPILOT).activeBlog();
  if (!active) return;
  const { dirs } = require('./lib/workspace');
  const d = dirs(active);
  fs.mkdirSync(d.elementor, { recursive: true });
  const src = path.join(d.elementor, '__uji-src.json');
  const dst = path.join(d.elementor, '__uji-dst.json');
  fs.writeFileSync(src, JSON.stringify(SAMPLE, null, 2));
  try {
    execFileSync(process.execPath, [
      path.join(SCRIPTS, 'clone-template.js'),
      '__uji-src.json', '__uji-dst.json', 'Sewa HT Yogyakarta',
      '--replace', 'Bandung:Yogyakarta'
    ], { stdio: 'pipe' });
    const out = JSON.parse(fs.readFileSync(dst, 'utf-8'));
    assert.ok(Array.isArray(out.content), 'output harus format halaman WordPress');
    const text = JSON.stringify(out);
    assert.ok(text.includes('Yogyakarta') && !text.includes('Bandung'), 'teks belum tergantikan');
    assert.notStrictEqual(out.content[0].id, 'sec1', 'id harus diregenerasi');
  } finally {
    [src, dst].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
  }
});

const create = require('./create-page');

test('create-page menerima array section Elementor apa adanya', () => {
  const d = tmpDirs();
  fs.writeFileSync(path.join(d.elementor, 'a.json'), JSON.stringify(SAMPLE));
  const r = create.readSource(d.elementor, 'a.json');
  assert.deepStrictEqual(r.sections, SAMPLE);
  assert.strictEqual(r.pageSettings, null);
});

test('create-page menerima format halaman WordPress dari clone-template', () => {
  const d = tmpDirs();
  fs.writeFileSync(path.join(d.elementor, 'b.json'), JSON.stringify({
    content: SAMPLE, page_settings: { hide_title: 'yes' }, version: '0.4', title: 'X', type: 'page'
  }));
  const r = create.readSource(d.elementor, 'b');  // ekstensi .json opsional
  assert.deepStrictEqual(r.sections, SAMPLE);
  assert.deepStrictEqual(r.pageSettings, { hide_title: 'yes' });
});

test('create-page menolak bentuk lain sebelum halaman terlanjur dibuat', () => {
  const d = tmpDirs();
  fs.writeFileSync(path.join(d.elementor, 'c.json'), JSON.stringify({ widgets: [] }));
  assert.throws(() => create.readSource(d.elementor, 'c.json'), /array section/);
  fs.writeFileSync(path.join(d.elementor, 'd.json'), '{oops');
  assert.throws(() => create.readSource(d.elementor, 'd.json'), /bukan JSON valid/);
  assert.throws(() => create.readSource(d.elementor, 'hilang.json'), /tidak ada/);
});

test('assertSections menolak section tanpa id atau elType', () => {
  assert.throws(() => create.assertSections([]), /satu section pun/);
  assert.throws(() => create.assertSections([{ elType: 'section' }]), /field wajib/);
  assert.throws(() => create.assertSections([{ id: 'a' }]), /field wajib/);
  create.assertSections(SAMPLE); // tidak melempar
});

test('create-page default status draft dan menolak status asing', () => {
  assert.deepStrictEqual(create.parseFlags(['a.json', 'Judul']),
    { slug: null, status: 'draft', rest: ['a.json', 'Judul'] });
  assert.deepStrictEqual(create.parseFlags(['a.json', 'Judul', '--slug=sewa-ht', '--status', 'publish']),
    { slug: 'sewa-ht', status: 'publish', rest: ['a.json', 'Judul'] });
  assert.throws(() => create.parseFlags(['a.json', 'J', '--status', 'live']), /tidak dikenal/);
});

test('payload create memuat penanda Elementor dan data ter-stringify', () => {
  const p = create.buildPayload({
    title: 'Sewa HT Yogyakarta', slug: 'sewa-ht-yogyakarta', status: 'draft',
    sections: SAMPLE, pageSettings: { hide_title: 'yes' }
  });
  assert.strictEqual(p.title, 'Sewa HT Yogyakarta');
  assert.strictEqual(p.slug, 'sewa-ht-yogyakarta');
  assert.strictEqual(p.status, 'draft');
  assert.strictEqual(p.meta._elementor_edit_mode, 'builder');
  assert.strictEqual(p.meta._elementor_template_type, 'wp-page');
  assert.deepStrictEqual(JSON.parse(p.meta._elementor_data), SAMPLE);
  assert.deepStrictEqual(p.meta._elementor_page_settings, { hide_title: 'yes' });
});

test('payload tanpa --slug tidak mengirim field slug (WordPress yang menurunkannya)', () => {
  const p = create.buildPayload({ title: 'T', slug: null, status: 'draft', sections: SAMPLE, pageSettings: null });
  assert.ok(!('slug' in p));
  assert.ok(!('_elementor_page_settings' in p.meta));
});
