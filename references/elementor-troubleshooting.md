ELEMENTOR EDITOR TROUBLESHOOTING
Last: 2026-01-09 | Purpose: Common issues & quick fixes

=== QUICK DIAGNOSTICS ===

Run these commands to diagnose issues:

Semua perintah dijalankan dari .claude/skills/blog-autopilot/scripts/elementor/

Cek kredensial & koneksi WordPress:
node download-page.js <slug-apa-saja>

Validasi semua berkas Elementor:
node validate-elementor.js

Jalankan cek otomatis skill:
node --test workflow.test.js

Lihat folder kerja blog aktif:
node -e "const{dirs}=require('./lib/workspace');const{makePaths}=require('../../blog-autopilot/scripts/lib/paths');console.log(dirs(makePaths('../../blog-autopilot').activeBlog()))"

=== CRITICAL: JSON SYNTAX ERRORS FROM MANUAL EDITING ===

⚠️ **This is the most common error when cloning templates**

Symptoms:
- "Unexpected token" error
- "Parse error" in JSON
- Trailing commas: `"size":"60,"` instead of `"size":"60"`
- Comma in wrong place: `"left":"0,"` instead of `"left":"0"`
- WordPress refuses to upload or displays broken layout

Root Cause:
Manually editing JSON files or using sed/awk for replacements breaks JSON structure.

Example of BROKEN JSON from manual editing:
```json
{
  "id": "section1",
  "settings": {
    "padding": {
      "unit": "px",
      "top": "0,",
      "right": "0,",
      "bottom": "0,",
      "left": "0,",      // ← WRONG: Trailing comma in number
      "isLinked": true,  // ← WRONG: Trailing comma
    }                   // ← WRONG: Extra comma
  },
}
```

Corresponding CORRECT JSON:
```json
{
  "id": "section1",
  "settings": {
    "padding": {
      "unit": "px",
      "top": "0",
      "right": "0",
      "bottom": "0",
      "left": "0",
      "isLinked": true
    }
  }
}
```

How to Fix:
1. **Don't manually edit JSON** - Use clone-template.js script:
   ```bash
   node .claude/skills/blog-autopilot/scripts/elementor/clone-template.js \
     source.json target.json "Page Title" \
     --replace "Malang:Denpasar"
   ```

2. **If file is already broken**:
   ```bash
   # Identify the error
   node .claude/skills/blog-autopilot/scripts/elementor/validate-elementor.js broken.json

   # Revert to original template
   git checkout elementor/broken.json

   # Re-clone using the script
   node .claude/skills/blog-autopilot/scripts/elementor/clone-template.js \
     template.json target.json "Title" --replace "old:new"
   ```

3. **If you must edit manually** (not recommended):
   - Use JSON.parse() and JSON.stringify() via Node.js
   - Validate after every edit
   - Never use sed/awk on JSON files

Prevention:
- ✅ ALWAYS use clone-template.js for template cloning
- ✅ ALWAYS validate JSON after any modification
- ✅ NEVER use sed/awk for complex JSON replacements
- ✅ NEVER manually reconstruct JSON structure

=== COMMON ERRORS ===

Error: Page not found
Symptom: "Page ID not found" or "Invalid slug"
Cause: Wrong slug, page doesn't exist, or in trash
Fix:
1. List pages in WordPress admin
2. Verify slug exact spelling (case-sensitive)
3. Coba pakai page id: node download-page.js 123
4. Check page not in trash

Error: No _elementor_data field
Symptom: "Invalid _elementor_data field" during extract
Cause: Page not built with Elementor
Fix:
1. Open page in WordPress
2. Check if "Edit with Elementor" button available
3. If not, page uses Gutenberg - cannot use this workflow
4. Convert to Elementor page first or skip

Error: JSON syntax error (from manual editing)
Symptom: "Unexpected token" or "Parse error"
Cause: Invalid JSON from manual reconstruction or sed/awk
Fix:
1. Use clone-template.js for template cloning
2. If already broken, revert to last working version
3. Validate to identify exact error: node validate-elementor.js file.json
4. See "CRITICAL: JSON SYNTAX ERRORS" section above

Error: Update failed
Symptom: Update returns false or error
Cause: Invalid compressed format or WordPress issue
Fix:
1. Re-run compress: node compress-elementor.js home.json
2. Verify compress file is single string (not object)
3. Check page ID correct in pages/ file
4. Verify JSON validated successfully before compress
5. Check WordPress permissions
6. Check WordPress error logs

Error: Widget not rendering
Symptom: Widget invisible or broken after upload
Cause: Invalid widget type, missing settings, or Pro widget
Fix:
1. Check widgetType is valid and available
2. Verify required settings present
3. Check if widget requires Elementor Pro
4. Validate structure: section → column → widget
5. Compare with working widget of same type
6. Ensure JSON was valid before upload

