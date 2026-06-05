/* ═══════════════════════════════════════════════════════
   BAARI SPORTS CENTER — Digital Shelves
   script.js  ·  Dynamic Catalogue + Cart + WhatsApp
   Flynn Technologies
═══════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────── */
const WA_NUMBER   = '254702453813';
const STORAGE_KEY = 'bsc_cart_v2';

/** Map category slug → JSON path + human label */
const CATEGORIES = {
  boots:      { file: 'data/boots.json',      label: 'Boots' },
  jerseys:    { file: 'data/jerseys.json',     label: 'Jerseys' },
  equipments: { file: 'data/equipments.json', label: 'Training Gear' },
};


/* ─────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────── */
let cart          = loadCart();
let activeCategory = 'boots';
let isLoading     = false;
let cartOpen      = false;


/* ─────────────────────────────────────────────────────
   PERSISTENCE
───────────────────────────────────────────────────── */
function loadCart() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}


/* ─────────────────────────────────────────────────────
   UTILITY — safe HTML escape (prevents XSS)
───────────────────────────────────────────────────── */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Parse "Ksh 12,500" → 12500 (number) */
function parsePrice(priceStr) {
  return parseInt(String(priceStr).replace(/[^0-9]/g, ''), 10) || 0;
}

/** Format number → "Ksh 12,500" */
function formatPrice(amount) {
  return `Ksh ${amount.toLocaleString('en-KE')}`;
}


/* ═══════════════════════════════════════════════════════
   DATA FETCHING
═══════════════════════════════════════════════════════ */

/**
 * Fetch products for a category from the local JSON file.
 * Returns an array of product objects, or [] on error.
 */
async function fetchProducts(category) {
  const { file } = CATEGORIES[category];
  try {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[BSC] Failed to load ${file}:`, err);
    return null; // null = network/parse error vs [] = genuinely empty
  }
}


/* ═══════════════════════════════════════════════════════
   CATEGORY SWITCHING
═══════════════════════════════════════════════════════ */

function initCategoryTabs() {
  const pills = document.querySelectorAll('.cat-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      const cat = pill.dataset.category;
      if (cat === activeCategory || isLoading) return;
      switchCategory(cat);
    });
  });

  // Set indicator on first paint
  requestAnimationFrame(() => positionIndicator(
    document.querySelector('.cat-pill--active')
  ));
}

function switchCategory(category) {
  if (!CATEGORIES[category]) return;
  activeCategory = category;

  // Update pill states
  document.querySelectorAll('.cat-pill').forEach(p => {
    const isActive = p.dataset.category === category;
    p.classList.toggle('cat-pill--active', isActive);
    p.setAttribute('aria-selected', String(isActive));
  });

  // Move sliding indicator
  const activepill = document.querySelector('.cat-pill--active');
  positionIndicator(activepill);

  loadCategory(category);
}

function positionIndicator(pill) {
  if (!pill) return;
  const bar = document.getElementById('catIndicator');
  if (!bar) return;
  bar.style.left  = `${pill.offsetLeft}px`;
  bar.style.width = `${pill.offsetWidth}px`;
}


/* ═══════════════════════════════════════════════════════
   RENDER PIPELINE
═══════════════════════════════════════════════════════ */

async function loadCategory(category) {
  if (isLoading) return;
  isLoading = true;

  const grid        = document.getElementById('productGrid');
  const skeleton    = document.getElementById('skeletonGrid');
  const emptyState  = document.getElementById('emptyState');
  const statusText  = document.getElementById('statusText');
  const catLabel    = CATEGORIES[category]?.label ?? category;

  // Show skeleton, hide grid + empty
  grid.innerHTML = '';
  grid.classList.add('hidden');
  emptyState.classList.add('hidden');
  skeleton.classList.remove('hidden');
  statusText.textContent = `Loading ${catLabel}…`;

  const products = await fetchProducts(category);
  isLoading = false;

  // Hide skeleton
  skeleton.classList.add('hidden');

  if (products === null) {
    // Network/parse error
    statusText.textContent = `⚠ Could not load ${catLabel}. Check your connection.`;
    return;
  }

  if (products.length === 0) {
    emptyState.classList.remove('hidden');
    statusText.textContent = `0 ${catLabel}`;
    return;
  }

  statusText.textContent = `${products.length} ${catLabel}`;

  // Render cards
  const fragment = document.createDocumentFragment();
  products.forEach((product, i) => {
    const card = buildProductCard(product, i);
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
  grid.classList.remove('hidden');

  // Staggered reveal
  requestAnimationFrame(() => {
    grid.querySelectorAll('.product-card').forEach((card, i) => {
      card.style.animationDelay = `${i * 0.06}s`;
      card.classList.add('product-card--visible');
    });
  });

  // Wire up buy buttons
  grid.querySelectorAll('.product-card__buy').forEach(btn => {
    btn.addEventListener('click', () => {
      const product = JSON.parse(btn.closest('.product-card').dataset.product);
      openWhatsApp(product);
    });
  });

  // Wire up add-to-cart buttons
  grid.querySelectorAll('.product-card__add').forEach(btn => {
    btn.addEventListener('click', () => {
      const product = JSON.parse(btn.closest('.product-card').dataset.product);
      addToCart(product, btn);
    });
  });
}

/**
 * Build a single product card DOM element.
 * product: { id, name, price, img }
 */
function buildProductCard(product, index) {
  const article = document.createElement('article');
  article.className   = 'product-card';
  article.dataset.product = JSON.stringify(product);
  article.setAttribute('role', 'listitem');

  const fallbackEmoji = { boots: '👟', jerseys: '👕', equipments: '⚽' }[activeCategory] ?? '📦';

  article.innerHTML = `
    <div class="product-card__media">
      <div class="product-card__img-wrap">
        <img
          class="product-card__img"
          src="${esc(product.img)}"
          alt="${esc(product.name)}"
          width="400" height="500"
          loading="lazy"
          onerror="this.closest('.product-card__img-wrap').classList.add('img-error')"
        />
        <div class="product-card__img-fallback" aria-hidden="true">${fallbackEmoji}</div>
      </div>
      <div class="product-card__id-tag">#${esc(product.id)}</div>
    </div>

    <div class="product-card__info">
      <h2 class="product-card__name">${esc(product.name)}</h2>
      <div class="product-card__price">${esc(product.price)}</div>

      <div class="product-card__actions">
        <button class="product-card__add" type="button" aria-label="Add ${esc(product.name)} to kit bag">
          + Kit Bag
        </button>
        <button class="product-card__buy" type="button" aria-label="Buy ${esc(product.name)} via WhatsApp">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Buy Now
        </button>
      </div>
    </div>
  `;

  return article;
}


/* ═══════════════════════════════════════════════════════
   WHATSAPP — SINGLE PRODUCT
═══════════════════════════════════════════════════════ */

function openWhatsApp(product, overrideMsg) {
  const msg = overrideMsg ?? buildSingleProductMsg(product);
  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function buildSingleProductMsg(product) {
  return [
    `Hello! I'd like to order from *BAARI SPORTS CENTER*:\n`,
    `📦 *Product:* ${product.name}`,
    `🔖 *ID:* ${product.id}`,
    `💰 *Price:* ${product.price}`,
    ``,
    `Please confirm availability and delivery details. Thank you! 🙏`,
  ].join('\n');
}


