/**
 * ═══════════════════════════════════════════════════════════
 * BAARI SPORTS CENTER — admin.js
 * Admin Dashboard: Auth · Products · Categories · Orders · Kit Requests
 * Backend: Supabase
 * Flynn Technologies © 2026
 * ═══════════════════════════════════════════════════════════
 */
'use strict';

/* ── SUPABASE CONFIG (from ../js/config.js) ─────────────────── */
const { URL: SUPABASE_URL, ANON_KEY: SUPABASE_ANON_KEY } = BAARI_CONFIG.SUPABASE;
const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
if (!db) {
  document.addEventListener('DOMContentLoaded', () => {
    const err = document.getElementById('loginError');
    if (err) err.textContent = 'Failed to load backend connection. Check your internet and refresh.';
  });
}

/* ── DOM HELPERS ─────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const kes = (n) => BaariDBFormatCurrency(n);
function BaariDBFormatCurrency(amount) {
  return new Intl.NumberFormat(BAARI_CONFIG.STORE.CURRENCY_LOCALE, {
    style: 'currency', currency: BAARI_CONFIG.STORE.CURRENCY, maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}
const escapeHTML = (str) => String(str ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

let _toastTimer;
const toast = (msg, type = '') => {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show${type ? ' toast--' + type : ''}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
};

function setBtnLoading(btn, isLoading, idleLabel) {
  const label = btn.querySelector('.btn-label');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = isLoading;
  if (label && idleLabel) label.textContent = isLoading ? 'Saving…' : idleLabel;
  if (spinner) spinner.hidden = !isLoading;
}

/* ── AUTH ────────────────────────────────────────────────── */
const showApp = () => {
  $('loginScreen').style.display = 'none';
  $('adminApp').hidden = false;
  loadDashboard();
};
const showLogin = () => {
  $('loginScreen').style.display = 'flex';
  $('adminApp').hidden = true;
};

const checkSession = async () => {
  const { data: { session } } = await db.auth.getSession();
  session ? showApp() : showLogin();
};

$('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const btn = $('loginBtn');
  const errEl = $('loginError');
  errEl.textContent = '';
  setBtnLoading(btn, true);

  const { error } = await db.auth.signInWithPassword({ email, password });

  setBtnLoading(btn, false, 'Sign In');

  if (error) {
    errEl.textContent = error.message || 'Sign in failed. Check your credentials.';
    return;
  }
  showApp();
});

$('logoutBtn')?.addEventListener('click', async () => {
  await db.auth.signOut();
  showLogin();
});

/* ── TABS (desktop buttons + mobile select stay in sync) ──── */
function activateTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('admin-tab--active', t.dataset.tab === tabName));
  document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('admin-panel--active', p.id === `panel-${tabName}`));
  $('adminTabsMobile').value = tabName;

  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'products') loadProducts();
  if (tabName === 'categories') loadCategories();
  if (tabName === 'orders') loadOrders();
  if (tabName === 'kits') loadKitRequests();
}

document.querySelectorAll('.admin-tab').forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});
$('adminTabsMobile')?.addEventListener('change', (e) => activateTab(e.target.value));

/* ── DASHBOARD ───────────────────────────────────────────── */
async function loadDashboard() {
  const [ordersRes, kitsRes, productsRes] = await Promise.all([
    db.from('orders').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('kit_requests').select('id, status'),
    db.from('products').select('id, stock_count, active'),
  ]);

  const orders = ordersRes.data || [];
  const kits = kitsRes.data || [];
  const products = productsRes.data || [];

  $('statNewOrders').textContent = orders.filter((o) => o.status === 'new').length;
  $('statPendingKits').textContent = kits.filter((k) => k.status === 'new' || k.status === 'quoted').length;
  $('statLowStock').textContent = products.filter((p) => p.active && p.stock_count > 0 && p.stock_count <= 3).length;
  $('statTotalProducts').textContent = products.filter((p) => p.active).length;

  renderOrderFeed($('dashboardOrderFeed'), orders.slice(0, 8), { compact: true });
}

