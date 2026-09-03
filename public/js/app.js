let config = {};
let hasChanges = false;
let currentWizardStep = 1;
let savedCategories = [];

// ==================== PAGE NAVIGATION ====================
function showPage(pageId, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  if (navEl) navEl.classList.add('active');
  if (pageId !== 'articles' && articlesPollTimer) {
    clearInterval(articlesPollTimer);
    articlesPollTimer = null;
  }
  if (pageId === 'articles' && articlesAll.length === 0) articlesLoad();
  if (pageId === 'planning') { planFillCategorySelect(null); plansLoad(); agentStatusBarRefresh(); }
}

// ==================== CONFIG LOAD/SAVE ====================
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    config = await res.json();
    populateForm(config);
    updateStatusDot(config);
    setChangeStatus(false);
    // Show wizard on first load if WordPress URL is empty
    if (!config.wordpress?.url) {
      openWizard();
    }
  } catch (e) {
    toast('Failed to load config: ' + e.message, 'error');
  }
}

function onSeoPluginTypeChange(type) {
  document.getElementById('seo-rankmath-config').style.display = type === 'rankmath' ? '' : 'none';
  document.getElementById('seo-yoast-config').style.display   = type === 'yoast'    ? '' : 'none';
  setChangeStatus(true);
}

function updateTitleSuffixPreview() {
  const suffix = document.getElementById('seo-rm-title-suffix').value || '';
  const preview = document.getElementById('seo-title-preview');
  if (preview) preview.textContent = ('e.g. Best Coffee Shops London: Top 7 Picks ' + suffix).trim();
}

function updateWpPasswordIndicator(isSet) {
  const el = document.getElementById('wp-password');
  if (!el) return;
  el.value = isSet ? '(set in .env)' : '';
  el.placeholder = isSet ? '' : 'Not set — add PREFIX_WP_APP_PASSWORD to .env';
}

function populateForm(c) {
  // WordPress
  setVal('wp-url', c.wordpress?.url);
  setVal('wp-username', c.wordpress?.username);
  updateWpPasswordIndicator(!!c._credentials?.wpPasswordSet);
  // Image
  const imgType = c.image_api?.type || 'gemini';
  selectImageType(imgType);
  setVal('img-key', c.image_api?.api_key);
  // Output
  setVal('out-articles', c.output?.articles_dir || './articles');
  setVal('out-images', c.output?.images_dir || './images');
  // Workflow
  setVal('wf-language', c.workflow?.language || 'id');
  setVal('wf-length', c.workflow?.content_length || 1000);
  document.getElementById('wf-autopublish').checked = c.workflow?.auto_publish || false;
  document.getElementById('wf-autocat').checked = c.workflow?.auto_select_category || false;
  // Categories
  savedCategories = c.workflow?.saved_categories || [];
  rebuildCategoryDropdown(savedCategories, c.workflow?.default_category_id);
  updateCatStatus();
  // Knowledge base
  setVal('kb-name', c.knowledge_base?.business_name);
  setVal('kb-desc', c.knowledge_base?.business_description);
  setVal('kb-audience', c.knowledge_base?.target_audience);
  selectTone(c.knowledge_base?.tone || 'professional');
  renderProhibited(c.knowledge_base?.prohibited_topics || []);
  renderProducts(c.knowledge_base?.products || []);
  renderLinks(c.knowledge_base?.internal_links || []);
  renderCustomEntries(c.knowledge_base?.custom_entries || []);
  isiProfilLengkap(c.knowledge_base || {});
  populateKnowledgeSource(c);
  // SEO Plugin
  const sp = c.seo_plugin || {};
  const seoType = sp.type || 'rankmath';
  setVal('seo-plugin-type', seoType);
  onSeoPluginTypeChange(seoType);
  const rm = sp.rankmath || {};
  setVal('seo-rm-title-suffix',  rm.title_suffix  || '');
  setVal('seo-rm-robots-meta',   rm.robots_meta   || 'index,follow');
  setVal('seo-rm-content-type',  rm.content_type  || 'article');
  updateTitleSuffixPreview();
}

function collectForm() {
  const products = [];
  document.querySelectorAll('.product-row').forEach(row => {
    const name = row.querySelector('.product-input')?.value?.trim();
    const url  = row.querySelector('.product-url')?.value?.trim() || '';
    if (name) products.push({ name, url });
  });

  const links = [];
  document.querySelectorAll('.link-row').forEach(row => {
    const url = row.querySelector('.link-url')?.value?.trim();
    const anchor = row.querySelector('.link-anchor')?.value?.trim();
    if (url || anchor) links.push({ url: url || '', anchor: anchor || '' });
  });

  const prohibited = [];
  document.querySelectorAll('#prohibited-tags .tag').forEach(t => {
    prohibited.push(t.dataset.value);
  });

  const selectedTone = document.querySelector('#tone-group .radio-btn.selected input')?.value || 'professional';
  const selectedImgType = document.querySelector('#img-type-group .img-option.selected input')?.value || 'none';

  // Selected category
  const catSelect = document.getElementById('wf-category-select');
  const selectedCatId = catSelect.value ? parseInt(catSelect.value) : null;
  const selectedCatName = catSelect.options[catSelect.selectedIndex]?.text || '';

  return {
    wordpress: {
      url: getVal('wp-url'),
      username: getVal('wp-username')
      // app_password is never sent from the browser — it lives only in .env.
    },
    image_api: {
      type: selectedImgType,
      api_key: getVal('img-key')
    },
    output: {
      articles_dir: getVal('out-articles') || './articles',
      images_dir: getVal('out-images') || './images'
    },
    workflow: {
      language: getVal('wf-language'),
      auto_publish: document.getElementById('wf-autopublish').checked,
      content_length: parseInt(getVal('wf-length')) || 1000,
      default_category_id: selectedCatId,
      default_category_name: selectedCatName !== '— Uncategorized —' ? selectedCatName : '',
      auto_select_category: document.getElementById('wf-autocat').checked,
      saved_categories: savedCategories
    },
    knowledge_base: {
      business_name: getVal('kb-name'),
      business_description: getVal('kb-desc'),
      products: products,
      target_audience: getVal('kb-audience'),
      tone: selectedTone,
      prohibited_topics: prohibited,
      internal_links: links,
      custom_entries: collectCustomEntries(),
      ...kumpulkanProfilLengkap()
    },
    knowledge_source: collectKnowledgeSource(),
    seo_plugin: {
      type: getVal('seo-plugin-type') || 'rankmath',
      rankmath: {
        title_suffix:  getVal('seo-rm-title-suffix')  || '| Bisnis Saya',
        robots_meta:   getVal('seo-rm-robots-meta')   || 'index,follow',
        content_type:  getVal('seo-rm-content-type')  || 'article'
      },
      yoast: {
        title_separator: '|'
      }
    }
  };
}

