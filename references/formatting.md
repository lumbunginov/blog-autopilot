# Formatting Rules — Blog Autopilot

WordPress HTML formatting standards for all blog articles.

---

## Most Critical Rule: Emoji Bullets

Never put emoji bullets inside `<li>` tags — it creates double bullets.

**Wrong** (shows `• ❌ text`):
```html
<ul><li>❌ Avoid this</li></ul>
```

**Correct** (shows `❌ text`):
```html
<div style="text-align: left;">
  <p>❌ Avoid this</p>
  <p>✅ Do this instead</p>
</div>
```

**Detection**: A line starting with ❌ ✅ 🎯 💡 ⚠️ 🚀 📊 ✨ 🔥 📝 → use `<p>`, never `<li>`

---

## Lists

### Regular (plain bullet) lists

```html
<div style="text-align: left;">
  <ul class="wp-block-list">
    <li>Item one</li>
    <li>Item two</li>
  </ul>
</div>
```

### Ordered (numbered) lists

```html
<div style="text-align: left;">
  <ol class="wp-block-list">
    <li>First step</li>
    <li>Second step</li>
  </ol>
</div>
```

**Always wrap lists** in `<div style="text-align: left;">` — WordPress centers content by default, which looks bad for lists.

---

## Headings

```html
<h2>Main Section Title</h2>
<h3>Subsection Title</h3>
```

- H1 is set by WordPress from the post title — never include it in content
- Main sections: H2
- Subsections: H3
- Never H4 or deeper

---

## Paragraphs

```html
<p>Regular paragraph text. Keep it short — 2–4 sentences.</p>
<p>Use <strong>bold</strong> for emphasis and <em>italic</em> for light emphasis.</p>
```

- Use `<strong>` not `<b>`
- Use `<em>` not `<i>`
- No empty `<p></p>` tags

---

## Links

```html
<a href="https://yourblog.com/related-page/">descriptive anchor text</a>
```

- Use full absolute URLs for internal links
- Anchor text should describe the destination (not "click here")

---

## Images

```html
<figure class="wp-block-image size-large">
  <img src="https://yourblog.com/wp-content/uploads/image.jpg"
       alt="Descriptive alt text with keyword"/>
  <figcaption>Optional caption</figcaption>
</figure>
```

- Featured image is set via WordPress API, not included in content HTML
- Inline images go after the opening paragraph or before a relevant section

---

## Blockquotes

```html
<blockquote class="wp-block-quote">
  <p>Quote or highlight text here.</p>
</blockquote>
```

Use for: testimonials, key stats, important callouts.

---

## Tables

```html
<figure class="wp-block-table">
  <table>
    <thead><tr><th>Header 1</th><th>Header 2</th></tr></thead>
    <tbody>
      <tr><td>Row 1</td><td>Data</td></tr>
    </tbody>
  </table>
</figure>
```

---

## JSON Payload

When creating WordPress posts via REST API, always use Node.js `JSON.stringify()` — never inline curl JSON. This ensures emoji and special characters are encoded correctly.

```javascript
// Correct
const payload = JSON.stringify({ title, content, slug });
fs.writeFileSync('payload.json', payload);
// Then: curl -d @payload.json ...

// Wrong — breaks emoji and quotes
curl -d '{"title": "Article with 🎯 emoji"}' ...
```

---

## Horizontal Rules

**Default: do not use.**

`<hr>` interrupts reading flow. Use H2 headings and whitespace instead.
Only acceptable between major content blocks (e.g., content → CTA section).