/* ── ORDER FEED RENDERING (shared by Dashboard + Orders tab) */
const ORDER_STATUS_OPTIONS = ['new', 'confirmed', 'dispatched', 'delivered'];

function groupOrdersByDay(orders) {
  const groups = new Map();
  orders.forEach((o) => {
    const day = new Date(o.created_at).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(o);
  });
  return groups;
}

function renderOrderFeed(container, orders, { compact = false } = {}) {
  if (!orders.length) {
    container.innerHTML = '<p class="admin-table-empty">No orders yet.</p>';
    return;
  }

  const groups = groupOrdersByDay(orders);
  let html = '';
  groups.forEach((dayOrders, day) => {
    html += `<p class="order-day-label">${escapeHTML(day)}</p>`;
    html += dayOrders.map((o) => renderOrderCard(o, compact)).join('');
  });
  container.innerHTML = html;

  container.querySelectorAll('.status-select').forEach((sel) =>
    sel.addEventListener('change', () => updateOrderStatus(sel.dataset.id, sel.value))
  );
  container.querySelectorAll('.wa-update-btn').forEach((btn) =>
    btn.addEventListener('click', () => sendOrderWhatsAppUpdate(btn.dataset.id, orders))
  );
}

function renderOrderCard(o, compact) {
  const time = new Date(o.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  const itemsSummary = (o.items || []).map((i) => `${i.name}${i.size ? ` (${i.size})` : ''} × ${i.qty}`).join(', ');

  return `
    <article class="order-card" data-id="${o.id}">
      <div class="order-card-top">
        <div>
          <p class="order-card-customer">${escapeHTML(o.customer_name)}</p>
          <p class="order-card-meta">${escapeHTML(o.phone)} · ${escapeHTML(o.location)}</p>
        </div>
        <span class="order-card-time">${time}</span>
      </div>
      <p class="order-card-items">${escapeHTML(itemsSummary)}</p>
      <div class="order-card-bottom">
        <span class="order-card-total">${kes(o.total)}</span>
        <div class="order-card-actions">
          ${!compact ? `
            <select class="status-select" data-id="${o.id}">
              ${ORDER_STATUS_OPTIONS.map((s) => `<option value="${s}"${s === o.status ? ' selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
            </select>
          ` : `<span class="admin-table-link">${escapeHTML(o.status)}</span>`}
          <button class="wa-update-btn" data-id="${o.id}" type="button">WhatsApp Update</button>
        </div>
      </div>
    </article>`;
}

async function loadOrders() {
  const feed = $('ordersFeed');
  feed.innerHTML = '<p class="admin-table-empty">Loading orders…</p>';

  const { data, error } = await db.from('orders').select('*').order('created_at', { ascending: false });

  if (error) {
    feed.innerHTML = '<p class="admin-table-empty">Failed to load orders. Make sure you\'re signed in.</p>';
    console.error(error);
    return;
  }

  renderOrderFeed(feed, data || []);
}

async function updateOrderStatus(id, status) {
  const { error } = await db.from('orders').update({ status }).eq('id', id);
  if (error) { toast('Failed to update order status.'); console.error(error); return; }
  toast('Order status updated.', 'success');
}

function sendOrderWhatsAppUpdate(orderId, orders) {
  const order = orders.find((o) => o.id === orderId);
  if (!order) return;

  const itemsSummary = (order.items || []).map((i) => `▸ ${i.name}${i.size ? ` (${i.size})` : ''} × ${i.qty}`).join('\n');
  const message = [
    `📦 *ORDER UPDATE — ${BAARI_CONFIG.STORE.NAME.toUpperCase()}*`, '',
    `Hi ${order.customer_name}, here's the status of your order:`, '',
    itemsSummary,
    `Total: ${kes(order.total)}`,
    `Status: *${order.status.toUpperCase()}*`, '',
    'Reply here if you have any questions!',
  ].join('\n');

  window.open(`https://wa.me/${order.phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

$('refreshOrdersBtn')?.addEventListener('click', loadOrders);

/* ── PRODUCTS: LOAD + RENDER ─────────────────────────────── */
let _productCategories = [];

async function loadProducts() {
  const tbody = $('productsTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="admin-table-empty">Loading products…</td></tr>';

  const [{ data, error }, cats] = await Promise.all([
    db.from('products').select('*, categories(id, slug, label)').order('created_at', { ascending: true }),
    ensureCategoriesLoaded(),
  ]);

  $('noCategoriesHint').hidden = cats.length > 0;

  if (error) {
    tbody.innerHTML = '<tr><td colspan="9" class="admin-table-empty">Failed to load products.</td></tr>';
    console.error(error);
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="admin-table-empty">No products yet. Click "Add Product" to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((p) => {
    const stock = Number(p.stock_count) || 0;
    const stockClass = stock === 0 ? 'is-zero' : stock <= 3 ? 'is-low' : '';
    return `
    <tr data-id="${p.id}">
      <td><img class="admin-table-img" src="${escapeHTML(p.image_url)}" alt="" loading="lazy" /></td>
      <td>${escapeHTML(p.name)}</td>
      <td>${escapeHTML(p.categories?.label || '—')}</td>
      <td>${kes(p.sale_price || p.price)}</td>
      <td>
        <div class="stock-stepper" data-id="${p.id}">
          <button class="stock-stepper-btn" data-stock-dec="${p.id}" aria-label="Decrease stock">&minus;</button>
          <span class="stock-stepper-val ${stockClass}" data-stock-val="${p.id}">${stock}</span>
          <button class="stock-stepper-btn" data-stock-inc="${p.id}" aria-label="Increase stock">+</button>
        </div>
      </td>
      <td>${(p.sizes || []).join(', ') || '—'}</td>
      <td>${p.is_new ? 'New' : stock === 0 ? 'Out of stock' : '—'}</td>
      <td>
        <button class="active-toggle" data-action="toggle-active" data-id="${p.id}" data-active="${p.active}" aria-label="Toggle active">
          ${p.active
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#37D67A" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'}
        </button>
      </td>
      <td>
        <div class="admin-table-actions">
          <span class="admin-table-link" data-action="edit" data-id="${p.id}">Edit</span>
          <span class="admin-table-link admin-table-link--danger" data-action="delete" data-id="${p.id}">Delete</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-action="edit"]').forEach((el) =>
    el.addEventListener('click', () => openProductModal(data.find((p) => p.id === el.dataset.id)))
  );
  tbody.querySelectorAll('[data-action="delete"]').forEach((el) =>
    el.addEventListener('click', () => deleteProduct(el.dataset.id))
  );
  tbody.querySelectorAll('[data-action="toggle-active"]').forEach((el) =>
    el.addEventListener('click', () => toggleActive(el.dataset.id, el.dataset.active === 'true'))
  );
  tbody.querySelectorAll('[data-stock-inc]').forEach((el) =>
    el.addEventListener('click', () => adjustStock(el.dataset.stockInc, +1))
  );
  tbody.querySelectorAll('[data-stock-dec]').forEach((el) =>
    el.addEventListener('click', () => adjustStock(el.dataset.stockDec, -1))
  );
}

/* ── PRODUCTS: INLINE STOCK STEPPER ──────────────────────── */
async function adjustStock(id, delta) {
  const valEl = document.querySelector(`[data-stock-val="${id}"]`);
  if (!valEl) return;

  const current = Number(valEl.textContent) || 0;
  const next = Math.max(0, current + delta);
  if (next === current) return;

  // Optimistic UI update, reverted on failure.
  valEl.textContent = next;
  valEl.classList.toggle('is-zero', next === 0);
  valEl.classList.toggle('is-low', next > 0 && next <= 3);

  const { error } = await db.from('products').update({ stock_count: next }).eq('id', id);
  if (error) {
    valEl.textContent = current;
    toast('Failed to update stock.');
    console.error(error);
  }
}

/* ── PRODUCTS: TOGGLE ACTIVE / DELETE ────────────────────── */
async function toggleActive(id, currentActive) {
  const { error } = await db.from('products').update({ active: !currentActive }).eq('id', id);
  if (error) { toast('Failed to update product.'); console.error(error); return; }
  toast(currentActive ? 'Product hidden from storefront.' : 'Product is now live.', 'success');
  loadProducts();
}

async function deleteProduct(id) {
  if (!confirm('Delete this product permanently? This cannot be undone.')) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) { toast('Failed to delete product.'); console.error(error); return; }
  toast('Product deleted.', 'success');
  loadProducts();
}