async function saveConfig() {
  const data = collectForm();
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data, null, 2)
    });
    const result = await res.json();
    if (result.success) {
      // Muat ulang dari server, bukan memakai `data` mentah: di mode
      // business_asset knowledge_base yang dikirim memang dibuang server,
      // jadi kalau dipakai apa adanya layar menampilkan data yang tidak tersimpan.
      await loadConfig();
      updateStatusDot(config);
      setChangeStatus(false);
      toast(result.warning || '✅ Settings saved!', result.warning ? 'warning' : 'success');
    } else {
      toast('Save failed: ' + result.error, 'error');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ==================== HELPERS ====================
function getVal(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}

function togglePwd(id, btn) {
  const el = document.getElementById(id);
  if (el.type === 'password') { el.type = 'text'; btn.textContent = 'Hide'; }
  else { el.type = 'password'; btn.textContent = 'Show'; }
}

function setChangeStatus(changed) {
  hasChanges = changed;
  const msg = changed ? '⚠️ Unsaved changes' : 'No unsaved changes';
  const el1 = document.getElementById('save-status');
  const el2 = document.getElementById('save-status-kb');
  if (el1) el1.textContent = msg;
  if (el2) el2.textContent = msg;
}

function updateStatusDot(c) {
  const dot = document.getElementById('config-status-dot');
  const text = document.getElementById('config-status-text');
  const hasWP = c.wordpress?.url && c.wordpress?.username && c._credentials?.wpPasswordSet;
  const hasKB = c.knowledge_base?.business_name && !c._knowledge?.error;
  if (hasWP && hasKB) {
    dot.className = 'dot ok';
    text.textContent = 'Config OK';
  } else if (hasWP || hasKB) {
    dot.className = 'dot warn';
    text.textContent = 'Incomplete';
  } else {
    dot.className = 'dot err';
    text.textContent = 'Not configured';
  }
}

// ==================== RADIO BUTTONS ====================
function selectImageType(val, el) {
  document.querySelectorAll('#img-type-group .img-option').forEach(b => b.classList.remove('selected'));
  if (el) {
    el.classList.add('selected');
  } else {
    const found = document.querySelector(`#img-type-group .img-option input[value="${val}"]`)?.closest('.img-option');
    if (found) found.classList.add('selected');
  }
  const keyGroup = document.getElementById('img-key-group');
  if (keyGroup) keyGroup.style.display = (val === 'none') ? 'none' : 'block';
  // Update hint
  const hint = document.getElementById('img-key-hint');
  if (hint) {
    if (val === 'seedream') hint.textContent = '📍 Get key: console.byteplus.com → Ark → API Keys (cheapest per image)';
    else if (val === 'gemini') hint.textContent = '📍 Get free key: aistudio.google.com → Get API Key';
    else if (val === 'openai') hint.textContent = '📍 Get key: platform.openai.com → API Keys (billing required)';
    else hint.textContent = '';
  }
}

function wzSelectImageType(val, el) {
  document.querySelectorAll('#wz-img-type-group .img-option').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  const keyGroup = document.getElementById('wz-img-key-group');
  if (keyGroup) keyGroup.style.display = (val === 'none') ? 'none' : 'block';
  const hint = document.getElementById('wz-img-key-hint');
  if (hint) {
    if (val === 'seedream') hint.textContent = '📍 Get key: console.byteplus.com → Ark → API Keys (cheapest per image)';
    else if (val === 'gemini') hint.textContent = '📍 Get free key: aistudio.google.com → Get API Key';
    else if (val === 'openai') hint.textContent = '📍 Get key: platform.openai.com → API Keys (billing required)';
    else hint.textContent = '';
  }
}

function selectTone(val, el) {
  document.querySelectorAll('#tone-group .radio-btn').forEach(b => b.classList.remove('selected'));
  if (el) {
    el.classList.add('selected');
  } else {
    const found = document.querySelector(`#tone-group .radio-btn input[value="${val}"]`)?.parentElement;
    if (found) found.classList.add('selected');
  }
}

// ==================== CATEGORIES ====================
function rebuildCategoryDropdown(cats, selectedId) {
  const sel = document.getElementById('wf-category-select');
  sel.innerHTML = '<option value="">— Uncategorized —</option>';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.count} posts)`;
    if (selectedId && c.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function updateCatStatus() {
  const el = document.getElementById('cat-status');
  if (!el) return;
  if (savedCategories.length > 0) {
    el.textContent = `✅ ${savedCategories.length} categories loaded`;
    el.style.color = 'var(--success)';
  } else {
    el.textContent = 'No categories loaded — click "Fetch from WordPress" to import';
    el.style.color = 'var(--text-secondary)';
  }
}

async function fetchCategories() {
  const btn = document.getElementById('fetch-cat-btn');
  const status = document.getElementById('cat-status');

  // Validate WP credentials first
  const wpUrl = getVal('wp-url');
  const wpUser = getVal('wp-username');
  if (!wpUrl || !wpUser) {
    toast('Fill in WordPress URL and username first', 'warning');
    return;
  }
  if (!config._credentials?.wpPasswordSet) {
    toast('WordPress password not set — add PREFIX_WP_APP_PASSWORD to .env first', 'warning');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Fetching...';
  status.textContent = 'Saving credentials...';
  status.style.color = 'var(--text-secondary)';

  // Auto-save config first so server reads the current form values
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectForm(), null, 2)
    });
  } catch (e) { /* non-fatal, try fetch anyway */ }

  status.textContent = 'Connecting to WordPress...';

  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.error) {
      toast('Failed: ' + data.error, 'error');
      status.textContent = 'Failed to fetch — check WordPress credentials';
      status.style.color = 'var(--danger)';
    } else {
      savedCategories = data;
      const currentId = config.workflow?.default_category_id || null;
      rebuildCategoryDropdown(savedCategories, currentId);
      updateCatStatus();
      markChanged();
      toast(`✅ ${data.length} categories loaded!`, 'success');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    status.textContent = 'Connection error — is the dashboard server running?';
    status.style.color = 'var(--danger)';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Fetch from WordPress';
  }
}

// ==================== WIZARD ====================
function openWizard() {
  currentWizardStep = 1;
  document.getElementById('wizard-overlay').style.display = 'flex';
  updateWizardUI();
  // Pre-fill from existing config if any
  if (config.wordpress?.url) setVal('wz-wp-url', config.wordpress.url);
  if (config.wordpress?.username) setVal('wz-wp-username', config.wordpress.username);
  const wzPwEl = document.getElementById('wz-wp-password');
  if (wzPwEl) {
    wzPwEl.value = config._credentials?.wpPasswordSet ? '(set in .env)' : '';
    wzPwEl.placeholder = config._credentials?.wpPasswordSet ? '' : 'Add PREFIX_WP_APP_PASSWORD to .env';
  }
  const imgType = config.image_api?.type || '';
  if (imgType) {
    const found = document.querySelector(`#wz-img-type-group .img-option input[value="${imgType}"]`)?.closest('.img-option');
    if (found) wzSelectImageType(imgType, found);
  }
  if (config.image_api?.api_key) setVal('wz-img-key', config.image_api.api_key);
}

function closeWizard() {
  document.getElementById('wizard-overlay').style.display = 'none';
}

function updateWizardUI() {
  // Steps visibility
  document.querySelectorAll('.wizard-step').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === currentWizardStep);
  });

  // Progress indicators
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`wz-dot-${i}`);
    const lbl = document.getElementById(`wz-lbl-${i}`);
    if (i < currentWizardStep) {
      dot.className = 'wz-dot done';
      lbl.className = 'wz-label';
    } else if (i === currentWizardStep) {
      dot.className = 'wz-dot active';
      lbl.className = 'wz-label active';
    } else {
      dot.className = 'wz-dot';
      lbl.className = 'wz-label';
    }
  }
  for (let i = 1; i <= 2; i++) {
    const line = document.getElementById(`wz-line-${i}`);
    line.className = i < currentWizardStep ? 'wz-line done' : 'wz-line';
  }

  // Back button
  document.getElementById('wz-btn-back').style.display = currentWizardStep > 1 ? 'inline-flex' : 'none';

  // Next button label
  const nextBtn = document.getElementById('wz-btn-next');
  const skipBtn = document.getElementById('wz-btn-skip');
  if (currentWizardStep === 3) {
    nextBtn.textContent = '🎉 Open Dashboard';
    skipBtn.style.display = 'none';
  } else {
    nextBtn.textContent = 'Next →';
    skipBtn.style.display = 'inline-flex';
  }
}

async function wizardNext() {
  if (currentWizardStep === 1) {
    // Validate WordPress fields (password lives in .env, not the form)
    const url = getVal('wz-wp-url');
    const user = getVal('wz-wp-username');
    if (!url || !user) {
      toast('Please fill in the WordPress URL and username', 'warning');
      return;
    }
    if (!config._credentials?.wpPasswordSet) {
      toast('Add PREFIX_WP_APP_PASSWORD to .env before continuing', 'warning');
      return;
    }
    // Copy to main form
    setVal('wp-url', url);
    setVal('wp-username', user);
    currentWizardStep = 2;

  } else if (currentWizardStep === 2) {
    // Copy image settings
    const imgType = document.querySelector('#wz-img-type-group .img-option.selected input')?.value;
    if (imgType) {
      selectImageType(imgType);
      const imgKey = document.getElementById('wz-img-key').value.trim();
      if (imgKey) setVal('img-key', imgKey);
    }
    // Save wizard data to config
    await wizardSave();
    // Build summary
    buildWizardSummary();
    currentWizardStep = 3;

  } else if (currentWizardStep === 3) {
    closeWizard();
    return;
  }

  updateWizardUI();
}

function wizardBack() {
  if (currentWizardStep > 1) {
    currentWizardStep--;
    updateWizardUI();
  }
}

async function wizardSave() {
  const url = getVal('wz-wp-url') || getVal('wp-url');
  const user = getVal('wz-wp-username') || getVal('wp-username');
  const imgType = document.querySelector('#wz-img-type-group .img-option.selected input')?.value || 'none';
  const imgKey = document.getElementById('wz-img-key').value.trim();

  // Merge into full config. app_password is never sent — it lives only in .env.
  const data = {
    ...config,
    wordpress: { url, username: user },
    image_api: { type: imgType, api_key: imgKey },
    output: config.output || { articles_dir: './articles', images_dir: './images' },
    workflow: config.workflow || { language: 'id', auto_publish: false, content_length: 1000, auto_select_category: false, saved_categories: [] },
    // Bentuk lengkap knowledge_base dijaga server (EMPTY_KB di lib/knowledge.js).
    // Menyalin daftar field ke sini cuma membuat dua sumber kebenaran yang pasti
    // menyimpang — kirim apa adanya, atau biarkan server yang mengisi.
    knowledge_base: config.knowledge_base || {}
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data, null, 2)
    });
    const result = await res.json();
    if (result.success) {
      config = { ...data, _credentials: config._credentials };
      populateForm(data);
      updateStatusDot(data);
      setChangeStatus(false);
    }
  } catch (e) {
    toast('Could not auto-save: ' + e.message, 'warning');
  }
}

