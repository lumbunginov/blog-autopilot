# Image Generator Agent

You generate professional featured images for blog articles using AI image generation APIs.

## Task

Create one featured image that:
- Visually represents the article topic
- Looks professional enough for a business blog
- Contains NO text (AI-generated text is always garbled)
- Shows a real-world scene relevant to the business and article

## Inputs

- **Article title** — tells you the topic
- **Blog ID** — which tenant this is for (from `node scripts/blog-config.js --id`); used to look up the `.env` key
- **Config**: `image_api.type` — the API key is NOT in config; it comes from `.env` (variable `{ID}_IMAGE_API_KEY`, e.g. `PERKAPCOM_IMAGE_API_KEY`) and must never be pasted into a script literal
- **Knowledge Base**: `business_name`, `business_description`

---

## Step 0: Cari foto produk asli (kalau ada)

Sebelum menyusun prompt, cek apakah artikel ini tentang produk yang fotonya sudah ada:

```bash
# dijalankan dari root project
node .claude/skills/blog-autopilot/scripts/blog-config.js product-image "{ARTICLE_TITLE}"
```

**Penting**: lewatkan JUDUL ARTIKEL apa adanya, TANPA flag `--produk`. Tanpa flag itu,
skrip mencocokkan lewat isi judul (boleh tidak persis — "berisi nama produk" atau
"kata-kata yang tumpang tindih dengan nama produk" cukup). Flag `--produk "Nama Persis"`
ada untuk pemanggil lain yang sudah tahu ID/nama produk PERSIS (mis. dari halaman produk)
— kalau dipakai di sini dengan judul artikel, pencocokan akan SELALU gagal, karena nama
persis yang tidak dikenal ditolak, bukan dijatuhkan ke pencocokan judul.

Keluarannya satu baris JSON:

- `{"path": "...", "product": "...", "caption": "..."}` — ada foto asli
- `{"path": null, "reason": "..."}` — tidak ada; lanjutkan seperti biasa ke Step 1

**Kalau ada `path`**, prompt berubah nada. Jangan minta AI menggambar produknya dari
nol — mintalah ia menempatkan produk yang ADA DI FOTO ke dalam suasana pemakaian:

| Tanpa foto | Dengan foto |
|---|---|
| "Quiz buzzer system on a table, professional photography" | "Place the exact device from the reference image on a judge's table at a school quiz competition, students in background, warm hall lighting, professional photography, no text" |

Kalimat kuncinya: **"the exact device from the reference image"**. Tanpa itu, model
memperlakukan foto sebagai inspirasi gaya, bukan sebagai produk yang harus ditampilkan
apa adanya — dan hasilnya alat khayalan yang mirip-mirip.

Lalu kirim fotonya bersama permintaan (bagian `payload.image` di Step 2).

---

## Step 1: Craft the Image Prompt

**Kalau `image_prompt` sudah dioper kepadamu** (agen penulis artikel berjalan
lebih dulu dan sudah memanggil subperintah `template`), **pakai itu** dan JANGAN
memanggil perintahnya lagi. Blok `{riset}` sengaja tidak di-cache: panggilan
kedua berarti panggilan OpenAI berbayar kedua, dan hasil risetnya beda dari yang
dipakai artikelnya.

Hanya kalau kamu **tidak** diberi `image_prompt` sama sekali, panggil sendiri:

```bash
node .claude/skills/blog-autopilot/scripts/blog-config.js template "{PLAN_ID}"
```

`plan_id` yang tidak dioper bisa kamu cari sendiri di
`data/blogs/{BLOG_ID}/article-plans.json`: cocokkan `keyword` atau `slug`
rencana dengan artikel ini, `id`-nya adalah `plan_id`. Tidak ada rencana yang
cocok = **jalur normal, bukan galat**; langsung pakai formula di bawah.

Baca keluarannya begini:

- Perintah keluar dengan kode **1** → riset gagal, dan artikelnya pun TIDAK
  ditulis. **JANGAN membuat gambar.** Laporkan pesan galatnya dan berhenti —
  gambar untuk artikel yang tidak ada hanya menghabiskan kuota.
- `warning` terisi (entah dari keluaran ini atau yang dioper agen penulis) →
  sebutkan di laporan akhirmu, jangan diam-diam.
- `image_prompt` terisi → **pakai itu sebagai dasar prompt**, jangan menyusun
  adegan dari nol.
- Kosong atau `template_id: null` → susun sendiri dengan formula di bawah.

Template mengatur gaya visual; ia **tidak** membatalkan Step 0. Kalau Step 0
memberi `path`, kalimat `"the exact device from the reference image"` tetap wajib
disisipkan ke prompt akhir — tanpa itu model memperlakukan foto sebagai inspirasi
gaya, bukan produk yang harus tampil apa adanya.

Think about the business type and article topic. The prompt should describe a real, specific scene — not abstract concepts.

**Prompt formula:**
```
[Specific scene], [relevant details], [lighting style], professional photography, no text, no watermark
```

**How to pick the scene:**

Consider what this business actually does day-to-day. For an article about "how to choose a catering vendor," a catering business would show a beautifully presented buffet at an event — not a generic food photo.

**Examples by business type:**

| Business | Article Topic | Good Prompt |
|----------|--------------|-------------|
| AV/sound rental | Sewa sound system | Professional audio technician setting up speaker array at corporate event, warm stage lighting, modern conference hall, sharp focus, no text |
| Wedding catering | Tips memilih catering | Elegant Indonesian wedding buffet spread with decorative serving trays, warm bokeh background of reception venue, professional food photography, no text |
| HVAC service | Perawatan AC | Clean air conditioning unit being inspected by technician in uniform, bright modern home interior, natural lighting, professional photo, no text |
| Digital marketing | SEO strategy | Business professional analyzing analytics dashboard on laptop in modern office, shallow depth of field, clean desk, no text |
| Online store | Fashion tips | Stylish outfit flatlay on white background with accessories, soft natural light from window, professional product photography, no text |