/* ── PRODUCT MODAL: OPEN / CLOSE / SAVE ──────────────────── */
async function ensureCategoriesLoaded() {
  if (_productCategories.length) return _productCategories;
  const { data } = await db.from('categories').select('*').order('sort_order', { ascending: true });
  _productCategories = data || [];
  return _productCategories;
}

function populateCategorySelect(selectedId) {
  const sel = $('productCategory');
  sel.innerHTML = _productCategories.map((c) =>
    `<option value="${c.id}"${c.id === selectedId ? ' selected' : ''}>${escapeHTML(c.label)}</option>`
  ).join('');
}

/* Size options per category slug. Boots use shoe sizing (numeric),
   clothing categories use standard letter sizing, and Accessories has
   no sizing at all — most accessories (shin guards, bottles, gloves)
   are one-size, so the field disappears rather than forcing a choice. */
const CATEGORY_SIZE_SETS = {
  boots: Array.from({ length: 45 - 38 + 1 }, (_, i) => String(38 + i)), // 38–45
  jerseys: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  training: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  'team-kits': ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  accessories: [], // no size picker shown for this category
};

let _selectedSizes = [];

function getCategorySlugById(categoryId) {
  return _productCategories.find((c) => c.id === categoryId)?.slug || null;
}

function renderSizePicker(categoryId, preselected = []) {
  const slug = getCategorySlugById(categoryId);
  const options = CATEGORY_SIZE_SETS[slug] ?? null; // null = unknown category, fall back to free choice

  _selectedSizes = preselected.slice();

  const groupEl = $('productSizesGroup');
  const pickerEl = $('productSizePicker');
  const labelEl = $('productSizesLabel');
  const hintEl = $('productSizesHint');

  if (slug === 'accessories') {
    groupEl.hidden = true;
    _selectedSizes = [];
    return;
  }
  groupEl.hidden = false;

  if (!options) {
    pickerEl.innerHTML = '<p class="size-picker-empty">Select a category to see size options.</p>';
    labelEl.textContent = 'Sizes';
    hintEl.textContent = '';
    return;
  }

  labelEl.textContent = slug === 'boots' ? 'Shoe Sizes' : 'Sizes';
  hintEl.textContent = 'Tap to select every size currently in stock.';
  pickerEl.innerHTML = options.map((size) =>
    `<button type="button" class="size-chip${_selectedSizes.includes(size) ? ' is-selected' : ''}" data-size="${escapeHTML(size)}">${escapeHTML(size)}</button>`
  ).join('');
}