function buildWizardSummary() {
  const url = getVal('wz-wp-url') || getVal('wp-url');
  const imgType = document.querySelector('#wz-img-type-group .img-option.selected input')?.value || 'none';
  const imgLabels = { seedream: 'BytePlus Seedream 4.5 (cheapest)', gemini: 'Google Gemini (Imagen 3)', openai: 'OpenAI DALL-E 3', none: 'Skipped' };

  const container = document.getElementById('wz-summary');
  const items = [
    { icon: '✅', text: `WordPress: ${url}` },
    { icon: '✅', text: `Images: ${imgLabels[imgType] || imgType}` },
    { icon: '📝', text: 'Knowledge Base: fill in the sidebar for better articles' },
  ];
  container.innerHTML = items.map(i => `
    <div class="wz-check-item"><span>${i.icon}</span><span>${escHtml(i.text)}</span></div>
  `).join('');
}

// ==================== PRODUCTS ====================
function renderProducts(arr) {
  const container = document.getElementById('products-list');
  container.innerHTML = '';
  const items = arr.length ? arr : [{ name: '', url: '' }];
  items.forEach(p => addProductItem(typeof p === 'string' ? { name: p, url: '' } : p));
}

function addProduct() { addProductItem({ name: '', url: '' }); }

function addProductItem(val) {
  // Accept string (legacy) or {name, url} object
  const name = typeof val === 'string' ? val : (val?.name || '');
  const url  = typeof val === 'string' ? '' : (val?.url || '');
  const container = document.getElementById('products-list');
  const row = document.createElement('div');
  row.className = 'product-row';
  row.innerHTML = `
    <input type="text" class="product-input" placeholder="e.g. Sound System, Web Hosting, Handmade Bag" value="${escHtml(name)}">
    <input type="url" class="product-url" placeholder="https://yourdomain.com/product-page/">
    <button class="btn-icon" onclick="this.parentElement.remove(); markChanged()">✕</button>
  `;
  row.querySelector('.product-url').value = url;
  container.appendChild(row);
  row.querySelectorAll('input').forEach(i => i.addEventListener('input', markChanged));
}

// ==================== INTERNAL LINKS ====================
function renderLinks(arr) {
  const container = document.getElementById('links-list');
  container.innerHTML = '';
  (arr.length ? arr : []).forEach(l => addLinkItem(l.url, l.anchor));
}

function addLink() { addLinkItem('', ''); }

function addLinkItem(url, anchor) {
  const container = document.getElementById('links-list');
  const row = document.createElement('div');
  row.className = 'list-item link-row';
  row.style.gridTemplateColumns = '1fr 1fr 40px';
  row.style.display = 'grid';
  row.style.gap = '8px';
  row.innerHTML = `
    <input type="url" class="link-url" placeholder="https://yourblog.com/page/" value="${escHtml(url)}">
    <input type="text" class="link-anchor" placeholder="anchor text" value="${escHtml(anchor)}">
    <button class="btn-icon" onclick="this.parentElement.remove(); markChanged()">✕</button>
  `;
  container.appendChild(row);
  row.querySelectorAll('input').forEach(i => i.addEventListener('input', markChanged));
}

// ==================== TAG INPUT ====================
function renderProhibited(arr) {
  const container = document.getElementById('prohibited-tags');
  container.querySelectorAll('.tag').forEach(t => t.remove());
  arr.forEach(tag => addTagItem('prohibited', tag));
}

function focusTagInput(id) { document.getElementById(id)?.focus(); }

function addTag(event, type) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    const input = event.target;
    const val = input.value.trim().replace(/,$/, '');
    if (val) {
      addTagItem(type, val);
      input.value = '';
      markChanged();
    }
  }
}

function addTagItem(type, val) {
  const container = document.getElementById(type + '-tags');
  const input = document.getElementById(type + '-input');
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.dataset.value = val;
  tag.innerHTML = `${escHtml(val)}<button class="tag-remove" onclick="this.parentElement.remove(); markChanged()">×</button>`;
  container.insertBefore(tag, input);
}

