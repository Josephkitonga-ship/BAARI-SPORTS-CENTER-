/* =========================================================
   BAARI SPORTS CENTER — app.js
   Event handling, scroll-spy nav, cart state, DOM rendering.
   Orchestrates BaariDB (Supabase) for reads/writes and builds
   the WhatsApp order-forwarding handoff after each checkout
   or kit-quote submission.
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
    hasMore: false,
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

    cartDrawerTitle: document.getElementById('cartDrawerTitle'),
    checkoutView: document.getElementById('checkoutView'),
    checkoutBackBtn: document.getElementById('checkoutBackBtn'),
    checkoutOrderSummary: document.getElementById('checkoutOrderSummary'),
    checkoutName: document.getElementById('checkoutName'),
    checkoutNameError: document.getElementById('checkoutNameError'),
    checkoutPhone: document.getElementById('checkoutPhone'),
    checkoutPhoneError: document.getElementById('checkoutPhoneError'),
    checkoutLocation: document.getElementById('checkoutLocation'),
    checkoutLocationError: document.getElementById('checkoutLocationError'),
    checkoutTotal: document.getElementById('checkoutTotal'),
    checkoutSubmitBtn: document.getElementById('checkoutSubmitBtn'),
    checkoutSubmitLabel: document.getElementById('checkoutSubmitLabel'),
    checkoutContactNote: document.getElementById('checkoutContactNote'),
    contactMethodPicker: document.getElementById('contactMethodPicker'),
    checkoutContactPreference: document.getElementById('checkoutContactPreference'),
    checkoutEmailGroup: document.getElementById('checkoutEmailGroup'),
    checkoutEmail: document.getElementById('checkoutEmail'),
    checkoutEmailError: document.getElementById('checkoutEmailError'),

    filterChips: document.getElementById('filterChips'),
    productGrid: document.getElementById('productGrid'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),

    liveStripText: document.getElementById('liveStripText'),

    kitForm: document.getElementById('kitCalculatorForm'),
    kitPriceValue: document.getElementById('kitPriceValue'),
    kitSubmitBtn: document.getElementById('kitSubmitBtn'),
    kitClubNameRow: document.getElementById('kitClubNameRow'),
    kitClubName: document.getElementById('kitClubName'),

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
    loadCategories();
    loadInitialProducts();
    connectLiveInventory();
    maybeShowFabTooltipOnce();
    setFooterYear();

    if (!BaariDB.isConfigured()) {
      dom.liveStripText.textContent = 'Store backend not connected yet. Showing offline mode.';
    }
  }

  function setFooterYear() {
    const el = document.getElementById('footerYear');
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ======================================================= */
  /* CATEGORY SUB-NAV (rendered from the categories table)     */
  /* ======================================================= */
  async function loadCategories() {
    const categories = await BaariDB.fetchCategories();
    if (!categories.length) return;

    const chips = categories.map((c) =>
      `<button class="sub-nav-item" data-category="${escapeHtml(c.slug)}">${escapeHtml(c.label)}</button>`
    ).join('');

    dom.subNavTrack.insertAdjacentHTML('beforeend', chips);
  }

  /* ======================================================= */
  /* HEADER / SCROLL SHADOW                                     */
  /* ======================================================= */
  function bindHeaderEvents() {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      dom.header.classList.toggle('is-scrolled', y > 8);
    }, { passive: true });
  }

  /* ======================================================= */
  /* MOBILE DRAWER (NAV)                                        */
  /* ======================================================= */
  function bindDrawerEvents() {
    dom.menuTrigger.addEventListener('click', () => {
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

    const { items } = await BaariDB.fetchProducts({ query, perPage: 12 });

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
    dom.checkoutBackBtn.addEventListener('click', closeCheckoutView);
    dom.checkoutView.addEventListener('submit', submitCheckoutForm);
    dom.contactMethodPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.contact-method-btn');
      if (!btn) return;
      selectContactMethod(btn.dataset.contact);
    });

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
    // Always return to the cart view (not the form) the next time it opens.
    closeCheckoutView();
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
    pulseCartBadge();
    showToast(`${product.name} added to cart`, 'success');
  }

  function pulseCartBadge() {
    dom.cartBadge.classList.remove('is-pulsing');
    // Force reflow so the animation can restart on rapid, repeated adds.
    void dom.cartBadge.offsetWidth;
    dom.cartBadge.classList.add('is-pulsing');
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
        <span class="cart-line-price">${BaariDB.formatCurrency(item.price * item.quantity)}</span>
      </div>
    `).join('');

    dom.cartSubtotal.textContent = BaariDB.formatCurrency(cartSubtotal());
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
  /* CHECKOUT — opens an in-drawer details form (replacing the */
  /* old prompt() dialogs), then logs the order to Supabase and */
  /* hands off to WhatsApp with a prefilled order summary. The  */
  /* Supabase write never blocks the WhatsApp handoff: if it    */
  /* fails, the customer's order still reaches the owner via    */
  /* WhatsApp.                                                   */
  /* ======================================================= */
  function handleCheckout() {
    if (state.cart.length === 0) return;
    openCheckoutView();
  }

  function openCheckoutView() {
    dom.cartDrawerTitle.textContent = 'Checkout';
    dom.cartItems.hidden = true;
    dom.cartFooter.hidden = true;
    dom.checkoutView.hidden = false;

    const itemsSummary = state.cart.map((i) =>
      `${i.name}${i.size ? ` (${i.size})` : ''} × ${i.quantity}`
    ).join(', ');
    dom.checkoutOrderSummary.textContent = itemsSummary;
    dom.checkoutTotal.textContent = BaariDB.formatCurrency(cartSubtotal());

    selectContactMethod('whatsapp');
    clearCheckoutErrors();
  }

  const CONTACT_METHOD_COPY = {
    whatsapp: {
      label: 'Place Order via WhatsApp',
      note: 'Order details are sent straight to our WhatsApp for confirmation.',
    },
    call: {
      label: 'Place Order & Request Callback',
      note: "We'll save your order and call you back to confirm.",
    },
    email: {
      label: 'Place Order via Email',
      note: 'Order details will open in your email app to send to us.',
    },
  };

  function selectContactMethod(method) {
    dom.checkoutContactPreference.value = method;

    dom.contactMethodPicker.querySelectorAll('.contact-method-btn').forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.contact === method);
    });

    dom.checkoutEmailGroup.hidden = method !== 'email';

    const copy = CONTACT_METHOD_COPY[method];
    dom.checkoutSubmitLabel.textContent = copy.label;
    dom.checkoutContactNote.textContent = copy.note;
  }

  function closeCheckoutView() {
    dom.cartDrawerTitle.textContent = 'Your Cart';
    dom.checkoutView.hidden = true;
    dom.cartItems.hidden = false;
    dom.cartFooter.hidden = state.cart.length === 0;
  }

  function clearCheckoutErrors() {
    [dom.checkoutName, dom.checkoutPhone, dom.checkoutLocation, dom.checkoutEmail].forEach((el) => el.classList.remove('is-invalid'));
    [dom.checkoutNameError, dom.checkoutPhoneError, dom.checkoutLocationError, dom.checkoutEmailError].forEach((el) => { el.textContent = ''; });
  }

  function setFieldError(inputEl, errorEl, message) {
    inputEl.classList.toggle('is-invalid', Boolean(message));
    errorEl.textContent = message || '';
  }

  async function submitCheckoutForm(e) {
    e.preventDefault();
    clearCheckoutErrors();

    const name = dom.checkoutName.value.trim();
    const phoneRaw = dom.checkoutPhone.value.trim();
    const location = dom.checkoutLocation.value.trim();
    const contactMethod = dom.checkoutContactPreference.value;
    const email = dom.checkoutEmail.value.trim();

    let hasError = false;
    if (!name) {
      setFieldError(dom.checkoutName, dom.checkoutNameError, 'Please enter your full name.');
      hasError = true;
    }
    if (!phoneRaw) {
      setFieldError(dom.checkoutPhone, dom.checkoutPhoneError, 'Please enter your phone number.');
      hasError = true;
    } else if (!isValidKenyanPhone(phoneRaw)) {
      setFieldError(dom.checkoutPhone, dom.checkoutPhoneError, 'Enter a valid Kenyan number, e.g. 0712345678.');
      hasError = true;
    }
    if (!location) {
      setFieldError(dom.checkoutLocation, dom.checkoutLocationError, 'Please enter a delivery or pickup location.');
      hasError = true;
    }
    if (contactMethod === 'email') {
      if (!email) {
        setFieldError(dom.checkoutEmail, dom.checkoutEmailError, 'Please enter your email address.');
        hasError = true;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldError(dom.checkoutEmail, dom.checkoutEmailError, 'Enter a valid email address.');
        hasError = true;
      }
    }
    if (hasError) return;

    const phone = normalizeKenyanPhone(phoneRaw);
    const total = cartSubtotal();
    const cartSnapshot = state.cart.slice();

    setBtnLoading(dom.checkoutSubmitBtn, true);

    try {
      await BaariDB.submitOrder({
        items: cartSnapshot.map((i) => ({
          productId: i.productId,
          name: i.name,
          size: i.size,
          qty: i.quantity,
          price: i.price,
        })),
        customer: { name, phone, location, email: email || null },
        total,
        contactPreference: contactMethod,
      });
    } catch (err) {
      console.error('[app] Order logging failed (contact handoff continues):', err);
    }

    dispatchOrderHandoff(contactMethod, { name, phone, email, location, items: cartSnapshot, total });

    state.cart = [];
    persistCart();
    renderCart();
    renderCartBadge();
    dom.checkoutView.reset();
    closeCheckoutView();
    closeCart();
    setBtnLoading(dom.checkoutSubmitBtn, false);

    const toastCopy = {
      whatsapp: 'Redirecting to WhatsApp to confirm your order…',
      call: "Order saved! We'll call you back shortly to confirm.",
      email: 'Opening your email app to send your order…',
    };
    showToast(toastCopy[contactMethod], 'success');
  }

  function dispatchOrderHandoff(method, orderDetails) {
    if (method === 'whatsapp') {
      sendOrderToWhatsApp(orderDetails);
    } else if (method === 'email') {
      sendOrderToEmail(orderDetails);
    }
    // 'call' has no client-side handoff to trigger — the order is saved
    // with contact_preference: 'call' and the owner calls the customer
    // back using the number on file, visible in the admin Orders tab.
  }

  function sendOrderToWhatsApp({ name, phone, location, items, total }) {
    const lines = items.map((i) =>
      `▸ ${i.name}${i.size ? `\n   Size: ${i.size}` : ''}  |  Qty: ${i.quantity}  |  ${BaariDB.formatCurrency(i.price * i.quantity)}`
    ).join('\n');

    const message = [
      `🛒 *NEW ORDER: ${CFG.STORE.NAME.toUpperCase()}*`, '─────────────────────', '',
      '👤 *Customer Details*', `Name: ${name}`, `Phone: ${phone}`, `Delivery/Pickup: ${location}`, '',
      '📦 *Order Summary*', '─────────────────────', lines,
      '─────────────────────', `*TOTAL: ${BaariDB.formatCurrency(total)}*`, '',
      '✅ Please confirm availability and payment details.', '',
      `Sent via ${CFG.STORE.NAME}`,
    ].join('\n');

    window.open(`https://wa.me/${CFG.STORE.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  function sendOrderToEmail({ name, phone, email, location, items, total }) {
    const lines = items.map((i) =>
      `- ${i.name}${i.size ? ` (Size: ${i.size})` : ''} x${i.quantity} — ${BaariDB.formatCurrency(i.price * i.quantity)}`
    ).join('\n');

    const subject = `New Order: ${name}`;
    const body = [
      `New order from ${CFG.STORE.NAME}'s website.`, '',
      `Customer: ${name}`, `Phone: ${phone}`, `Email: ${email}`, `Delivery/Pickup: ${location}`, '',
      'Order Summary:', lines, '',
      `Total: ${BaariDB.formatCurrency(total)}`, '',
      'Please confirm availability and payment details.',
    ].join('\n');

    // Opens the customer's own email app with the order prefilled, addressed
    // to the store. No email is actually sent by our system at this stage —
    // that upgrade requires a verified domain and a transactional email
    // provider, planned as a fast-follow after launch.
    window.location.href = `mailto:${CFG.STORE.SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
  /* PRODUCT GRID RENDERING                                     */
  /* ======================================================= */
  async function loadInitialProducts() {
    state.isLoading = true;
    dom.productGrid.setAttribute('aria-busy', 'true');
    dom.productGrid.innerHTML = renderMiniSkeletons(8);

    const { items, hasMore, page } = await BaariDB.fetchProducts({
      page: 1,
      category: state.currentCategory,
      filter: state.currentFilter,
    });

    state.products = items;
    state.currentPage = page;
    state.hasMore = hasMore;
    state.isLoading = false;

    renderProductGrid();
    dom.loadMoreBtn.hidden = !state.hasMore;
    dom.productGrid.removeAttribute('aria-busy');
  }

  async function loadMoreProducts() {
    if (state.isLoading || !state.hasMore) return;

    state.isLoading = true;
    setBtnLoading(dom.loadMoreBtn, true);

    const { items, hasMore, page } = await BaariDB.fetchProducts({
      page: state.currentPage + 1,
      category: state.currentCategory,
      filter: state.currentFilter,
    });

    state.products = state.products.concat(items);
    state.currentPage = page;
    state.hasMore = hasMore;
    state.isLoading = false;

    renderProductGrid();
    dom.loadMoreBtn.hidden = !state.hasMore;
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
          <span class="product-card-category">${escapeHtml(product.categoryLabel || product.category)}</span>
          <h3 class="product-card-name">${escapeHtml(product.name)}</h3>
          <div class="product-card-price-row">
            <span class="product-card-price">${BaariDB.formatCurrency(product.salePrice ?? product.price)}</span>
            ${onSale ? `<span class="product-card-price-old">${BaariDB.formatCurrency(product.price)}</span>` : ''}
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
      <p class="qv-price">${BaariDB.formatCurrency(product.salePrice ?? product.price)}</p>
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
  /* CUSTOM KIT CALCULATOR — client estimate, then logs the    */
  /* request to Supabase and hands off to WhatsApp for the     */
  /* owner to confirm a final price.                            */
  /*                                                             */
  /* 'club-jersey' is a distinct garment type for customer-      */
  /* requested named club/team jerseys (Arsenal, Man United,     */
  /* etc.) that can't be pre-stocked as individual storefront    */
  /* products. Selecting it reveals a required Club/Team Name    */
  /* field, separate from the free-text notes box, so the owner  */
  /* always sees exactly which club/team was requested.          */
  /* ======================================================= */
  const GARMENT_LABELS = {
    jersey: 'Match Jersey',
    'club-jersey': 'Club Jerseys',
    'training-tee': 'Training Tee',
    tracksuit: 'Tracksuit Set',
    shorts: 'Shorts',
  };

  const KIT_NOTES_PLACEHOLDER = {
    'club-jersey': 'e.g. Sizes S x5, M x8, L x2, name+number on back, needed by 20th Aug',
    default: 'e.g. Home kit, navy + gold, club badge on chest, needed by 20th Aug',
  };

  function bindKitCalculatorEvents() {
    const inputs = dom.kitForm.querySelectorAll('select, input');
    inputs.forEach((el) => el.addEventListener('input', updateKitEstimate));

    dom.kitForm.garment.addEventListener('change', () => {
      toggleClubNameField();
      updateKitNotesPlaceholder();
    });

    dom.kitForm.addEventListener('submit', handleKitSubmit);

    updateKitEstimate();
    toggleClubNameField();
    updateKitNotesPlaceholder();
  }

  function isClubJerseySelected() {
    return dom.kitForm.garment.value === 'club-jersey';
  }

  function toggleClubNameField() {
    const showClubField = isClubJerseySelected();
    dom.kitClubNameRow.hidden = !showClubField;
    if (showClubField) {
      dom.kitClubName.setAttribute('required', 'required');
    } else {
      dom.kitClubName.removeAttribute('required');
      dom.kitClubName.value = '';
    }
  }

  function updateKitNotesPlaceholder() {
    const garment = dom.kitForm.garment.value;
    dom.kitForm.notes.placeholder = KIT_NOTES_PLACEHOLDER[garment] || KIT_NOTES_PLACEHOLDER.default;
  }

  function calculateKitEstimate(garment, quantity, printing) {
    const { BASE_UNIT_PRICE, PRINTING_SURCHARGE, BULK_DISCOUNT_TIERS } = CFG.KIT_PRICING;
    const unitPrice = (BASE_UNIT_PRICE[garment] || 0) + (PRINTING_SURCHARGE[printing] || 0);
    const tier = BULK_DISCOUNT_TIERS.find((t) => quantity >= t.minQty) || { discount: 0 };
    const rawTotal = unitPrice * quantity;
    return { total: rawTotal * (1 - tier.discount), discount: tier.discount };
  }

  function updateKitEstimate() {
    const garment = dom.kitForm.garment.value;
    const quantity = Math.max(0, Number(dom.kitForm.quantity.value) || 0);
    const printing = dom.kitForm.printing.value;

    const { total, discount } = calculateKitEstimate(garment, quantity, printing);

    dom.kitPriceValue.textContent = quantity > 0
      ? `${BaariDB.formatCurrency(total)}${discount > 0 ? ` (${discount * 100}% bulk off)` : ''}`
      : `${CFG.STORE.CURRENCY} —`;
  }

  async function handleKitSubmit(e) {
    e.preventDefault();

    const garment = dom.kitForm.garment.value;
    const quantity = Number(dom.kitForm.quantity.value);
    const printing = dom.kitForm.printing.value;
    const notes = dom.kitForm.notes.value;
    const clubName = dom.kitClubName.value.trim();

    if (isClubJerseySelected() && !clubName) {
      showToast('Please enter the club or team name.', 'error');
      dom.kitClubName.focus();
      return;
    }

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

    const { total: estimatedTotal } = calculateKitEstimate(garment, quantity, printing);

    try {
      await BaariDB.submitKitRequest({
        garment,
        quantity,
        printing,
        notes,
        clubName: isClubJerseySelected() ? clubName : null,
        customer: { name, phone },
        estimatedTotal,
      });
    } catch (err) {
      console.error('[app] Kit request logging failed (WhatsApp handoff continues):', err);
    }

    sendKitRequestToWhatsApp({ garment, quantity, printing, notes, clubName, name, phone, estimatedTotal });

    showToast('Request sent! We\u2019ll confirm your final quote on WhatsApp.', 'success');
    dom.kitForm.reset();
    toggleClubNameField();
    updateKitNotesPlaceholder();
    updateKitEstimate();
    setBtnLoading(dom.kitSubmitBtn, false);
  }

  function sendKitRequestToWhatsApp({ garment, quantity, printing, notes, clubName, name, phone, estimatedTotal }) {
    const printingLabels = {
      none: 'None', 'name-number': 'Name + Number', 'full-sponsor': 'Full Sponsor Set',
    };

    const garmentLine = garment === 'club-jersey' && clubName
      ? `Garment: ${GARMENT_LABELS[garment]} — ${clubName}`
      : `Garment: ${GARMENT_LABELS[garment] || garment}`;

    const message = [
      `🏆 *CUSTOM KIT REQUEST: ${CFG.STORE.NAME.toUpperCase()}*`, '─────────────────────', '',
      '👤 *Customer Details*', `Name: ${name}`, `Phone: ${phone}`, '',
      '📦 *Kit Details*', '─────────────────────',
      garmentLine,
      `Quantity: ${quantity}`,
      `Printing: ${printingLabels[printing] || printing}`,
      notes ? `Notes: ${notes}` : null,
      '─────────────────────',
      `*Estimated Total: ${BaariDB.formatCurrency(estimatedTotal)}*`, '',
      '✅ Please confirm the final price and delivery timeline.', '',
      `Sent via ${CFG.STORE.NAME}`,
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/${CFG.STORE.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  /* ======================================================= */
  /* LIVE INVENTORY STRIP (Supabase Realtime)                   */
  /* ======================================================= */
  function connectLiveInventory() {
    BaariDB.connectRealtime();

    BaariDB.onStockUpdate(({ action, product }) => {
      updateLiveStripMessage(action, product);
      mergeLiveProductIntoGrid(product);
    });

    if (BaariDB.isConfigured()) {
      dom.liveStripText.textContent = 'Live inventory sync active.';
    }
  }

  function updateLiveStripMessage(action, product) {
    if (action === 'UPDATE' && product.stockCount <= 3 && product.stockCount > 0) {
      dom.liveStripText.textContent = `⚡ Only ${product.stockCount} left: ${product.name}`;
    } else if (action === 'INSERT') {
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

  function isValidKenyanPhone(rawInput) {
    if (!rawInput) return false;
    const cleaned = String(rawInput).trim().replace(/[\s-]/g, '');
    return KENYA_PHONE_REGEX.test(cleaned);
  }

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