$('productSizePicker')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.size-chip');
  if (!chip) return;

  const size = chip.dataset.size;
  const idx = _selectedSizes.indexOf(size);
  if (idx >= 0) {
    _selectedSizes.splice(idx, 1);
    chip.classList.remove('is-selected');
  } else {
    _selectedSizes.push(size);
    chip.classList.add('is-selected');
  }
});

$('productCategory')?.addEventListener('change', (e) => {
  // Switching category clears the previous selection — sizes rarely
  // carry over cleanly between e.g. Boots and Jerseys.
  renderSizePicker(e.target.value, []);
});

const openProductModal = async (product = null) => {
  await ensureCategoriesLoaded();

  if (!_productCategories.length) {
    toast('Add at least one category before adding products.', 'error');
    activateTab('categories');
    return;
  }

  const initialCategoryId = product?.category_id || product?.categories?.id || _productCategories[0].id;
  populateCategorySelect(initialCategoryId);

  $('productFormError').textContent = '';
  $('productModalTitle').textContent = product ? 'Edit Product' : 'Add Product';
  $('productId').value = product?.id || '';
  $('productName').value = product?.name || '';
  $('productDescription').value = product?.description || '';
  $('productPrice').value = product?.price ?? '';
  $('productSalePrice').value = product?.sale_price ?? '';
  $('productStock').value = product?.stock_count ?? 0;
  $('productImage').value = product?.image_url || '';
  $('productIsNew').checked = !!product?.is_new;
  $('productActive').checked = product ? !!product.active : true;

  renderSizePicker(initialCategoryId, product?.sizes || []);
  resetImageUploadWidget(product?.image_url || null);

  $('productModalOverlay').hidden = false;
  $('productModalOverlay').setAttribute('aria-hidden', 'false');
};
const closeProductModal = () => {
  $('productModalOverlay').hidden = true;
  $('productModalOverlay').setAttribute('aria-hidden', 'true');
};
$('newProductBtn')?.addEventListener('click', () => openProductModal());
$('goToCategoriesLink')?.addEventListener('click', () => activateTab('categories'));
$('productModalCloseBtn')?.addEventListener('click', closeProductModal);
$('productModalOverlay')?.addEventListener('click', (e) => e.target === $('productModalOverlay') && closeProductModal());