/* ═══════════════════════════════════════════════════════
   WHATSAPP — FULL CART CHECKOUT
═══════════════════════════════════════════════════════ */

function buildCartCheckoutMsg() {
  if (cart.length === 0) return null;

  const subtotal = cart.reduce((sum, item) => sum + parsePrice(item.price) * item.qty, 0);
  const lines = [
    `Hello! I'd like to place an order from *BAARI SPORTS CENTER Digital Shelves*:\n`,
  ];

  cart.forEach(item => {
    lines.push(`• ${item.qty}× ${item.name} (ID: ${item.id}) — ${item.price}`);
  });

  lines.push('');
  lines.push(`*Total: ${formatPrice(subtotal)}*`);
  lines.push('');
  lines.push('Please confirm and share delivery details. Thank you! 🙏');

  return lines.join('\n');
}


/* ═══════════════════════════════════════════════════════
   CART LOGIC
═══════════════════════════════════════════════════════ */

function addToCart(product, btn) {
  const existing = cart.find(i => i.id === product.id);
  if (existing) {
    existing.qty += 1;
    showToast(`${product.name} qty updated ✓`);
  } else {
    cart.push({ ...product, qty: 1 });
    showToast(`Added to kit bag ✓`);
  }

  // Button feedback
  const orig = btn.textContent;
  btn.textContent = '✓ Added!';
  btn.disabled    = true;
  btn.classList.add('product-card__add--done');

  // Bump badge
  const badge = document.getElementById('cartBadge');
  if (badge) { badge.classList.add('badge-bump'); setTimeout(() => badge.classList.remove('badge-bump'), 300); }

  setTimeout(() => {
    btn.textContent = orig;
    btn.disabled    = false;
    btn.classList.remove('product-card__add--done');
  }, 1400);

  saveCart();
  renderCartUI();
}

function removeFromCart(id) {
  const idx = cart.findIndex(i => i.id === id);
  if (idx === -1) return;

  const li = document.querySelector(`.cart-list__item[data-id="${CSS.escape(id)}"]`);
  if (li) {
    li.style.transition = 'opacity 0.2s, transform 0.2s';
    li.style.opacity    = '0';
    li.style.transform  = 'translateX(40px)';
    setTimeout(() => { cart.splice(idx, 1); saveCart(); renderCartUI(); }, 220);
  } else {
    cart.splice(idx, 1);
    saveCart();
    renderCartUI();
  }
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  saveCart();
  renderCartUI();
}

