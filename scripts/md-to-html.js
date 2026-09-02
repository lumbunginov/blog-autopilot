#!/usr/bin/env node
/**
 * md-to-html.js — Convert blog-autopilot markdown to WordPress-ready HTML
 * Usage: node md-to-html.js <path-to-markdown-file>
 * Output: <path>.converted.json
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
if (!inputFile || !fs.existsSync(inputFile)) {
  console.error('Usage: node md-to-html.js <markdown-file>');
  process.exit(1);
}

const raw = fs.readFileSync(inputFile, 'utf-8');

// ==================== PARSE FRONTMATTER ====================
function parseFrontmatter(text) {
  const meta = {
    title: '', meta_title: '', meta_description: '',
    slug: '', focus_keyword: '', category: '', image_alt_text: ''
  };
  let body = text;

  // Extract H1 title
  const h1 = text.match(/^# (.+)$/m);
  if (h1) {
    meta.title = h1[1].trim();
    body = body.replace(/^# .+\n?/m, '');
  }

  // Extract metadata lines (bold key: value format)
  const metaPatterns = {
    meta_title: /^\*\*Meta Title\*\*:\s*(.+)$/m,
    meta_description: /^\*\*Meta Description\*\*:\s*(.+)$/m,
    slug: /^\*\*URL\*\*:\s*\/(.+?)\/?$/m,
    focus_keyword: /^\*\*Keywords\*\*:\s*(.+)$/m,
    category: /^\*\*Category\*\*:\s*(.+)$/m,
    image_alt_text: /^\*\*Image Alt Text\*\*:\s*(.+)$/m,
  };

  for (const [key, regex] of Object.entries(metaPatterns)) {
    const match = body.match(regex);
    if (match) {
      if (key === 'focus_keyword') {
        // Take only first keyword
        meta[key] = match[1].split(',')[0].trim();
      } else if (key === 'slug') {
        meta[key] = match[1].replace(/\//g, '').trim();
      } else {
        meta[key] = match[1].trim();
      }
      body = body.replace(match[0] + '\n', '');
    }
  }

  // Auto-generate slug if missing
  if (!meta.slug && meta.title) {
    meta.slug = meta.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  // Remove separator lines and trailing metadata
  body = body
    .replace(/^---\s*$/gm, '')
    .replace(/^\*\*(Keywords|Category|Related|Image Alt Text)\*\*:.+$/gm, '')
    .trim();

  return { meta, body };
}

// ==================== CONVERT TO HTML ====================
const EMOJI_BULLET = /^[❌✅🎯💡⚠️🚀📊✨🔥📝🔑✔️➡️⚡🎉🏆💪📌🔧]/u;

function mdToHtml(text) {
  const lines = text.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) { i++; continue; }

    // H2
    if (/^## /.test(line)) {
      output.push(`<h2>${inline(line.replace(/^## /, '').trim())}</h2>`);
      i++; continue;
    }

    // H3
    if (/^### /.test(line)) {
      output.push(`<h3>${inline(line.replace(/^### /, '').trim())}</h3>`);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { i++; continue; }

    // Blockquote
    if (/^> /.test(line)) {
      output.push(`<blockquote class="wp-block-quote"><p>${inline(line.replace(/^> /, ''))}</p></blockquote>`);
      i++; continue;
    }

    // Unordered list (collect all consecutive items)
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*] /, '').trim());
        i++;
      }
      const emojiItems = items.filter(it => EMOJI_BULLET.test(it));
      const plainItems = items.filter(it => !EMOJI_BULLET.test(it));

      if (emojiItems.length > 0 && plainItems.length === 0) {
        // All emoji — render as <p> wrapped in left-align div
        output.push('<div style="text-align: left;">');
        items.forEach(it => output.push(`  <p>${inline(it)}</p>`));
        output.push('</div>');
      } else if (plainItems.length > 0 && emojiItems.length === 0) {
        // All plain — render as <ul>
        output.push('<div style="text-align: left;">');
        output.push('  <ul class="wp-block-list">');
        items.forEach(it => output.push(`    <li>${inline(it)}</li>`));
        output.push('  </ul>');
        output.push('</div>');
      } else {
        // Mixed — render each appropriately
        output.push('<div style="text-align: left;">');
        output.push('  <ul class="wp-block-list">');
        items.forEach(it => {
          if (EMOJI_BULLET.test(it)) {
            output.push(`    <li style="list-style: none; padding-left: 0;">${inline(it)}</li>`);
          } else {
            output.push(`    <li>${inline(it)}</li>`);
          }
        });
        output.push('  </ul>');
        output.push('</div>');
      }
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, '').trim());
        i++;
      }
      output.push('<div style="text-align: left;">');
      output.push('  <ol class="wp-block-list">');
      items.forEach(it => output.push(`    <li>${inline(it)}</li>`));
      output.push('  </ol>');
      output.push('</div>');
      continue;
    }

    // Table
    if (/^\|/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      output.push(parseTable(tableLines));
      continue;
    }

    // Emoji bullet as standalone line (not in list)
    if (EMOJI_BULLET.test(line.trim())) {
      output.push(`<p>${inline(line.trim())}</p>`);
      i++; continue;
    }

    // Regular paragraph
    output.push(`<p>${inline(line.trim())}</p>`);
    i++;
  }

  return output.join('\n');
}

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2">$1</a>');
}

function parseTable(lines) {
  const rows = lines.filter(l => !/^\|[-|:\s]+\|$/.test(l));
  if (rows.length < 1) return '';
  const parseRow = (line) =>
    line.split('|').slice(1, -1).map(c => inline(c.trim()));

  const [header, ...body] = rows;
  const heads = parseRow(header);

  let html = '<figure class="wp-block-table"><table><thead><tr>';
  heads.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';
  body.forEach(row => {
    html += '<tr>';
    parseRow(row).forEach(c => html += `<td>${c}</td>`);
    html += '</tr>';
  });
  html += '</tbody></table></figure>';
  return html;
}

// ==================== MAIN ====================
const { meta, body } = parseFrontmatter(raw);
const html = mdToHtml(body);

const result = {
  title: meta.title,
  html: html,
  slug: meta.slug,
  meta_title: meta.meta_title || meta.title,
  meta_description: meta.meta_description || '',
  focus_keyword: meta.focus_keyword || '',
  category: meta.category || '',
  image_alt_text: meta.image_alt_text || null
};

const outputFile = inputFile + '.converted.json';
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');

console.log('CONVERTED:' + outputFile);
console.log('TITLE:' + result.title);
console.log('SLUG:' + result.slug);