/* ── IMAGE UPLOAD WIDGET ──────────────────────────────────── */
let _imageUploadInProgress = false;

function resetImageUploadWidget(existingUrl) {
  _imageUploadInProgress = false;
  $('productImageFile').value = '';
  $('imageUploadStatus').textContent = '';
  $('imageUploadStatus').className = 'image-upload-status';
  $('imageUploadBtnLabel').textContent = existingUrl ? 'Change Photo' : 'Choose Photo';

  if (existingUrl) {
    $('imageUploadPreviewImg').src = existingUrl;
    $('imageUploadPreviewImg').hidden = false;
    $('imageUploadEmpty').hidden = true;
  } else {
    $('imageUploadPreviewImg').hidden = true;
    $('imageUploadPreviewImg').src = '';
    $('imageUploadEmpty').hidden = false;
  }
}

/** Resizes/compresses an image file in the browser before upload, capping
 *  the longest edge at 1200px and re-encoding as JPEG at 82% quality — keeps
 *  phone-camera photos (often 3-8MB) well under Supabase's free storage cap. */
function compressImage(file, maxDimension = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = (e) => { img.src = e.target.result; };

    img.onerror = () => reject(new Error('Could not load the selected image.'));
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Image compression failed.')),
        'image/jpeg',
        quality
      );
    };

    reader.readAsDataURL(file);
  });
}