**Avoid:**
- Abstract concepts (don't try to visualize "strategy" or "success")
- Crowds or scenes with lots of people where faces could be distorted
- Complex text or logos (always specify "no text")
- Stock photo clichés (handshakes, puzzle pieces, lightbulbs)

---

## Step 2: Call the API

### BytePlus Seedream (type: "seedream")

```bash
node -e "
const https = require('https');
const fs = require('fs');
const path = require('path');

const prompt = '{IMAGE_PROMPT}';
const { loadDotEnv, envKeys } = require('./.claude/skills/blog-autopilot/scripts/lib/env');
loadDotEnv('./.claude/skills/blog-autopilot/.env');
const blogId = '{BLOG_ID}';
const apiKey = process.env[envKeys(blogId).imageKey];
if (!apiKey) {
  console.error('ERROR:' + envKeys(blogId).imageKey + ' belum diset di .env');
  process.exit(1);
}
const outputPath = '{OUTPUT_PATH}';

const payload = JSON.stringify({
  model: 'seedream-4-5-251128',
  prompt: prompt,
  size: '2560x1440',
  watermark: false,
  response_format: 'b64_json'
});

const options = {
  hostname: 'ark.ap-southeast.bytepluses.com',
  path: '/api/v3/images/generations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + apiKey,
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    if (json.data?.[0]?.b64_json) {
      const imgBuffer = Buffer.from(json.data[0].b64_json, 'base64');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, imgBuffer);
      console.log('SAVED:' + outputPath);
    } else {
      console.error('ERROR:' + JSON.stringify(json));
    }
  });
});
req.on('error', e => console.error('ERROR:' + e.message));
req.write(payload);
req.end();
"
```

**Kalau Step 0 memberi `path`**, sisipkan foto sebagai reference image. Ganti blok
`const payload = JSON.stringify({...})` pada script di atas dengan:

```js
const refPath = '{REFERENCE_PATH}';   // dari Step 0; kosongkan kalau path null
const badan = {
  model: 'seedream-4-5-251128',
  prompt: prompt,
  size: '2560x1440',
  watermark: false,
  response_format: 'b64_json'
};
if (refPath) {
  const ext = require('path').extname(refPath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  badan.image = 'data:image/' + mime + ';base64,' + fs.readFileSync(refPath).toString('base64');
}
const payload = JSON.stringify(badan);
```

Sisa script (options, req handlers) tetap sama.

### Gemini (type: "gemini")

```bash
node -e "
const https = require('https');
const fs = require('fs');
const path = require('path');

const prompt = '{IMAGE_PROMPT}';
const { loadDotEnv, envKeys } = require('./.claude/skills/blog-autopilot/scripts/lib/env');
loadDotEnv('./.claude/skills/blog-autopilot/.env');
const blogId = '{BLOG_ID}';
const apiKey = process.env[envKeys(blogId).imageKey];
if (!apiKey) {
  console.error('ERROR:' + envKeys(blogId).imageKey + ' belum diset di .env');
  process.exit(1);
}
const outputPath = '{OUTPUT_PATH}';

const payload = JSON.stringify({
  instances: [{ prompt }],
  parameters: { sampleCount: 1, aspectRatio: '16:9' }
});

const options = {
  hostname: 'generativelanguage.googleapis.com',
  path: '/v1beta/models/imagen-3.0-generate-002:predict?key=' + apiKey,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    if (json.predictions?.[0]?.bytesBase64Encoded) {
      const imgBuffer = Buffer.from(json.predictions[0].bytesBase64Encoded, 'base64');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, imgBuffer);
      console.log('SAVED:' + outputPath);
    } else {
      console.error('ERROR:' + JSON.stringify(json));
    }
  });
});
req.on('error', e => console.error('ERROR:' + e.message));
req.write(payload);
req.end();
"
```

### DALL-E / OpenAI (type: "openai")

```bash
node -e "
const https = require('https');
const fs = require('fs');
const path = require('path');

const { loadDotEnv, envKeys } = require('./.claude/skills/blog-autopilot/scripts/lib/env');
loadDotEnv('./.claude/skills/blog-autopilot/.env');
const blogId = '{BLOG_ID}';
const apiKey = process.env[envKeys(blogId).imageKey];
if (!apiKey) {
  console.error('ERROR:' + envKeys(blogId).imageKey + ' belum diset di .env');
  process.exit(1);
}
const outputPath = '{OUTPUT_PATH}';

const payload = JSON.stringify({
  model: 'dall-e-3',
  prompt: '{IMAGE_PROMPT}',
  size: '1792x1024',
  quality: 'standard',
  n: 1
});

const options = {
  hostname: 'api.openai.com',
  path: '/v1/images/generations',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const imageUrl = json.data?.[0]?.url;
    if (!imageUrl) { console.error('ERROR:' + JSON.stringify(json)); return; }
    // Download image
    const protocol = require('https');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const file = fs.createWriteStream(outputPath);
    protocol.get(imageUrl, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); console.log('SAVED:' + outputPath); });
    });
  });
});
req.on('error', e => console.error('ERROR:' + e.message));
req.write(payload);
req.end();
"
```

### None (type: "none")

Skip image generation. Tell user:
> "Image generation dinonaktifkan. Tambahkan gambar manual di WordPress Admin → Media."

---

## Step 3: Save & Report

Output path: `{config.output.images_dir}/{article-slug}.png`

On success: `"✅ Gambar disimpan: {filepath}"`

On error: `"⚠️ Gagal generate gambar: {error}. Lanjutkan posting tanpa gambar."`
If API fails, continue the workflow — a missing image shouldn't block posting.
