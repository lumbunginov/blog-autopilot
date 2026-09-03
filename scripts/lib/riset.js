'use strict';
// Blok {riset}...{/riset} diselesaikan AI sebelum prompt final dipakai.
// Meniru resolveRisetBlocks di business-asset (lib/ai.js:14), termasuk
// format [HASIL n] dan aturan "beberapa blok = satu panggilan".
//
// Pemanggil AI DISUNTIK lewat opsi `ask`, bukan di-require di sini: dengan
// begitu seluruh penguraian dan penyisipan bisa diuji tanpa jaringan.

// Regex ber-flag `g` menyimpan `lastIndex` yang berubah-ubah. Kalau satu objek
// dipakai bersama, `.test()` menggeser posisinya dan `matchAll` berikutnya
// melewatkan blok pertama. Pabrik ini memberi regex baru tiap pemakaian.
const reRiset = () => /\{riset\}([\s\S]*?)\{\/riset\}/gi;

function punyaRiset(text) {
  return reRiset().test(String(text || ''));
}

function susunPrompt(tugas, konteks) {
  const daftarTugas = tugas.map((t, i) => `TUGAS ${i + 1}:\n${t}`).join('\n\n');
  const format = tugas.map((_, i) =>
    `[HASIL ${i + 1}]\n<isi hasil tugas ${i + 1} di sini>\n[/HASIL ${i + 1}]`
  ).join('\n\n');
  return [
    konteks || '',
    `INSTRUKSI RISET — selesaikan semua tugas:\n\n${daftarTugas}`,
    `\nFormat keluaran WAJIB (jangan tambah teks lain di luar tag):\n${format}`
  ].filter(Boolean).join('\n\n');
}

function ambilHasil(balasan, nomor) {
  const re = new RegExp(`\\[HASIL ${nomor}\\]([\\s\\S]*?)\\[\\/HASIL ${nomor}\\]`, 'i');
  const cocok = String(balasan || '').match(re);
  return cocok ? cocok[1].trim() : null;
}

async function resolveRiset(text, { ask, konteks } = {}) {
  const isi = String(text || '');
  const cocokan = [...isi.matchAll(reRiset())];
  if (cocokan.length === 0) return isi;

  // Blok yang isinya kosong tidak layak memicu panggilan berbayar; ia cukup
  // dibuang. Blok berisi tetap dikerjakan.
  const berisi = cocokan.filter(m => m[1].trim());
  if (berisi.length === 0) return isi.replace(reRiset(), '');

  if (typeof ask !== 'function') throw new Error('resolveRiset butuh opsi `ask`.');

  const tugas = berisi.map(m => m[1].trim());
  const balasan = await ask(susunPrompt(tugas, konteks));

  // Ambil SEMUA hasil dulu, baru menyisipkan. Balasan yang kurang satu tag
  // harus menggagalkan seluruhnya — menyisipkan sebagian menghasilkan prompt
  // yang terpotong diam-diam, dan itu tidak terlihat di mana pun.
  const hasil = [];
  for (let i = 0; i < tugas.length; i++) {
    const h = ambilHasil(balasan, i + 1);
    if (h === null) {
      throw new Error(`Balasan riset tidak memuat [HASIL ${i + 1}]. Balasan: ${String(balasan).slice(0, 200)}`);
    }
    hasil.push(h);
  }

  let n = 0;
  return isi.replace(reRiset(), (utuh, badan) => (badan.trim() ? hasil[n++] : ''));
}

module.exports = { punyaRiset, resolveRiset };
