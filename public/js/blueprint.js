// ==================== BLUEPRINT HALAMAN ====================
// Sub-tab "Halaman" di menu Template. Blueprint = kerangka seksi halaman
// Elementor; dipakai menahan halaman yang bentuknya menyimpang sebelum terbit.
// Berkas terpisah dari app.js karena urusannya berdiri sendiri: app.js sudah
// panjang, dan bagian ini tidak dipakai menu lain.
let bpData = { blueprints: [], pages: [] };

function tplTab(nama, el) {
  document.getElementById('tpl-pane-artikel').style.display = nama === 'artikel' ? '' : 'none';
  document.getElementById('tpl-pane-halaman').style.display = nama === 'halaman' ? '' : 'none';
  document.querySelectorAll('.tpl-tab').forEach(b => b.classList.remove('tpl-tab-active'));
  if (el) el.classList.add('tpl-tab-active');
  if (nama === 'halaman') bpLoad();
}

async function bpLoad() {
  try {
    bpData = await fetch('/api/page-blueprints').then(x => x.json());
    if (bpData.error) { toast('Error: ' + bpData.error, 'error'); return; }
    bpRender();
  } catch (e) { toast('Gagal memuat blueprint: ' + e.message, 'error'); }
}

function bpRender() {
  const list = document.getElementById('bp-list');
  const pages = document.getElementById('bp-pages');
  if (!list || !pages) return;

  list.innerHTML = bpData.blueprints.length === 0
    ? '<p style="color:var(--text-secondary); font-size:14px;">Belum ada blueprint. Klik &quot;+ Rekam dari Halaman&quot; dan pilih halaman yang bentuknya sudah benar.</p>'
    : bpData.blueprints.map(b => `
      <div class="produk-kartu" data-bp="${escHtml(b.name)}" style="border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div style="min-width:0;">
            <strong>${escHtml(b.name)}</strong>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
              ${b.sections.length} seksi &middot; ${b.pages.length} halaman memakai${b.note ? ' &middot; ' + escHtml(b.note) : ''}
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button class="plan-act" data-aksi="rinci">📐 Rincian</button>
            <button class="plan-act" data-aksi="periksa">🔍 Periksa</button>
            <button class="plan-act" data-aksi="hapus">🗑 Hapus</button>
          </div>
        </div>
        <div class="bp-rinci" style="display:none; margin-top:10px; border-top:1px solid var(--border); padding-top:10px; font-size:13px;">
          ${b.sections.map((s, i) => `
            <div style="margin-bottom:6px;">
              <span style="color:var(--text-secondary);">${String(i).padStart(2, '0')}.</span>
              <strong>${escHtml(s.label || '(tanpa teks)')}</strong>
              <div style="color:var(--text-secondary); margin-left:26px;">${escHtml(s.widgets.join(' · ') || '(tanpa widget)')}</div>
            </div>`).join('')}
        </div>
      </div>`).join('');

  pages.innerHTML = bpData.pages.length === 0
    ? '<p style="color:var(--text-secondary); font-size:14px;">Belum ada halaman di <code>elementor/</code>. Jalankan <code>download-page.js</code> lalu <code>extract-elementor.js</code>.</p>'
    : bpData.pages.map(p => `
      <div data-page="${escHtml(p.file)}" style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border);">
        <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${escHtml(p.file.replace(/\.json$/, ''))}
          <span class="bp-status" style="font-size:12px; margin-left:8px;"></span>
        </div>
        <select data-aksi="peta" style="max-width:200px;">
          <option value="">— tanpa blueprint —</option>
          ${bpData.blueprints.map(b =>
            `<option value="${escHtml(b.name)}"${b.name === p.blueprint ? ' selected' : ''}>${escHtml(b.name)}</option>`).join('')}
        </select>
      </div>`).join('');

  bpPasangKlik();
}

let bpKlikTerpasang = false;
function bpPasangKlik() {
  if (bpKlikTerpasang) return;
  bpKlikTerpasang = true;
  // Listener terdelegasi, sama seperti daftar template: nilai dari server masuk
  // lewat data-attribute dan tidak pernah diperlakukan sebagai kode.
  document.getElementById('bp-list').addEventListener('click', (e) => {
    const tombol = e.target.closest('[data-aksi]');
    if (!tombol) return;
    const kartu = tombol.closest('[data-bp]');
    const nama = kartu && kartu.dataset.bp;
    if (!nama) return;
    if (tombol.dataset.aksi === 'rinci') {
      const box = kartu.querySelector('.bp-rinci');
      box.style.display = box.style.display === 'none' ? '' : 'none';
    } else if (tombol.dataset.aksi === 'periksa') bpPeriksa(nama);
    else bpHapus(nama);
  });
  document.getElementById('bp-pages').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-aksi="peta"]');
    if (!sel) return;
    bpPeta(sel.closest('[data-page]').dataset.page, sel.value);
  });
}

