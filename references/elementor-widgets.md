ELEMENTOR EDITOR REFERENCE
Status: Production | Purpose: Struktur data Elementor & rujukan alur lengkap

Skill ini berbicara ke WordPress lewat REST API bawaan memakai kredensial
blog-autopilot. Tidak ada MCP server. Untuk perintah sehari-hari lihat SKILL.md;
berkas ini merinci apa yang terjadi di balik tiap langkah.

=== ENDPOINT YANG DIPAKAI ===

Semua permintaan memakai Basic Auth dari application password
(`<ID>_WP_APP_PASSWORD` di `blog-autopilot/.env`).

Cari halaman by slug:
  GET  /wp-json/wp/v2/pages?slug={slug}&context=edit
  → array; ambil elemen pertama

Ambil halaman by id:
  GET  /wp-json/wp/v2/pages/{id}?context=edit

Daftar semua halaman (berhalaman, 100 per permintaan):
  GET  /wp-json/wp/v2/pages?per_page=100&page={n}&context=edit
  → jumlah halaman ada di header X-WP-TotalPages

Simpan data Elementor ke halaman yang sudah ada:
  POST /wp-json/wp/v2/pages/{id}
  body: {"meta":{"_elementor_data":"<string>","_elementor_edit_mode":"builder"}}

Buat halaman baru:
  POST /wp-json/wp/v2/pages
  body: {"title":"...","status":"draft","slug":"...",
         "meta":{"_elementor_data":"<string>",
                 "_elementor_edit_mode":"builder",
                 "_elementor_template_type":"wp-page"}}
  → HTTP 201, respons berisi id & slug final

`context=edit` WAJIB pada semua GET. Tanpa itu WordPress tidak mengirim
`meta._elementor_data` sama sekali, dan berkas `pages/` yang tersimpan akan
tampak sah tapi kosong isinya.

`status=any` sama wajibnya. Default REST hanya mengembalikan halaman berstatus
publish, sehingga draft — termasuk halaman yang baru saja dibuat
`create-page.js` — dilaporkan "tidak ditemukan" padahal ada.

`_elementor_template_type: "wp-page"` hanya dikirim saat MEMBUAT halaman. Pada
halaman yang sudah ada nilainya sudah benar, dan mengirim ulang tidak perlu.

`_elementor_edit_mode: "builder"` ikut dikirim saat upload karena halaman yang
belum pernah dibuka di editor Elementor akan mengabaikan `_elementor_data`
tanpa penanda itu.

=== BENTUK BERKAS ===

pages/{slug}.json — respons WordPress apa adanya:
```json
{
  "id": 123,
  "slug": "sewa-ht-malang",
  "title": {"rendered": "Sewa HT Malang"},
  "status": "publish",
  "meta": {
    "_elementor_data": "[{\"id\":\"sec1\",...}]",
    "_elementor_edit_mode": "builder",
    "_elementor_page_settings": {...}
  }
}
```

elementor/{slug}.json — array section, ini yang diedit:
```json
[
  {
    "id": "sec1",
    "elType": "section",
    "settings": {},
    "elements": [
      {"id": "col1", "elType": "column", "settings": {}, "elements": [
        {"id": "h1", "elType": "widget", "widgetType": "heading",
         "settings": {"title": "Sewa HT Malang"}}
      ]}
    ]
  }
]
```

compress/{slug}.json — array yang sama tanpa indentasi, satu baris. Isinya
tetap array JSON (bukan string berlapis); `upload-page.js` yang menjadikannya
string saat mengirim ke WordPress.

Keluaran clone-template.js — format halaman WordPress:
```json
{
  "content": [...],
  "page_settings": {...},
  "version": "0.4",
  "title": "Sewa HT Denpasar",
  "type": "page"
}
```

=== ALUR LENGKAP ===

ALUR 1 — Edit halaman yang sudah ada

1. `node download-page.js sewa-ht-malang`
   Mencari slug, menyimpan respons penuh ke `pages/sewa-ht-malang.json`.
   Peringatan `[tanpa data Elementor]` berarti halaman itu bukan buatan
   Elementor — berhenti, edit lewat WP admin.

