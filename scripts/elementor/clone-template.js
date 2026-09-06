#!/usr/bin/env node
/**
 * Clone Elementor Template from Source to Target
 *
 * Creates a new WordPress page file from a template by:
 * 1. Reading source template file (Elementor array OR WordPress page format)
 * 2. Performing safe text replacements (location, keywords, etc.)
 * 3. Generating unique IDs for all elements
 * 4. Writing new file in WordPress page format WITH wrapper
 *
 * CRITICAL: This script preserves JSON structure integrity by:
 * - Never manually reconstructing JSON
 * - Using JSON.parse() and JSON.stringify() for all operations
 * - Validating output before writing
 * - Always outputting WordPress page format (content + metadata)
 *
 * INPUT FORMATS SUPPORTED:
 * 1. Elementor array: [{"id":"...", ...}, ...]
 * 2. WordPress page: {"content":[...], "page_settings":{...}, "version":"0.4", ...}
 *
 * OUTPUT FORMAT (always):
 *   {
 *     "content": [...],           // Elementor sections
 *     "page_settings": {...},     // Preserved from source
 *     "version": "0.4",           // Preserved from source
 *     "title": "page-title",      // From argument
 *     "type": "page"              // Always "page"
 *   }
 *
 * Usage:
 *   node clone-template.js source.json target.json "Page Title"
 *   node clone-template.js source.json target.json "Page Title" --replace "Malang:Denpasar"
 *
 * Examples:
 *   node clone-template.js page-malang.json page-denpasar.json "Sewa HT Denpasar"
 *   node clone-template.js template.json new-page.json "New Page Title" --replace "Malang:Denpasar" --replace "sewa HT:rental HT"
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { resolveWorkspaceOffline } = require('./lib/workspace');
const { args: ARGV, dirs: DIRS, blogId: BLOG_ID } = resolveWorkspaceOffline();
const ELEMENTOR_DIR = DIRS.elementor;

// Parse arguments
const args = ARGV;

if (args.length < 3) {
  console.error('Usage: node clone-template.js <source.json> <target.json> "<Page Title>" [--replace "old:new"]');
  console.error('');
  console.error('Examples:');
  console.error('  node clone-template.js page-malang.json page-denpasar.json "Sewa HT Denpasar"');
  console.error('  node clone-template.js template.json new.json "Title" --replace "Malang:Denpasar"');
  process.exit(1);
}

const sourceFile = args[0];
const targetFile = args[1];
const pageTitle = args[2];

// Parse replacement pairs
const replacements = [];
for (let i = 3; i < args.length; i++) {
  if (args[i] === '--replace' && i + 1 < args.length) {
    const pair = args[i + 1];
    const [oldText, newText] = pair.split(':');
    if (oldText && newText) {
      replacements.push({ old: oldText, new: newText });
    }
    i++; // Skip next arg
  }
}

/**
 * Generate random element ID
 */
function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Recursively update all element IDs in the structure
 */
function updateIds(element) {
  // Create new object to avoid mutation
  const updated = { ...element };
  updated.id = generateId();

  // Recursively update nested elements
  if (updated.elements && Array.isArray(updated.elements)) {
    updated.elements = updated.elements.map(child => updateIds(child));
  }

  return updated;
}

/**
 * Replace text in element settings
 */
function replaceText(obj, replacements) {
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string' && replacements.length > 0) {
      let text = obj;
      replacements.forEach(({ old, new: newText }) => {
        text = text.split(old).join(newText); // Case-sensitive replace
      });
      return text;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => replaceText(item, replacements));
  }

  const result = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      result[key] = replaceText(obj[key], replacements);
    }
  }

  return result;
}

/**
 * Extract Elementor content from source data
 * Handles both Elementor array and WordPress page formats
 */
