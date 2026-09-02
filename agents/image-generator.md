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
- **Config**: `image_api.type`, `image_api.api_key`
- **Knowledge Base**: `business_name`, `business_description`

---

## Step 1: Craft the Image Prompt

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
const apiKey = '{API_KEY}';
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

### Gemini (type: "gemini")

```bash
node -e "
const https = require('https');
const fs = require('fs');
const path = require('path');

const prompt = '{IMAGE_PROMPT}';
const apiKey = '{API_KEY}';
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

const apiKey = '{API_KEY}';
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
