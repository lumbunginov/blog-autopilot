#!/usr/bin/env node
/**
 * Validate Elementor Data Files
 *
 * Checks JSON syntax and structure validity
 *
 * Usage:
 *   node validate-elementor.js              # Validate all files
 *   node validate-elementor.js home.json    # Validate specific file
 */

const fs = require('fs');
const path = require('path');

const { resolveWorkspaceOffline } = require('./lib/workspace');
const { args: ARGV, dirs: DIRS, blogId: BLOG_ID } = resolveWorkspaceOffline();
const ELEMENTOR_DIR = DIRS.elementor;

// Valid element types
const VALID_EL_TYPES = ['section', 'column', 'widget'];

// Common widget types (not exhaustive)
const COMMON_WIDGET_TYPES = [
  'heading', 'text-editor', 'image', 'button', 'divider', 'spacer',
  'google_maps', 'icon', 'image-box', 'icon-box', 'star-rating',
  'image-carousel', 'image-gallery', 'icon-list', 'counter',
  'progress', 'testimonial', 'tabs', 'accordion', 'toggle',
  'social-icons', 'alert', 'audio', 'video', 'shortcode', 'html'
];

/**
 * Validate element structure recursively
 */
function validateElement(element, path = 'root', errors = []) {
  // Check required fields
  if (!element.id) {
    errors.push(`${path}: Missing required field 'id'`);
  }

  if (!element.elType) {
    errors.push(`${path}: Missing required field 'elType'`);
  } else if (!VALID_EL_TYPES.includes(element.elType)) {
    errors.push(`${path}: Invalid elType '${element.elType}' (must be: ${VALID_EL_TYPES.join(', ')})`);
  }

  // Widget-specific validation
  if (element.elType === 'widget') {
    if (!element.widgetType) {
      errors.push(`${path}: Widget missing 'widgetType' field`);
    }
  }

  // Check for settings object
  if (!element.settings || typeof element.settings !== 'object') {
    errors.push(`${path}: Missing or invalid 'settings' object`);
  }

  // Validate nested elements
  if (element.elements && Array.isArray(element.elements)) {
    element.elements.forEach((child, index) => {
      validateElement(child, `${path}.elements[${index}]`, errors);
    });
  }

  return errors;
}

/**
 * Validate Elementor data file
 */
function validateFile(filename) {
  const filePath = path.join(ELEMENTOR_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.error(`✗ File not found: ${filename}`);
    return false;
  }

  // Parse JSON
  let data;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(content);
  } catch (error) {
    console.error(`✗ ${filename}: JSON syntax error`);
    console.error(`  ${error.message}`);
    return false;
  }

  // Check if data is array
  if (!Array.isArray(data)) {
    console.error(`✗ ${filename}: Root should be an array of sections`);
    return false;
  }

  // Validate structure
  const errors = [];
  data.forEach((section, index) => {
    validateElement(section, `section[${index}]`, errors);
  });

  if (errors.length > 0) {
    console.error(`✗ ${filename}: ${errors.length} validation error(s)`);
    errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }

  // Check for duplicate IDs
  const ids = new Set();
  const duplicates = [];

  function collectIds(element) {
    if (ids.has(element.id)) {
      duplicates.push(element.id);
    } else {
      ids.add(element.id);
    }

    if (element.elements) {
      element.elements.forEach(collectIds);
    }
  }

  data.forEach(collectIds);

  if (duplicates.length > 0) {
    console.error(`✗ ${filename}: Duplicate IDs found: ${duplicates.join(', ')}`);
    return false;
  }

  // Success
  console.log(`✓ ${filename}: Valid (${data.length} sections, ${ids.size} elements)`);
  return true;
}

/**
 * Main execution
 */
function main() {
  if (!fs.existsSync(ELEMENTOR_DIR)) {
    console.error(`Error: elementor/ directory not found at ${ELEMENTOR_DIR}`);
    process.exit(1);
  }

  const arg = ARGV[0];

  // Validate specific file
  if (arg && arg.endsWith('.json')) {
    const success = validateFile(arg);
    process.exit(success ? 0 : 1);
  }

  // Validate all files
  const files = fs.readdirSync(ELEMENTOR_DIR).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log('No Elementor files found in elementor/ directory');
    process.exit(0);
  }

  console.log(`Validating ${files.length} file(s)...\n`);

  let valid = 0;
  let invalid = 0;

  files.forEach(filename => {
    const success = validateFile(filename);
    if (success) {
      valid++;
    } else {
      invalid++;
    }
  });

  console.log(`\n=== Validation Summary ===`);
  console.log(`Valid: ${valid}`);
  console.log(`Invalid: ${invalid}`);

  process.exit(invalid > 0 ? 1 : 0);
}

main();
