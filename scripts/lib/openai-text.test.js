'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { askOpenAI } = require('./openai-text');
const { envKeys } = require('./env');

test('envKeys menyediakan nama kunci teks per tenant', () => {
  assert.equal(envKeys('perkapcom').textKey, 'PERKAPCOM_TEXT_API_KEY');
  assert.equal(envKeys('blog-baru').textKey, 'BLOG_BARU_TEXT_API_KEY');
});

test('kunci API kosong ditolak sebelum menyentuh jaringan', async () => {
  await assert.rejects(() => askOpenAI('', 'halo'), /kunci|key/i);
  await assert.rejects(() => askOpenAI(null, 'halo'), /kunci|key/i);
});

test('prompt kosong ditolak', async () => {
  await assert.rejects(() => askOpenAI('sk-palsu', '   '), /prompt/i);
});
