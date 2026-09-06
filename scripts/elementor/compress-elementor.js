#!/usr/bin/env node
/**
 * Compress Elementor Data for WordPress Upload
 *
 * Converts elementor/{slug}.json → compress/{slug}.json
 *
 * Usage:
 *   node compress-elementor.js              # Compress all files
 *   node compress-elementor.js skipExisting # Compress only modified files
 *   node compress-elementor.js home.json    # Compress specific file
 */

const fs = require('fs');
const path = require('path');

const { resolveWorkspaceOffline } = require('./lib/workspace');
const { args: ARGV, dirs: DIRS, blogId: BLOG_ID } = resolveWorkspaceOffline();
const ELEMENTOR_DIR = DIRS.elementor;
const COMPRESS_DIR = DIRS.compress;

// Ensure directories exist
if (!fs.existsSync(ELEMENTOR_DIR)) {
  console.error(`Error: elementor/ directory not found at ${ELEMENTOR_DIR}`);
  process.exit(1);
}

if (!fs.existsSync(COMPRESS_DIR)) {
  console.log(`Creating compress/ directory at ${COMPRESS_DIR}`);
  fs.mkdirSync(COMPRESS_DIR, { recursive: true });
}

/**
 * Compress Elementor data file
 */
function compressPage(filename) {
  const elementorPath = path.join(ELEMENTOR_DIR, filename);
  const compressPath = path.join(COMPRESS_DIR, filename);

  // Check if elementor file exists
  if (!fs.existsSync(elementorPath)) {
    console.error(`Error: Elementor file not found: ${elementorPath}`);
    return false;
  }

  // Read and parse elementor data
  let elementorData;
  try {
    const elementorContent = fs.readFileSync(elementorPath, 'utf8');
    elementorData = JSON.parse(elementorContent);
  } catch (error) {
    console.error(`Error parsing ${filename}:`, error.message);
    console.log('Please validate JSON syntax before compressing.');
    return false;
  }

  // Validate basic structure
  if (!Array.isArray(elementorData)) {
    console.error(`Error: ${filename} should be an array of sections`);
    return false;
  }

  // Validate each section
  for (let i = 0; i < elementorData.length; i++) {
    const section = elementorData[i];
    if (!section.id || !section.elType) {
      console.error(`Error: Section ${i} in ${filename} missing required fields (id, elType)`);
      return false;
    }
  }

  // Compress to string
  const compressed = JSON.stringify(elementorData);

  // Write compressed data
  try {
    fs.writeFileSync(compressPath, compressed, 'utf8');
    console.log(`✓ Compressed: ${filename} → compress/${filename}`);
    return true;
  } catch (error) {
    console.error(`Error writing ${filename}:`, error.message);
    return false;
  }
}

/**
 * Check if file needs compression (source newer than target)
 */
function needsCompression(filename) {
  const elementorPath = path.join(ELEMENTOR_DIR, filename);
  const compressPath = path.join(COMPRESS_DIR, filename);

  if (!fs.existsSync(compressPath)) {
    return true;
  }

  const elementorStat = fs.statSync(elementorPath);
  const compressStat = fs.statSync(compressPath);

  return elementorStat.mtime > compressStat.mtime;
}

/**
 * Main execution
 */
function main() {
  const arg = ARGV[0];

  // Process specific file
  if (arg && arg.endsWith('.json')) {
    console.log(`Compressing single file: ${arg}`);
    const success = compressPage(arg);
    process.exit(success ? 0 : 1);
  }

  // Get all elementor files
  const elementorFiles = fs.readdirSync(ELEMENTOR_DIR).filter(f => f.endsWith('.json'));

  if (elementorFiles.length === 0) {
    console.log('No Elementor files found in elementor/ directory');
    console.log('Run extract-elementor.js first to create editable files');
    process.exit(0);
  }

  console.log(`Found ${elementorFiles.length} Elementor file(s)`);

  // Process all files
  let compressed = 0;
  let skipped = 0;
  let failed = 0;

  elementorFiles.forEach(filename => {
    // Skip existing if requested and not modified
    if (arg === 'skipExisting' && !needsCompression(filename)) {
      console.log(`- Skipped: ${filename} (not modified)`);
      skipped++;
      return;
    }

    const success = compressPage(filename);
    if (success) {
      compressed++;
    } else {
      failed++;
    }
  });

  console.log('\n=== Compression Summary ===');
  console.log(`Compressed: ${compressed}`);
  if (skipped > 0) console.log(`Skipped: ${skipped}`);
  if (failed > 0) console.log(`Failed: ${failed}`);
  console.log(`\nUpload-ready files in: ${COMPRESS_DIR}`);

  if (compressed > 0) {
    console.log('\nNext step: Upload to WordPress using MCP tools');
  }
}

main();