function extractElementorContent(sourceData) {
  // Check if it's WordPress page format
  if (sourceData && typeof sourceData === 'object' && !Array.isArray(sourceData)) {
    if (sourceData.content && Array.isArray(sourceData.content)) {
      return {
        content: sourceData.content,
        metadata: {
          page_settings: sourceData.page_settings || { hide_title: 'yes' },
          version: sourceData.version || '0.4'
        }
      };
    }
  }

  // Check if it's Elementor array format
  if (Array.isArray(sourceData)) {
    return {
      content: sourceData,
      metadata: {
        page_settings: { hide_title: 'yes' },
        version: '0.4'
      }
    };
  }

  return null;
}

/**
 * Main cloning process
 */
function main() {
  const sourcePath = path.join(ELEMENTOR_DIR, sourceFile);
  const targetPath = path.join(ELEMENTOR_DIR, targetFile);

  console.log(`Cloning template:`);
  console.log(`  Source: ${sourceFile}`);
  console.log(`  Target: ${targetFile}`);
  console.log(`  Title:  ${pageTitle}`);
  if (replacements.length > 0) {
    console.log(`  Replacements:`);
    replacements.forEach(({ old, new: newText }) => {
      console.log(`    "${old}" → "${newText}"`);
    });
  }
  console.log('');

  // Check source file exists
  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source file not found: ${sourceFile}`);
    console.error(`Expected location: ${sourcePath}`);
    process.exit(1);
  }

  // Read and parse source file
  let sourceData;
  try {
    const sourceContent = fs.readFileSync(sourcePath, 'utf8');
    sourceData = JSON.parse(sourceContent);
  } catch (error) {
    console.error(`Error reading source file: ${error.message}`);
    process.exit(1);
  }

  // Extract Elementor content and metadata
  const extracted = extractElementorContent(sourceData);
  if (!extracted) {
    console.error(`Error: Source file must be Elementor array or WordPress page format`);
    process.exit(1);
  }

  const { content: elementorContent, metadata } = extracted;
  console.log(`✓ Detected format: ${metadata.page_settings ? 'WordPress page' : 'Elementor array'}`);

  // Clone and update IDs
  console.log('Updating element IDs...');
  const clonedData = elementorContent.map(section => updateIds({ ...section }));

  // Apply text replacements
  if (replacements.length > 0) {
    console.log('Applying text replacements...');
    const replacedData = replaceText(clonedData, replacements);

    // Create WordPress page format output
    const output = {
      content: replacedData,
      page_settings: metadata.page_settings,
      version: metadata.version,
      title: pageTitle,
      type: 'page'
    };

    // Write to temporary file for validation
    const tempFile = targetPath + '.tmp';
    try {
      fs.writeFileSync(tempFile, JSON.stringify(output, null, 2), 'utf8');
      console.log(`✓ Created temporary file: ${tempFile}`);

      // Validate the temporary file
      console.log('Validating JSON structure...');
      const tempContent = fs.readFileSync(tempFile, 'utf8');
      JSON.parse(tempContent); // Will throw if invalid

      // If validation passes, move to final location
      fs.renameSync(tempFile, targetPath);
      console.log(`✓ Template cloned successfully: ${targetFile}`);
      console.log('');
      console.log('Next steps:');
      console.log(`1. Review: ${targetPath}`);
      console.log(`2. The file is ready in WordPress page format`);
      console.log(`3. Upload to WordPress or copy to Content/Page/ folder`);

    } catch (error) {
      console.error(`Error: Validation failed - ${error.message}`);
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      process.exit(1);
    }
  } else {
    // No replacements, just write with updated IDs in WordPress format
    const output = {
      content: clonedData,
      page_settings: metadata.page_settings,
      version: metadata.version,
      title: pageTitle,
      type: 'page'
    };

    try {
      fs.writeFileSync(targetPath, JSON.stringify(output, null, 2), 'utf8');
      console.log(`✓ Template cloned successfully: ${targetFile}`);
      console.log('');
      console.log('Next steps:');
      console.log(`1. Review: ${targetPath}`);
      console.log(`2. The file is ready in WordPress page format`);
      console.log(`3. Upload to WordPress or copy to Content/Page/ folder`);
    } catch (error) {
      console.error(`Error writing target file: ${error.message}`);
      process.exit(1);
    }
  }
}

main();