function bpRekamBuka() {
  const sel = document.getElementById('bp-source');
  sel.innerHTML = bpData.pages.map(p =>
    `<option value="${escHtml(p.file)}">${escHtml(p.file.replace(/\.json$/, ''))}</option>`).join('');
  document.getElementById('bp-name').value = '';
  document.getElementById('bp-note').value = '';
  document.getElementById('bp-rekam').style.display = '';
}

function bpRekamTutup() { document.getElementById('bp-rekam').style.display = 'none'; }

async function bpRekamSimpan() {
  const body = {
    source: document.getElementById('bp-source').value,
    name: document.getElementById('bp-name').value.trim(),
    note: document.getElementById('bp-note').value.trim()
  };
  if (!body.source) { toast('Pilih halaman sumber dulu.', 'error'); return; }
  if (!body.name) { toast('Nama blueprint wajib diisi.', 'error'); return; }
  try {
    const d = await fetch('/api/page-blueprints', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(x => x.json());
    if (d.error) { toast('Error: ' + d.error, 'error'); return; }
    toast(`Blueprint "${d.name}" direkam (${d.sections} seksi).`, 'success');
    bpRekamTutup();
    bpLoad();
  } catch (e) { toast('Gagal merekam: ' + e.message, 'error'); }
}

async function bpPeta(page, blueprint) {
  try {
    const d = await fetch('/api/page-blueprints/map', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, blueprint: blueprint || null })
    }).then(x => x.json());
    if (d.error) { toast('Error: ' + d.error, 'error'); bpLoad(); return; }
    toast(blueprint ? `Dipetakan ke "${d.blueprint}".` : 'Pemetaan dilepas.', 'success');
    bpLoad();
  } catch (e) { toast('Gagal memetakan: ' + e.message, 'error'); }
}

async function bpPeriksa(namaBlueprint) {
  let body = {};
  if (namaBlueprint) {
    const b = bpData.blueprints.find(x => x.name === namaBlueprint);
    const halaman = (b && b.pages) || [];
    if (halaman.length === 0) {
      toast(`Belum ada halaman yang dipetakan ke "${namaBlueprint}".`, 'error');
      return;
    }
    body = { pages: halaman };
  }
  try {
    const d = await fetch('/api/page-blueprints/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(x => x.json());
    if (d.error) { toast('Error: ' + d.error, 'error'); return; }
    if (d.hasil.length === 0) {
      toast('Belum ada halaman yang dipetakan ke blueprint mana pun.', 'error');
      return;
    }
    bpTampilHasil(d.hasil);
    toast(d.menyimpang === 0
      ? `Semua sesuai (${d.hasil.length} halaman).`
      : `${d.menyimpang} halaman menyimpang — arahkan kursor ke tandanya untuk rincian.`,
      d.menyimpang === 0 ? 'success' : 'error');
  } catch (e) { toast('Gagal memeriksa: ' + e.message, 'error'); }
}

function bpTampilHasil(hasil) {
  hasil.forEach(h => {
    const baris = document.querySelector(`#bp-pages [data-page="${CSS.escape(h.page)}"]`);
    if (!baris) return;
    const span = baris.querySelector('.bp-status');
    if (h.status === 'sesuai') {
      span.textContent = '✓ sesuai';
      span.style.color = '#16a34a';
      span.title = '';
    } else if (h.status === 'menyimpang') {
      span.textContent = `✗ ${h.diffs.length} penyimpangan`;
      span.style.color = '#dc2626';
      // Rincian lewat title: cukup untuk tahu seksi mana yang salah, tanpa
      // menambah panel baru yang harus dibuka-tutup.
      span.title = h.diffs.map(d => {
        if (d.kind === 'lebih') return `+ seksi ${d.index} "${d.label}" tidak ada di blueprint`;
        if (d.kind === 'kurang') return `- seksi ${d.index} "${d.label}" hilang dari halaman`;
        return `~ seksi ${d.index} "${d.label}" beda\n   blueprint: ${d.expected.join(', ')}\n   halaman  : ${d.actual.join(', ')}`;
      }).join('\n');
    } else {
      span.textContent = h.pesan || h.status;
      span.style.color = 'var(--text-secondary)';
      span.title = '';
    }
  });
}

async function bpHapus(nama) {
  const b = bpData.blueprints.find(x => x.name === nama);
  if (!b) return;
  if (!confirm(`Hapus blueprint "${nama}"?\n\n${b.pages.length} halaman yang memakainya akan dilepas dan tidak lagi diperiksa.`)) return;
  try {
    const d = await fetch('/api/page-blueprints', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nama })
    }).then(x => x.json());
    if (d.error) { toast('Error: ' + d.error, 'error'); return; }
    toast('Blueprint dihapus.', 'success');
    bpLoad();
  } catch (e) { toast('Gagal menghapus: ' + e.message, 'error'); }
}