function markChanged() { setChangeStatus(true); }

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==================== TOAST ====================
function toast(msg, type = 'success') {
  const container = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ==================== CHANGE DETECTION ====================
document.addEventListener('input', (e) => {
  if (!e.target.classList.contains('tag-input')) markChanged();
});

document.addEventListener('change', (e) => {
  if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') markChanged();
});

// ==================== SCRAPE ====================
let scrapeData = null;

async function scrapeWebsite() {
  const url = document.getElementById('scrape-url').value.trim();
  if (!url) { toast('Enter a website URL first', 'warning'); return; }

  const btn = document.getElementById('scrape-btn');
  const status = document.getElementById('scrape-status');
  const preview = document.getElementById('scrape-preview');

  btn.disabled = true;
  btn.textContent = '⏳ Scraping...';
  status.textContent = 'Fetching page content...';
  status.style.color = 'var(--text-secondary)';
  preview.style.display = 'none';

  try {
    const res = await fetch('/api/scrape?url=' + encodeURIComponent(url));
    const data = await res.json();

    if (data.error) {
      status.textContent = '❌ ' + data.error;
      status.style.color = 'var(--danger)';
      toast('Scrape failed: ' + data.error, 'error');
      return;
    }

    scrapeData = data;
    renderScrapePreview(data);
    preview.style.display = 'block';
    status.textContent = `✅ Scraped successfully — review suggestions below`;
    status.style.color = 'var(--success)';

  } catch (e) {
    status.textContent = '❌ Connection error: ' + e.message;
    status.style.color = 'var(--danger)';
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Scrape Website';
  }
}

function renderScrapePreview(data) {
  const container = document.getElementById('scrape-suggestions');
  const rows = [];

  if (data.businessName) {
    rows.push({ id: 'sg-name', label: 'Business Name', value: data.businessName });
  }
  if (data.description) {
    rows.push({ id: 'sg-desc', label: 'Description', value: data.description, multiline: true });
  }
  if (data.products && data.products.length > 0) {
    rows.push({ id: 'sg-products', label: 'Products', value: data.products.join('\n'), multiline: true });
  }
  if (data.tagline) {
    rows.push({ id: 'sg-tagline', label: 'Tagline', value: data.tagline });
  }

  if (rows.length === 0) {
    container.innerHTML = '<p style="font-size:13px; color:var(--text-secondary); padding:8px 0;">No structured data found. Try a different page (like /about or /services).</p>';
    return;
  }

  container.innerHTML = rows.map(r => `
    <div class="suggestion-row">
      <input type="checkbox" class="suggestion-check" id="${r.id}-check" checked>
      <div class="suggestion-label">${escHtml(r.label)}</div>
      <div class="suggestion-value ${r.multiline ? 'multiline' : ''}" id="${r.id}-val">${escHtml(r.value)}</div>
    </div>
  `).join('');
}

function applyScrapeData() {
  if (!scrapeData) return;

  let applied = 0;

  if (document.getElementById('sg-name-check')?.checked && scrapeData.businessName) {
    setVal('kb-name', scrapeData.businessName);
    applied++;
  }
  if (document.getElementById('sg-desc-check')?.checked && scrapeData.description) {
    setVal('kb-desc', scrapeData.description);
    applied++;
  }
  if (document.getElementById('sg-products-check')?.checked && scrapeData.products?.length) {
    // Clear existing and add scraped products
    const container = document.getElementById('products-list');
    container.innerHTML = '';
    scrapeData.products.forEach(p => addProductItem(p));
    applied++;
  }

  if (applied > 0) {
    markChanged();
    document.getElementById('scrape-preview').style.display = 'none';
    toast(`✅ Applied ${applied} field(s) to Knowledge Base`, 'success');
  } else {
    toast('No fields selected to apply', 'warning');
  }
}

// ==================== CUSTOM KNOWLEDGE ENTRIES ====================

function renderCustomEntries(entries) {
  const container = document.getElementById('custom-entries-list');
  container.innerHTML = '';
  (entries || []).forEach(e => addCustomEntryItem(e.title, e.content));
}

function addCustomEntry() {
  addCustomEntryItem('', '');
  markChanged();
}

function addCustomEntryItem(title, content) {
  const container = document.getElementById('custom-entries-list');
  const row = document.createElement('div');
  row.className = 'custom-entry-row';
  row.style.cssText = 'border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px; background:#fff;';
  row.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
      <input type="text" class="custom-entry-title" placeholder="Note title (e.g., Pricing, Service Area, FAQ)" value="${(title||'').replace(/"/g,'&quot;')}" style="flex:1; font-weight:500;">
      <button onclick="this.closest('.custom-entry-row').remove(); markChanged();" style="background:none; border:none; color:var(--text-light); cursor:pointer; font-size:18px; line-height:1; padding:2px 6px; border-radius:4px;" title="Remove">×</button>
    </div>
    <textarea class="custom-entry-content" rows="4" placeholder="Write any context here — pricing tiers, FAQs, service area, brand guidelines, unique selling points...">${content||''}</textarea>
  `;
  row.querySelector('.custom-entry-title').addEventListener('input', markChanged);
  row.querySelector('.custom-entry-content').addEventListener('input', markChanged);
  container.appendChild(row);
}

function collectCustomEntries() {
  const entries = [];
  document.querySelectorAll('.custom-entry-row').forEach(row => {
    const title = row.querySelector('.custom-entry-title')?.value?.trim() || '';
    const content = row.querySelector('.custom-entry-content')?.value?.trim() || '';
    if (title || content) entries.push({ title, content });
  });
  return entries;
}

// ==================== ARTICLES TAB ====================

// --- State ---
let articlesAll     = [];   // full cached list
let articlesFiltered = [];  // after filter/search
let articlesPage    = 1;
const ARTICLES_PER_PAGE = 20;
let articlesPollTimer = null;
let articlesStatusFilter = 'all';

// --- Load (called by showPage when tab opens) ---
function articlesLoad() {
  const tbody = document.getElementById('articles-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="articles-empty">Memuat artikel...</td></tr>';
  document.getElementById('articles-sync-status').textContent = 'Memuat...';
  document.getElementById('articles-sync-status').className = 'sync-status-text syncing';

  fetch('/api/articles')
    .then(r => r.json())
    .then(data => {
      articlesAll = data.articles || [];
      articlesFilteredUpdate();
      articlesRenderTable();
      articlesBuildCategoryFilter();
      articlesUpdateStats();
      if (data.syncing) {
        document.getElementById('articles-sync-status').textContent = 'Syncing...';
        articlesStartPoll();
      } else {
        articlesShowSyncTime(data.lastSync);
      }
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="5" class="articles-empty">Gagal memuat artikel. Coba lagi.</td></tr>';
      document.getElementById('articles-sync-status').textContent = '';
      document.getElementById('articles-sync-status').className = 'sync-status-text';
    });
}

// --- Filter + Search ---
function articlesFilteredUpdate() {
  const q     = (document.getElementById('articles-search').value || '').toLowerCase().trim();
  const cat   = document.getElementById('articles-cat-select').value;
  const status = articlesStatusFilter;

  articlesFiltered = articlesAll.filter(a => {
    if (status !== 'all' && a.status !== status) return false;
    if (cat && a.category !== cat) return false;
    if (q && !a.title.toLowerCase().includes(q)) return false;
    return true;
  });
  articlesPage = 1;
}

function articlesFilter() {
  articlesFilteredUpdate();
  articlesRenderTable();
}

function articlesPillClick(btn) {
  document.querySelectorAll('#articles-filter-pills .filter-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  articlesStatusFilter = btn.dataset.status;
  articlesFilter();
}

// --- Render Table ---
function articlesRenderTable() {
  const tbody = document.getElementById('articles-tbody');
  const start = (articlesPage - 1) * ARTICLES_PER_PAGE;
  const rows  = articlesFiltered.slice(start, start + ARTICLES_PER_PAGE);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="articles-empty">Tidak ada artikel ditemukan.</td></tr>';
    document.getElementById('articles-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = rows.map(a => {
    const isDraft = a.status === 'draft';
    const dateStr = a.date ? a.date.substring(0, 10).split('-').reverse().join(' ').replace(
      /(\d+) (\d+) (\d+)/,
      (_, d, m, y) => `${d} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][+m-1]} ${y}`
    ) : '—';
    const checked = isDraft ? '' : 'checked';
    const badgeCls = isDraft ? 'draft' : 'published';
    const badgeLabel = isDraft ? 'Draft' : 'Published';
    const wpBase = (config.wordpress?.url || '').replace(/\/$/, '');
    const editUrl = wpBase ? wpBase + '/wp-admin/post.php?post=' + a.id + '&action=edit' : '#';
    return `<tr class="${isDraft ? 'draft-row' : ''}">
      <td><a class="article-title-link" href="${escHtml(a.url)}" target="_blank" title="${escHtml(a.title)}">${escHtml(a.title)}</a></td>
      <td>
        <label class="toggle-switch" title="Toggle publish/draft">
          <input type="checkbox" ${checked} onchange="articlesToggle(${a.id}, this)">
          <span class="articles-toggle-slider"></span>
        </label>
        <span class="status-badge ${badgeCls}">${badgeLabel}</span>
      </td>
      <td><span class="cat-tag">${escHtml(a.category || '—')}</span></td>
      <td style="white-space:nowrap;color:#64748b">${dateStr}</td>
      <td style="white-space:nowrap">
        <a class="article-action-btn" href="${escHtml(a.url)}" target="_blank">👁 Preview</a>
        <a class="article-action-btn" href="${escHtml(editUrl)}" target="_blank">✏️ Edit</a>
      </td>
    </tr>`;
  }).join('');

  articlesRenderPagination();
}

// --- Pagination ---
function articlesRenderPagination() {
  const total = articlesFiltered.length;
  const pages = Math.ceil(total / ARTICLES_PER_PAGE);
  const pag   = document.getElementById('articles-pagination');
  if (pages <= 1) { pag.innerHTML = ''; return; }

  const range = paginationRange(articlesPage, pages);
  pag.innerHTML = [
    `<button class="page-btn" ${articlesPage === 1 ? 'disabled' : ''} onclick="articlesGoPage(${articlesPage-1})">‹</button>`,
    ...range.map(p => p === '…'
      ? `<button class="page-btn" disabled>…</button>`
      : `<button class="page-btn ${p === articlesPage ? 'active' : ''}" onclick="articlesGoPage(${p})">${p}</button>`
    ),
    `<button class="page-btn" ${articlesPage === pages ? 'disabled' : ''} onclick="articlesGoPage(${articlesPage+1})">›</button>`
  ].join('');
}

function paginationRange(cur, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (cur > 3) pages.push('…');
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
  if (cur < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

function articlesGoPage(p) {
  articlesPage = p;
  articlesRenderTable();
  document.querySelector('.articles-table-wrap').scrollIntoView({behavior: 'smooth', block: 'start'});
}

// --- Stats ---
function articlesUpdateStats() {
  const pub   = articlesAll.filter(a => a.status === 'publish').length;
  const draft = articlesAll.filter(a => a.status === 'draft').length;
  document.getElementById('stat-total').textContent     = articlesAll.length;
  document.getElementById('stat-published').textContent  = pub;
  document.getElementById('stat-draft').textContent     = draft;
  document.getElementById('stat-links').textContent     = pub;
  // Update sidebar badge
  const badge = document.getElementById('draft-count-badge');
  if (badge) badge.textContent = draft > 0 ? draft : '';
}

// --- Category Filter ---
function articlesBuildCategoryFilter() {
  const sel  = document.getElementById('articles-cat-select');
  const cats = [...new Set(articlesAll.map(a => a.category).filter(Boolean))].sort();
  const cur  = sel.value;
  sel.innerHTML = '<option value="">Semua Kategori</option>' +
    cats.map(c => `<option value="${escHtml(c)}" ${c === cur ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
}

// --- Toggle Publish/Draft ---
function articlesToggle(id, checkbox) {
  const newStatus = checkbox.checked ? 'publish' : 'draft';
  checkbox.disabled = true;

  fetch('/api/articles/toggle', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id, status: newStatus})
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      const art = articlesAll.find(a => a.id === id);
      if (art) art.status = res.status;
      articlesFilteredUpdate();
      articlesRenderTable();
      articlesUpdateStats();
    } else {
      checkbox.checked = !checkbox.checked; // revert
      alert('Gagal mengubah status: ' + (res.error || 'Unknown error'));
    }
  })
  .catch(() => {
    checkbox.checked = !checkbox.checked;
    alert('Gagal mengubah status. Periksa koneksi.');
  })
  .finally(() => { checkbox.disabled = false; });
}

// --- Force Sync ---
function articlesForceSync() {
  const statusEl = document.getElementById('articles-sync-status');
  statusEl.textContent = 'Syncing...';
  statusEl.className = 'sync-status-text syncing';

  fetch('/api/articles?force=true')
    .then(r => {
      if (r.status === 409) { articlesStartPoll(); return null; }
      return r.json();
    })
    .then(data => {
      if (!data) return;
      articlesAll = data.articles || [];
      articlesFilteredUpdate();
      articlesRenderTable();
      articlesBuildCategoryFilter();
      articlesUpdateStats();
      articlesStartPoll();
    })
    .catch(() => {
      statusEl.textContent = 'Sync gagal';
      statusEl.className = 'sync-status-text';
    });
}