$('productImageFile')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const statusEl = $('imageUploadStatus');
  const MAX_SOURCE_MB = 15;

  if (file.size > MAX_SOURCE_MB * 1024 * 1024) {
    statusEl.textContent = `File too large (max ${MAX_SOURCE_MB}MB before compression).`;
    statusEl.className = 'image-upload-status is-error';
    e.target.value = '';
    return;
  }

  _imageUploadInProgress = true;
  statusEl.textContent = 'Compressing…';
  statusEl.className = 'image-upload-status is-uploading';

  try {
    const compressedBlob = await compressImage(file);

    // Show preview immediately from the compressed blob, no need to wait on the network.
    const previewUrl = URL.createObjectURL(compressedBlob);
    $('imageUploadPreviewImg').src = previewUrl;
    $('imageUploadPreviewImg').hidden = false;
    $('imageUploadEmpty').hidden = true;

    statusEl.textContent = 'Uploading…';

    const filename = `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error: uploadError } = await db.storage
      .from(BAARI_CONFIG.SUPABASE.STORAGE_BUCKET)
      .upload(filename, compressedBlob, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = db.storage
      .from(BAARI_CONFIG.SUPABASE.STORAGE_BUCKET)
      .getPublicUrl(filename);

    $('productImage').value = urlData.publicUrl;
    statusEl.textContent = 'Photo uploaded.';
    statusEl.className = 'image-upload-status is-success';
    $('imageUploadBtnLabel').textContent = 'Change Photo';
  } catch (err) {
    console.error('[admin] Image upload failed:', err);
    statusEl.textContent = 'Upload failed. Please try again.';
    statusEl.className = 'image-upload-status is-error';
  } finally {
    _imageUploadInProgress = false;
  }
});

$('productForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('productFormError');
  errEl.textContent = '';

  if (_imageUploadInProgress) {
    errEl.textContent = 'Please wait for the photo to finish uploading.';
    return;
  }

  const id = $('productId').value || null;
  const name = $('productName').value.trim();
  const description = $('productDescription').value.trim();
  const category_id = $('productCategory').value || null;
  const price = Number($('productPrice').value);
  const sale_price = $('productSalePrice').value ? Number($('productSalePrice').value) : null;
  const stock_count = Number($('productStock').value);
  const sizes = _selectedSizes.slice();
  const image_url = $('productImage').value.trim();
  const is_new = $('productIsNew').checked;
  const active = $('productActive').checked;

  if (!name || !image_url) {
    errEl.textContent = !image_url ? 'Please upload a product photo.' : 'Please fill in all required fields correctly.';
    return;
  }
  if (Number.isNaN(price) || price < 0 || Number.isNaN(stock_count) || stock_count < 0) {
    errEl.textContent = 'Please fill in all required fields correctly.';
    return;
  }

  const btn = $('productSaveBtn');
  setBtnLoading(btn, true);

  const payload = { name, description, category_id, price, sale_price, stock_count, sizes, image_url, is_new, active };
  const { error } = id
    ? await db.from('products').update(payload).eq('id', id)
    : await db.from('products').insert(payload);

  setBtnLoading(btn, false, 'Save Product');

  if (error) {
    errEl.textContent = error.message || 'Failed to save product.';
    console.error(error);
    return;
  }

  toast(id ? 'Product updated.' : 'Product added.', 'success');
  closeProductModal();
  loadProducts();
});

/* ── CATEGORIES: LOAD + RENDER ───────────────────────────── */
async function loadCategories() {
  const tbody = $('categoriesTableBody');
  tbody.innerHTML = '<tr><td colspan="4" class="admin-table-empty">Loading categories…</td></tr>';

  const { data, error } = await db.from('categories').select('*').order('sort_order', { ascending: true });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="4" class="admin-table-empty">Failed to load categories.</td></tr>';
    console.error(error);
    return;
  }
  _productCategories = data || [];

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="admin-table-empty">No categories yet. Click "Add Category" to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((c, idx) => `
    <tr data-id="${c.id}">
      <td>
        <button class="category-order-btn" data-move-up="${c.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button class="category-order-btn" data-move-down="${c.id}" ${idx === data.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
      </td>
      <td>${escapeHTML(c.label)}</td>
      <td>${escapeHTML(c.slug)}</td>
      <td>
        <div class="admin-table-actions">
          <span class="admin-table-link" data-action="edit-cat" data-id="${c.id}">Edit</span>
          <span class="admin-table-link admin-table-link--danger" data-action="delete-cat" data-id="${c.id}">Delete</span>
        </div>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('[data-action="edit-cat"]').forEach((el) =>
    el.addEventListener('click', () => openCategoryModal(data.find((c) => c.id === el.dataset.id)))
  );
  tbody.querySelectorAll('[data-action="delete-cat"]').forEach((el) =>
    el.addEventListener('click', () => deleteCategory(el.dataset.id))
  );
  tbody.querySelectorAll('[data-move-up]').forEach((el) =>
    el.addEventListener('click', () => reorderCategory(data, el.dataset.moveUp, -1))
  );
  tbody.querySelectorAll('[data-move-down]').forEach((el) =>
    el.addEventListener('click', () => reorderCategory(data, el.dataset.moveDown, +1))
  );
}

