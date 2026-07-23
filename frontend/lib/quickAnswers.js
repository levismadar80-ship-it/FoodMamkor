/**
 * Module:   quickAnswers
 * Purpose:  Pure answer descriptors for the producer contact card's "Quick
 *           Answers" (MEH-1302) — turn the producer's already-public delivery
 *           and contact data into a small structured descriptor the
 *           WhatsAppQuestionChips component renders as an in-page disclosure
 *           (answer-first), falling back to WhatsApp only when data is absent.
 * Touches:  nothing — pure, no I/O, no React, no i18n (answer STRINGS live in
 *           the component + messages/*.json; here we only classify + shape).
 *           Consumes the PUBLIC ProducerDetailOut shape.
 * Does NOT: render, translate, or build WhatsApp hrefs — see
 *           WhatsAppQuestionChips.jsx (rendering) and lib/contact-method.js
 *           (primary-CTA hrefs, REUSED here for the ordering channel link).
 * Related:  frontend/lib/contact-method.js:34 (getPrimaryContactHref),
 *           backend/app/schemas/schemas.py:924-941 (public delivery fields:
 *           has_physical_location, offers_delivery, delivery_nationwide,
 *           delivery_excluded_cities, delivery_areas).
 * History:  MEH-1302 (creation).
 */
import { getPrimaryMethod, getPrimaryContactHref } from "@/lib/contact-method";

// Cap the delivery-city preview; the remainder is summarised as "+ N more".
const MAX_DELIVERY_CITIES = 4;

/**
 * Classify the producer's delivery reality into a render-ready descriptor.
 * Returns `null` when there is no usable data — the caller then falls back to
 * the WhatsApp link (today's behaviour).
 *
 * @param {object|null|undefined} producer — public ProducerDetailOut shape
 * @returns {
 *   | { kind: "nationwide" }
 *   | { kind: "nationwide_except", cities: string[] }
 *   | { kind: "areas", cities: string[], moreCount: number,
 *       minOrder: number|null, deliveryDay: string|null }
 *   | { kind: "pickup_only", city: string|null }
 *   | null
 * }
 */
export function buildDeliveryAnswer(producer) {
  if (!producer) return null;

  if (producer.delivery_nationwide) {
    const excluded = (producer.delivery_excluded_cities || []).filter(Boolean);
    return excluded.length > 0
      ? { kind: "nationwide_except", cities: excluded }
      : { kind: "nationwide" };
  }

  const areas = (producer.delivery_areas || []).filter((a) => a && a.city);
  if (areas.length > 0) {
    const cities = areas.slice(0, MAX_DELIVERY_CITIES).map((a) => a.city);
    const moreCount = Math.max(0, areas.length - MAX_DELIVERY_CITIES);
    const mins = areas
      .map((a) => a.min_order)
      .filter((m) => typeof m === "number" && m > 0);
    const minOrder = mins.length > 0 ? Math.min(...mins) : null;
    const days = [...new Set(areas.map((a) => a.delivery_day).filter(Boolean))];
    const deliveryDay = days.length > 0 ? days.join(", ") : null;
    return { kind: "areas", cities, moreCount, minOrder, deliveryDay };
  }

  // No delivery + a physical location → self-pickup is the honest answer.
  if (!producer.offers_delivery && producer.has_physical_location) {
    return { kind: "pickup_only", city: producer.city || null };
  }

  return null;
}

/**
 * Classify how to order, driven by primary_contact_method. Reuses
 * getPrimaryContactHref so the channel link matches the primary CTA exactly.
 * Returns `null` when the method's backing field is missing (→ WhatsApp
 * fallback). WhatsApp itself needs no link — the primary CTA already sends.
 *
 * @param {object|null|undefined} producer
 * @returns {
 *   | { kind: "whatsapp" }
 *   | { kind: "phone", href: string, phone: string }
 *   | { kind: "external_order"|"website"|"instagram"|"facebook"|"email", href: string }
 *   | null
 * }
 */
export function buildOrderingAnswer(producer) {
  if (!producer) return null;
  const method = getPrimaryMethod(producer);
  if (method === "whatsapp") return { kind: "whatsapp" };

  const href = getPrimaryContactHref(producer);
  if (!href) return null; // backing field missing → fall back to WhatsApp

  if (method === "phone") return { kind: "phone", href, phone: producer.phone };
  return { kind: method, href };
}
