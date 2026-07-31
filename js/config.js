/* =========================================================
   BAARI SPORTS CENTER — config.js
   Environment variables, API endpoints & app-wide constants.
   NO SECRETS LIVE HERE. This file is public and ships to the
   browser. Anything sensitive (payment keys, WhatsApp tokens)
   stays inside /functions on the FaaS layer.
   ========================================================= */

const BAARI_CONFIG = Object.freeze({

  // ---------------------------------------------------------
  // PATHWAY A — Direct BaaS connection (PocketBase instance)
  // Public reads only: products, categories, live stock counts.
  // ---------------------------------------------------------
  BAAS: Object.freeze({
    BASE_URL: 'https://baas.baarisports.co.ke',
    COLLECTIONS: Object.freeze({
      PRODUCTS: 'products',
      CATEGORIES: 'categories',
      ORDERS: 'orders',
      KIT_REQUESTS: 'kit_requests',
    }),
    // Realtime subscription topics (Pathway A)
    REALTIME_TOPICS: Object.freeze({
      STOCK_UPDATES: 'products',
      NEW_ARRIVALS: 'products',
    }),
    PAGE_SIZE: 20,
  }),

  // ---------------------------------------------------------
  // PATHWAY B — Ephemeral FaaS endpoints
  // These functions hold secret keys server-side and are the
  // ONLY layer permitted to write elevated/financial records.
  // ---------------------------------------------------------
  FAAS: Object.freeze({
    BASE_URL: 'https://functions.baarisports.co.ke',
    ENDPOINTS: Object.freeze({
      CHECKOUT: '/checkout',
      CUSTOM_KITS: '/custom-kits',
      NOTIFICATIONS: '/notifications',
    }),
    TIMEOUT_MS: 15000,
  }),

  // ---------------------------------------------------------
  // BUSINESS / STOREFRONT CONSTANTS
  // ---------------------------------------------------------
  STORE: Object.freeze({
    NAME: 'Baari Sports Center',
    LOCATION: 'Kimana Town, Oloitokitok Sub-County, Kajiado County',
    WHATSAPP_NUMBER: '254700000000', // digits only, no + prefix
    CURRENCY: 'KES',
    CURRENCY_LOCALE: 'en-KE',
    SUPPORT_EMAIL: 'hello@baarisports.co.ke',
  }),

  // ---------------------------------------------------------
  // CUSTOM KIT PRICING BASELINES
  // Used for the CLIENT-SIDE instant estimate shown in the
  // calculator UI. The authoritative, final price is always
  // recalculated server-side by functions/custom-kits before
  // any order is confirmed (Pathway B), so these numbers are
  // safe to expose publicly.
  // ---------------------------------------------------------
  KIT_PRICING: Object.freeze({
    BASE_UNIT_PRICE: Object.freeze({
      jersey: 1200,
      'training-tee': 800,
      tracksuit: 2500,
      shorts: 600,
    }),
    PRINTING_SURCHARGE: Object.freeze({
      none: 0,
      'name-number': 250,
      'full-sponsor': 500,
    }),
    BULK_DISCOUNT_TIERS: Object.freeze([
      { minQty: 50, discount: 0.15 },
      { minQty: 25, discount: 0.10 },
      { minQty: 15, discount: 0.05 },
      { minQty: 5, discount: 0 },
    ]),
  }),

  // ---------------------------------------------------------
  // UX / BEHAVIOR CONSTANTS
  // ---------------------------------------------------------
  UX: Object.freeze({
    TOAST_DURATION_MS: 3200,
    SCROLL_SPY_OFFSET_PX: 96,
    SEARCH_DEBOUNCE_MS: 220,
    FAB_TOOLTIP_DELAY_MS: 2600,
    FAB_TOOLTIP_AUTOSHOW_ONCE_KEY: 'baari_fab_tooltip_shown',
    CART_STORAGE_KEY: 'baari_cart_v1',
    WISHLIST_STORAGE_KEY: 'baari_wishlist_v1',
    RECENT_SEARCH_KEY: 'baari_recent_search_v1',
    LIVE_STRIP_ROTATE_MS: 5000,
  }),

  // ---------------------------------------------------------
  // FEATURE FLAGS
  // ---------------------------------------------------------
  FEATURES: Object.freeze({
    ENABLE_REALTIME_STOCK: true,
    ENABLE_WISHLIST: true,
    ENABLE_KIT_CALCULATOR: true,
    ENABLE_WHATSAPP_RECEIPT: true,
  }),
});

// Freeze the top-level export defensively against runtime mutation.
if (typeof window !== 'undefined') {
  window.BAARI_CONFIG = BAARI_CONFIG;
}