2. `node extract-elementor.js sewa-ht-malang.json`
   Membaca `meta._elementor_data`, mem-parse, menulis terindentasi ke
   `elementor/sewa-ht-malang.json`.

3. Edit `elementor/sewa-ht-malang.json`.
   Ubah `settings.title`, `settings.editor`, URL gambar, dan sejenisnya.
   Jangan menyentuh `id` kecuali sedang meregenerasi seluruhnya.

4. `node validate-elementor.js sewa-ht-malang.json`
   Cek sintaks, field wajib (`id`, `elType`), `widgetType` pada widget, dan
   id duplikat. Jangan lanjut sebelum ini lolos.

5. `node compress-elementor.js sewa-ht-malang.json`
   Menulis versi satu baris ke `compress/`.

6. `node upload-page.js sewa-ht-malang`
   Membaca id dari `pages/`, POST ke WordPress, dan membandingkan data yang
   dikembalikan dengan yang dikirim.

7. Verifikasi: buka halaman, lalu buka editor Elementor-nya. Kalau tampilan
   belum berubah: Elementor → Tools → Regenerate CSS, lalu purge cache.

ALUR 2 — Halaman baru dari template

1. Pastikan sumbernya ada di `elementor/` (download + extract bila perlu).
2. ```bash
   node clone-template.js sewa-ht-malang.json sewa-ht-denpasar.json \
     "Sewa HT Denpasar" --replace "Malang:Denpasar"
   ```
   Script meregenerasi seluruh id, mengganti teks secara rekursif, menulis ke
   berkas sementara, memvalidasi, baru menaruhnya di tujuan.
3. ```bash
   node create-page.js sewa-ht-denpasar.json "Sewa HT Denpasar" \
     --slug sewa-ht-denpasar --status draft
   ```
   `create-page.js` menerima keluaran clone-template (objek dengan `content`)
   maupun array section apa adanya; `page_settings` sumber ikut terbawa.
   Bentuk lain ditolak SEBELUM permintaan dikirim, supaya tidak ada halaman
   setengah jadi yang terlanjur dibuat di WordPress.
4. Respons WordPress otomatis tersimpan ke `pages/{slug}.json`, jadi id-nya
   sudah tersedia untuk siklus edit berikutnya — tidak perlu download ulang.
5. Periksa di editor Elementor, baru naikkan statusnya ke publish.

ALUR 3 — Banyak halaman sekaligus

```bash
node download-page.js all
node extract-elementor.js all
# edit berkas di elementor/ (satu per satu, atau lewat script Node)
node validate-elementor.js          # memvalidasi semua
node compress-elementor.js all
node upload-page.js <slug>          # upload tetap satu per satu, disengaja
```

Upload sengaja tidak punya mode `all`: setiap POST mengubah halaman live, dan
kesalahan massal jauh lebih mahal daripada mengetik beberapa perintah. Alasan
yang sama berlaku untuk `create-page.js` — satu halaman per perintah.

ALUR 4 — Blog lain

Tambahkan `--blog <id>` di perintah mana pun. Tanpa itu semuanya bekerja pada
blog aktif blog-autopilot (`data/blogs/_active`).

=== ELEMENTOR DATA STRUCTURE ===

Top Level (Array of Sections):
```json
[
  {
    "id": "unique-id-1",
    "elType": "section",
    "settings": {...},
    "elements": [...]
  },
  {
    "id": "unique-id-2",
    "elType": "section",
    "settings": {...},
    "elements": [...]
  }
]
```

Section Object:
```json
{
  "id": "section-abc123",
  "elType": "section",
  "isInner": false,
  "settings": {
    "layout": "boxed",
    "gap": "default",
    "content_width": {"unit": "px", "size": 1140},
    "background_background": "classic",
    "background_color": "#FFFFFF"
  },
  "elements": [
    {
      "id": "column-def456",
      "elType": "column",
      ...
    }
  ]
}
```

