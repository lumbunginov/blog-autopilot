'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { punyaRiset, resolveRiset } = require('./riset');

// Ganti ganda: mencatat berapa kali dipanggil dan dengan prompt apa.
function askPalsu(balasan) {
  const panggilan = [];
  const ask = async (prompt) => { panggilan.push(prompt); return balasan; };
  ask.panggilan = panggilan;
  return ask;
}

test('punyaRiset mendeteksi blok', () => {
  assert.equal(punyaRiset('{riset}cari fakta{/riset}'), true);
  assert.equal(punyaRiset('tanpa blok apa pun'), false);
  assert.equal(punyaRiset(''), false);
  assert.equal(punyaRiset(null), false);
});

test('teks tanpa blok riset dikembalikan tanpa memanggil AI', async () => {
  const ask = askPalsu('[HASIL 1]x[/HASIL 1]');
  const hasil = await resolveRiset('teks biasa', { ask });
  assert.equal(hasil, 'teks biasa');
  assert.equal(ask.panggilan.length, 0);
});

test('satu blok diganti hasilnya', async () => {
  const ask = askPalsu('[HASIL 1]\nFakta A\n[/HASIL 1]');
  const hasil = await resolveRiset('Awal {riset}cari fakta{/riset} akhir', { ask });
  assert.equal(hasil, 'Awal Fakta A akhir');
});

test('beberapa blok diselesaikan dalam SATU panggilan, bukan satu per blok', async () => {
  const ask = askPalsu('[HASIL 1]Satu[/HASIL 1]\n[HASIL 2]Dua[/HASIL 2]');
  const hasil = await resolveRiset('{riset}tugas a{/riset} dan {riset}tugas b{/riset}', { ask });
  assert.equal(ask.panggilan.length, 1, 'harus satu panggilan untuk dua blok');
  assert.equal(hasil, 'Satu dan Dua');
});

test('prompt yang dikirim memuat semua tugas dan format keluaran yang diminta', async () => {
  const ask = askPalsu('[HASIL 1]a[/HASIL 1]\n[HASIL 2]b[/HASIL 2]');
  await resolveRiset('{riset}tugas satu{/riset}{riset}tugas dua{/riset}', { ask });
  const p = ask.panggilan[0];
  assert.match(p, /tugas satu/);
  assert.match(p, /tugas dua/);
  assert.match(p, /\[HASIL 1\]/);
  assert.match(p, /\[HASIL 2\]/);
});

test('konteks bisnis ikut dikirim bila diberikan', async () => {
  const ask = askPalsu('[HASIL 1]a[/HASIL 1]');
  await resolveRiset('{riset}t{/riset}', { ask, konteks: 'PROFIL: Perkap.com' });
  assert.match(ask.panggilan[0], /PROFIL: Perkap\.com/);
});

test('balasan tanpa tag HASIL melempar, bukan menghasilkan prompt terpotong diam-diam', async () => {
  const ask = askPalsu('maaf saya tidak bisa membantu');
  await assert.rejects(() => resolveRiset('{riset}t{/riset}', { ask }), /HASIL/);
});

test('balasan kurang satu tag melempar', async () => {
  const ask = askPalsu('[HASIL 1]ada[/HASIL 1]');
  await assert.rejects(() => resolveRiset('{riset}a{/riset}{riset}b{/riset}', { ask }), /HASIL 2/);
});

test('galat dari ask diteruskan apa adanya, tidak ditelan', async () => {
  const ask = async () => { throw new Error('Kunci API teks kosong.'); };
  await assert.rejects(() => resolveRiset('{riset}t{/riset}', { ask }), /Kunci API teks kosong/);
});

test('blok riset kosong dilewati tanpa memanggil AI', async () => {
  const ask = askPalsu('[HASIL 1]x[/HASIL 1]');
  const hasil = await resolveRiset('a {riset}   {/riset} b', { ask });
  assert.equal(ask.panggilan.length, 0);
  assert.equal(hasil, 'a  b');
});

test('penulisan blok tidak peka huruf besar-kecil', async () => {
  const ask = askPalsu('[HASIL 1]Hasil[/HASIL 1]');
  assert.equal(await resolveRiset('{RISET}tugas{/RISET}', { ask }), 'Hasil');
});

test('punyaRiset dipanggil lebih dulu tidak merusak hitungan blok', async () => {
  const teks = '{riset}tugas a{/riset} dan {riset}tugas b{/riset}';
  assert.equal(punyaRiset(teks), true);
  assert.equal(punyaRiset(teks), true);
  const ask = askPalsu('[HASIL 1]Satu[/HASIL 1]\n[HASIL 2]Dua[/HASIL 2]');
  const hasil = await resolveRiset(teks, { ask });
  assert.equal(ask.panggilan.length, 1);
  assert.equal(hasil, 'Satu dan Dua');
});
