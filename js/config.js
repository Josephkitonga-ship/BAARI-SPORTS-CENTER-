/* =========================================================
   BAARI SPORTS CENTER — config.js
   Environment variables, API endpoints & app-wide constants.
   NO SECRETS LIVE HERE. This file is public and ships to the
   browser. The Supabase anon key below is a public, RLS-scoped
   key — safe to expose. It can only do what the database's Row
   Level Security policies explicitly allow (public read of
   active products/categories, public insert of orders/kit
   requests). Nothing else.
   ========================================================= */

const BAARI_CONFIG = Object.freeze({

  // ---------------------------------------------------------
  // SUPABASE — backend project
  // Replace these two values once the Supabase project for
  // Baari Sports Center exists. Until then the storefront runs
  // in a safe "backend not connected" state (see app.js).
  // ---------------------------------------------------------
  SUPABASE: Object.freeze({
    URL: 'https://ccnjlyytxbhqhwybobei.supabase.co',
    ANON_KEY: 'sb_publishable_e3Zx40VklZr4uL0hP3CT4g_8uU0TE6m',
    TABLES: Object.freeze({
      PRODUCTS: 'products',
      CATEGORIES: 'categories',
      ORDERS: 'orders',
      KIT_REQUESTS: 'kit_requests',
    }),
    STORAGE_BUCKET: 'product-images',
  }),

  // ---------------------------------------------------------
  // BUSINESS / STOREFRONT CONSTANTS
  // ---------------------------------------------------------
  STORE: Object.freeze({
    NAME: 'Baari Sports Center',
    LOCATION: 'Kimana Town, Oloitokitok Sub-County, Kajiado County',
    WHATSAPP_NUMBER: '254702453813', // digits only, no + prefix
    SUPPORT_EMAIL: 'BaariSportscentre01@gmail.com',
    CURRENCY: 'KES',
    CURRENCY_LOCALE: 'en-KE',
  }),

  // ---------------------------------------------------------
  // CUSTOM KIT PRICING BASELINES
  // Used for the client-side instant estimate shown in the
  // calculator UI before the request is submitted. The store
  // owner reviews and sets the authoritative price from the
  // admin dashboard once the request lands.
  //
  // 'club-jersey' covers customer-requested named club/team
  // jerseys (e.g. Arsenal, Manchester United) that can't be
  // pre-stocked as individual storefront products — priced
  // per unit like the other garments, quoted via the kit
  // request flow instead of Add to Cart.
  // ---------------------------------------------------------
  KIT_PRICING: Object.freeze({
    BASE_UNIT_PRICE: Object.freeze({
      jersey: 1200,
      'club-jersey': 550,
      'training-tee': 800,
      tracksuit: 2500,
      shorts: 400,
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
    PRODUCTS_PAGE_SIZE: 20,
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
