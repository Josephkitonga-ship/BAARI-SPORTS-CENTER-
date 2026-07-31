/* =========================================================
   BAARI SPORTS CENTER — baas-client.js
   PATHWAY A: Direct BaaS Connection (Ultra-low latency reads)
   ---------------------------------------------------------
   Handles: product/category fetches, pagination, search,
   and live realtime stock subscriptions — ALL directly
   against the BaaS (PocketBase) instance, bypassing serverless
   compute entirely. No secret keys ever live in this file;
   only public, read-scoped collection access is used here,
   governed by baas/rules.json.
   ========================================================= */

const BaasClient = (() => {
  const { BASE_URL, COLLECTIONS, PAGE_SIZE } = BAARI_CONFIG.BAAS;

  let realtimeSocket = null;
  let realtimeReconnectAttempts = 0;
  const realtimeListeners = new Map(); // topic -> Set<callback>
  let isRealtimeConnected = false;

  /* ----------------------------------------------------- */
  /* Low-level fetch helper                                 */
  /* ----------------------------------------------------- */
  async function baasFetch(path, { method = 'GET', params = null, body = null } = {}) {
    let url = `${BASE_URL}${path}`;

    if (params) {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
      );
      url += `?${query.toString()}`;
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`BaaS request failed [${res.status}]: ${errText}`);
    }

    return res.json();
  }

  /* ----------------------------------------------------- */
  /* PRODUCTS                                                */
  /* ----------------------------------------------------- */

  /**
   * Fetch a page of products, optionally filtered by category,
   * search term, and a named filter chip (in-stock / new / sale).
   */
  async function fetchProducts({
    page = 1,
    perPage = PAGE_SIZE,
    category = 'all',
    filter = 'all',
    query = '',
    sort = '-created',
  } = {}) {
    const filterClauses = [];

    if (category && category !== 'all') {
      filterClauses.push(`category = "${escapeFilterValue(category)}"`);
    }

    if (query && query.trim()) {
      const q = escapeFilterValue(query.trim());
      filterClauses.push(`(name ~ "${q}" || description ~ "${q}" || tags ~ "${q}")`);
    }

    if (filter === 'in-stock') {
      filterClauses.push('stock_count > 0');
    } else if (filter === 'new') {
      filterClauses.push('is_new = true');
    } else if (filter === 'sale') {
      filterClauses.push('sale_price > 0');
    }

    const filterString = filterClauses.length ? filterClauses.join(' && ') : '';

    try {
      const data = await baasFetch(`/api/collections/${COLLECTIONS.PRODUCTS}/records`, {
        params: {
          page,
          perPage,
          filter: filterString || undefined,
          sort,
        },
      });

      return {
        items: (data.items || []).map(normalizeProduct),
        totalItems: data.totalItems ?? 0,
        totalPages: data.totalPages ?? 1,
        page: data.page ?? page,
      };
    } catch (err) {
      console.error('[BaasClient] fetchProducts failed:', err);
      return { items: [], totalItems: 0, totalPages: 1, page };
    }
  }

  async function fetchProductById(id) {
    try {
      const record = await baasFetch(`/api/collections/${COLLECTIONS.PRODUCTS}/records/${id}`);
      return normalizeProduct(record);
    } catch (err) {
      console.error('[BaasClient] fetchProductById failed:', err);
      return null;
    }
  }

  /* ----------------------------------------------------- */
  /* CATEGORIES                                              */
  /* ----------------------------------------------------- */
  async function fetchCategories() {
    try {
      const data = await baasFetch(`/api/collections/${COLLECTIONS.CATEGORIES}/records`, {
        params: { perPage: 50, sort: 'sort_order' },
      });
      return (data.items || []).map((c) => ({
        id: c.id,
        slug: c.slug,
        label: c.label,
        icon: c.icon || null,
      }));
    } catch (err) {
      console.error('[BaasClient] fetchCategories failed:', err);
      return [];
    }
  }

  /* ----------------------------------------------------- */
  /* REALTIME SUBSCRIPTIONS (live inventory sync)            */
  /* ----------------------------------------------------- */

  function connectRealtime() {
    if (!BAARI_CONFIG.FEATURES.ENABLE_REALTIME_STOCK) return;
    if (realtimeSocket && isRealtimeConnected) return;

    try {
      const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/api/realtime';
      realtimeSocket = new EventSource(`${BASE_URL}/api/realtime`);

      realtimeSocket.addEventListener('PB_CONNECT', (e) => {
        isRealtimeConnected = true;
        realtimeReconnectAttempts = 0;
        subscribeAllTopics(JSON.parse(e.data)?.clientId);
      });

      realtimeSocket.addEventListener('message', handleRealtimeMessage);

      realtimeSocket.onerror = () => {
        isRealtimeConnected = false;
        realtimeSocket?.close();
        scheduleReconnect();
      };
    } catch (err) {
      console.warn('[BaasClient] Realtime connection unavailable, falling back to polling:', err);
      startPollingFallback();
    }
  }

  function scheduleReconnect() {
    realtimeReconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** realtimeReconnectAttempts, 30000);
    setTimeout(connectRealtime, delay);
  }

  async function subscribeAllTopics(clientId) {
    if (!clientId) return;
    try {
      await baasFetch('/api/realtime', {
        method: 'POST',
        body: {
          clientId,
          subscriptions: [`${COLLECTIONS.PRODUCTS}/*`],
        },
      });
    } catch (err) {
      console.warn('[BaasClient] Topic subscription failed:', err);
    }
  }

  function handleRealtimeMessage(event) {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    const { action, record } = payload;
    if (!record) return;

    const normalized = normalizeProduct(record);
    const listeners = realtimeListeners.get('stock') || new Set();
    listeners.forEach((cb) => {
      try {
        cb({ action, product: normalized });
      } catch (err) {
        console.error('[BaasClient] Realtime listener error:', err);
      }
    });
  }

  /**
   * Fallback for environments where EventSource/SSE is blocked
   * (some mobile carrier networks). Polls stock every 12s.
   */
  let pollHandle = null;
  function startPollingFallback() {
    if (pollHandle) return;
    pollHandle = setInterval(async () => {
      const { items } = await fetchProducts({ perPage: 40, sort: '-updated' });
      const listeners = realtimeListeners.get('stock') || new Set();
      items.forEach((product) => {
        listeners.forEach((cb) => {
          try {
            cb({ action: 'update', product });
          } catch (err) {
            console.error('[BaasClient] Polling listener error:', err);
          }
        });
      });
    }, 12000);
  }

  /**
   * Register a callback for live stock/product change events.
   * Returns an unsubscribe function.
   */
  function onStockUpdate(callback) {
    if (!realtimeListeners.has('stock')) {
      realtimeListeners.set('stock', new Set());
    }
    realtimeListeners.get('stock').add(callback);

    return () => {
      realtimeListeners.get('stock')?.delete(callback);
    };
  }

  /* ----------------------------------------------------- */
  /* NORMALIZATION / HELPERS                                 */
  /* ----------------------------------------------------- */

  function normalizeProduct(record) {
    const imageUrl = record.image
      ? `${BASE_URL}/api/files/${COLLECTIONS.PRODUCTS}/${record.id}/${record.image}`
      : null;

    return {
      id: record.id,
      name: record.name || 'Unnamed Product',
      description: record.description || '',
      category: record.category || 'uncategorized',
      price: Number(record.price) || 0,
      salePrice: record.sale_price ? Number(record.sale_price) : null,
      stockCount: Number(record.stock_count) || 0,
      isNew: Boolean(record.is_new),
      sizes: Array.isArray(record.sizes) ? record.sizes : [],
      imageUrl,
      updated: record.updated || null,
    };
  }

  function escapeFilterValue(value) {
    return String(value).replace(/"/g, '\\"');
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
    fetchProducts,
    fetchProductById,
    fetchCategories,
    connectRealtime,
    onStockUpdate,
    formatCurrency,
  };
})();

if (typeof window !== 'undefined') {
  window.BaasClient = BaasClient;
}