// --- Polling ---
function articlesStartPoll() {
  if (articlesPollTimer) clearInterval(articlesPollTimer);
  let attempts = 0;
  articlesPollTimer = setInterval(() => {
    attempts++;
    if (attempts > 30) { clearInterval(articlesPollTimer); return; }
    fetch('/api/articles/sync-status')
      .then(r => r.json())
      .then(data => {
        if (data.done) {
          clearInterval(articlesPollTimer);
          articlesPollTimer = null;
          // Refresh from cache (no-sync)
          fetch('/api/articles?nosync=true')
            .then(r => r.json())
            .then(d => {
              articlesAll = d.articles || [];
              articlesFilteredUpdate();
              articlesRenderTable();
              articlesBuildCategoryFilter();
              articlesUpdateStats();
              articlesShowSyncTime(data.lastSync);
            });
        }
      })
      .catch(() => { /* ignore poll errors */ });
  }, 2000);
}

function articlesShowSyncTime(iso) {
  const el = document.getElementById('articles-sync-status');
  if (!el) return;
  if (!iso) { el.textContent = ''; el.className = 'sync-status-text'; return; }
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  let label;
  if (diff < 30)        label = 'Synced just now';
  else if (diff < 120)  label = 'Synced 1 min ago';
  else if (diff < 3600) label = `Synced ${Math.round(diff/60)} min ago`;
  else                  label = 'Synced >1 hour ago';
  el.textContent = label;
  el.className = 'sync-status-text';
}

// ==================== PLANNING ====================
let plansData = [];

async function plansLoad() {
  try {
    const res = await fetch('/api/plans');
    const data = await res.json();
    plansData = data.plans || [];
    plansPopulateCategoryFilter();
    plansRender();
    plansUpdateStats();
    // Update badge
    const pending = plansData.filter(p => p.status === 'planned' || p.status === 'writing').length;
    const badge = document.getElementById('plan-count-badge');
    if (badge) { badge.textContent = pending; badge.style.display = pending ? '' : 'none'; }
  } catch(e) { console.warn('Plans load failed:', e.message); }
}

