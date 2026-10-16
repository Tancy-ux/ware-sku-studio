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
      const section = link.dataset.section;
      if (!section) return; // external link (e.g. the ware tab) - let it navigate normally
      e.preventDefault();
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
  await refreshNextAssemblyNumber();
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

// When category changes, ask the server for the next sequence number in that category.
async function onCategoryChange() {
  await refreshNextAssemblyNumber();
  updateAsmPreview();
}

// Fetch + display the auto-assigned sequence number for the currently selected category.
async function refreshNextAssemblyNumber() {
  const cat = getSelectedText('asm-cat');
  const seqField = document.getElementById('asm-seq');
  if (!cat.code) { if (seqField) seqField.value = 1; return; }
  try {
    const res = await fetch('/api/next-assembly-number?category_code=' + encodeURIComponent(cat.code));
    const data = await res.json();
    if (seqField) seqField.value = data.next_number || 1;
  } catch {
    if (seqField) seqField.value = 1;
  }
  updateAsmPreview();
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
    // Pull the next number in this category so it climbs automatically.
    await refreshNextAssemblyNumber();
    loadStats();
  } else {
    showToast('asm-toast', data.error || 'Error saving assembly', 'error');
  }
}

function clearAsmForm() {
  bom = [];
  renderBOM();
  document.getElementById('asm-name').value = '';
  document.getElementById('asm-notes').value = '';
  refreshNextAssemblyNumber();
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
// Escape text from the database / user input before putting it into innerHTML.
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

let asmList = [];           // last loaded assemblies
let asmEdit = null;         // { id, bom, original } while a card is in edit mode
let asmSkuMap = {};         // individual SKU code -> product name, for the editor's search box
const asmOpen = new Set();  // ids of cards the user expanded
const asmClosed = new Set(); // search-opened cards the user collapsed

async function loadAssemblies() {
  const search = document.getElementById('search-asm')?.value || '';
  const res = await fetch(`/api/assemblies?search=${encodeURIComponent(search)}`);
  asmList = await res.json();
  renderAssemblies();
}

function asmSearchTerm() {
  return (document.getElementById('search-asm')?.value || '').trim().toLowerCase();
}

// True when the search term hits this component (not just the assembly's own code/name).
function asmComponentMatches(c, term) {
  return !!term && (c.sku.toLowerCase().includes(term) || (c.desc || '').toLowerCase().includes(term));
}

function asmIsOpen(a, term) {
  if (asmEdit && asmEdit.id === a.id) return true;
  if (asmOpen.has(a.id)) return true;
  // Cards whose components match the search open automatically, unless the user closed them.
  return (a.bom || []).some(c => asmComponentMatches(c, term)) && !asmClosed.has(a.id);
}

function renderAssemblies() {
  const el = document.getElementById('assemblies-list');
  if (!el) return;
  const term = asmSearchTerm();
  if (!asmList.length) {
    el.innerHTML = `<div class="empty-state" style="padding:32px 0">${term ? 'No assemblies match that search' : 'No assemblies saved yet'}</div>`;
    return;
  }
  el.innerHTML = asmList.map(a => {
    const editing = asmEdit && asmEdit.id === a.id;
    const bom = a.bom || [];
    const open = asmIsOpen(a, term);
    const count = bom.length;
    return `
    <div class="asm-card${open ? ' open' : ''}">
      <div class="asm-card-header asm-toggle" role="button" tabindex="0" aria-expanded="${open}"
           onclick="toggleAsmCard(${a.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleAsmCard(${a.id})}">
        <div style="display:flex;align-items:center">
          <span class="asm-chevron">&#9656;</span>
          <span class="asm-card-sku">${escHtml(a.sku_code)}</span>
          <span class="asm-card-name">${escHtml(a.product_name)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="asm-count">${count} component${count === 1 ? '' : 's'}</span>
          <span class="synced-badge ${a.zoho_synced ? 'yes' : 'no'}">${a.zoho_synced ? 'Synced' : 'Pending'}</span>
        </div>
      </div>
      ${open ? `
      <div class="asm-card-meta">
        <span>${escHtml(a.category_name)} · ${escHtml(a.design_name)} · ${a.created_at ? a.created_at.split(' ')[0] : ''}</span>
        ${editing ? '' : `<span style="display:flex;gap:8px">
          <button class="icon-btn" title="Edit components" aria-label="Edit components" onclick="startAsmEdit(${a.id})">${ICON_EDIT}</button>
          <button class="icon-btn danger" title="Delete assembly" aria-label="Delete assembly" onclick="deleteAssembly(${a.id})">${ICON_DELETE}</button>
        </span>`}
      </div>
      ${editing ? renderAsmEditor(a) : renderAsmBOM(bom, term)}` : ''}
    </div>`;
  }).join('');
}

function toggleAsmCard(id) {
  if (asmEdit && asmEdit.id === id) return; // keep the editor open until saved/cancelled
  const a = asmList.find(x => x.id === id);
  if (!a) return;
  if (asmIsOpen(a, asmSearchTerm())) {
    asmOpen.delete(id);
    asmClosed.add(id);
  } else {
    asmOpen.add(id);
    asmClosed.delete(id);
  }
  renderAssemblies();
}

function renderAsmBOM(items, term) {
  if (!items.length) return '<div class="empty-state">No components — composite shell only</div>';
  return `<table class="bom-table">
    <thead><tr>
      <th>Component SKU</th><th>Description</th><th style="text-align:right">Qty</th>
    </tr></thead>
    <tbody>${items.map(c => `
      <tr${asmComponentMatches(c, term) ? ' class="bom-hit"' : ''}>
        <td><span class="sku-pill">${escHtml(c.sku)}</span></td>
        <td style="color:var(--grey)">${c.desc && c.desc !== c.sku ? escHtml(c.desc) : '—'}</td>
        <td style="text-align:right;font-family:monospace;font-weight:600;color:var(--terracotta)">${c.qty}${c.unit === 'reel' ? ' reel' : ''}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

function renderAsmEditor(a) {
  const rows = asmEdit.bom.map((c, i) => `
      <tr>
        <td><span class="sku-pill">${escHtml(c.sku)}</span></td>
        <td style="color:var(--grey)">${c.desc && c.desc !== c.sku ? escHtml(c.desc) : '—'}</td>
        <td style="text-align:right">
          <input type="number" min="0.01" step="0.01" value="${c.qty}" style="width:80px;text-align:right"
                 oninput="setAsmEditQty(${i}, this.value)" />
        </td>
        <td style="text-align:right;width:44px">
          <button class="icon-btn danger" title="Remove component" aria-label="Remove component" onclick="removeAsmEditItem(${i})">${ICON_DELETE}</button>
        </td>
      </tr>`).join('');
  const options = Object.entries(asmSkuMap)
    .map(([sku, name]) => `<option value="${escHtml(sku)}">${escHtml(name || 'unnamed')}</option>`).join('');
  return `<div class="asm-edit">
    ${asmEdit.bom.length ? `<table class="bom-table">
      <thead><tr>
        <th>Component SKU</th><th>Description</th><th style="text-align:right">Qty</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody></table>`
    : '<div class="empty-state">No components yet — add some below</div>'}
    <div class="asm-edit-add">
      <input type="text" id="asm-edit-sku" list="asm-edit-skus" placeholder="Search SKU or name…"
             style="font-family:monospace;width:260px" autocomplete="off"
             oninput="onAsmEditSkuInput(this)" onkeydown="if(event.key==='Enter')addAsmEditItem()" />
      <datalist id="asm-edit-skus">${options}</datalist>
      <input type="text" id="asm-edit-desc" placeholder="Description" style="flex:1;min-width:180px"
             onkeydown="if(event.key==='Enter')addAsmEditItem()" />
      <input type="number" id="asm-edit-qty" value="1" min="0.01" step="0.01" style="width:80px"
             onkeydown="if(event.key==='Enter')addAsmEditItem()" />
      <button class="btn btn-sm" onclick="addAsmEditItem()">Add</button>
    </div>
    ${a.zoho_synced ? `<div style="font-size:11px;color:var(--grey);margin-top:10px">
      This assembly is already in Zoho — changes here are saved locally only; update the composite item in Zoho too.</div>` : ''}
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
      <button class="btn btn-sm" onclick="cancelAsmEdit()">Cancel</button>
      <button class="btn btn-sm btn-primary" onclick="saveAsmEdit()">Save components</button>
    </div>
  </div>`;
}

function asmEditDirty() {
  return !!asmEdit && JSON.stringify(asmEdit.bom) !== asmEdit.original;
}

async function startAsmEdit(id) {
  if (asmEditDirty() && asmEdit.id !== id) {
    const other = asmList.find(x => x.id === asmEdit.id);
    const ok = await confirmModal(
      'Discard unsaved changes?',
      `You have unsaved component changes on <b>${other ? escHtml(other.sku_code) : 'another assembly'}</b>. Opening this one will discard them.`);
    if (!ok) return;
  }
  const a = asmList.find(x => x.id === id);
  if (!a) return;
  const bom = (a.bom || []).map(c => ({ ...c }));
  asmEdit = { id, bom, original: JSON.stringify(bom) };
  asmOpen.add(id);
  asmClosed.delete(id);
  try {
    const skus = await (await fetch('/api/skus')).json();
    asmSkuMap = Object.fromEntries(skus.map(s => [s.sku_code, s.product_name || '']));
  } catch {
    asmSkuMap = {};
  }
  renderAssemblies();
  document.getElementById('asm-edit-sku')?.focus();
}

// When the typed/picked value is a known SKU, fill in its description.
function onAsmEditSkuInput(input) {
  input.value = input.value.toUpperCase();
  const name = asmSkuMap[input.value.trim()];
  if (name !== undefined) document.getElementById('asm-edit-desc').value = name;
}

function addAsmEditItem() {
  const sku = document.getElementById('asm-edit-sku').value.trim().toUpperCase();
  if (!sku) return;
  const desc = document.getElementById('asm-edit-desc').value.trim();
  const qty = parseFloat(document.getElementById('asm-edit-qty').value) || 1;
  const existing = asmEdit.bom.find(c => c.sku === sku);
  if (existing) existing.qty = parseFloat((existing.qty + qty).toFixed(4));
  else asmEdit.bom.push({ sku, desc: desc || sku, qty, unit: 'unit' });
  renderAssemblies();
  document.getElementById('asm-edit-sku')?.focus();
}

function setAsmEditQty(i, val) {
  const qty = parseFloat(val);
  if (qty > 0) asmEdit.bom[i].qty = qty;
}

function removeAsmEditItem(i) {
  asmEdit.bom.splice(i, 1);
  renderAssemblies();
}

function cancelAsmEdit() {
  asmEdit = null;
  renderAssemblies();
}

let asmSaving = false;

async function saveAsmEdit() {
  if (!asmEdit || asmSaving) return; // ignore double-clicks
  asmSaving = true;
  const { id, bom, original } = asmEdit;
  const a = asmList.find(x => x.id === id);
  try {
    const res = await fetch(`/api/assemblies/${id}/bom`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bom, original_bom: JSON.parse(original) })
    });
    const data = await res.json();
    if (!data.success) {
      // Edits stay on screen so nothing typed is lost.
      showToast('asm-archive-toast', data.error || 'Could not save components', 'error');
      return;
    }
    asmEdit = null;
    const count = data.bom.length;
    showToast('asm-archive-toast',
      `${a ? a.sku_code : 'Assembly'} saved — ${count} component${count === 1 ? '' : 's'}.`, 'success');
    loadAssemblies();
  } catch {
    showToast('asm-archive-toast', 'Could not reach the server — your edits are still here, try saving again.', 'error');
  } finally {
    asmSaving = false;
  }
}