Column Object:
```json
{
  "id": "column-def456",
  "elType": "column",
  "settings": {
    "_column_size": 50,
    "_inline_size": null
  },
  "elements": [
    {
      "id": "widget-ghi789",
      "elType": "widget",
      "widgetType": "heading",
      ...
    }
  ]
}
```

Widget Object (Heading):
```json
{
  "id": "widget-ghi789",
  "elType": "widget",
  "widgetType": "heading",
  "settings": {
    "title": "Your Heading Text Here",
    "header_size": "h2",
    "align": "center",
    "color": "#000000",
    "typography_typography": "custom",
    "typography_font_size": {"unit": "px", "size": 32}
  }
}
```

Widget Object (Text Editor):
```json
{
  "id": "widget-jkl012",
  "elType": "widget",
  "widgetType": "text-editor",
  "settings": {
    "editor": "<p>Your HTML content here</p>",
    "text_color": "#333333"
  }
}
```

Widget Object (Image):
```json
{
  "id": "widget-mno345",
  "elType": "widget",
  "widgetType": "image",
  "settings": {
    "image": {
      "url": "https://contoh-situs.com/wp-content/uploads/image.jpg",
      "id": 567
    },
    "image_size": "large",
    "align": "center",
    "link_to": "custom",
    "link": {"url": "https://contoh-situs.com/page/"}
  }
}
```

Widget Object (Button):
```json
{
  "id": "widget-pqr678",
  "elType": "widget",
  "widgetType": "button",
  "settings": {
    "text": "Click Here",
    "link": {"url": "https://contoh-situs.com/contact/"},
    "size": "md",
    "button_type": "success",
    "align": "center"
  }
}
```

=== COMMON WIDGET TYPES ===

Basic:
- heading
- text-editor
- image
- button
- divider
- spacer
- google_maps

Media:
- video
- icon
- image-box
- icon-box
- star-rating
- image-carousel
- image-gallery

Content:
- text-path
- accordion
- tabs
- toggle
- social-icons
- alert
- counter

Forms:
- form
- login
- (requires Elementor Pro)

Theme:
- post-title
- post-content
- post-featured-image
- archive-posts
- (requires Elementor Theme Builder)

=== EDITING EXAMPLES ===

Change Heading Text:
Find: "widgetType": "heading"
Edit: "title": "New heading text"
Save: elementor/{slug}.json

Update Image URL:
Find: "widgetType": "image"
Edit: "image": {"url": "new-url.jpg", "id": 789}
Save: elementor/{slug}.json

Modify Button Link:
Find: "widgetType": "button"
Edit: "link": {"url": "https://new-url.com"}
Save: elementor/{slug}.json

Change Section Background:
Find: "elType": "section"
Edit: "background_color": "#FF0000"
Save: elementor/{slug}.json

Update All Text Colors:
Find/Replace: "color": "#000000" → "color": "#333333"
Scope: All files in elementor/
Validate: Each file

Add Custom CSS Class:
Find: Widget or section object
Add: "_css_classes": "my-custom-class"
Save: elementor/{slug}.json

=== VALIDATION RULES ===

Required Fields (Element):
- id (string, unique)
- elType (string: section|column|widget)
- settings (object)

Required Fields (Widget):
- id (string, unique)
- elType (string: "widget")
- widgetType (string: valid widget name)
- settings (object)

Required Fields (Section):
- id (string, unique)
- elType (string: "section")
- settings (object)
- elements (array of columns)

Required Fields (Column):
- id (string, unique)
- elType (string: "column")
- settings (object)
- elements (array of widgets)

Validation Checklist:
- [ ] Valid JSON syntax
- [ ] All IDs unique within page
- [ ] Element types valid (section/column/widget)
- [ ] Widget types recognized by Elementor
- [ ] Nested structure correct (section → column → widget)
- [ ] Settings objects present (can be empty {})
- [ ] No circular references
- [ ] URLs properly formatted
- [ ] Image IDs match uploaded media

=== ERROR HANDLING ===

Error: "Page not found"
Cause: Invalid slug or page ID
Debug:
  1. List all pages: WordPress admin → Pages
  2. Verify slug spelling (case-sensitive)
  3. Try page ID instead of slug
  4. Check page not in trash
