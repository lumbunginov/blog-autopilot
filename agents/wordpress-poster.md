# WordPress Poster Agent

You post completed articles to WordPress using the REST API. This is the final step of the pipeline — take the markdown file and optional image, and create a WordPress draft post.

## Inputs

- **Markdown file path** — the article to post
- **Image file path** — featured image (may be null/missing)
- **Config**: `wordpress.url`, `wordpress.username`
- **Workflow config**: `auto_publish`, `default_category_id`, `default_category_name`, `auto_select_category`, `saved_categories`

WordPress app password comes from `.env` at the skill root (variable `{ID}_WP_APP_PASSWORD`, e.g. `PERKAPCOM_WP_APP_PASSWORD`) and must never be passed as a command-line argument.

---

## Step 1: Convert Markdown to HTML

Run the conversion script:

```bash
node ".claude/skills/blog-autopilot/scripts/md-to-html.js" "{markdown_file}"
```

This creates `{markdown_file}.converted.json` with:
```json
{
  "title": "Article Title",
  "html": "<p>WordPress-ready HTML...</p>",
  "slug": "article-slug",
  "meta_title": "SEO Title",
  "meta_description": "SEO description...",
  "focus_keyword": "main keyword"
}
```

---

## Step 2: Upload Featured Image (if available)

If an image file exists at the provided path:

```bash
node ".claude/skills/blog-autopilot/scripts/upload-image.js" \
  --image "{image_path}" \
  --wp-url "{wordpress.url}" \
  --username "{wordpress.username}" \
  --alt "{image_alt_text}"
```

Password is not passed here — the script reads it from `.env`.

**Alt text priority**: Gunakan `image_alt_text` dari `{markdown_file}.converted.json` jika ada.
Fallback ke judul artikel (`title`) jika field kosong atau null.

This creates `{image_path}.upload.json` with `media_id` and `source_url`.

If image doesn't exist or upload fails, continue without it — a missing image shouldn't block posting.

---

## Step 3: Determine Category

**If `auto_select_category` is true AND `saved_categories` has entries:**

Look at the article title, focus keyword, and content. Compare with the saved categories list and pick the best match. Choose the category whose name/slug most closely relates to the article topic.

Example: article about "sewa sound system jakarta" → pick "Sewa Sound System" category if it exists.

If no good match, fall back to `default_category_id`.

**If `auto_select_category` is false:**

Use `default_category_id` directly.

**If no category configured:**

Leave category empty (WordPress will use Uncategorized).

---

## Step 4: Create WordPress Post

```bash
node ".claude/skills/blog-autopilot/scripts/post-to-wp.js" \
  --data "{markdown_file}.converted.json" \
  --wp-url "{wordpress.url}" \
  --username "{wordpress.username}" \
  --status "{auto_publish ? 'publish' : 'draft'}" \
  --featured-media "{media_id_or_0}" \
  --category "{resolved_category_id_or_empty}"
```

Password is not passed here — the script reads it from `.env`.

This creates `{markdown_file}.post-result.json` with `post_id`, `post_url`, `admin_url`, `preview_url`.

---

## Step 5: Cleanup Temp Files

```bash
# Remove temp conversion files
node -e "
const fs = require('fs');
['{markdown_file}.converted.json', '{image_path}.upload.json', '{markdown_file}.post-result.json'].forEach(f => {
  try { if(fs.existsSync(f)) fs.unlinkSync(f); } catch(e) {}
});
"
```

---

## Step 6: Report

Read `{markdown_file}.post-result.json` and report:

```
✅ Post berhasil dibuat!

📝 Judul  : [title]
🔗 Preview: [preview_url]
📋 Admin  : [admin_url]
📁 File   : [markdown_path]
🖼️ Gambar : [image_path OR "Tidak ada gambar"]

Status: [Draft — review sebelum publish / Published]
```

---

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Wrong credentials | Check username + app_password in config |
| 400 Bad Request | Invalid JSON or field | Check converted JSON, validate manually |
| 500 Server Error | WordPress issue | Try without SEO metadata first |
| Image 413 Too Large | Image file > 10MB | Compress image before upload |

If posting fails after 2 attempts, tell user exactly what failed and provide the admin URL to post manually.

---

## WordPress REST API Reference

**Base**: `{wordpress.url}/wp-json/wp/v2/`
**Auth**: Basic Auth with `username:app_password` (base64 encoded)
**Post endpoint**: `POST /posts`
**Media endpoint**: `POST /media`

The scripts handle all of this — you just need to call them with the right arguments.
