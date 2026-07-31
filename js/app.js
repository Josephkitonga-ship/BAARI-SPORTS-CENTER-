/* =========================================================
   BAARI SPORTS CENTER — app.js
   Event handling, scroll-spy nav, cart state, DOM rendering.
   Orchestrates BaasClient (Pathway A) + FaasService (Pathway B).
   ========================================================= */

(() => {
  'use strict';

  const CFG = BAARI_CONFIG;

  /* ======================================================= */
  /* STATE                                                     */
  /* ======================================================= */
  const state = {
    products: [],
    currentCategory: 'all',
    currentFilter: 'all',
    currentPage: 1,
    totalPages: 1,
    isLoading: false,
    cart: loadCart(),
    wishlist: loadWishlist(),
    activeQuickViewProduct: null,
    activeQuickViewSize: null,
  };

  /* ======================================================= */
  /* DOM REFS                                                  */
  /* ======================================================= */
  const dom = {
    header: document.getElementById('siteHeader'),
    subNavTrack: document.getElementById('subNavTrack'),

    menuTrigger: document.getElementById('menuTrigger'),
    drawer: document.getElementById('mobileDrawer'),
    drawerScrim: document.getElementById('drawerScrim'),
    drawerClose: document.getElementById('drawerClose'),

    searchTrigger: document.getElementById('searchTrigger'),
    searchOverlay: document.getElementById('searchOverlay'),
    searchClose: document.getElementById('searchClose'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),

    cartTrigger: document.getElementById('cartTrigger'),
    cartBadge: document.getElementById('cartBadge'),
    cartDrawer: document.getElementById('cartDrawer'),
    cartScrim: document.getElementById('cartScrim'),
    cartClose: document.getElementById('cartClose'),
    cartItems: document.getElementById('cartItems'),
    cartEmpty: document.getElementById('cartEmpty'),
    cartFooter: document.getElementById('cartFooter'),
    cartSubtotal: document.getElementById('cartSubtotal'),
    checkoutBtn: document.getElementById('checkoutBtn'),

    filterChips: document.getElementById('filterChips'),
    productGrid: document.getElementById('productGrid'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),

    liveStripText: document.getElementById('liveStripText'),

    kitForm: document.getElementById('kitCalculatorForm'),
    kitPriceValue: document.getElementById('kitPriceValue'),
    kitSubmitBtn: document.getElementById('kitSubmitBtn'),

    quickViewScrim: document.getElementById('quickViewScrim'),
    quickViewModal: document.getElementById('quickViewModal'),
    quickViewClose: document.getElementById('quickViewClose'),
    quickViewBody: document.getElementById('quickViewBody'),

    toastContainer: document.getElementById('toastContainer'),

    fabConsult: document.getElementById('fabConsult'),
    fabTooltip: document.getElementById('fabTooltip'),
  };

  /* ======================================================= */
  /* INIT                                                       */
  /* ======================================================= */
  function init() {
    bindHeaderEvents();
    bindDrawerEvents();
    bindSearchEvents();
    bindCartEvents();
    bindFilterEvents();
    bindKitCalculatorEvents();
    bindQuickViewEvents();
    bindFabEvents();
    bindScrollSpy();
    bindSmoothScrollLinks();

    renderCartBadge();
    loadInitialProducts();
    connectLiveInventory();
    maybeShowFabTooltipOnce();
  }

  /* ======================================================= */
  /* HEADER / SCROLL SHADOW                                     */
  /* ======================================================= */
  function bindHeaderEvents() {
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      dom.header.classList.toggle('is-scrolled', y > 8);
      lastScrollY = y;
    }, { passive: true });
  }

  /* ======================================================= */
  /* MOBILE DRAWER (NAV)                                        */
  /* ======================================================= */
  function bindDrawerEvents() {
    dom.menuTrigger.addEventListener('click', () => {
      // Toggle off the trigger's own current aria-expanded state rather
      // than assuming — guarantees a single tap always flips correctly
      // even if focus/DOM state changed elsewhere.
      const isOpen = dom.menuTrigger.getAttribute('aria-expanded') === 'true';
      isOpen ? closeDrawer() : openDrawer();
    });
    dom.drawerClose.addEventListener('click', () => closeDrawer());
    dom.drawerScrim.addEventListener('click', () => closeDrawer());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.menuTrigger.getAttribute('aria-expanded') === 'true') {
        closeDrawer();
      }
    });
  }

  // openDrawer/closeDrawer are the ONLY functions permitted to touch
  // .is-open on #mobileDrawer or aria-expanded on #menuTrigger — both
  // are always set together here so the CSS X-morph (keyed off
  // aria-expanded) can never desync from the drawer's actual state.
  function openDrawer() {
    dom.drawer.classList.add('is-open');
    dom.drawer.setAttribute('aria-hidden', 'false');
    dom.menuTrigger.setAttribute('aria-expanded', 'true');
    dom.drawerScrim.hidden = false;
    requestAnimationFrame(() => dom.drawerScrim.classList.add('is-visible'));
    document.body.classList.add('drawer-is-open');
  }

  function closeDrawer() {
    dom.drawer.classList.remove('is-open');
    dom.drawer.setAttribute('aria-hidden', 'true');
    dom.menuTrigger.setAttribute('aria-expanded', 'false');
    dom.drawerScrim.classList.remove('is-visible');
    document.body.classList.remove('drawer-is-open');
    setTimeout(() => { dom.drawerScrim.hidden = true; }, 260);
  }

  /* ======================================================= */
  /* SEARCH OVERLAY                                             */
  /* ======================================================= */
  function bindSearchEvents() {
    dom.searchTrigger.addEventListener('click', openSearch);
    dom.searchClose.addEventListener('click', closeSearch);

    let debounceHandle = null;
    dom.searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceHandle);
      const query = e.target.value.trim();
      debounceHandle = setTimeout(() => runSearch(query), CFG.UX.SEARCH_DEBOUNCE_MS);
    });
  }

  function openSearch() {
    dom.searchOverlay.hidden = false;
    dom.searchTrigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-is-open');
    setTimeout(() => dom.searchInput.focus(), 50);
  }

  function closeSearch() {
    dom.searchOverlay.hidden = true;
    dom.searchTrigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-is-open');
    dom.searchInput.value = '';
    dom.searchResults.innerHTML = '';
  }

  async function runSearch(query) {
    if (!query) {
      dom.searchResults.innerHTML = '';
      return;
    }

    dom.searchResults.innerHTML = renderMiniSkeletons(4);

    const { items } = await BaasClient.fetchProducts({ query, perPage: 12 });

    if (!items.length) {
      dom.searchResults.innerHTML = `<p class="cart-empty">No products found for "${escapeHtml(query)}".</p>`;
      return;
    }

    dom.searchResults.innerHTML = `<div class="product-grid">${items.map(renderProductCard).join('')}</div>`;
  }

  /* ======================================================= */
  /* CART DRAWER                                                */
  /* ======================================================= */
  function bindCartEvents() {
    dom.cartTrigger.addEventListener('click', openCart);
    dom.cartClose.addEventListener('click', closeCart);
    dom.cartScrim.addEventListener('click', closeCart);
    dom.checkoutBtn.addEventListener('click', handleCheckout);

    // Event delegation for qty +/- and remove inside cart items
    dom.cartItems.addEventListener('click', (e) => {
      const incBtn = e.target.closest('[data-cart-inc]');
      const decBtn = e.target.closest('[data-cart-dec]');
      const removeBtn = e.target.closest('[data-cart-remove]');

      if (incBtn) updateCartQuantity(incBtn.dataset.cartInc, incBtn.dataset.size, +1);
      if (decBtn) updateCartQuantity(decBtn.dataset.cartDec, decBtn.dataset.size, -1);
      if (removeBtn) removeFromCart(removeBtn.dataset.cartRemove, removeBtn.dataset.size);
    });
  }

  function openCart() {
    dom.cartDrawer.classList.add('is-open');
    dom.cartDrawer.setAttribute('aria-hidden', 'false');
    dom.cartScrim.hidden = false;
    requestAnimationFrame(() => dom.cartScrim.classList.add('is-visible'));
    dom.cartTrigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-is-open');
    renderCart();
  }

  function closeCart() {
    dom.cartDrawer.classList.remove('is-open');
    dom.cartDrawer.setAttribute('aria-hidden', 'true');
    dom.cartScrim.classList.remove('is-visible');
    dom.cartTrigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-is-open');
    setTimeout(() => { dom.cartScrim.hidden = true; }, 260);
  }

  function addToCart(product, size = null, quantity = 1) {
    const key = cartKey(product.id, size);
    const existing = state.cart.find((i) => cartKey(i.productId, i.size) === key);

    if (existing) {
      existing.quantity += quantity;
    } else {
      state.cart.push({
        productId: product.id,
        name: product.name,
        price: product.salePrice ?? product.price,
        imageUrl: product.imageUrl,
        size,
        quantity,
      });
    }

    persistCart();
    renderCartBadge();
    showToast(`${product.name} added to cart`, 'success');
  }

  function updateCartQuantity(productId, size, delta) {
    const key = cartKey(productId, size || null);
    const item = state.cart.find((i) => cartKey(i.productId, i.size) === key);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      state.cart = state.cart.filter((i) => cartKey(i.productId, i.size) !== key);
    }

    persistCart();
    renderCart();
    renderCartBadge();
  }

  function removeFromCart(productId, size) {
    const key = cartKey(productId, size || null);
    state.cart = state.cart.filter((i) => cartKey(i.productId, i.size) !== key);
    persistCart();
    renderCart();
    renderCartBadge();
  }

  function cartKey(productId, size) {
    return `${productId}::${size || 'nosize'}`;
  }

  function cartSubtotal() {
    return state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  function renderCart() {
    if (state.cart.length === 0) {
      dom.cartItems.innerHTML = '<p class="cart-empty" id="cartEmpty">Your cart is empty. Start shopping the showroom.</p>';
      dom.cartFooter.hidden = true;
      return;
    }

    dom.cartFooter.hidden = false;
    dom.cartItems.innerHTML = state.cart.map((item) => `
      <div class="cart-line-item">
        <img src="${item.imageUrl || placeholderImage()}" alt="${escapeHtml(item.name)}" loading="lazy">
        <div>
          <p class="cart-line-name">${escapeHtml(item.name)}</p>
          ${item.size ? `<p class="cart-line-meta">Size: ${escapeHtml(item.size)}</p>` : ''}
          <div class="cart-line-controls">
            <button class="qty-btn" data-cart-dec="${item.productId}" data-size="${item.size || ''}" aria-label="Decrease quantity">&minus;</button>
            <span>${item.quantity}</span>
            <button class="qty-btn" data-cart-inc="${item.productId}" data-size="${item.size || ''}" aria-label="Increase quantity">+</button>
          </div>
          <button class="cart-line-remove" data-cart-remove="${item.productId}" data-size="${item.size || ''}">Remove</button>
        </div>
        <span class="cart-line-price">${BaasClient.formatCurrency(item.price * item.quantity)}</span>
      </div>
    `).join('');

    dom.cartSubtotal.textContent = BaasClient.formatCurrency(cartSubtotal());
  }

  function renderCartBadge() {
    const count = state.cart.reduce((sum, i) => sum + i.quantity, 0);
    dom.cartBadge.textContent = String(count);
    dom.cartBadge.hidden = count === 0;
  }

  function persistCart() {
    try {
      localStorage.setItem(CFG.UX.CART_STORAGE_KEY, JSON.stringify(state.cart));
    } catch (err) {
      console.warn('[app] Failed to persist cart:', err);
    }
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CFG.UX.CART_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /* ======================================================= */
  /* CHECKOUT (Pathway B)                                       */
  /* ======================================================= */
  async function handleCheckout() {
    if (state.cart.length === 0) return;

    const name = prompt('Your full name for this order:');
    if (!name) return;
    const phoneRaw = prompt('Your M-Pesa phone number (e.g. 07XXXXXXXX):');
    if (!phoneRaw) return;

    if (!isValidKenyanPhone(phoneRaw)) {
      showToast('Please enter a valid Kenyan mobile number (e.g. 0712345678 or 254712345678).', 'error');
      return;
    }
    const phone = normalizeKenyanPhone(phoneRaw);

    const location = prompt('Delivery / pickup location in Kimana area:') || '';

    setBtnLoading(dom.checkoutBtn, true);

    try {
      const result = await FaasService.submitCheckout({
        items: state.cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          size: i.size,
        })),
        customer: { name, phone, location },
        paymentMethod: 'mpesa',
      });

      showToast('Order submitted! Check your phone to complete M-Pesa payment.', 'success');

      await FaasService.triggerNotification({
        orderId: result.orderId,
        type: 'order_confirmation',
        phone,
      });

      state.cart = [];
      persistCart();
      renderCart();
      renderCartBadge();
      closeCart();
    } catch (err) {
      console.error('[app] Checkout failed:', err);
      showToast(err.message || 'Checkout failed. Please try again or WhatsApp us directly.', 'error');
    } finally {
      setBtnLoading(dom.checkoutBtn, false);
    }
  }

  /* ======================================================= */
  /* FILTER CHIPS + CATEGORY SUB-NAV                            */
  /* ======================================================= */
  function bindFilterEvents() {
    dom.filterChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      dom.filterChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      state.currentFilter = chip.dataset.filter;
      state.currentPage = 1;
      loadInitialProducts();
    });

    dom.subNavTrack.addEventListener('click', (e) => {
      const item = e.target.closest('.sub-nav-item');
      if (!item) return;

      dom.subNavTrack.querySelectorAll('.sub-nav-item').forEach((i) => i.classList.remove('is-active'));
      item.classList.add('is-active');
      state.currentCategory = item.dataset.category;
      state.currentPage = 1;
      loadInitialProducts();
    });

    dom.loadMoreBtn.addEventListener('click', loadMoreProducts);
  }

  /* ======================================================= */
  /* PRODUCT GRID RENDERING (Pathway A)                         */
  /* ======================================================= */
  async function loadInitialProducts() {
    state.isLoading = true;
    dom.productGrid.setAttribute('aria-busy', 'true');
    dom.productGrid.innerHTML = renderMiniSkeletons(8);

    const { items, totalPages, page } = await BaasClient.fetchProducts({
      page: 1,
      category: state.currentCategory,
      filter: state.currentFilter,
    });

    state.products = items;
    state.currentPage = page;
    state.totalPages = totalPages;
    state.isLoading = false;

    renderProductGrid();
    dom.loadMoreBtn.hidden = state.currentPage >= state.totalPages;
    dom.productGrid.removeAttribute('aria-busy');
  }

  async function loadMoreProducts() {
    if (state.isLoading || state.currentPage >= state.totalPages) return;

    state.isLoading = true;
    setBtnLoading(dom.loadMoreBtn, true);

    const { items, totalPages, page } = await BaasClient.fetchProducts({
      page: state.currentPage + 1,
      category: state.currentCategory,
      filter: state.currentFilter,
    });

    state.products = state.products.concat(items);
    state.currentPage = page;
    state.totalPages = totalPages;
    state.isLoading = false;

    renderProductGrid();
    dom.loadMoreBtn.hidden = state.currentPage >= state.totalPages;
    setBtnLoading(dom.loadMoreBtn, false);
  }

  function renderProductGrid() {
    if (state.products.length === 0) {
      dom.productGrid.innerHTML = '<p class="cart-empty">No products match this filter yet. Check back soon.</p>';
      return;
    }
    dom.productGrid.innerHTML = state.products.map(renderProductCard).join('');
  }

  function renderProductCard(product) {
    const isWishlisted = state.wishlist.includes(product.id);
    const lowStock = product.stockCount > 0 && product.stockCount <= 3;
    const outOfStock = product.stockCount === 0;
    const onSale = product.salePrice && product.salePrice < product.price;

    let badge = '';
    if (onSale) badge = `<span class="product-badge badge-sale">Sale</span>`;
    else if (product.isNew) badge = `<span class="product-badge">New</span>`;
    else if (lowStock) badge = `<span class="product-badge badge-low-stock">Low Stock</span>`;

    return `
      <article class="product-card" data-product-id="${product.id}">
        <div class="product-card-media" data-quick-view="${product.id}">
          ${badge}
          <button class="wishlist-btn ${isWishlisted ? 'is-active' : ''}" data-wishlist-toggle="${product.id}" aria-label="Toggle wishlist">
            <svg viewBox="0 0 24 24" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
          </button>
          <img src="${product.imageUrl || placeholderImage()}" alt="${escapeHtml(product.name)}" loading="lazy">
        </div>
        <div class="product-card-body">
          <span class="product-card-category">${escapeHtml(product.category)}</span>
          <h3 class="product-card-name">${escapeHtml(product.name)}</h3>
          <div class="product-card-price-row">
            <span class="product-card-price">${BaasClient.formatCurrency(product.salePrice ?? product.price)}</span>
            ${onSale ? `<span class="product-card-price-old">${BaasClient.formatCurrency(product.price)}</span>` : ''}
          </div>
          <button class="product-card-add" data-quick-add="${product.id}" ${outOfStock ? 'disabled' : ''}>
            ${outOfStock ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      </article>
    `;
  }

  function renderMiniSkeletons(count) {
    return Array.from({ length: count }).map(() => `
      <div class="product-card skeleton" aria-hidden="true">
        <div class="skeleton-img"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
      </div>
    `).join('');
  }

  /* Event delegation for the whole grid: add-to-cart, quick view, wishlist */
  document.addEventListener('click', (e) => {
    const quickAddBtn = e.target.closest('[data-quick-add]');
    const quickViewMedia = e.target.closest('[data-quick-view]');
    const wishlistBtn = e.target.closest('[data-wishlist-toggle]');

    if (quickAddBtn) {
      e.preventDefault();
      const id = quickAddBtn.dataset.quickAdd;
      const product = findProductById(id);
      if (product) {
        if (product.sizes?.length) {
          openQuickView(product);
        } else {
          addToCart(product);
        }
      }
    }

    if (quickViewMedia && !wishlistBtn) {
      const id = quickViewMedia.dataset.quickView;
      const product = findProductById(id);
      if (product) openQuickView(product);
    }

    if (wishlistBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleWishlist(wishlistBtn.dataset.wishlistToggle, wishlistBtn);
    }
  });

  function findProductById(id) {
    return state.products.find((p) => p.id === id) || null;
  }

  /* ======================================================= */
  /* WISHLIST                                                   */
  /* ======================================================= */
  function toggleWishlist(productId, btnEl) {
    const idx = state.wishlist.indexOf(productId);
    if (idx >= 0) {
      state.wishlist.splice(idx, 1);
      btnEl?.classList.remove('is-active');
    } else {
      state.wishlist.push(productId);
      btnEl?.classList.add('is-active');
    }
    try {
      localStorage.setItem(CFG.UX.WISHLIST_STORAGE_KEY, JSON.stringify(state.wishlist));
    } catch (err) {
      console.warn('[app] Failed to persist wishlist:', err);
    }
  }

  function loadWishlist() {
    try {
      const raw = localStorage.getItem(CFG.UX.WISHLIST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /* ======================================================= */
  /* QUICK VIEW MODAL                                           */
  /* ======================================================= */
  function bindQuickViewEvents() {
    dom.quickViewClose.addEventListener('click', closeQuickView);
    dom.quickViewScrim.addEventListener('click', closeQuickView);

    dom.quickViewBody.addEventListener('click', (e) => {
      const sizeBtn = e.target.closest('[data-qv-size]');
      const addBtn = e.target.closest('[data-qv-add]');

      if (sizeBtn && !sizeBtn.disabled) {
        dom.quickViewBody.querySelectorAll('[data-qv-size]').forEach((b) => b.classList.remove('is-active'));
        sizeBtn.classList.add('is-active');
        state.activeQuickViewSize = sizeBtn.dataset.qvSize;
      }

      if (addBtn) {
        if (state.activeQuickViewProduct?.sizes?.length && !state.activeQuickViewSize) {
          showToast('Please select a size first', 'error');
          return;
        }
        addToCart(state.activeQuickViewProduct, state.activeQuickViewSize);
        closeQuickView();
      }
    });
  }

  function openQuickView(product) {
    state.activeQuickViewProduct = product;
    state.activeQuickViewSize = null;

    dom.quickViewBody.innerHTML = `
      <div class="qv-media">
        <img src="${product.imageUrl || placeholderImage()}" alt="${escapeHtml(product.name)}">
      </div>
      <h2 class="qv-title" id="qvTitle">${escapeHtml(product.name)}</h2>
      <p class="qv-price">${BaasClient.formatCurrency(product.salePrice ?? product.price)}</p>
      ${product.sizes?.length ? `
        <div class="qv-size-grid">
          ${product.sizes.map((s) => `<button class="qv-size-btn" data-qv-size="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
        </div>
      ` : ''}
      <p class="qv-desc">${escapeHtml(product.description || 'No description available.')}</p>
      <button class="btn btn-accent btn-block" data-qv-add="${product.id}">Add to Cart</button>
    `;

    dom.quickViewScrim.hidden = false;
    dom.quickViewModal.hidden = false;
    requestAnimationFrame(() => dom.quickViewScrim.classList.add('is-visible'));
    document.body.classList.add('drawer-is-open');
  }

  function closeQuickView() {
    dom.quickViewScrim.classList.remove('is-visible');
    document.body.classList.remove('drawer-is-open');
    setTimeout(() => {
      dom.quickViewScrim.hidden = true;
      dom.quickViewModal.hidden = true;
    }, 260);
  }

  /* ======================================================= */
  /* CUSTOM KIT CALCULATOR (client estimate + Pathway B quote) */
  /* ======================================================= */
  function bindKitCalculatorEvents() {
    const inputs = dom.kitForm.querySelectorAll('select, input');
    inputs.forEach((el) => el.addEventListener('input', updateKitEstimate));

    dom.kitForm.addEventListener('submit', handleKitSubmit);
    updateKitEstimate();
  }

  function updateKitEstimate() {
    const garment = dom.kitForm.garment.value;
    const quantity = Math.max(0, Number(dom.kitForm.quantity.value) || 0);
    const printing = dom.kitForm.printing.value;

    const { BASE_UNIT_PRICE, PRINTING_SURCHARGE, BULK_DISCOUNT_TIERS } = CFG.KIT_PRICING;

    const unitPrice = (BASE_UNIT_PRICE[garment] || 0) + (PRINTING_SURCHARGE[printing] || 0);
    const tier = BULK_DISCOUNT_TIERS.find((t) => quantity >= t.minQty) || { discount: 0 };
    const rawTotal = unitPrice * quantity;
    const total = rawTotal * (1 - tier.discount);

    dom.kitPriceValue.textContent = quantity > 0
      ? `${BaasClient.formatCurrency(total)}${tier.discount > 0 ? ` (${tier.discount * 100}% bulk off)` : ''}`
      : `${CFG.STORE.CURRENCY} —`;
  }

  async function handleKitSubmit(e) {
    e.preventDefault();

    const garment = dom.kitForm.garment.value;
    const quantity = Number(dom.kitForm.quantity.value);
    const printing = dom.kitForm.printing.value;
    const notes = dom.kitForm.notes.value;

    const name = prompt('Your name (for the quote):');
    if (!name) return;
    const phoneRaw = prompt('Phone number so we can send the final quote:');
    if (!phoneRaw) return;

    if (!isValidKenyanPhone(phoneRaw)) {
      showToast('Please enter a valid Kenyan mobile number (e.g. 0712345678 or 254712345678).', 'error');
      return;
    }
    const phone = normalizeKenyanPhone(phoneRaw);

    setBtnLoading(dom.kitSubmitBtn, true);

    try {
      const quote = await FaasService.requestKitQuote({
        garment,
        quantity,
        printing,
        notes,
        customer: { name, phone },
      });

      showToast(`Quote requested! Final price: ${BaasClient.formatCurrency(quote.finalPrice || 0)}. We'll confirm via WhatsApp.`, 'success');

      await FaasService.triggerNotification({
        orderId: quote.requestId,
        type: 'kit_quote',
        phone,
      });

      dom.kitForm.reset();
      updateKitEstimate();
    } catch (err) {
      console.error('[app] Kit quote request failed:', err);
      showToast(err.message || 'Could not submit your quote request. Please try WhatsApp instead.', 'error');
    } finally {
      setBtnLoading(dom.kitSubmitBtn, false);
    }
  }

  /* ======================================================= */
  /* LIVE INVENTORY STRIP (Pathway A realtime)                  */
  /* ======================================================= */
  function connectLiveInventory() {
    BaasClient.connectRealtime();

    BaasClient.onStockUpdate(({ action, product }) => {
      updateLiveStripMessage(action, product);
      mergeLiveProductIntoGrid(product);
    });

    dom.liveStripText.textContent = 'Live inventory sync active.';
  }

  function updateLiveStripMessage(action, product) {
    if (action === 'update' && product.stockCount <= 3 && product.stockCount > 0) {
      dom.liveStripText.textContent = `⚡ Only ${product.stockCount} left: ${product.name}`;
    } else if (action === 'create') {
      dom.liveStripText.textContent = `🆕 Just added: ${product.name}`;
    }
  }

  function mergeLiveProductIntoGrid(updatedProduct) {
    const idx = state.products.findIndex((p) => p.id === updatedProduct.id);
    if (idx === -1) return;

    state.products[idx] = updatedProduct;

    const cardEl = dom.productGrid.querySelector(`[data-product-id="${updatedProduct.id}"]`);
    if (cardEl) {
      cardEl.outerHTML = renderProductCard(updatedProduct);
    }
  }

  /* ======================================================= */
  /* SCROLL-SPY NAV (category sub-nav highlights on scroll)     */
  /* ======================================================= */
  function bindScrollSpy() {
    const sections = ['home', 'showroom', 'custom-kits', 'about'];
    const navLinks = document.querySelectorAll('[data-scroll]');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach((link) => {
            const isMatch = link.getAttribute('href') === `#${id}`;
            link.classList.toggle('is-active-link', isMatch);
          });
        }
      });
    }, { rootMargin: `-${CFG.UX.SCROLL_SPY_OFFSET_PX}px 0px -60% 0px`, threshold: 0 });

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  function bindSmoothScrollLinks() {
    document.querySelectorAll('[data-scroll]').forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return;

        const target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();

        // Close any open drawer/search BEFORE scheduling scroll (avoids scroll-lock traps)
        closeDrawer();
        closeSearch();

        const top = target.getBoundingClientRect().top + window.scrollY - CFG.UX.SCROLL_SPY_OFFSET_PX;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  }

  /* ======================================================= */
  /* FLOATING CONSULTATION FAB                                  */
  /* ======================================================= */
  function bindFabEvents() {
    dom.fabConsult.addEventListener('click', () => {
      dom.fabTooltip.hidden = !dom.fabTooltip.hidden;
    });

    document.addEventListener('click', (e) => {
      if (dom.fabTooltip.hidden) return;
      if (e.target.closest('#fabTooltip') || e.target.closest('#fabConsult')) return;
      dom.fabTooltip.hidden = true;
    });
  }

  function maybeShowFabTooltipOnce() {
    try {
      if (localStorage.getItem(CFG.UX.FAB_TOOLTIP_AUTOSHOW_ONCE_KEY)) return;
      setTimeout(() => {
        dom.fabTooltip.hidden = false;
        localStorage.setItem(CFG.UX.FAB_TOOLTIP_AUTOSHOW_ONCE_KEY, '1');
      }, CFG.UX.FAB_TOOLTIP_DELAY_MS);
    } catch (err) {
      console.warn('[app] FAB tooltip autoshow skipped:', err);
    }
  }

  /* ======================================================= */
  /* TOASTS                                                      */
  /* ======================================================= */
  function showToast(message, type = 'default') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`.trim();
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 260);
    }, CFG.UX.TOAST_DURATION_MS);
  }

  /* ======================================================= */
  /* PHONE VALIDATION / NORMALIZATION (Kenyan mobile numbers)   */
  /* ======================================================= */
  const KENYA_PHONE_REGEX = /^(\+?254|0)?[71]\d{8}$/;

  /**
   * Validates a Kenyan mobile number in any common input shape:
   * 0712345678, 254712345678, +254712345678, 0112345678, etc.
   */
  function isValidKenyanPhone(rawInput) {
    if (!rawInput) return false;
    const cleaned = String(rawInput).trim().replace(/[\s-]/g, '');
    return KENYA_PHONE_REGEX.test(cleaned);
  }

  /**
   * Normalizes any valid Kenyan mobile number into international
   * format without a plus sign: 2547XXXXXXXX / 2541XXXXXXXX.
   * Assumes the input has already passed isValidKenyanPhone.
   */
  function normalizeKenyanPhone(rawInput) {
    let digits = String(rawInput).trim().replace(/[\s-]/g, '').replace(/^\+/, '');

    if (digits.startsWith('0')) {
      digits = '254' + digits.slice(1);
    } else if (!digits.startsWith('254')) {
      digits = '254' + digits;
    }

    return digits;
  }

  /* ======================================================= */
  /* UI HELPERS                                                  */
  /* ======================================================= */
  function setBtnLoading(btnEl, isLoading) {
    const label = btnEl.querySelector('.btn-label');
    const spinner = btnEl.querySelector('.btn-spinner');
    btnEl.disabled = isLoading;

    if (label) label.style.opacity = isLoading ? '0' : '1';
    if (spinner) spinner.hidden = !isLoading;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function placeholderImage() {
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="%23141414"/></svg>'
    );
  }

  /* ======================================================= */
  /* BOOT                                                        */
  /* ======================================================= */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
