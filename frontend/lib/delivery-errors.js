/**
 * MEH-1943 chunk 3 — code→copy resolver for the two delivery 422s from
 * backend/app/services/delivery_validation.py (owner PUT /producers/me and
 * admin PUT /admin/producers/{id} both run them).
 *
 * The backend sends `{code, message, params}`; the copy lives in
 * `dashboard.producer.delivery.errors.<code>` (he = the backend's sentence
 * word for word, en = its direct translation). Both consumers — the owner
 * DeliveryCard and the admin ProducerForm — pass a translator scoped to
 * `dashboard.producer.delivery`, so the sentence has ONE home in messages/*.json.
 *
 * Unknown codes return null so `detailToMessage` falls back to `message`.
 * No Hebrew in this file on purpose: that is what the ticket removes.
 */
export const DELIVERY_ERROR_CODES = new Set([
  "excluded_requires_nationwide",
  "nationwide_requires_delivery",
]);

/**
 * @param {(key: string) => string} tDelivery translator scoped to
 *   `dashboard.producer.delivery`
 * @returns {(code: string) => (string | null)}
 */
export function makeDeliveryCodeResolver(tDelivery) {
  return (code) => (DELIVERY_ERROR_CODES.has(code) ? tDelivery(`errors.${code}`) : null);
}