Error: Changes not visible
Symptom: Uploaded but page unchanged
Cause: Cache not cleared or upload failed
Fix:
1. Verify upload returned true
2. Clear WordPress cache: WP Rocket → Clear cache
3. Clear browser cache: Ctrl+Shift+R
4. Check CDN cache: BunnyCDN purge
5. Open Elementor editor to verify changes
6. Check page preview URL

Error: Duplicate element IDs
Symptom: "Duplicate IDs found" in validation
Cause: Copied elements without changing IDs
Fix:
1. Find duplicate IDs: node validate-elementor.js
2. Use clone-template.js which auto-generates unique IDs
3. Or manually change IDs to unique random strings
4. ID format: lowercase alphanumeric, 6-8 chars
5. Example: "abc123" → "xyz789"

Error: Section layout broken
Symptom: Columns misaligned or overlapping
Cause: Invalid column size or structure from bad JSON
Fix:
1. Check columns array exists in section
2. Verify _column_size adds to 100
3. Example: 2 columns = 50 + 50
4. Structure: section.elements[column].elements[widget]
5. Validate with script
6. If JSON is broken, revert and re-clone

Error: Script execution failed
Symptom: Node.js error when running clone-template.js
Cause: Missing dependencies or wrong directory
Fix:
1. Verify Node.js installed: node --version
2. Jalankan dari folder scripts/ skill ini
3. Pastikan blog aktif terdaftar (atau sebut --blog <id>)
4. Verify source file exists

=== WORKFLOW ISSUES ===

Issue: Lost original page data
Problem: Accidentally deleted pages/ file
Solution:
1. Download ulang dari WordPress:
   node download-page.js <slug>
2. Extract again to elementor/
3. Always backup pages/ folder before major changes

Issue: Can't find page ID
Problem: Have slug, need ID for operations
Solution:
1. node download-page.js <slug>, lalu baca field "id" di pages/{slug}.json
2. Atau langsung: pages/{slug}.json → field id
3. Or find in WordPress admin → Pages list

Issue: Edited wrong file
Problem: Modified pages/ instead of elementor/
Solution:
1. NEVER edit pages/ files directly
2. Re-download from WordPress to restore
3. Extract to elementor/
4. Edit elementor/ file
5. Compress and upload

Issue: Compressed file looks wrong
Problem: compress/ file is object not string
Solution:
Correct compress format:
"[{\"id\":\"abc\",\"elType\":\"section\"...}]"

NOT this:
{
  "elementor_data": "[...]"
}

Re-run: node compress-elementor.js

Issue: Batch operation failed mid-way
Problem: Some pages processed, others failed
Solution:
1. Check which failed (error messages)
2. Fix failed files individually
3. Use skipExisting to avoid re-processing
4. Process in smaller batches (5-10 at a time)

Issue: Template cloning creates broken JSON
Problem: New page has syntax errors
Cause: Used manual editing or sed instead of clone-template.js
Solution:
1. Delete broken file
2. Use clone-template.js script:
   ```bash
   node .claude/skills/blog-autopilot/scripts/elementor/clone-template.js \
     source.json target.json "Title" --replace "old:new"
   ```
3. Validate output before proceeding

=== VALIDATION ERRORS ===

Error: Missing required field 'id'
Fix: Add unique ID to element:
```json
{
  "id": "abc123",
  "elType": "widget",
  ...
}
```

Error: Invalid elType
Valid types: section, column, widget
Fix: Correct typo or use valid type

Error: Widget missing 'widgetType'
Fix: Add widgetType field:
```json
{
  "id": "widget1",
  "elType": "widget",
  "widgetType": "heading",
  "settings": {...}
}
```

Error: Missing 'settings' object
Fix: Add settings (can be empty):
```json
{
  "id": "widget1",
  "elType": "widget",
  "widgetType": "heading",
  "settings": {}
}
```

Error: Root should be array
Fix: Wrap in array:
```json
[
  {
    "id": "section1",
    ...
  }
]
```

Error: Unexpected token
Fix: JSON syntax error from manual editing
1. Identify error location with validate script
2. Revert to last working version
3. Use proper tools (clone-template.js, Node.js)
4. Never manually reconstruct JSON

=== PERFORMANCE ISSUES ===

Issue: Upload taking too long
Cause: Large page or slow connection
Fix:
1. Optimize page size (remove unused widgets)
2. Split into multiple smaller pages
3. Check internet connection
4. Increase timeout if possible
5. Upload during off-peak hours

Issue: Download timing out
Cause: Large page or server load
Fix:
1. Try multiple times
2. Download during off-peak hours
3. Check WordPress server status
4. Increase timeout in MCP call
5. Contact hosting if persistent

Issue: Validation very slow
Cause: Large file with many elements
Fix:
1. Validate specific file instead of all
2. Break page into smaller sections
3. Use faster machine if available
4. Consider page complexity optimization

=== FILE ISSUES ===

