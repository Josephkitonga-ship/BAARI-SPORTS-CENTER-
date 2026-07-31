/* =========================================================
   BAARI SPORTS CENTER — faas-service.js
   PATHWAY B: Ephemeral Serverless Compute (Sensitive ops)
   ---------------------------------------------------------
   Every call in this file hits a serverless function in
   /functions — never the BaaS directly. These endpoints hold
   secret keys server-side (payment provider secrets, WhatsApp
   Business API tokens) and are the ONLY layer permitted to
   write elevated/financial records back into the BaaS.
   This client file NEVER holds or transmits secret keys —
   it only sends the minimal payload the function needs.
   ========================================================= */

const FaasService = (() => {
  const { BASE_URL, ENDPOINTS, TIMEOUT_MS } = BAARI_CONFIG.FAAS;

  /* ----------------------------------------------------- */
  /* Low-level fetch helper with timeout + retry-safe design */
  /* ----------------------------------------------------- */
  async function faasFetch(endpoint, { method = 'POST', body = null } = {}) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutHandle);

      const contentType = res.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await res.json()
        : { message: await res.text() };

      if (!res.ok) {
        const err = new Error(payload?.error || payload?.message || `Function call failed [${res.status}]`);
        err.status = res.status;
        err.payload = payload;
        throw err;
      }

      return payload;
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. Please check your connection and try again.');
      }
      throw err;
    }
  }

  /* ----------------------------------------------------- */
  /* CHECKOUT (functions/checkout)                           */
  /* ----------------------------------------------------- */

  /**
   * Submits a cart for checkout processing. The function verifies
   * payment (e.g. M-Pesa STK push / callback confirmation), writes
   * the authoritative order + transaction record, and returns a
   * confirmation reference. Cart totals are RE-CALCULATED
   * server-side — client totals are never trusted for payment.
   *
   * @param {Object} order
   * @param {Array<{productId:string, quantity:number, size?:string}>} order.items
   * @param {{name:string, phone:string, location:string}} order.customer
   * @param {string} order.paymentMethod - e.g. 'mpesa'
   */
  async function submitCheckout({ items, customer, paymentMethod = 'mpesa' }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Cannot checkout an empty cart.');
    }
    if (!customer?.name || !customer?.phone) {
      throw new Error('Customer name and phone number are required.');
    }

    return faasFetch(ENDPOINTS.CHECKOUT, {
      method: 'POST',
      body: {
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          size: i.size || null,
        })),
        customer: {
          name: customer.name,
          phone: normalizePhone(customer.phone),
          location: customer.location || '',
        },
        paymentMethod,
        clientTimestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Polls the checkout function for payment confirmation status
   * (used after an M-Pesa STK push is triggered).
   */
  async function pollCheckoutStatus(orderId) {
    return faasFetch(`${ENDPOINTS.CHECKOUT}/status/${encodeURIComponent(orderId)}`, {
      method: 'GET',
    });
  }

  /* ----------------------------------------------------- */
  /* CUSTOM KITS (functions/custom-kits)                      */
  /* ----------------------------------------------------- */

  /**
   * Requests an authoritative bulk-pricing quote for a custom
   * team kit order. The client-side calculator in app.js shows
   * an instant ESTIMATE using public baseline pricing from
   * config.js, but this call returns the true, final quote that
   * accounts for current fabric costs, printing capacity, and
   * any live promotions — and is what actually gets persisted
   * as a kit_requests record.
   */
  async function requestKitQuote({ garment, quantity, printing, notes, customer }) {
    if (!garment || !quantity || quantity < 5) {
      throw new Error('Custom kit orders require a minimum quantity of 5.');
    }

    return faasFetch(ENDPOINTS.CUSTOM_KITS, {
      method: 'POST',
      body: {
        garment,
        quantity: Number(quantity),
        printing: printing || 'none',
        notes: notes || '',
        customer: customer
          ? { name: customer.name, phone: normalizePhone(customer.phone) }
          : null,
        clientTimestamp: new Date().toISOString(),
      },
    });
  }

  /* ----------------------------------------------------- */
  /* NOTIFICATIONS (functions/notifications)                  */
  /* ----------------------------------------------------- */

  /**
   * Triggers an automated WhatsApp/SMS receipt or order-status
   * update for a confirmed order. Called after submitCheckout
   * succeeds, or standalone for kit-quote follow-ups.
   */
  async function triggerNotification({ orderId, type = 'order_confirmation', phone }) {
    if (!BAARI_CONFIG.FEATURES.ENABLE_WHATSAPP_RECEIPT) return null;

    try {
      return await faasFetch(ENDPOINTS.NOTIFICATIONS, {
        method: 'POST',
        body: {
          orderId,
          type,
          phone: phone ? normalizePhone(phone) : null,
        },
      });
    } catch (err) {
      // Notification failure should never block the user's checkout flow.
      console.warn('[FaasService] Notification dispatch failed (non-blocking):', err);
      return null;
    }
  }

  /* ----------------------------------------------------- */
  /* HELPERS                                                  */
  /* ----------------------------------------------------- */

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

  /* ----------------------------------------------------- */
  /* PUBLIC API                                               */
  /* ----------------------------------------------------- */
  return {
    submitCheckout,
    pollCheckoutStatus,
    requestKitQuote,
    triggerNotification,
    normalizePhone,
  };
})();

if (typeof window !== 'undefined') {
  window.FaasService = FaasService;
}