function renderCartUI() {
  const badge         = document.getElementById('cartBadge');
  const mobBadge      = document.getElementById('mobCartBadge');
  const countEl       = document.getElementById('cartItemCount');
  const subtotalEl    = document.getElementById('cartSubtotal');
  const cartList      = document.getElementById('cartList');
  const cartEmpty     = document.getElementById('cartEmpty');
  const checkoutBtn   = document.getElementById('checkoutBtn');

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = cart.reduce((s, i) => s + parsePrice(i.price) * i.qty, 0);

  if (badge)      badge.textContent     = totalQty;
  if (mobBadge)   mobBadge.textContent  = totalQty;
  if (countEl)    countEl.textContent   = `${totalQty} item${totalQty !== 1 ? 's' : ''}`;
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);

  if (!cartList) return;

  if (cart.length === 0) {
    cartEmpty?.classList.remove('hidden');
    cartList.innerHTML = '';
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  cartEmpty?.classList.add('hidden');
  if (checkoutBtn) checkoutBtn.disabled = false;

  cartList.innerHTML = '';
  cart.forEach(item => {
    const li = document.createElement('li');
    li.className      = 'cart-list__item';
    li.dataset.id     = item.id;

    li.innerHTML = `
      <div class="cart-list__info">
        <div class="cart-list__name">${esc(item.name)}</div>
        <div class="cart-list__id">#${esc(item.id)}</div>
        <div class="cart-list__price">${formatPrice(parsePrice(item.price) * item.qty)}</div>
      </div>
      <div class="cart-list__controls">
        <div class="qty-row">
          <button class="qty-btn" data-id="${esc(item.id)}" data-delta="-1" aria-label="Decrease quantity">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" data-id="${esc(item.id)}" data-delta="1"  aria-label="Increase quantity">+</button>
        </div>
        <button class="remove-btn" data-id="${esc(item.id)}" aria-label="Remove item">Remove</button>
      </div>
    `;
    cartList.appendChild(li);
  });

  cartList.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => changeQty(btn.dataset.id, parseInt(btn.dataset.delta, 10)));
  });
  cartList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.id));
  });
}


/* ═══════════════════════════════════════════════════════
   CART DRAWER OPEN / CLOSE
═══════════════════════════════════════════════════════ */

function openCart() {
  const drawer  = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (!drawer) return;
  cartOpen = true;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  overlay?.classList.add('open');
  overlay?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  const drawer  = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (!drawer) return;
  cartOpen = false;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  overlay?.classList.remove('open');
  overlay?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function initCartDrawer() {
  document.getElementById('cartTrigger')?.addEventListener('click', openCart);
  document.getElementById('mobCart')?.addEventListener('click', openCart);
  document.getElementById('cartClose')?.addEventListener('click', closeCart);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cartOpen) closeCart();
  });

  document.getElementById('checkoutBtn')?.addEventListener('click', () => {
    const msg = buildCartCheckoutMsg();
    if (!msg) return;
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}


/* ═══════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════ */

let _toastTimer = null;

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `toast toast--${type} toast--show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2600);
}


/* ═══════════════════════════════════════════════════════
   NAV — SCROLL EFFECT
═══════════════════════════════════════════════════════ */

function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('nav--scrolled', window.scrollY > 24);
  }, { passive: true });
}


/* ═══════════════════════════════════════════════════════
   HAMBURGER — MOBILE MENU
═══════════════════════════════════════════════════════ */

function initHamburger() {
  const btn     = document.getElementById('hamburger');
  const overlay = document.getElementById('mobileNav');
  const close   = document.getElementById('mobileNavClose');
  if (!btn || !overlay) return;

  function open() {
    overlay.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function close2() {
    overlay.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', open);
  close?.addEventListener('click', close2);
  overlay.querySelectorAll('a').forEach(a => a.addEventListener('click', close2));
}


/* ═══════════════════════════════════════════════════════
   RESIZE — REPOSITION INDICATOR
═══════════════════════════════════════════════════════ */

function initResizeObserver() {
  const catBar = document.querySelector('.cat-bar__inner');
  if (!catBar || !window.ResizeObserver) return;

  new ResizeObserver(() => {
    const active = catBar.querySelector('.cat-pill--active');
    if (active) positionIndicator(active);
  }).observe(catBar);
}


/* ═══════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initHamburger();
  initCartDrawer();
  initCategoryTabs();
  initResizeObserver();
  renderCartUI();

  // Load default category
  loadCategory(activeCategory);
});