async function reorderCategory(list, id, direction) {
  const idx = list.findIndex((c) => c.id === id);
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= list.length) return;

  const a = list[idx];
  const b = list[swapIdx];

  const [res1, res2] = await Promise.all([
    db.from('categories').update({ sort_order: b.sort_order }).eq('id', a.id),
    db.from('categories').update({ sort_order: a.sort_order }).eq('id', b.id),
  ]);

  if (res1.error || res2.error) {
    toast('Failed to reorder categories.');
    console.error(res1.error || res2.error);
    return;
  }
  loadCategories();
}

async function deleteCategory(id) {
  if (!confirm('Delete this category? Products using it will need to be reassigned.')) return;
  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) { toast('Failed to delete category. Check that no products still use it.'); console.error(error); return; }
  toast('Category deleted.', 'success');
  loadCategories();
}

const openCategoryModal = (category = null) => {
  $('categoryFormError').textContent = '';
  $('categoryModalTitle').textContent = category ? 'Edit Category' : 'Add Category';
  $('categoryId').value = category?.id || '';
  $('categoryLabel').value = category?.label || '';
  $('categorySlug').value = category?.slug || '';

  $('categoryModalOverlay').hidden = false;
  $('categoryModalOverlay').setAttribute('aria-hidden', 'false');
};
const closeCategoryModal = () => {
  $('categoryModalOverlay').hidden = true;
  $('categoryModalOverlay').setAttribute('aria-hidden', 'true');
};
$('newCategoryBtn')?.addEventListener('click', () => openCategoryModal());
$('categoryModalCloseBtn')?.addEventListener('click', closeCategoryModal);
$('categoryModalOverlay')?.addEventListener('click', (e) => e.target === $('categoryModalOverlay') && closeCategoryModal());

$('categoryForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('categoryFormError');
  errEl.textContent = '';

  const id = $('categoryId').value || null;
  const label = $('categoryLabel').value.trim();
  const slug = $('categorySlug').value.trim().toLowerCase();

  if (!label || !/^[a-z0-9-]+$/.test(slug)) {
    errEl.textContent = 'Please enter a label and a slug using only lowercase letters, numbers, and hyphens.';
    return;
  }

  const btn = $('categorySaveBtn');
  setBtnLoading(btn, true);

  let payload = { label, slug };
  if (!id) {
    const { data: existing } = await db.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    payload.sort_order = (existing?.[0]?.sort_order ?? 0) + 1;
  }

  const { error } = id
    ? await db.from('categories').update(payload).eq('id', id)
    : await db.from('categories').insert(payload);

  setBtnLoading(btn, false, 'Save Category');

  if (error) {
    errEl.textContent = error.message || 'Failed to save category. Slug may already be in use.';
    console.error(error);
    return;
  }

  toast(id ? 'Category updated.' : 'Category added.', 'success');
  closeCategoryModal();
  loadCategories();
});