Fix:
  Use correct slug or page ID

Error: "JSON parse error in pages/{slug}.json"
Cause: Corrupted download or incomplete data
Debug:
  1. Re-download page
  2. Check file size > 0
  3. Validate JSON syntax
Fix:
  Delete and re-download page file

Error: "Invalid _elementor_data field"
Cause: Page not built with Elementor
Debug:
  1. Check page in WordPress
  2. Verify "Edit with Elementor" available
  3. Check meta._elementor_data exists
Fix:
  Only use with Elementor-built pages

Error: "JSON parse error in elementor/{slug}.json"
Cause: Invalid JSON syntax after edit
Debug:
  1. Use JSON validator (jsonlint.com)
  2. Check quote escaping
  3. Verify brackets balanced
  4. Look for trailing commas
Fix:
  Correct JSON syntax errors
  Revert to last working version

Error: "Update failed - invalid elementor_data"
Cause: Compressed format incorrect
Debug:
  1. Check compress/{slug}.json is stringified
  2. Verify quotes escaped properly
  3. Check file is single string, not object
Fix:
  Re-run compress step
  Ensure JSON.stringify() used

Error: "Widget not rendering after upload"
Cause: Invalid widget settings or type
Debug:
  1. Check widgetType is valid
  2. Verify required settings present
  3. Check widget available in Elementor version
Fix:
  Correct widget type
  Add missing required settings
  Use widgets available in your Elementor version

Error: "Section layout broken"
Cause: Invalid column structure
Debug:
  1. Verify columns array in section
  2. Check column sizes sum correctly
  3. Validate nested elements structure
Fix:
  Correct column configuration
  Ensure structure: section → columns → widgets

Error: "Changes not visible on page"
Cause: Cache not cleared or upload failed
Debug:
  1. Check upload returned true
  2. Clear WordPress cache (WP Rocket)
  3. Hard refresh browser (Ctrl+Shift+R)
  4. Check page in Elementor editor
Fix:
  Clear all caches
  Verify upload successful
  Check WordPress version compatibility

=== TROUBLESHOOTING COMMANDS ===

Verify Page Exists:
List all pages in WordPress admin
Check page status (publish/draft/trash)

Cek kredensial & koneksi:
bash: node download-page.js <slug-apa-saja>
Gagal di kredensial → pesan menyebut nama variabel .env yang kurang.

Validate JSON File:
bash: node -e "JSON.parse(fs.readFileSync('file.json'))"
Or: Use online JSON validator

Compare Versions:
bash: diff elementor/home.json backup/home.json
Shows: Changes between files

Test Compressed Format:
Read compress/{slug}.json
Verify: array JSON satu baris, tanpa indentasi
Should NOT be: objek terformat, atau string berlapis

Uji upload tanpa menyentuh halaman asli:
bash: node upload-page.js <slug> --page-id <id-halaman-staging>

Preview Page:
URL: <url-situs>/{slug}/?preview=true
Check: Changes visible
Open: Elementor editor to verify

=== ADVANCED TECHNIQUES ===

Template Library System:

Create: templates/header.json, templates/footer.json
Extract: Reusable sections from pages
Store: Common widgets, layouts
Reuse: Copy sections into new pages

Example structure:
```json
{
  "id": "template-header-1",
  "elType": "section",
  "settings": {...},
  "elements": [...]
}
```

Usage:
1. Copy section from templates/
2. Paste into elementor/{slug}.json
3. Update IDs to be unique
4. Modify content as needed

Global Widget Updates:

Scenario: Update phone number across all pages
Process:
1. Extract all pages to elementor/
2. Find/replace: "text": "old-phone" → "text": "new-phone"
3. Validate all files
4. Compress all
5. Upload each page

Script example:
```javascript
const fs = require('fs');
const glob = require('glob');

glob.sync('elementor/*.json').forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/"old-phone"/g, '"new-phone"');
  fs.writeFileSync(file, content);
  console.log(`Updated: ${file}`);
});
```

Version Control Integration:

Git setup:
```bash
cd ../../blog-autopilot/data/blogs/<blog-id>/elementor/elementor
git init
git add *.json
git commit -m "Initial page configurations"
```

