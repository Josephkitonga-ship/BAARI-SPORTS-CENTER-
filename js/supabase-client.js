/* =========================================================
   BAARI SPORTS CENTER — supabase-client.js
   Storefront data layer. Talks directly to Supabase using the
   public anon key. Row Level Security on the database is what
   keeps this safe — this file never holds a secret key, and
   RLS policies restrict it to:
     - SELECT on products/categories where active = true
     - INSERT on orders / kit_requests (never SELECT/UPDATE)
   Requires the Supabase JS SDK to be loaded on the page before
   this file (see index.html <script> order).
   ========================================================= */

const BaariDB = (() => {
  const { URL, ANON_KEY, TABLES, STORAGE_BUCKET } = BAARI_CONFIG.SUPABASE;

  let client = null;
  let isConfigured = false;

  try {
    const looksConfigured =
      URL && !URL.includes('YOUR-BAARI-PROJECT-REF') &&
      ANON_KEY && !ANON_KEY.includes('YOUR-BAARI-ANON-PUBLIC-KEY');

    if (looksConfigured && window.supabase?.createClient) {
      client = window.supabase.createClient(URL, ANON_KEY);
      isConfigured = true;
    } else {
      console.warn('[BaariDB] Supabase is not configured yet — storefront running in offline mode.');
    }
  } catch (err) {
    console.error('[BaariDB] Failed to initialize Supabase client:', err);
  }

  let realtimeChannel = null;
  const stockListeners = new Set();

  /* ----------------------------------------------------- */
  /* PRODUCTS                                                */
  /* ----------------------------------------------------- */

  /**
   * Fetch a page of products, optionally filtered by category
   * slug, search term, and a named filter chip (in-stock / new / sale).
   */
  let _categorySlugToId = null;

  async function resolveCategoryId(slug) {
    if (!_categorySlugToId) {
      const { data } = await client.from(TABLES.CATEGORIES).select('id, slug');
      _categorySlugToId = new Map((data || []).map((c) => [c.slug, c.id]));
    }
    return _categorySlugToId.get(slug) || null;
  }

  async function fetchProducts({
    page = 1,
    perPage = BAARI_CONFIG.UX.PRODUCTS_PAGE_SIZE,
    category = 'all',
    filter = 'all',
    query = '',
  } = {}) {
    if (!isConfigured) return { items: [], totalItems: 0, page, hasMore: false };

    try {
      let q = client
        .from(TABLES.PRODUCTS)
        .select('*, categories(slug, label)', { count: 'exact' })
        .eq('active', true);

      // Filtering by a joined table's column via dotted .eq() isn't valid
      // PostgREST usage through the JS client — it silently returns no
      // rows instead of erroring. Resolve the slug to the real
      // products.category_id (a plain column on the base table) first.
      if (category && category !== 'all') {
        const categoryId = await resolveCategoryId(category);
        if (categoryId) {
          q = q.eq('category_id', categoryId);
        } else {
          // Unknown category slug — no products can match, skip the query.
          return { items: [], totalItems: 0, page, hasMore: false };
        }
      }
      if (query && query.trim()) {
        const term = query.trim();
        q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }
      if (filter === 'in-stock') {
        q = q.gt('stock_count', 0);
      } else if (filter === 'new') {
        q = q.eq('is_new', true);
      } else if (filter === 'sale') {
        q = q.not('sale_price', 'is', null);
      }

      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      q = q.order('created_at', { ascending: false }).range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;

      const items = (data || []).map(normalizeProduct);
      const totalItems = count ?? items.length;
      return { items, totalItems, page, hasMore: from + items.length < totalItems };
    } catch (err) {
      console.error('[BaariDB] fetchProducts failed:', err);
      return { items: [], totalItems: 0, page, hasMore: false };
    }
  }

  async function fetchProductById(id) {
    if (!isConfigured) return null;
    try {
      const { data, error } = await client
        .from(TABLES.PRODUCTS)
        .select('*, categories(slug, label)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return normalizeProduct(data);
    } catch (err) {
      console.error('[BaariDB] fetchProductById failed:', err);
      return null;
    }
  }

  /* ----------------------------------------------------- */
  /* CATEGORIES                                              */
  /* ----------------------------------------------------- */
  async function fetchCategories() {
    if (!isConfigured) return [];
    try {
      const { data, error } = await client
        .from(TABLES.CATEGORIES)
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []).map((c) => ({
        id: c.id,
        slug: c.slug,
        label: c.label,
        icon: c.icon || null,
      }));
    } catch (err) {
      console.error('[BaariDB] fetchCategories failed:', err);
      return [];
    }
  }

  /* ----------------------------------------------------- */
  /* ORDERS                                                   */
  /* ----------------------------------------------------- */

  /**
   * Logs an order to Supabase. Cart totals are display-only —
   * the owner confirms the real total from the admin dashboard
   * before dispatching, same as the price shown at handoff to
   * WhatsApp is a customer-facing summary, not a payment charge.
   */
  async function submitOrder({ items, customer, total, notes }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Cannot submit an empty cart.');
    }
    if (!customer?.name || !customer?.phone || !customer?.location) {
      throw new Error('Customer name, phone, and delivery location are required.');
    }
    if (!isConfigured) {
      throw new Error('Store backend is not connected yet.');
    }

    const { data, error } = await client
      .from(TABLES.ORDERS)
      .insert({
        customer_name: customer.name,
        phone: normalizePhone(customer.phone),
        location: customer.location,
        notes: notes || null,
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          size: i.size || null,
          qty: i.qty,
          price: i.price,
        })),
        total: Number(total) || 0,
        status: 'new',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /* ----------------------------------------------------- */
  /* CUSTOM KIT REQUESTS                                      */
  /* ----------------------------------------------------- */

  async function submitKitRequest({ garment, quantity, printing, notes, customer, estimatedTotal }) {
    if (!garment || !quantity || quantity < 5) {
      throw new Error('Custom kit orders require a minimum quantity of 5.');
    }
    if (!customer?.name || !customer?.phone) {
      throw new Error('Name and phone number are required for a kit quote.');
    }
    if (!isConfigured) {
      throw new Error('Store backend is not connected yet.');
    }

    const { data, error } = await client
      .from(TABLES.KIT_REQUESTS)
      .insert({
        garment,
        quantity: Number(quantity),
        printing: printing || 'none',
        notes: notes || null,
        customer_name: customer.name,
        phone: normalizePhone(customer.phone),
        estimated_total: Number(estimatedTotal) || null,
        status: 'new',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /* ----------------------------------------------------- */
  /* REALTIME SUBSCRIPTIONS (live stock sync)                 */
  /* ----------------------------------------------------- */

  function connectRealtime() {
    if (!BAARI_CONFIG.FEATURES.ENABLE_REALTIME_STOCK) return;
    if (!isConfigured || realtimeChannel) return;

    try {
      realtimeChannel = client
        .channel('public:products')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: TABLES.PRODUCTS },
          (payload) => {
            const record = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
            if (!record) return;
            const normalized = normalizeProduct(record);
            stockListeners.forEach((cb) => {
              try {
                cb({ action: payload.eventType, product: normalized });
              } catch (err) {
                console.error('[BaariDB] Realtime listener error:', err);
              }
            });
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('[BaariDB] Realtime connection unavailable:', err);
    }
  }

  function onStockUpdate(callback) {
    stockListeners.add(callback);
    return () => stockListeners.delete(callback);
  }

  /* ----------------------------------------------------- */
  /* NORMALIZATION / HELPERS                                 */
  /* ----------------------------------------------------- */

  function normalizeProduct(record) {
    const imageUrl = resolveImageUrl(record.image_url);
    return {
      id: record.id,
      name: record.name || 'Unnamed Product',
      description: record.description || '',
      category: record.categories?.slug || record.category_slug || 'uncategorized',
      categoryLabel: record.categories?.label || null,
      price: Number(record.price) || 0,
      salePrice: record.sale_price ? Number(record.sale_price) : null,
      stockCount: Number(record.stock_count) || 0,
      isNew: Boolean(record.is_new),
      sizes: Array.isArray(record.sizes) ? record.sizes : [],
      imageUrl,
      updated: record.updated_at || record.created_at || null,
    };
  }

  function resolveImageUrl(path) {
    if (!path) return null;
    // Already a full URL (e.g. pasted directly by the admin) — use as-is.
    if (/^https?:\/\//i.test(path)) return path;
    // Otherwise treat it as a Storage object path in the public bucket.
    if (!isConfigured) return null;
    const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  function normalizePhone(phone) {
    let digits = String(phone).replace(/[^\d+]/g, '');
    if (digits.startsWith('0')) {
      digits = '254' + digits.slice(1);
    } else if (digits.startsWith('+254')) {
      digits = digits.slice(1);
    } else if (!digits.startsWith('254')) {
      digits = '254' + digits;
    }
    return digits;
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat(BAARI_CONFIG.STORE.CURRENCY_LOCALE, {
      style: 'currency',
      currency: BAARI_CONFIG.STORE.CURRENCY,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /* ----------------------------------------------------- */
  /* PUBLIC API                                              */
  /* ----------------------------------------------------- */
  return {
    isConfigured: () => isConfigured,
    fetchProducts,
    fetchProductById,
    fetchCategories,
    submitOrder,
    submitKitRequest,
    connectRealtime,
    onStockUpdate,
    normalizePhone,
    formatCurrency,
  };
})();

if (typeof window !== 'undefined') {
  window.BaariDB = BaariDB;
}
