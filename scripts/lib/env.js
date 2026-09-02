'use strict';
const fs = require('fs');

// Tipe image_api yang tidak memerlukan API key.
const NO_KEY_TYPES = new Set(['none', '']);

function loadDotEnv(filePath, env = process.env) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf-8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!key) continue;
    if (env[key] === undefined) env[key] = value; // shell menang atas berkas
  }
}

function envKeys(blogId) {
  const prefix = String(blogId).toUpperCase().replace(/-/g, '_');
  return {
    wpPassword: `${prefix}_WP_APP_PASSWORD`,
    imageKey: `${prefix}_IMAGE_API_KEY`
  };
}

function resolveCredentials(blogId, config, env = process.env) {
  const keys = envKeys(blogId);
  const cfg = JSON.parse(JSON.stringify(config || {}));

  const wpPassword = env[keys.wpPassword];
  if (!wpPassword) {
    throw new Error(
      `Kredensial WordPress untuk blog "${blogId}" belum diset. ` +
      `Tambahkan ${keys.wpPassword}=... ke berkas .env di root skill ` +
      `(lihat .env.example).`
    );
  }
  cfg.wordpress = { ...(cfg.wordpress || {}), app_password: wpPassword };

  const imageType = cfg.image_api?.type || 'none';
  const imageKey = env[keys.imageKey] || '';
  if (!imageKey && !NO_KEY_TYPES.has(imageType)) {
    throw new Error(
      `API key gambar untuk blog "${blogId}" belum diset (image_api.type = "${imageType}"). ` +
      `Tambahkan ${keys.imageKey}=... ke berkas .env, atau set image_api.type ke "none".`
    );
  }
  cfg.image_api = { ...(cfg.image_api || {}), api_key: imageKey };

  return cfg;
}

module.exports = { loadDotEnv, envKeys, resolveCredentials, NO_KEY_TYPES };
