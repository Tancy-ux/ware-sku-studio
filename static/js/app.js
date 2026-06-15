// ── STATE ────────────────────────────────────────────────────────────────────
let bom = [];

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initNavLinks();
  loadAllOptions();
  loadStats();
  loadComponents();
  loadSKUPicker();
  checkZoho();
  showPage('individual');
  document.getElementById('bom-unit').addEventListener('change', toggleReelSizeField);
});

// ── SIDEBAR ──────────────────────────────────────────────────────────────────
function initSidebar() {
  document.querySelectorAll('.sidebar-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const groupId = header.dataset.group;
      const items = document.getElementById('group-' + groupId);
      header.classList.toggle('collapsed');
      items.classList.toggle('collapsed');
    });
  });

  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      showPage(item.dataset.page);
    });
  });
}

function initNavLinks() {
  const navMap = {
    'generator': 'individual',
    'archive':   'archive-ind',
    'zoho':      'zoho-status',
    'settings':  'zoho-setup'
  };
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const section = link.dataset.section;
      const pageId = navMap[section];
      if (!pageId) return;
      // Update nav active state
      document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      // Update sidebar active state
      document.querySelectorAll('.sidebar-item').forEach(i => {
        i.classList.toggle('active', i.dataset.page === pageId);
      });
      showPage(pageId);
    });
  });
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  // Trigger data loads per page
  if (pageId === 'assembly') loadSKUPicker();
  if (pageId === 'archive-ind') loadSKUs();
  if (pageId === 'archive-asm') loadAssemblies();
  if (pageId === 'components') loadComponents();
  if (pageId === 'options') loadAllOptPages();
  if (pageId === 'zoho-status') checkZohoStatus();
  if (pageId === 'zoho-setup') loadZohoConfig();
}

// ── OPTIONS ───────────────────────────────────────────────────────────────────
async function loadOptions(type, selectId) {
  const res = await fetch(`/api/options/${type}`);
  const opts = await res.json();
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = opts.map(o => `<option value="${o.code}">${o.code} — ${o.name}</option>`).join('');
  if (prev && opts.find(o => o.code === prev)) sel.value = prev;
  return opts;
}

async function loadAllOptions() {
  await loadOptions('material', 'ind-mat');
  await loadOptions('typology', 'ind-typ');
  await loadOptions('category', 'asm-cat');
  await loadOptions('design', 'asm-des');
  await refreshNextNumber();
  updateIndPreview();
  updateAsmPreview();
}

async function addOption(type, selectId) {
  const codeInput = document.getElementById(`new-${type}-code`);
  const nameInput = document.getElementById(`new-${type}-name`);
  const code = codeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  if (!code || !name) return;

  const res = await fetch(`/api/options/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name })
  });
  const data = await res.json();
  if (data.success) {
    codeInput.value = '';
    nameInput.value = '';
    await loadOptions(type, selectId);
    updateIndPreview();
    updateAsmPreview();
  } else {
    alert(data.error || 'Error adding option');
  }
}

async function addOptionFromOpts(type) {
  const codeInput = document.getElementById(`opts-new-${type}-code`);
  const nameInput = document.getElementById(`opts-new-${type}-name`);
  const code = codeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  if (!code || !name) return;

  const res = await fetch(`/api/options/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name })
  });
  const data = await res.json();
  if (data.success) {
    codeInput.value = '';
    nameInput.value = '';
    await loadOptPage(type);
    await loadAllOptions();
  } else {
    alert(data.error || 'Error adding option');
  }
}

async function deleteOption(type, code) {
  if (!confirm(`Remove ${code}?`)) return;
  await fetch(`/api/options/${type}/${code}`, { method: 'DELETE' });
  await loadOptPage(type);
  await loadAllOptions();
}

async function loadOptPage(type) {
  const res = await fetch(`/api/options/${type}`);
  const opts = await res.json();
  const el = document.getElementById(`opts-${type}`);
  if (!el) return;
  el.innerHTML = opts.length ? opts.map(o => `
    <div class="opt-row">
      <span class="opt-code">${o.code}</span>
      <span class="opt-name">${o.name}</span>
      <button class="opt-rm" onclick="deleteOption('${type}','${o.code}')">✕</button>
    </div>`).join('') : '<div class="empty-state">None yet</div>';
}

function loadAllOptPages() {
  ['material','color','typology','category','variant','design'].forEach(loadOptPage);
}

// ── SKU PREVIEW ───────────────────────────────────────────────────────────────
function getSelectedText(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return { code: '???', name: '' };
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return { code: '???', name: '' };
  const parts = opt.text.split(' — ');
  return { code: parts[0] || '???', name: parts[1] || '' };
}

