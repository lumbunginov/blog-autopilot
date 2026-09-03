'use strict';
// Satu-satunya tempat yang tahu bentuk API OpenAI. Modul lain memanggil
// askOpenAI dan tidak pernah menyusun payload-nya sendiri.
const https = require('https');

const MODEL_BAWAAN = 'gpt-4o-mini';
// 60 detik, bukan 15 seperti wp-client: riset menghasilkan beberapa paragraf,
// dan batas pendek memotong balasan yang sah.
const TIMEOUT_BAWAAN = 60000;

function askOpenAI(apiKey, prompt, opts = {}) {
  const kunci = String(apiKey || '').trim();
  const isi = String(prompt || '').trim();
  const model = opts.model || MODEL_BAWAAN;
  const timeout = opts.timeout || TIMEOUT_BAWAAN;

  // Ditolak sebelum menyentuh jaringan: pesannya harus menyebut apa yang kurang,
  // bukan "401 Unauthorized" yang tidak memberi tahu apa pun ke pemilik blog.
  if (!kunci) return Promise.reject(new Error('Kunci API teks kosong. Isi {ID}_TEXT_API_KEY di .env.'));
  if (!isi) return Promise.reject(new Error('Prompt riset kosong.'));

  const payload = JSON.stringify({
    model,
    messages: [{ role: 'user', content: isi }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kunci}`,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          // Potong badan balasan: pesan galat OpenAI bisa panjang, dan isinya
          // masuk ke terminal pemilik blog.
          return reject(new Error(`OpenAI menolak (HTTP ${res.statusCode}): ${data.slice(0, 300)}`));
        }
        let json;
        try { json = JSON.parse(data); }
        catch { return reject(new Error(`Balasan OpenAI bukan JSON: ${data.slice(0, 200)}`)); }
        const isiBalasan = json?.choices?.[0]?.message?.content;
        if (!isiBalasan) return reject(new Error(`Balasan OpenAI tanpa isi: ${data.slice(0, 200)}`));
        resolve(isiBalasan);
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`OpenAI tidak menjawab dalam ${timeout} ms.`)); });
    req.on('error', (e) => reject(new Error(`Panggilan OpenAI gagal: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}

module.exports = { askOpenAI, MODEL_BAWAAN, TIMEOUT_BAWAAN };