// Warn before closing/reloading the tab with unsaved component edits.
window.addEventListener('beforeunload', e => {
  if (asmEditDirty()) { e.preventDefault(); e.returnValue = ''; }
});

async function deleteAssembly(id) {
  const a = asmList.find(x => x.id === id);
  if (!a) return;
  const ok = await confirmModal(
    'Delete this assembly?',
    `<b>${escHtml(a.sku_code)}</b>${a.product_name ? ' — ' + escHtml(a.product_name) : ''}<br>
     This permanently removes it from the archive. This can't be undone.`,
    true);
  if (!ok) return;
  try {
    const res = await fetch(`/api/assemblies/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
  } catch {
    showToast('asm-archive-toast', `Could not delete ${a.sku_code} — nothing was removed.`, 'error');
    return;
  }
  asmOpen.delete(id);
  if (asmEdit && asmEdit.id === id) asmEdit = null;
  showToast('asm-archive-toast', `${a.sku_code} deleted.`, 'success');
  loadAssemblies();
  loadStats();
}

// ── CONFIRM MODAL ─────────────────────────────────────────────────────────────
// Yes / No dialog. Resolves true on Yes, false on No / Escape / backdrop click.
// Focus starts on No so a stray Enter never confirms.
function confirmModal(title, message, danger = false) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-title">${title}</div>
        <div class="modal-body">${message}</div>
        <div class="modal-actions">
          <button class="btn btn-sm" data-act="no">No</button>
          <button class="btn btn-sm ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-act="yes">Yes</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = result => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      resolve(result);
    };
    const onKey = e => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(false); });
    wrap.querySelector('[data-act="no"]').onclick = () => close(false);
    wrap.querySelector('[data-act="yes"]').onclick = () => close(true);
    wrap.querySelector('[data-act="no"]').focus();
  });
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
