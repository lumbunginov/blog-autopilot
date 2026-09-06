#!/usr/bin/env node
/**
 * Extract Elementor Data from WordPress Page Files
 *
 * Converts pages/{slug}.json → elementor/{slug}.json
 *
 * Usage:
 *   node extract-elementor.js              # Extract all pages
 *   node extract-elementor.js skipExisting # Extract only new pages
 *   node extract-elementor.js home.json    # Extract specific page
 */

const fs = require('fs');
const path = require('path');

const { resolveWorkspaceOffline } = require('./lib/workspace');
const { args: ARGV, dirs: DIRS, blogId: BLOG_ID } = resolveWorkspaceOffline();
const PAGES_DIR = DIRS.pages;
const ELEMENTOR_DIR = DIRS.elementor;

// Ensure directories exist
if (!fs.existsSync(PAGES_DIR)) {
  console.error(`Error: pages/ directory not found at ${PAGES_DIR}`);
  process.exit(1);
}

if (!fs.existsSync(ELEMENTOR_DIR)) {
  console.log(`Creating elementor/ directory at ${ELEMENTOR_DIR}`);
  fs.mkdirSync(ELEMENTOR_DIR, { recursive: true });
}

/**
 * Extract Elementor data from a page file
 */
function extractPage(filename) {
  const pagePath = path.join(PAGES_DIR, filename);
  const elementorPath = path.join(ELEMENTOR_DIR, filename);

  // Check if page file exists
  if (!fs.existsSync(pagePath)) {
    console.error(`Error: Page file not found: ${pagePath}`);
    return false;
  }

  // Read and parse page data
  let pageData;
  try {
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    pageData = JSON.parse(pageContent);
  } catch (error) {
    console.error(`Error parsing ${filename}:`, error.message);
    return false;
  }

  // Extract _elementor_data
  if (!pageData.meta || !pageData.meta._elementor_data) {
    console.error(`Error: No _elementor_data found in ${filename}`);
    console.log('This page may not be built with Elementor.');
    return false;
  }

  // Parse Elementor data string
  let elementorData;
  try {
    elementorData = JSON.parse(pageData.meta._elementor_data);
  } catch (error) {
    console.error(`Error parsing Elementor data in ${filename}:`, error.message);
    return false;
  }

  // Write formatted Elementor data
  try {
    fs.writeFileSync(
      elementorPath,
      JSON.stringify(elementorData, null, 2),
      'utf8'
    );
    console.log(`✓ Extracted: ${filename} → elementor/${filename}`);
    return true;
  } catch (error) {
    console.error(`Error writing ${filename}:`, error.message);
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  const arg = ARGV[0];

  // Process specific file
  if (arg && arg.endsWith('.json')) {
    console.log(`Extracting single file: ${arg}`);
    const success = extractPage(arg);
    process.exit(success ? 0 : 1);
  }

  // Get all page files
  const pageFiles = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.json'));

  if (pageFiles.length === 0) {
    console.log('No page files found in pages/ directory');
    process.exit(0);
  }

  console.log(`Found ${pageFiles.length} page file(s) in pages/`);

  // Process all files
  let extracted = 0;
  let skipped = 0;
  let failed = 0;

  pageFiles.forEach(filename => {
    const elementorPath = path.join(ELEMENTOR_DIR, filename);

    // Skip existing if requested
    if (arg === 'skipExisting' && fs.existsSync(elementorPath)) {
      console.log(`- Skipped: ${filename} (already exists)`);
      skipped++;
      return;
    }

    const success = extractPage(filename);
    if (success) {
      extracted++;
    } else {
      failed++;
    }
  });

  console.log('\n=== Extraction Summary ===');
  console.log(`Extracted: ${extracted}`);
  if (skipped > 0) console.log(`Skipped: ${skipped}`);
  if (failed > 0) console.log(`Failed: ${failed}`);
  console.log(`\nEditable files in: ${ELEMENTOR_DIR}`);
}

main();