function plansPopulateCategoryFilter() {
  const sel = document.getElementById('plan-filter-category');
  if (!sel) return;
  const cats = [...new Set(plansData.map(p => p.category_name).filter(Boolean))].sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="">Semua Kategori</option>' +
    cats.map(c => `<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
}

function plansRender() {
  const tbody = document.getElementById('plan-tbody');
  if (!tbody) return;
  const search = (document.getElementById('plan-search')?.value || '').toLowerCase();
  const fStatus = document.getElementById('plan-filter-status')?.value || '';
  const fPriority = document.getElementById('plan-filter-priority')?.value || '';
  const fCat = document.getElementById('plan-filter-category')?.value || '';

  let items = plansData.filter(p => {
    if (fStatus && p.status !== fStatus) return false;
    if (fPriority && p.priority !== fPriority) return false;
    if (fCat && p.category_name !== fCat) return false;
    if (search && !((p.keyword||'').toLowerCase().includes(search) || (p.title||'').toLowerCase().includes(search) || (p.meta_title||'').toLowerCase().includes(search))) return false;
    return true;
  });

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="plan-empty"><div class="empty-icon">🔍</div><h3>Tidak ada rencana yang cocok</h3><p>Coba ubah filter atau tambah rencana baru</p></div></td></tr>';
    return;
  }

  const statusMap = { planned:'s-planned', writing:'s-writing', written:'s-written', posting:'s-posting', published:'s-published' };
  const statusLabel = { planned:'Direncanakan', writing:'Sedang Ditulis', written:'Ditulis', posting:'Diposting', published:'Dipublikasi' };
  const priorityMap = { high:'p-high', medium:'p-medium', low:'p-low' };
  const priorityLabel = { high:'Tinggi', medium:'Sedang', low:'Rendah' };

  tbody.innerHTML = items.map(p => `
    <tr>
      <td class="kw-cell">
        ${escHtml(p.keyword || '—')}
        <small>${p.city ? '📍 ' + escHtml(p.city) : ''}${p.product ? (p.city?' · ':' ')+'🏷 '+escHtml(p.product) : ''}</small>
      </td>
      <td class="meta-cell" title="${escHtml(p.meta_title||'')}">
        ${escHtml(p.meta_title || p.title || '—')}
        ${p.meta_title ? `<small>${p.meta_title.length} kar.</small>` : ''}
      </td>
      <td>${escHtml(p.category_name || '—')}</td>
      <td><span class="plan-status ${statusMap[p.status]||'s-planned'}">${statusLabel[p.status]||p.status}</span></td>
      <td><span class="plan-priority ${priorityMap[p.priority]||'p-medium'}">${priorityLabel[p.priority]||p.priority}</span></td>
      <td style="font-size:12px; color:var(--text-secondary);">${p.scheduled_date || '—'}</td>
      <td>
        <div class="plan-act-group">
          <button class="plan-act" onclick="planModalOpen('${p.id}')">✏️ Edit</button>
          ${p.status !== 'published' ? `<button class="plan-act write" onclick="planActionComingSoon('Tulis Artikel')">✍️ Tulis</button>` : ''}
          ${(p.status === 'writing' || p.status === 'written') ? `<button class="plan-act post" onclick="planActionComingSoon('Post ke WordPress')">🚀 Post</button>` : ''}
          <button class="plan-act danger" onclick="planDelete('${p.id}')">🗑</button>
        </div>
      </td>
    </tr>`).join('');
}

function plansUpdateStats() {
  const total = plansData.length;
  const planned = plansData.filter(p => p.status === 'planned').length;
  const progress = plansData.filter(p => p.status === 'writing' || p.status === 'written' || p.status === 'posting').length;
  const done = plansData.filter(p => p.status === 'published').length;
  document.getElementById('ps-total').textContent = total;
  document.getElementById('ps-planned').textContent = planned;
  document.getElementById('ps-progress').textContent = progress;
  document.getElementById('ps-done').textContent = done;
}

// ── SSE Client & Agent Status Bar ───────────────────────────────────────────

let sseConnection = null;
let agentQueueCache = { tasks: [] };

function initSSE() {
  if (sseConnection) { sseConnection.close(); }
  sseConnection = new EventSource('/api/events');
  sseConnection.addEventListener('connected', () => {
    console.log('[SSE] connected');
    agentStatusBarRefresh();
  });
  sseConnection.addEventListener('queue_updated', (e) => {
    const data = JSON.parse(e.data);
    agentStatusBarUpdate(data);
    if (data.status === 'done') {
      setTimeout(() => plansLoad(), 500);
    }
  });
  sseConnection.addEventListener('plan_saved', () => {
    plansLoad();
  });
  sseConnection.addEventListener('agent_ping', () => {
    const bar = document.getElementById('agent-status-bar');
    if (bar && bar.style.display !== 'none') {
      document.getElementById('asb-icon').textContent = '🤖';
    }
  });
  sseConnection.onerror = () => {
    setTimeout(initSSE, 3000);
  };
}

async function agentStatusBarRefresh() {
  try {
    const resp = await fetch('/api/agent-queue');
    const data = await resp.json();
    agentQueueCache = data;
    const pending = (data.tasks || []).filter(t => t.status === 'pending' || t.status === 'in_progress');
    if (!pending.length) {
      document.getElementById('agent-status-bar').style.display = 'none';
      return;
    }
    const active = pending.find(t => t.status === 'in_progress') || pending[0];
    agentStatusBarShow(active, pending.length);
  } catch(e) {}
}

function agentStatusBarShow(task, pendingCount) {
  const bar = document.getElementById('agent-status-bar');
  if (!bar) return;
  bar.style.display = 'flex';
  const seeds = task.input?.seed_keyword
    ? `${task.input.seed_keyword}${task.input.target_location ? ' × ' + task.input.target_location : ''}`.substring(0, 40)
    : (task.input?.seed_keywords || []).join(', ').substring(0, 40);
  const isActive = task.status === 'in_progress';
  bar.className = 'agent-status-bar ' + (isActive ? 'active' : 'waiting');
  document.getElementById('asb-icon').textContent = isActive ? '🤖' : '⏳';
  const prog = task.progress || { current: 0, total: 0 };
  if (isActive && prog.total > 0) {
    document.getElementById('asb-text').textContent = `Agent aktif · Memproses "${seeds}"`;
    document.getElementById('asb-progress').textContent = `(${prog.current}/${prog.total})`;
    const pct = Math.round((prog.current / prog.total) * 100);
    const barEl = document.getElementById('asb-bar');
    const fillEl = document.getElementById('asb-bar-fill');
    barEl.style.display = 'block';
    fillEl.style.width = pct + '%';
  } else {
    const extra = pendingCount > 1 ? ` · ${pendingCount} task pending` : '';
    document.getElementById('asb-text').textContent = `Menunggu agent · "${seeds}"${extra} — ketik /blog-autopilot di terminal`;
    document.getElementById('asb-progress').textContent = '';
    document.getElementById('asb-bar').style.display = 'none';
  }
}

function agentStatusBarUpdate(data) {
  const idx = agentQueueCache.tasks.findIndex(t => t.id === data.id);
  if (idx !== -1) {
    agentQueueCache.tasks[idx].status = data.status;
    agentQueueCache.tasks[idx].progress = data.progress;
  }
  const pending = agentQueueCache.tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  if (!pending.length) {
    document.getElementById('agent-status-bar').style.display = 'none';
    return;
  }
  const active = pending.find(t => t.status === 'in_progress') || pending[0];
  agentStatusBarShow(active, pending.length);
}

// ── Auto Generate Modal ──────────────────────────────────────────────────────

function autoGenModalOpen() {
  const overlay = document.getElementById('autogen-modal-overlay');
  if (!overlay) return;
  const elKeyword = document.getElementById('ag-keyword');
  const elLocation = document.getElementById('ag-location');
  const elProduct = document.getElementById('ag-product');
  const elAnchorUrl = document.getElementById('ag-anchor-url');
  const elAnchorText = document.getElementById('ag-anchor-text');
  const elCount = document.getElementById('ag-count');
  const elSpacing = document.getElementById('ag-spacing');
  const elStartDate = document.getElementById('ag-start-date');
  if (!elKeyword || !elLocation || !elProduct || !elAnchorUrl || !elAnchorText || !elCount || !elSpacing || !elStartDate) return;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  elStartDate.value = tomorrow.toISOString().split('T')[0];
  elKeyword.value = '';
  elLocation.value = '';
  elProduct.value = '';
  elProduct.style.display = '';
  elAnchorUrl.value = '';
  elAnchorText.value = '';
  elCount.value = '5';
  elSpacing.value = '7';
  autoGenFillProductSelect();
  autoGenPreviewUpdate();
  overlay.style.display = 'flex';
  setTimeout(() => elKeyword.focus(), 50);
}

function autoGenModalClose() {
  const overlay = document.getElementById('autogen-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function autoGenModalBgClick(e) {
  if (e.target === document.getElementById('autogen-modal-overlay')) autoGenModalClose();
}

function autoGenFillProductSelect() {
  const sel = document.getElementById('ag-product-select');
  if (!sel) return;
  const products = (config.knowledge_base?.products || [])
    .map(p => typeof p === 'string' ? { name: p, url: '' } : p)
    .filter(p => p.name);
  sel.innerHTML = '<option value="">✏️ Type manually</option>' +
    products.map(p => `<option value="${escHtml(p.name)}" data-url="${escHtml(p.url || '')}">${escHtml(p.name)}${p.url ? ' 🔗' : ''}</option>`).join('');
  const manualInput = document.getElementById('ag-product');
  if (sel.value) {
    manualInput.value = sel.value;
    manualInput.style.display = 'none';
  } else {
    manualInput.style.display = '';
  }
}

function autoGenProductSelectChange() {
  const sel = document.getElementById('ag-product-select');
  const manualInput = document.getElementById('ag-product');
  const anchorUrl = document.getElementById('ag-anchor-url');
  const anchorText = document.getElementById('ag-anchor-text');
  if (!sel || !manualInput || !anchorUrl || !anchorText) return;
  const opt = sel.options[sel.selectedIndex];
  if (sel.value) {
    manualInput.value = sel.value;
    manualInput.style.display = 'none';
    if (opt.dataset.url) {
      anchorUrl.value = opt.dataset.url;
      anchorText.placeholder = 'e.g. ' + sel.value.toLowerCase();
    } else {
      anchorUrl.value = '';
      anchorText.placeholder = '';
    }
  } else {
    manualInput.value = '';
    manualInput.style.display = '';
    anchorUrl.value = '';
    anchorText.placeholder = '';
  }
}

function autoGenPreviewUpdate() {
  const keyword = (document.getElementById('ag-keyword')?.value || '').trim();
  const location = (document.getElementById('ag-location')?.value || '').trim();
  const count = parseInt(document.getElementById('ag-count')?.value || '5', 10) || 5;
  const spacing = parseInt(document.getElementById('ag-spacing')?.value || '7', 10) || 7;
  const startVal = document.getElementById('ag-start-date')?.value;
  const preview = document.getElementById('ag-preview');
  if (!preview) return;
  if (!keyword) {
    preview.innerHTML = '<div class="autogen-preview-title">Isi keyword & lokasi untuk melihat preview jadwal</div>';
    return;
  }
  const startDate = startVal ? new Date(startVal) : new Date(Date.now() + 86400000);
  const locationStr = location ? ` × ${location}` : '';
  let items = '';
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate.getTime() + i * spacing * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    items += `<div class="autogen-preview-item"><span class="autogen-preview-date">${dateStr}</span><span class="autogen-preview-seed">${escHtml(keyword)}${escHtml(locationStr)} - artikel ${i + 1}</span></div>`;
  }
  preview.innerHTML = `<div class="autogen-preview-title">📅 Jadwal preview (${count} artikel) — judul akan diisi AI:</div>${items}`;
}

async function autoGenSubmit() {
  const keyword = (document.getElementById('ag-keyword')?.value || '').trim();
  const location = (document.getElementById('ag-location')?.value || '').trim();
  const productSel = document.getElementById('ag-product-select');
  const product = productSel?.value || (document.getElementById('ag-product')?.value || '').trim();
  if (!keyword) { alert('Masukkan Seed Keyword.'); return; }
  if (!location) { alert('Masukkan Target Location.'); return; }
  if (!product) { alert('Pilih atau ketik Product / Topic.'); return; }
  const count = parseInt(document.getElementById('ag-count')?.value || '5', 10) || 5;
  const spacing = parseInt(document.getElementById('ag-spacing')?.value || '7', 10) || 7;
  const startDate = document.getElementById('ag-start-date')?.value || new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const productUrl = (document.getElementById('ag-anchor-url')?.value || '').trim();
  const anchorText = (document.getElementById('ag-anchor-text')?.value || '').trim();
  const btn = document.getElementById('ag-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }
  try {
    const resp = await fetch('/api/agent-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'auto_generate',
        input: { seed_keyword: keyword, target_location: location, product, product_url: productUrl, anchor_text: anchorText, count, spacing_days: spacing, start_date: startDate }
      })
    });
    const result = await resp.json();
    if (result.success) {
      autoGenModalClose();
      agentStatusBarRefresh();
    } else {
      alert('Gagal membuat task: ' + (result.error || 'Unknown error'));
    }
  } catch(e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Generate dengan AI'; }
  }
}

function planModalOpen(id) {
  // Update slug domain prefix from config
  const slugDomain = document.getElementById('pm-slug-domain');
  if (slugDomain) {
    const wpUrl = config.wordpress?.url || '';
    slugDomain.textContent = wpUrl ? wpUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') + '/' : 'yourdomain.com/';
  }
  const modal = document.getElementById('plan-modal-overlay');
  if (!id) {
    // New plan
    document.getElementById('plan-modal-title').textContent = 'Add Article Plan';
    document.getElementById('pm-id').value = '';
    document.getElementById('pm-keyword').value = '';
    document.getElementById('pm-city').value = '';
    document.getElementById('pm-product').value = '';
    document.getElementById('pm-product').style.display = '';
    document.getElementById('pm-anchor-url').value = '';
    document.getElementById('pm-anchor-text').value = '';
    planFillProductSelect('');
    document.getElementById('pm-title').value = '';
    document.getElementById('pm-meta-title').value = '';
    document.getElementById('pm-meta-desc').value = '';
    document.getElementById('pm-slug').value = '';
    document.getElementById('pm-content-type').value = 'informational';
    document.getElementById('pm-word-count').value = '1000';
    document.getElementById('pm-lsi').value = '';
    document.getElementById('pm-status').value = 'planned';
    document.getElementById('pm-priority').value = 'medium';
    document.getElementById('pm-date').value = '';
    document.getElementById('pm-notes').value = '';
    document.getElementById('pm-meta-title-count').textContent = '0 karakter';
    document.getElementById('pm-meta-desc-count').textContent = '0 karakter';
    planFillCategorySelect(null);
  } else {
    const p = plansData.find(x => x.id === id);
    if (!p) return;
    document.getElementById('plan-modal-title').textContent = 'Edit Article Plan';
    document.getElementById('pm-id').value = p.id;
    document.getElementById('pm-keyword').value = p.keyword || '';
    document.getElementById('pm-city').value = p.city || '';
    document.getElementById('pm-anchor-url').value = p.anchor_url || '';
    document.getElementById('pm-anchor-text').value = p.anchor_text || '';
    planFillProductSelect(p.product || '');
    if (!p.product) document.getElementById('pm-product').value = '';
    document.getElementById('pm-title').value = p.title || '';
    document.getElementById('pm-meta-title').value = p.meta_title || '';
    document.getElementById('pm-meta-desc').value = p.meta_description || '';
    document.getElementById('pm-slug').value = p.slug || '';
    document.getElementById('pm-content-type').value = p.content_type || 'informational';
    document.getElementById('pm-word-count').value = p.target_words || '1000';
    document.getElementById('pm-lsi').value = (p.lsi_keywords || []).join(', ');
    document.getElementById('pm-status').value = p.status || 'planned';
    document.getElementById('pm-priority').value = p.priority || 'medium';
    document.getElementById('pm-date').value = p.scheduled_date || '';
    document.getElementById('pm-notes').value = p.notes || '';
    planFillCategorySelect(p.category_id);
    planCharCount('pm-meta-title','pm-meta-title-count',50,60);
    planCharCount('pm-meta-desc','pm-meta-desc-count',150,160);
  }
  planSeoCheck();
  modal.style.display = 'flex';
}

function planFillProductSelect(selectedName) {
  const sel = document.getElementById('pm-product-select');
  if (!sel) return;
  const products = (config.knowledge_base?.products || [])
    .map(p => typeof p === 'string' ? { name: p, url: '' } : p)
    .filter(p => p.name);
  sel.innerHTML = '<option value="">✏️ Type manually</option>' +
    products.map(p => `<option value="${escHtml(p.name)}" data-url="${escHtml(p.url)}" ${p.name===selectedName?'selected':''}>${escHtml(p.name)}${p.url?' 🔗':''}</option>`).join('');
  // Show/hide manual input based on selection
  const manualInput = document.getElementById('pm-product');
  if (sel.value) {
    manualInput.value = sel.value;
    manualInput.style.display = 'none';
  } else {
    manualInput.style.display = '';
  }
}

function planProductSelectChange() {
  const sel = document.getElementById('pm-product-select');
  const manualInput = document.getElementById('pm-product');
  const anchorUrl = document.getElementById('pm-anchor-url');
  const anchorText = document.getElementById('pm-anchor-text');
  const opt = sel.options[sel.selectedIndex];
  if (sel.value) {
    manualInput.value = sel.value;
    manualInput.style.display = 'none';
    // Auto-fill anchor if product has URL
    if (opt.dataset.url) {
      anchorUrl.value = opt.dataset.url;
      anchorText.placeholder = 'e.g. ' + sel.value.toLowerCase();
    }
  } else {
    manualInput.value = '';
    manualInput.style.display = '';
    manualInput.focus();
  }
}

function planAnchorCheck() {
  // Could add validation, currently just a passthrough
}

function planFillCategorySelect(selectedId) {
  const sel = document.getElementById('pm-category-id');
  if (!sel) return;
  const cats = config.workflow?.saved_categories || savedCategories || [];
  sel.innerHTML = '<option value="">-- Pilih Kategori --</option>' +
    cats.map(c => `<option value="${c.id}" data-name="${escHtml(c.name)}" ${c.id==selectedId?'selected':''}>${escHtml(c.name)}</option>`).join('');
}

function planModalClose() {
  document.getElementById('plan-modal-overlay').style.display = 'none';
}

function planModalBgClick(e) {
  if (e.target === document.getElementById('plan-modal-overlay')) planModalClose();
}

function planUpdateSlug() {
  const kw = document.getElementById('pm-keyword')?.value || '';
  if (!document.getElementById('pm-slug').value || document.getElementById('pm-id').value === '') {
    document.getElementById('pm-slug').value = kw.toLowerCase()
      .replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim().replace(/^-|-$/g,'');
  }
}

function planCharCount(inputId, counterId, minOk, maxOk) {
  const input = document.getElementById(inputId);
  const counter = document.getElementById(counterId);
  if (!input || !counter) return;
  const len = input.value.length;
  counter.textContent = len + ' karakter';
  counter.className = 'char-counter';
  if (len >= minOk && len <= maxOk) counter.classList.add('ok');
  else if (len > maxOk) counter.classList.add('over');
  else if (len >= minOk * 0.8) counter.classList.add('warn');
}

function planSeoCheck() {
  const kw = (document.getElementById('pm-keyword')?.value || '').toLowerCase().trim();
  const title = (document.getElementById('pm-title')?.value || '').toLowerCase();
  const metaTitle = document.getElementById('pm-meta-title')?.value || '';
  const metaDesc = document.getElementById('pm-meta-desc')?.value || '';
  const slug = document.getElementById('pm-slug')?.value || '';
  const catId = document.getElementById('pm-category-id')?.value || '';

  function setChk(id, pass) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'chk ' + (pass ? 'pass' : 'fail');
    el.textContent = pass ? '✓' : '—';
  }
  setChk('chk-kw', kw.length > 0);
  setChk('chk-title', kw && title.includes(kw.split(' ')[0]));
  setChk('chk-meta-title', metaTitle.length >= 50 && metaTitle.length <= 60);
  setChk('chk-meta-desc', metaDesc.length >= 150 && metaDesc.length <= 160);
  setChk('chk-slug', slug.length > 0);
  setChk('chk-cat', catId !== '');
}

async function planSave() {
  const kw = document.getElementById('pm-keyword').value.trim();
  if (!kw) { showToast('Focus keyword wajib diisi!', 'error'); return; }

  const catSel = document.getElementById('pm-category-id');
  const catOption = catSel.options[catSel.selectedIndex];
  const catName = catOption?.dataset?.name || catOption?.textContent?.trim() || '';

  const plan = {
    id: document.getElementById('pm-id').value || ('plan_' + Date.now()),
    keyword: kw,
    city: document.getElementById('pm-city').value,
    product: document.getElementById('pm-product').value.trim(),
    anchor_url: document.getElementById('pm-anchor-url').value.trim(),
    anchor_text: document.getElementById('pm-anchor-text').value.trim(),
    title: document.getElementById('pm-title').value.trim(),
    meta_title: document.getElementById('pm-meta-title').value.trim(),
    meta_description: document.getElementById('pm-meta-desc').value.trim(),
    slug: document.getElementById('pm-slug').value.trim(),
    category_id: document.getElementById('pm-category-id').value ? Number(document.getElementById('pm-category-id').value) : null,
    category_name: catName.replace(/^-- .* --$/, ''),
    content_type: document.getElementById('pm-content-type').value,
    target_words: Number(document.getElementById('pm-word-count').value) || 1000,
    lsi_keywords: document.getElementById('pm-lsi').value.split(',').map(s=>s.trim()).filter(Boolean),
    status: document.getElementById('pm-status').value,
    priority: document.getElementById('pm-priority').value,
    scheduled_date: document.getElementById('pm-date').value,
    notes: document.getElementById('pm-notes').value.trim(),
  };

  try {
    const res = await fetch('/api/plans', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(plan) });
    const data = await res.json();
    if (data.error) { showToast('Error: ' + data.error, 'error'); return; }
    showToast(data.created ? 'Rencana berhasil ditambahkan!' : 'Rencana berhasil diupdate!', 'success');
    planModalClose();
    plansLoad();
  } catch(e) { showToast('Gagal menyimpan: ' + e.message, 'error'); }
}

function planActionComingSoon(action) {
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1e293b;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
  msg.textContent = `⚡ ${action} — coming soon! Ketik /blog-autopilot di terminal untuk sekarang.`;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 3500);
}

async function planDelete(id) {
  const p = plansData.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Hapus rencana "${p.keyword}"?`)) return;
  try {
    const res = await fetch('/api/plans', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id}) });
    const data = await res.json();
    if (data.error) { showToast('Error: ' + data.error, 'error'); return; }
    showToast('Rencana dihapus.', 'success');
    plansLoad();
  } catch(e) { showToast('Gagal menghapus: ' + e.message, 'error'); }
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadBlogs() {
  const r = await fetch('/api/blogs').then(x => x.json());
  const sel = document.getElementById('blogSelect');
  if (!sel) return;
  sel.innerHTML = (r.blogs || [])
    .map(b => `<option value="${b.id}"${b.id === r.active ? ' selected' : ''}>${b.name}</option>`)
    .join('');
  sel.onchange = async () => {
    await fetch('/api/blogs/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sel.value })
    });
    location.reload();
  };
}

