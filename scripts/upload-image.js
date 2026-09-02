#!/usr/bin/env node
/**
 * upload-image.js — Upload an image to WordPress media library
 * Usage: node upload-image.js --image <path> --wp-url <url> --username <user> [--blog <id>] --alt <text>
 * Password is read from .env (variable {ID}_WP_APP_PASSWORD), never from argv.
 * Output: <image-path>.upload.json with media_id and source_url
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const { loadDotEnv, envKeys } = require('./lib/env');

loadDotEnv(path.join(__dirname, '..', '.env'));

// Parse args
const args = {};
process.argv.slice(2).forEach((arg, i, arr) => {
  if (arg.startsWith('--')) args[arg.slice(2)] = arr[i + 1];
});

const { image, 'wp-url': wpUrl, username, alt = '' } = args;

const blogId = args.blog || 'perkapcom';
const password = process.env[envKeys(blogId).wpPassword];
if (!password) {
  console.error(`❌ ${envKeys(blogId).wpPassword} belum diset di .env`);
  process.exit(1);
}

if (!image || !wpUrl || !username) {
  console.error('Missing required arguments: --image --wp-url --username');
  process.exit(1);
}

if (!fs.existsSync(image)) {
  console.error('Image file not found: ' + image);
  process.exit(1);
}

const imageBuffer = fs.readFileSync(image);
const filename = path.basename(image);
const ext = path.extname(filename).toLowerCase();
const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const mimeType = mimeTypes[ext] || 'image/jpeg';

const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
const apiUrl = wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2/media';
const parsed = url.parse(apiUrl);
const isHttps = parsed.protocol === 'https:';

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const lib = isHttps ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function uploadImage() {
  const boundary = '----BlogAutopilotBoundary' + Date.now();

  // Build multipart/form-data body
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, imageBuffer, footer]);

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.path,
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  };

  const res = await makeRequest(options, body);

  if (res.status !== 201) {
    console.error('Upload failed with status ' + res.status);
    console.error(JSON.stringify(res.body));
    process.exit(1);
  }

  const media = res.body;
  const mediaId = media.id;

  // Set alt text if provided
  if (alt && mediaId) {
    const altPayload = Buffer.from(JSON.stringify({ alt_text: alt }));
    const altOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.path + '/' + mediaId,
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Content-Length': altPayload.length
      }
    };
    await makeRequest(altOptions, altPayload);
  }

  const result = {
    media_id: mediaId,
    source_url: media.source_url || media.guid?.rendered || '',
    slug: media.slug || ''
  };

  const outputFile = image + '.upload.json';
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');

  console.log('UPLOADED:' + outputFile);
  console.log('MEDIA_ID:' + mediaId);
  console.log('URL:' + result.source_url);
}

uploadImage().catch(e => {
  console.error('ERROR:' + e.message);
  process.exit(1);
});
