// Aturan gaya menulis bawaan, disalin dari agents/article-writer.md bagian
// "Writing Guidelines" (Language & Tone sampai Panjang Kalimat).
//
// KENAPA DISALIN, BUKAN DIPINDAH: article-writer.md tetap memegang aturan ini
// sebagai perilaku bawaan. Rencana TANPA template harus berperilaku persis
// seperti sebelum fitur template ada — itu janji inti spec-nya, dan 663 artikel
// yang sudah terbit bergantung padanya. Berkas ini hanya memberi pemilik blog
// titik mulai yang bisa diedit, bukan memindahkan sumber kebenaran.
//
// Yang SENGAJA tidak ikut disalin:
// - Article File Format, batas meta 50-60 / 150-160, dan prohibited_topics:
//   itu pagar yang template TIDAK BOLEH kalahkan (lihat article-writer.md).
//   Menaruhnya di sini berarti pemilik bisa menghapusnya tanpa sadar.
// - Internal Linking dan Detail Produk: keduanya berisi kode yang dijalankan
//   agen (baca articles-cache.json, panggil blog-config.js product). Template
//   hanya teks; kode di dalamnya tidak akan pernah dieksekusi.
//
// Kalau article-writer.md berubah, teks di sini ikut usang. Itu diterima:
// keduanya berdiri sendiri, dan yang di sini hanya contoh awal.
const ATURAN_BAWAAN_ARTIKEL = `## Nada

Nada tulisan: {nada}.
- professional -> berwibawa, berbasis data, formal tapi tidak kaku
- casual -> hangat, mengobrol, pakai "kamu" bukan "Anda"
- educational -> jelaskan dengan contoh dan analogi
- authoritative -> suara ahli, sebut hal spesifik, percaya diri
- local -> dekat dengan komunitas, sebut konteks lokal

## Struktur

Buka dengan hook — pertanyaan, angka, atau pernyataan masalah yang menarik
pembaca. Sebut {keyword} dengan tebal di paragraf pertama.

1. Pembuka — hook + konteks + keyword (satu paragraf pendek)
2. Bagian H2 — 3-6 bagian utama, tiap bagian 2-4 paragraf
3. Subbagian H3 — secukupnya saja, untuk daftar atau poin turunan
4. Penutup — rangkum + CTA halus ke {namaBisnis}

## Kualitas Isi

- Tiap paragraf harus punya alasan untuk ada — tanpa pengisi
- Pakai detail spesifik (angka, contoh, skenario), bukan generalisasi kabur
- Paragraf pendek, 2-4 kalimat — ini blog, bukan esai
- Daftar bagus untuk langkah, perbandingan, dan tips — pakai kalau terasa wajar
- Sebut 1-2 produk secara alami, jangan dipaksakan

## SEO

- {keyword} wajib muncul di: paragraf pertama (tebal), minimal satu H2, penutup
- Kepadatan keyword 1-2%. Sebar merata — jangan menumpuk di satu bagian
- Satu H2 setiap 200-300 kata. Minimal satu H2 memuat {keyword} atau variasinya
- 2-3 tautan internal dengan anchor deskriptif, bukan "klik di sini"

## Kata Kunci Semantik (LSI)

Sertakan 10-15 variasi dan istilah terkait dari: {lsi}
Cara mencari: variasi kata (sewa/rental/pinjam), istilah teknis terkait, dan
sinonim dari sudut pandang pembeli (booking/pesan/reservasi). Sisipkan secara
alami — jangan dipaksakan.

## SEO Lokal

Kota sasaran artikel ini: {kotaTarget}.
Sebut nama kota 3-5 kali. Wajib ada di: judul, paragraf pertama, minimal satu
H2, dan penutup. Tambahkan area sekitar bila relevan.

## Panjang

Target {jumlahKata} kata. Tipe konten: {tipeKonten}.
- informational (tips, panduan, cara): 1200-1500 kata, minimum 800
- transactional (harga, sewa, beli): 800-1200 kata, minimum 600
- SEO lokal: 800-1000 kata, minimum 500

## Panjang Kalimat

Rata-rata 15-20 kata per kalimat, maksimal 25. Variasikan: campur kalimat
pendek (8-10 kata) dan sedang (15-20 kata). Kalimat lebih dari 25 kata dipecah
menjadi dua.`;