// ==================== INIT ====================
loadConfig();
initSSE();
loadBlogs();

// ==================== PROFIL BISNIS LENGKAP ====================
// Peta id elemen -> nama field knowledge_base. Satu tempat supaya pengisian
// dan pengumpulan tidak bisa menyimpang satu sama lain.
const FIELD_PROFIL_TEKS = {
  'kb-tagline': 'tagline',
  'kb-type': 'business_type',
  'kb-founded': 'founded_year',
  'kb-usp': 'usp',
  'kb-address': 'address',
  'kb-city': 'city',
  'kb-whatsapp': 'whatsapp',
  'kb-email': 'email',
  'kb-hours': 'hours',
  'kb-website': 'website'
};
const FIELD_PROFIL_TAG = {
  signature: 'signature_words',
  avoid: 'avoid_words',
  cta: 'cta',
  dos: 'dos',
  donts: 'donts'
};

function isiProfilLengkap(kb) {
  for (const [id, field] of Object.entries(FIELD_PROFIL_TEKS)) setVal(id, kb[field]);
  for (const [tipe, field] of Object.entries(FIELD_PROFIL_TAG)) renderTags(tipe, kb[field] || []);
}

function renderTags(tipe, arr) {
  const container = document.getElementById(tipe + '-tags');
  if (!container) return;
  container.querySelectorAll('.tag').forEach(t => t.remove());
  (Array.isArray(arr) ? arr : []).forEach(v => addTagItem(tipe, v));
}