/* ── KIT REQUESTS: LOAD + RENDER ─────────────────────────── */
const KIT_STATUS_OPTIONS = ['new', 'quoted', 'confirmed', 'fulfilled'];
const GARMENT_LABELS = { jersey: 'Match Jersey', 'training-tee': 'Training Tee', tracksuit: 'Tracksuit Set', shorts: 'Shorts' };
const PRINTING_LABELS = { none: 'None', 'name-number': 'Name + Number', 'full-sponsor': 'Full Sponsor Set' };

async function loadKitRequests() {
  const tbody = $('kitsTableBody');
  tbody.innerHTML = '<tr><td colspan="10" class="admin-table-empty">Loading kit requests…</td></tr>';

  const { data, error } = await db.from('kit_requests').select('*').order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="10" class="admin-table-empty">Failed to load kit requests.</td></tr>';
    console.error(error);
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="admin-table-empty">No kit requests yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((k) => {
    const date = new Date(k.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
    return `
    <tr data-id="${k.id}">
      <td>${date}</td>
      <td>${escapeHTML(k.customer_name)}</td>
      <td>${escapeHTML(k.phone)}</td>
      <td>${escapeHTML(GARMENT_LABELS[k.garment] || k.garment)}</td>
      <td>${k.quantity}</td>
      <td>${escapeHTML(PRINTING_LABELS[k.printing] || k.printing)}</td>
      <td>${k.estimated_total ? kes(k.estimated_total) : '—'}</td>
      <td>
        <input class="form-input final-price-input" type="number" min="0" step="1"
               data-id="${k.id}" value="${k.final_total ?? ''}" placeholder="Set price" style="width:110px; padding:6px 8px;">
      </td>
      <td>
        <select class="status-select" data-id="${k.id}">
          ${KIT_STATUS_OPTIONS.map((s) => `<option value="${s}"${s === k.status ? ' selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
      </td>
      <td>
        <button class="wa-update-btn" data-id="${k.id}" type="button">WhatsApp Quote</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.status-select').forEach((sel) =>
    sel.addEventListener('change', () => updateKitStatus(sel.dataset.id, sel.value))
  );
  tbody.querySelectorAll('.final-price-input').forEach((input) =>
    input.addEventListener('change', () => updateKitFinalPrice(input.dataset.id, input.value))
  );
  tbody.querySelectorAll('.wa-update-btn').forEach((btn) =>
    btn.addEventListener('click', () => sendKitWhatsAppQuote(btn.dataset.id, data))
  );
}

async function updateKitStatus(id, status) {
  const { error } = await db.from('kit_requests').update({ status }).eq('id', id);
  if (error) { toast('Failed to update status.'); console.error(error); return; }
  toast('Kit request status updated.', 'success');
}

async function updateKitFinalPrice(id, value) {
  const final_total = value ? Number(value) : null;
  const { error } = await db.from('kit_requests').update({ final_total }).eq('id', id);
  if (error) { toast('Failed to save price.'); console.error(error); return; }
  toast('Final price saved.', 'success');
}

function sendKitWhatsAppQuote(id, kits) {
  const k = kits.find((x) => x.id === id);
  if (!k) return;

  const price = k.final_total ?? k.estimated_total;
  const message = [
    `🏆 *KIT QUOTE — ${BAARI_CONFIG.STORE.NAME.toUpperCase()}*`, '',
    `Hi ${k.customer_name}, here's your custom kit quote:`, '',
    `Garment: ${GARMENT_LABELS[k.garment] || k.garment}`,
    `Quantity: ${k.quantity}`,
    `Printing: ${PRINTING_LABELS[k.printing] || k.printing}`,
    price ? `*Final Price: ${kes(price)}*` : 'We\'ll confirm pricing shortly.',
    '', 'Let us know if you\'d like to proceed!',
  ].join('\n');

  window.open(`https://wa.me/${k.phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

$('refreshKitsBtn')?.addEventListener('click', loadKitRequests);

/* ── INIT ────────────────────────────────────────────────── */
checkSession();

db.auth.onAuthStateChange((_event, session) => {
  session ? showApp() : showLogin();
});