function updateIndPreview() {
  const mat = getSelectedText('ind-mat');
  const typ = getSelectedText('ind-typ');
  const num = String(parseInt(document.getElementById('ind-num')?.value) || 1).padStart(3, '0');

  setText('prev-mat', mat.code);
  setText('prev-typ', typ.code);
  setText('prev-num', num);

  // SKU identity = Material + Typology + Number. Colour is decided per order, never in the code.
  const sku = mat.code + typ.code + num;
  setText('ind-sku-full', sku);
}

// When typology changes, ask the server for the next number in that typology's sequence.
async function onTypologyChange() {
  await refreshNextNumber();
  updateIndPreview();
}

// Fetch + display the auto-assigned number for the currently selected typology.
async function refreshNextNumber() {
  const typ = getSelectedText('ind-typ');
  const numField = document.getElementById('ind-num');
  if (!typ.code) { if (numField) numField.value = 1; return; }
  try {
    const res = await fetch('/api/next-number?typology_code=' + encodeURIComponent(typ.code));
    const data = await res.json();
    if (numField) numField.value = data.next_number || 1;
  } catch {
    if (numField) numField.value = 1;
  }
  updateIndPreview();
}

function updateAsmPreview() {
  const cat = getSelectedText('asm-cat');
  const des = getSelectedText('asm-des');
  const seq = String(parseInt(document.getElementById('asm-seq')?.value) || 1).padStart(3, '0');

  setText('prev-cat', cat.code);
  setText('prev-des', des.code);
  setText('prev-seq', seq);

  // Variant/colour is not part of the assembly SKU. Identity = Category + Design + Seq.
  const sku = `${cat.code}-${des.code}-${seq}`;
  setText('asm-sku-full', sku);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── STATS ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  const res = await fetch('/api/stats');
  const s = await res.json();
  setText('stat-total', s.total_skus);
  setText('stat-asm', s.total_assemblies);
  setText('stat-synced', s.synced_today);
  setText('stat-pending', s.pending_sync);
}

// ── ZOHO STATUS ───────────────────────────────────────────────────────────────
async function checkZoho() {
  try {
    const res = await fetch('/api/zoho/test');
    const data = await res.json();
    const dot = document.querySelector('#sync-badge .sync-dot');
    const label = document.getElementById('sync-label');
    if (data.connected) {
      dot.classList.add('connected');
      label.textContent = 'Zoho connected';
    } else {
      dot.classList.add('disconnected');
      label.textContent = 'Zoho not connected';
    }
  } catch {
    const label = document.getElementById('sync-label');
    if (label) label.textContent = 'Zoho not configured';
  }
}

async function checkZohoStatus() {
  const el = document.getElementById('zoho-status-display');
  if (!el) return;
  el.textContent = 'Checking...';
  try {
    const res = await fetch('/api/zoho/test');
    const data = await res.json();
    if (data.connected) {
      el.innerHTML = '<span style="color:var(--olive);font-weight:600">● Connected</span> — Zoho Inventory is reachable and authenticated.';
    } else {
      el.innerHTML = `<span style="color:#BF3535;font-weight:600">● Not connected</span> — ${data.error || 'Check your credentials in Setup.'}`;
    }
  } catch {
    el.textContent = 'Could not reach server.';
  }
}

// ── SAVE INDIVIDUAL SKU ───────────────────────────────────────────────────────
async function saveSKU(pushToZoho) {
  const mat = getSelectedText('ind-mat');
  const typ = getSelectedText('ind-typ');
  const num = parseInt(document.getElementById('ind-num').value) || 1;
  const name = document.getElementById('ind-name').value.trim();
  const notes = document.getElementById('ind-notes').value.trim();

  const payload = {
    material_code: mat.code, material_name: mat.name,
    typology_code: typ.code, typology_name: typ.name,
    product_number: num, product_name: name, notes,
    push_to_zoho: pushToZoho
  };

  const res = await fetch('/api/skus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  if (data.success) {
    let msg = `SKU ${data.sku_code} saved successfully.`;
    if (data.zoho_synced) msg += ' Pushed to Zoho ✓';
    if (data.zoho_error) msg += ` (Zoho: ${data.zoho_error})`;
    showToast('ind-toast', msg, 'success');
    // Clear the name and pull the next number in this typology so it climbs automatically.
    document.getElementById('ind-name').value = '';
    document.getElementById('ind-notes').value = '';
    await refreshNextNumber();
    loadStats();
  } else {
    showToast('ind-toast', data.error || 'Error saving SKU', 'error');
  }
}