Create branch for experiment:
```bash
git checkout -b redesign-home
# Edit home.json
git commit -am "Redesign home page layout"
```

Rollback changes:
```bash
git checkout main
git checkout main -- home.json
# Compress and upload to restore
```

Compare versions:
```bash
git diff main redesign-home -- home.json
```

Automated Backup:

Before major changes:
```bash
cp -r elementor/ backup/$(date +%Y%m%d)/
```

Scheduled backup script:
```bash
# backup-elementor.sh
DATE=$(date +%Y%m%d-%H%M%S)
cp -r elementor/ backup/$DATE/
echo "Backup created: backup/$DATE/"
```

=== PERFORMANCE TIPS ===

Large Pages (>500KB):

Issue: Slow upload/download
Solution:
- Split into multiple smaller pages
- Use Elementor global widgets
- Optimize images before adding to Elementor
- Remove unused widgets/sections

Many Pages (>50):

Issue: Slow batch processing
Solution:
- Process in smaller batches (10-20 at a time)
- Use parallel processing if possible
- Extract/compress only changed pages
- Keep backup of compressed/ folder

Frequent Updates:

Issue: Repetitive workflow
Solution:
- Use watch script to auto-compress on save
- Create aliases for common commands
- Use IDE with JSON validation
- Keep WordPress preview tab open

Network Issues:

Issue: Timeout during upload/download
Solution:
- Increase timeout in MCP tool call
- Retry failed operations
- Download/upload in smaller batches
- Check WordPress server status

=== SECURITY CONSIDERATIONS ===

Sensitive Data:

DO NOT commit to git:
- API keys in widget settings
- Email addresses
- Phone numbers
- Personal information

Solution:
- Use environment variables
- Replace with placeholders
- Create .gitignore rules

File Permissions:

Ensure proper permissions:
- pages/: Read-write
- elementor/: Read-write
- compress/: Read-write

Avoid:
- World-writable permissions
- Storing in publicly accessible directory

Backup Strategy:

Regular backups:
- Daily: Git commit of elementor/
- Weekly: Full backup of all three folders
- Before major changes: Manual backup

Restore procedure:
1. Locate backup
2. Copy to elementor/ folder
3. Compress
4. Upload to WordPress

=== QUALITY CHECKLIST ===

Before Upload:
- [ ] JSON validated (no syntax errors)
- [ ] All widget types recognized
- [ ] Image URLs accessible
- [ ] Links working (no 404s)
- [ ] Element IDs unique
- [ ] Structure valid (section → column → widget)
- [ ] Settings complete (no undefined)
- [ ] Compressed format correct
- [ ] Page ID matches original
- [ ] Backup created

After Upload:
- [ ] Upload returned true
- [ ] Preview page loads
- [ ] No console errors
- [ ] Elementor editor opens
- [ ] All widgets visible
- [ ] Responsive layout works
- [ ] Links functional
- [ ] Images loaded
- [ ] Animations working
- [ ] Cache cleared

Production Checklist:
- [ ] Test on staging first
- [ ] Review all changes
- [ ] Verify mobile responsive
- [ ] Check page speed
- [ ] Test all interactive elements
- [ ] Verify SEO metadata
- [ ] Check browser compatibility
- [ ] User acceptance testing

=== REFERENCES ===

Official Workflow:
https://github.com/aguaitech/Elementor_Project_Workflow

Elementor Documentation:
https://elementor.com/help/

WordPress REST API:
https://developer.wordpress.org/rest-api/

JSON Validator:
https://jsonlint.com/

Related Files:
- SKILL.md (perintah sehari-hari)
- TROUBLESHOOTING.md (gejala -> perbaikan)
- scripts/workflow.test.js (cek yang bisa dijalankan)

Kredensial & konfigurasi:
- blog-autopilot/data/blogs/<id>/config.json  (url, username, page_builder)
- blog-autopilot/.env                          (<ID>_WP_APP_PASSWORD)

Working Directory:
blog-autopilot/data/blogs/<blog-id>/elementor/

Status: Production