Issue: File permissions denied
Symptom: "EACCES" or "Permission denied"
Fix:
1. Check file permissions: ls -l
2. Ensure write access to directories
3. Run with appropriate permissions
4. Check antivirus not blocking

Issue: File not found
Symptom: "ENOENT" error
Fix:
1. Verify file exists: ls -la
2. Check file name spelling
3. Ensure .json extension
4. Use absolute path if needed

Issue: Character encoding problems
Symptom: Emoji or special chars broken
Fix:
1. Use UTF-8 encoding always
2. Check editor encoding settings
3. Verify JSON.stringify() used
4. Test special chars before upload

=== RECOVERY PROCEDURES ===

Recover from bad upload:
1. Don't panic - WordPress preserves revisions
2. Check WordPress Revisions (admin → edit page)
3. Restore previous version from WordPress
4. Re-download working version
5. Identify what went wrong before retry

Recover from deleted file:
1. Check git history (if using version control)
2. Restore from backup folder
3. Re-download from WordPress
4. Extract fresh copy

Recover from corrupted JSON (most common):
1. Run validation to identify errors
2. DO NOT try to manually fix JSON syntax
3. Revert to last commit (git) or backup
4. Re-extract from pages/ file
5. If cloning, use clone-template.js script
6. Validate output before proceeding

Emergency rollback:
1. Go to WordPress → Pages → Edit
2. Click "Revisions" metabox
3. Select working version
4. Click "Restore this revision"
5. Re-download to sync local files

=== PREVENTION TIPS ===

Before editing:
✓ Backup elementor/ folder
✓ Commit to git if using version control
✓ Validate JSON syntax
✓ Test on staging page first

During editing:
✓ Use clone-template.js for template cloning
✓ Validate frequently: node validate-elementor.js
✓ Save incremental backups
✓ Test small changes first
✓ Keep WordPress preview open

Before uploading:
✓ Final validation check (MANDATORY)
✓ Verify page ID correct
✓ Test compress format
✓ Create backup of current live version
✓ Plan rollback procedure

After uploading:
✓ Verify update successful
✓ Check preview immediately
✓ Clear all caches
✓ Test in Elementor editor
✓ Check mobile responsive

=== DEBUGGING TECHNIQUES ===

Inspect element structure:
node -e "console.log(JSON.stringify(require('./elementor/home.json')[0], null, 2))"

Find specific widget:
grep -r "widgetType.*heading" elementor/

Count elements:
node -e "console.log('Sections:', require('./elementor/home.json').length)"

Compare files:
diff elementor/home.json backup/home.json

Test compression:
node -e "console.log(JSON.stringify(require('./elementor/home.json')))" | wc -c

Validate single element:
node -e "const el = require('./elementor/home.json')[0]; console.log('ID:', el.id, 'Type:', el.elType)"

Validate before compress:
node .claude/skills/blog-autopilot/scripts/elementor/validate-elementor.js file.json

Safe template cloning:
node .claude/skills/blog-autopilot/scripts/elementor/clone-template.js \
  source.json target.json "Title" --replace "old:new"

=== GETTING HELP ===

Check documentation:
- SKILL.md (quick reference)
- REFERENCE.md (detailed API docs)
- elementor-editor.md (agent instructions)

Test environment:
1. Create test page in WordPress
2. Download and experiment
3. Test changes on test page
4. Apply to production when confident

Community resources:
- Elementor documentation: https://elementor.com/help/
- GitHub workflow: https://github.com/aguaitech/Elementor_Project_Workflow
- WordPress REST API: https://developer.wordpress.org/rest-api/

Report issues:
- Check if bug or user error
- Gather error messages
- Note steps to reproduce
- Check existing issues

=== STATUS INDICATORS ===

✓ Success - Operation completed
✗ Error - Operation failed
- Skipped - Operation skipped
⚠ Warning - Potential issue

Exit codes:
0 = Success
1 = Failure/Error

Log files:
Check WordPress debug.log for server errors
Check browser console for frontend errors

=== QUICK REFERENCE ===

Validate all files:
node .claude/skills/blog-autopilot/scripts/elementor/validate-elementor.js

Validate one file:
node .claude/skills/blog-autopilot/scripts/elementor/validate-elementor.js home.json

Clone template safely:
node .claude/skills/blog-autopilot/scripts/elementor/clone-template.js \
  source.json target.json "Page Title" --replace "old:new"

Extract all pages:
node .claude/skills/blog-autopilot/scripts/elementor/extract-elementor.js

Extract one page:
node .claude/skills/blog-autopilot/scripts/elementor/extract-elementor.js home.json

Compress all files:
node .claude/skills/blog-autopilot/scripts/elementor/compress-elementor.js

Compress one file:
node .claude/skills/blog-autopilot/scripts/elementor/compress-elementor.js home.json

Check MCP:
claude mcp list

Preview page:
https://contoh-situs.com/{slug}/?preview=true

Status: Production | Last: 2026-01-09