function bacaTags(tipe) {
  return [...document.querySelectorAll(`#${tipe}-tags .tag`)].map(t => t.dataset.value);
}

function kumpulkanProfilLengkap() {
  const out = {};
  for (const [id, field] of Object.entries(FIELD_PROFIL_TEKS)) out[field] = getVal(id);
  for (const [tipe, field] of Object.entries(FIELD_PROFIL_TAG)) out[field] = bacaTags(tipe);
  return out;
}

// ==================== SUMBER KNOWLEDGE BASE ====================
function ksCurrentType() {
  return document.querySelector('#ks-type-group input:checked')?.value || 'manual';
}

function onKsTypeChange(type) {
  document.querySelectorAll('#ks-type-group .radio-btn').forEach(el => {
    el.classList.toggle('selected', el.querySelector('input')?.value === type);
  });
  document.getElementById('ks-ba-fields').style.display = type === 'business_asset' ? '' : 'none';
  applyKnowledgeReadonly(type === 'business_asset');
  if (type === 'business_asset') ksMuatOtomatisKalauPerlu();
  markChanged();
}

// Di mode business_asset seluruh field knowledge base dikunci: isinya hasil
// baca live, dan menyimpan hasil bacaan itu balik ke config akan membekukannya.
function applyKnowledgeReadonly(readonly) {
  const page = document.getElementById('page-knowledge');
  if (!page) return;
  page.querySelectorAll('input, textarea, select, button').forEach(el => {
    if (el.closest('#ks-type-group') || el.closest('#ks-ba-fields')) return;
    // Tombol di save-bar diurus terpisah di bawah — jangan ikut dimatikan di sini.
    if (el.closest('.save-bar')) return;
    if (el.tagName === 'BUTTON') el.disabled = readonly;
    else if (el.type === 'radio' || el.type === 'checkbox') el.disabled = readonly;
    else { el.readOnly = readonly; el.disabled = readonly; }
  });
  // Field kosong yang terkunci: sembunyikan placeholder-nya. Contoh isian pada
  // kolom yang tidak bisa diketik membuat user mengira ia boleh mengisinya.
  page.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    if (el.closest('#ks-type-group') || el.closest('#ks-ba-fields')) return;
    if (readonly) {
      if (el.dataset.phAsli === undefined) el.dataset.phAsli = el.placeholder;
      el.placeholder = el.value ? '' : '—';
    } else if (el.dataset.phAsli !== undefined) {
      el.placeholder = el.dataset.phAsli;
    }
  });
  // Kotak tag: input pengetiknya disembunyikan, bukan sekadar dimatikan.
  page.querySelectorAll('.tag-container').forEach(box => {
    const inp = box.querySelector('.tag-input');
    if (inp) inp.style.display = readonly ? 'none' : '';
    if (readonly && !box.querySelector('.tag') && !box.querySelector('.ks-kosong')) {
      const span = document.createElement('span');
      span.className = 'ks-kosong';
      span.style.cssText = 'color:var(--text-secondary); font-size:13px;';
      span.textContent = '—';
      box.appendChild(span);
    }
    if (!readonly) box.querySelectorAll('.ks-kosong').forEach(x => x.remove());
  });

  const scrapeCard = document.getElementById('scrape-url')?.closest('.card');
  if (scrapeCard) scrapeCard.style.display = readonly ? 'none' : '';
  // Tombol Save TETAP hidup: ia satu-satunya jalan menyimpan knowledge_source
  // (pilihan mode dan bisnis). Yang dikunci cuma field knowledge base-nya.
  // Server sudah membuang knowledge_base kiriman browser di mode ini, jadi
  // menekan Save aman — labelnya diganti supaya jelas apa yang tersimpan.
  const saveBtn = document.querySelector('#page-knowledge .save-bar .btn-primary');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = readonly ? '💾 Simpan Sumber' : '💾 Save Knowledge Base';
  }
}

async function ksLoadBusinesses(selectId) {
  const root = getVal('ks-root');
  const sel = document.getElementById('ks-business');
  const status = document.getElementById('ks-status');
  if (!root) {
    status.innerHTML = '<span style="color:var(--danger)">Isi folder root dulu.</span>';
    return { gagal: true };
  }
  try {
    const r = await (await fetch('/api/business-assets?root=' + encodeURIComponent(root))).json();
    sel.innerHTML = (r.businesses || []).map(b =>
      `<option value="${escHtml(b.id)}">${escHtml(b.name)} (${b.productCount} produk)</option>`).join('');
    if (selectId) sel.value = selectId;
    status.innerHTML = r.error
      ? `<span style="color:var(--danger)">${escHtml(r.error)}</span>`
      : `<span style="color:var(--text-secondary)">${r.businesses.length} bisnis ditemukan.</span>`;
    return { gagal: !!r.error };
  } catch (e) {
    status.innerHTML = `<span style="color:var(--danger)">${escHtml(e.message)}</span>`;
    return { gagal: true };
  }
}

function ksOnBusinessChange() { markChanged(); }

// Radio dipindah ke Business Asset tapi daftar belum dimuat: dropdown kosong,
// sehingga Save akan menyimpan business_id kosong dan tenant langsung error.
// Muat otomatis kalau root-nya sudah terisi, supaya user tidak perlu tahu bahwa
// tombol Muat itu wajib ditekan.
async function ksMuatOtomatisKalauPerlu() {
  const sel = document.getElementById('ks-business');
  if (!sel || sel.options.length || !getVal('ks-root')) return;
  await ksLoadBusinesses();
}

// Dipanggil dari populateForm(): pasang keadaan UI dari config yang dimuat.
function populateKnowledgeSource(c) {
  const type = c.knowledge_source?.type === 'business_asset' ? 'business_asset' : 'manual';
  const radio = document.querySelector(`#ks-type-group input[value="${type}"]`);
  if (radio) radio.checked = true;
  setVal('ks-root', c.knowledge_source?.business_asset?.root || '');
  onKsTypeChange(type);

  const status = document.getElementById('ks-status');
  if (type === 'business_asset') {
    // ksLoadBusinesses async dan ikut menulis ks-status. Tunggu ia selesai dulu,
    // kalau tidak pesan "2 bisnis ditemukan" mendarat belakangan dan menimpa
    // ringkasan "Terbaca: N produk" yang justru dicari user.
    ksLoadBusinesses(c.knowledge_source?.business_asset?.business_id).then((hasil) => {
      // Kalau pemuatan daftar bisnis sendiri yang gagal, biarkan pesannya berdiri.
      // Menimpanya dengan ringkasan dari config berarti menyembunyikan kegagalan
      // yang baru saja terjadi di balik data yang belum tentu masih berlaku.
      if (hasil && hasil.gagal) return;
      tulisStatusKnowledge(c, status);
    });
  }
}

// Ringkasan hasil resolusi knowledge base — sumber kebenarannya _knowledge dari server.
function tulisStatusKnowledge(c, status) {
  if (!status) return;
  if (c._knowledge?.error) {
    status.innerHTML = `<span style="color:var(--danger)">⚠️ ${escHtml(c._knowledge.error)}</span>`;
    return;
  }
  const kb = c.knowledge_base || {};
  status.innerHTML = `<span style="color:var(--success, green)">✅ Terbaca: ` +
    `${(kb.products || []).length} produk · ${(kb.internal_links || []).length} internal link · ` +
    `tone ${escHtml(kb.tone || '')}</span>`;
}

// Bagian knowledge_source yang ikut dikirim saat Save.
function collectKnowledgeSource() {
  const type = ksCurrentType();
  if (type !== 'business_asset') return { type: 'manual' };
  return {
    type: 'business_asset',
    business_asset: {
      root: getVal('ks-root'),
      business_id: document.getElementById('ks-business')?.value || ''
    }
  };
}
