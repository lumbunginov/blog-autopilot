#!/usr/bin/env node
/**
 * build.js — Package skill untuk distribusi (sikil.id)
 * Auto-increment versi dari ZIP terakhir di folder build/
 * Output: build/blog-autopilot-vX.X.X.zip (di dalam folder skill)
 *
 * Cara pakai: node build.js
 * Install deps dulu jika belum: npm install archiver --save-dev
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const SKILL_NAME = 'blog-autopilot';
const SKILL_DIR = __dirname;
const BUILD_DIR = path.join(SKILL_DIR, 'build');

// File/folder yang tidak masuk ZIP
const EXCLUDE = new Set([
  'build.js',
  // Keluaran build sendiri. Tanpa ini copyDir menyalin build/ ke dalam
  // build/_temp_.../build/ berulang sampai path Windows terlalu panjang.
  'build',
  'node_modules',
  'package.json',
  'package-lock.json',
  '.git',
  '.gitignore',
  // Rahasia dan data hidup — JANGAN PERNAH masuk zip yang dibagikan.
  '.env',
  'data',
  '.superpowers',
  '.playwright-mcp',
  // Catatan pengembangan internal — bukan bagian dari skill yang dibagikan.
  'docs',
]);
const EXCLUDE_PATTERNS = [
  /^\.env$/,                // .env asli; .env.example SENGAJA ikut (mendokumentasikan nama variabel)
  /^\.env\.(?!example$).*$/, // .env.simpan, .env.local, dst — tapi bukan .env.example
  /^.*-config\.json$/,      // *-config.json (runtime settings)
  /^articles-cache\.json$/,
  /^article-plans\.json$/,
  /^agent-queue\.json$/,
  /^.*\.upload\.json$/,
  // Test hanya berguna di repo pengembangan; di paket rilis ia cuma menambah
  // berat dan bikin pengguna menjalankan sesuatu yang bukan untuk mereka.
  /^.*\.test\.js$/,
];

function shouldExclude(name) {
  if (EXCLUDE.has(name)) return true;
  return EXCLUDE_PATTERNS.some(p => p.test(name));
}

// --- Deteksi versi ---
function getNextVersion() {
  if (!fs.existsSync(BUILD_DIR)) return '1.0.0';
  const files = fs.readdirSync(BUILD_DIR);
  const regex = new RegExp(`^${SKILL_NAME}-v(\\d+)\\.(\\d+)\\.(\\d+)\\.zip$`);
  let max = null;
  for (const f of files) {
    const m = f.match(regex);
    if (!m) continue;
    const [, major, minor, patch] = m.map(Number);
    if (!max || major > max[0] || (major === max[0] && minor > max[1]) || (major === max[0] && minor === max[1] && patch > max[2])) {
      max = [major, minor, patch];
    }
  }
  if (!max) return '1.0.0';
  return `${max[0]}.${max[1]}.${max[2] + 1}`;
}

// --- Obfuscate file JS ---
function obfuscateFile(filePath) {
  try {
    execSync(
      `npx javascript-obfuscator "${filePath}" --output "${filePath}" ` +
      `--compact true --string-array true --string-array-threshold 0.75 ` +
      `--rename-globals false --rename-properties false`,
      { stdio: 'pipe' }
    );
  } catch (e) {
    console.warn(`  ⚠️  Obfuscate gagal untuk ${path.basename(filePath)}: ${e.message}`);
  }
}

// --- Copy rekursif ---
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (shouldExclude(entry)) continue;
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// --- ZIP dengan struktur sikil.id ---
function createZip(tempDir, outputZip) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputZip);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    // .claude-plugin/plugin.json (wajib sikil.id)
    archive.append(JSON.stringify({ name: SKILL_NAME }, null, 2), {
      name: `${SKILL_NAME}/.claude-plugin/plugin.json`
    });

    // Semua file dari tempDir, dengan prefix nama skill
    archive.directory(tempDir, SKILL_NAME);
    archive.finalize();
  });
}

// --- Main ---
async function main() {
  const version = getNextVersion();
  const outFile = path.join(BUILD_DIR, `${SKILL_NAME}-v${version}.zip`);

  console.log(`\n📦 Build ${SKILL_NAME} v${version}`);
  console.log('─────────────────────────────────────');

  // 1. Buat folder build jika belum ada
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // 2. Copy file ke temp folder
  const tempDir = path.join(BUILD_DIR, `_temp_${SKILL_NAME}`);
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  console.log('📁 Menyalin file skill...');
  copyDir(SKILL_DIR, tempDir);

  // Pindahkan SKILL.md ke skills/SKILL_NAME/SKILL.md (struktur sikil.id)
  const skillMdSrc = path.join(tempDir, 'SKILL.md');
  const skillMdDir = path.join(tempDir, 'skills', SKILL_NAME);
  if (fs.existsSync(skillMdSrc)) {
    fs.mkdirSync(skillMdDir, { recursive: true });
    fs.renameSync(skillMdSrc, path.join(skillMdDir, 'SKILL.md'));
  }

  // 3. Obfuscate semua file .js
  console.log('🔒 Obfuscating JS files...');
  function obfuscateDir(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        obfuscateDir(fullPath);
      } else if (entry.endsWith('.js')) {
        process.stdout.write(`  → ${path.relative(tempDir, fullPath)}... `);
        obfuscateFile(fullPath);
        console.log('✓');
      }
    }
  }
  obfuscateDir(tempDir);

  // 4. Buat ZIP
  console.log('🗜️  Membuat ZIP...');
  await createZip(tempDir, outFile);

  // 5. Bersihkan temp
  fs.rmSync(tempDir, { recursive: true });

  const sizekb = Math.round(fs.statSync(outFile).size / 1024);
  console.log('─────────────────────────────────────');
  console.log(`✅ Build selesai!`);
  console.log(`📦 Output : build/${SKILL_NAME}-v${version}.zip (${sizekb} KB)`);
  console.log(`🚀 Siap upload ke sikil.id\n`);
}

main().catch(e => {
  console.error('❌ Build gagal:', e.message);
  process.exit(1);
});