function clearIndForm() {
  document.getElementById('ind-name').value = '';
  document.getElementById('ind-notes').value = '';
  refreshNextNumber();
}

// ── BOM ───────────────────────────────────────────────────────────────────────
function toggleReelSizeField() {
  const unit = document.getElementById('bom-unit').value;
  const field = document.getElementById('reel-size-field');
  if (field) field.style.display = unit === 'reel' ? 'flex' : 'none';
}

function addBOMItem() {
  const sku = document.getElementById('bom-sku').value.trim().toUpperCase();
  const desc = document.getElementById('bom-desc').value.trim();
  const unit = document.getElementById('bom-unit').value;
  let qty = parseFloat(document.getElementById('bom-qty').value) || 1;

  if (!sku) return;

  // If unit is reel, auto-calculate consumption fraction
  if (unit === 'reel') {
    const reelSize = parseFloat(document.getElementById('bom-reel').value) || 5;
    const usageMetres = qty;
    qty = parseFloat((usageMetres / reelSize).toFixed(4));
  }

  bom.push({ sku, desc: desc || sku, qty, unit });
  document.getElementById('bom-sku').value = '';
  document.getElementById('bom-desc').value = '';
  document.getElementById('bom-qty').value = 1;
  renderBOM();
}

function pickFromLib() {
  const val = document.getElementById('lib-pick').value;
  if (!val) return;
  const parts = val.split('||');
  document.getElementById('bom-sku').value = parts[0] || '';
  document.getElementById('bom-desc').value = parts[1] || '';
  if (parts[2] === 'reel') {
    document.getElementById('bom-unit').value = 'reel';
    document.getElementById('bom-reel').value = parts[3] || 5;
    toggleReelSizeField();
  }
  document.getElementById('lib-pick').value = '';
}

// Populate the picker from your archived individual SKUs (the skus table).
async function loadSKUPicker() {
  const pick = document.getElementById('sku-pick');
  if (!pick) return;
  try {
    const res = await fetch('/api/skus');
    const skus = await res.json();
    if (!skus.length) {
      pick.innerHTML = '<option value="">— no individual SKUs yet —</option>';
      return;
    }
    pick.innerHTML = '<option value="">— select an individual SKU —</option>' +
      skus.map(s => {
        const name = (s.product_name || '').replace(/"/g, '&quot;');
        return `<option value="${s.sku_code}||${name}">${s.sku_code} — ${s.product_name || 'unnamed'}</option>`;
      }).join('');
  } catch {
    pick.innerHTML = '<option value="">— could not load SKUs —</option>';
  }
}

// Fill the BOM row from a chosen archived SKU.
function pickFromSKUs() {
  const val = document.getElementById('sku-pick').value;
  if (!val) return;
  const parts = val.split('||');
  document.getElementById('bom-sku').value = parts[0] || '';
  document.getElementById('bom-desc').value = parts[1] || '';
  document.getElementById('sku-pick').value = '';
}

function renderBOM() {
  const el = document.getElementById('bom-list');
  if (!bom.length) {
    el.innerHTML = '<div class="empty-state">No components added — assembly will push as an empty composite shell</div>';
    return;
  }
  el.innerHTML = `<table class="bom-table">
    <thead><tr>
      <th>SKU</th><th>Description</th><th style="text-align:right">Qty in Zoho</th><th></th>
    </tr></thead>
    <tbody>${bom.map((c, i) => `
      <tr>
        <td><span class="sku-pill">${c.sku}</span></td>
        <td style="color:var(--grey)">${c.desc}</td>
        <td style="text-align:right;font-family:monospace;font-weight:600;color:var(--terracotta)">${c.qty}</td>
        <td style="text-align:right">
          <button class="btn btn-sm btn-danger" onclick="removeBOM(${i})">Remove</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}

function removeBOM(i) {
  bom.splice(i, 1);
  renderBOM();
}

// ── SAVE ASSEMBLY ─────────────────────────────────────────────────────────────
async function saveAssembly(pushToZoho) {
  // BOM is optional: you can create the assembly SKU as a composite shell and
  // link its component items directly in Zoho afterwards.
  const cat = getSelectedText('asm-cat');
  const des = getSelectedText('asm-des');
  const seq = parseInt(document.getElementById('asm-seq').value) || 1;
  const name = document.getElementById('asm-name').value.trim();
  const notes = document.getElementById('asm-notes').value.trim();

  const payload = {
    category_code: cat.code, category_name: cat.name,
    design_code: des.code, design_name: des.name,
    seq_number: seq, product_name: name, notes,
    bom: bom, push_to_zoho: pushToZoho
  };

  const res = await fetch('/api/assemblies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  if (data.success) {
    let msg = `Assembly ${data.sku_code} saved successfully.`;
    if (data.zoho_synced) msg += ' Pushed to Zoho ✓';
    if (data.zoho_error) msg += ` (Zoho: ${data.zoho_error})`;
    showToast('asm-toast', msg, 'success');
    bom = [];
    renderBOM();
    loadStats();
  } else {
    showToast('asm-toast', data.error || 'Error saving assembly', 'error');
  }
}

function clearAsmForm() {
  bom = [];
  renderBOM();
  document.getElementById('asm-seq').value = 1;
  document.getElementById('asm-name').value = '';
  document.getElementById('asm-notes').value = '';
  updateAsmPreview();
}

// ── LOAD SKU ARCHIVE ──────────────────────────────────────────────────────────
async function loadSKUs() {
  const search = document.getElementById('search-ind')?.value || '';
  const res = await fetch(`/api/skus?search=${encodeURIComponent(search)}`);
  const skus = await res.json();
  const tbody = document.getElementById('skus-tbody');
  if (!tbody) return;
  if (!skus.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No SKUs found</td></tr>';
    return;
  }
  tbody.innerHTML = skus.map(s => {
    const safeName = (s.product_name || '').replace(/"/g, '&quot;');
    return `
    <tr id="sku-row-${s.id}">
      <td><span class="sku-pill">${s.sku_code}</span></td>
      <td class="sku-name-cell" id="sku-name-${s.id}">
        <span class="sku-name-text">${s.product_name || '—'}</span>
      </td>
      <td>${s.material_code} <span style="color:var(--grey);font-size:11px">— ${s.material_name}</span></td>
      <td>${s.typology_code} <span style="color:var(--grey);font-size:11px">— ${s.typology_name}</span></td>
      <td><span class="synced-badge ${s.zoho_synced ? 'yes' : 'no'}">${s.zoho_synced ? 'Synced' : 'Pending'}</span></td>
      <td style="color:var(--grey);font-size:11px">${s.created_at ? s.created_at.split(' ')[0] : '—'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-olive" onclick="editSKUName(${s.id}, &quot;${safeName}&quot;)">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSKU(${s.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

function editSKUName(id, currentName) {
  const cell = document.getElementById('sku-name-' + id);
  if (!cell) return;
  cell.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center">
      <input type="text" id="sku-name-input-${id}" value="${(currentName||'').replace(/"/g,'&quot;')}"
             style="flex:1;min-width:120px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px" />
      <button class="btn btn-sm btn-primary" onclick="saveSKUName(${id})">Save</button>
      <button class="btn btn-sm btn-ghost" onclick="loadSKUs()">Cancel</button>
    </div>`;
  const input = document.getElementById('sku-name-input-' + id);
  if (input) { input.focus(); input.select(); }
}

async function saveSKUName(id) {
  const input = document.getElementById('sku-name-input-' + id);
  if (!input) return;
  const newName = input.value.trim();
  const res = await fetch(`/api/skus/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_name: newName })
  });
  const data = await res.json();
  if (data.success) {
    loadSKUs();
  } else {
    alert(data.error || 'Could not update name');
  }
}

async function deleteSKU(id) {
  if (!confirm('Delete this SKU?')) return;
  await fetch(`/api/skus/${id}`, { method: 'DELETE' });
  loadSKUs();
  loadStats();
}

// ── LOAD ASSEMBLY ARCHIVE ─────────────────────────────────────────────────────
async function loadAssemblies() {
  const search = document.getElementById('search-asm')?.value || '';
  const res = await fetch(`/api/assemblies?search=${encodeURIComponent(search)}`);
  const asms = await res.json();
  const el = document.getElementById('assemblies-list');
  if (!el) return;
  if (!asms.length) {
    el.innerHTML = '<div class="empty-state" style="padding:32px 0">No assemblies saved yet</div>';
    return;
  }
  el.innerHTML = asms.map(a => `
    <div class="asm-card">
      <div class="asm-card-header">
        <div style="display:flex;align-items:center">
          <span class="asm-card-sku">${a.sku_code}</span>
          <span class="asm-card-name">${a.product_name || ''}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="synced-badge ${a.zoho_synced ? 'yes' : 'no'}">${a.zoho_synced ? 'Synced' : 'Pending'}</span>
          <button class="btn btn-sm btn-danger" onclick="deleteAssembly(${a.id})">Delete</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--grey);margin-bottom:8px">
        ${a.category_name} · ${a.design_name} · ${a.created_at ? a.created_at.split(' ')[0] : ''}
      </div>
      <div class="bom-chips">
        ${(a.bom || []).map(c => `<span class="bom-chip">${c.qty !== 1 ? c.qty + '× ' : ''}${c.sku}</span>`).join('')}
      </div>
    </div>`).join('');
}

async function deleteAssembly(id) {
  if (!confirm('Delete this assembly?')) return;
  await fetch(`/api/assemblies/${id}`, { method: 'DELETE' });
  loadAssemblies();
  loadStats();
}

// ── COMPONENT LIBRARY ─────────────────────────────────────────────────────────
async function loadComponents() {
  const res = await fetch('/api/components');
  const comps = await res.json();

  // Update lib-pick dropdown
  const pick = document.getElementById('lib-pick');
  if (pick) {
    pick.innerHTML = '<option value="">— select —</option>' +
      comps.map(c => `<option value="${c.sku}||${c.description}||${c.unit}||${c.reel_size}">${c.sku} — ${c.description}</option>`).join('');
  }

  // Update components table
  const tbody = document.getElementById('components-tbody');
  if (!tbody) return;
  if (!comps.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No components in library</td></tr>';
    return;
  }
  tbody.innerHTML = comps.map(c => `
    <tr>
      <td><span class="sku-pill">${c.sku}</span></td>
      <td>${c.description}</td>
      <td style="color:var(--grey);text-transform:capitalize">${c.category}</td>
      <td style="color:var(--grey);text-transform:capitalize">${c.unit}</td>
      <td style="color:var(--grey)">${c.unit === 'reel' ? c.reel_size + 'm' : '—'}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteComponent(${c.id})">Remove</button></td>
    </tr>`).join('');
}

function toggleReelSize() {
  const unit = document.getElementById('comp-unit').value;
  const field = document.getElementById('comp-reel-field');
  if (field) field.style.display = unit === 'reel' ? 'flex' : 'none';
}

async function addComponent() {
  const sku = document.getElementById('comp-sku').value.trim().toUpperCase();
  const desc = document.getElementById('comp-desc').value.trim();
  const cat = document.getElementById('comp-cat').value;
  const unit = document.getElementById('comp-unit').value;
  const reel = parseFloat(document.getElementById('comp-reel')?.value) || 1;
  if (!sku || !desc) return;

  const res = await fetch('/api/components', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, description: desc, category: cat, unit, reel_size: reel })
  });
  const data = await res.json();
  if (data.success) {
    document.getElementById('comp-sku').value = '';
    document.getElementById('comp-desc').value = '';
    loadComponents();
  } else {
    alert(data.error || 'Error adding component');
  }
}

async function deleteComponent(id) {
  if (!confirm('Remove from library?')) return;
  await fetch(`/api/components/${id}`, { method: 'DELETE' });
  loadComponents();
}

// ── ZOHO CONFIG ───────────────────────────────────────────────────────────────
async function loadZohoConfig() {
  const res = await fetch('/api/config');
  const cfg = await res.json();
  const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  f('cfg-client-id', cfg.zoho_client_id);
  f('cfg-org-id', cfg.zoho_org_id);
}

async function saveZohoConfig() {
  const clientId = document.getElementById('cfg-client-id').value.trim();
  const clientSecret = document.getElementById('cfg-client-secret').value.trim();
  const orgId = document.getElementById('cfg-org-id').value.trim();
  const code = document.getElementById('cfg-code').value.trim();

  // Save credentials first
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zoho_client_id: clientId, zoho_client_secret: clientSecret, zoho_org_id: orgId })
  });

  // Exchange code if provided
  if (code) {
    const res = await fetch('/api/zoho/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('cfg-code').value = '';
      showToast('zoho-toast', 'Credentials saved and Zoho authenticated successfully.', 'success');
      checkZoho();
    } else {
      showToast('zoho-toast', `Auth failed: ${data.error}`, 'error');
    }
  } else {
    showToast('zoho-toast', 'Credentials saved. Paste your grant code to complete authentication.', 'success');
  }
}

async function testZoho() {
  const res = await fetch('/api/zoho/test');
  const data = await res.json();
  if (data.connected) {
    showToast('zoho-toast', 'Zoho connection successful ✓', 'success');
  } else {
    showToast('zoho-toast', `Connection failed: ${data.error}`, 'error');
  }
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────
function copyToClipboard(elementId) {
  const text = document.getElementById(elementId)?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = orig, 1500);
}

function showToast(id, message, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, 4000);
}
