// @ts-check
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
 *           WhatsAppQuestionChips.jsx (rendering). There is no «איך מזמינים?»
 *           answer any more: it was built from the primary CTA's own href and
 *           so could only repeat the button above it (Sapir 19/11).
 * Related:  backend/app/schemas/schemas.py:924-941 (public delivery fields:
 *           has_physical_location, offers_delivery, delivery_nationwide,
 *           delivery_excluded_cities, delivery_areas).
 * History:  MEH-1302 (creation); MEH-1512 (pickup_only derives cities from
 *           locations[] so a multi-pickup business isn't reduced to one city);
 *           19/11 buildOrderingAnswer removed, hasDeliverySection added.
 */

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
    // MEH-3484: a city can go out on several days (a delivery zone).
    const days = [
      ...new Set(areas.flatMap((a) => (a.delivery_days?.length ? a.delivery_days : [a.delivery_day])).filter(Boolean)),
    ];
    const deliveryDay = days.length > 0 ? days.join(", ") : null;
    return { kind: "areas", cities, moreCount, minOrder, deliveryDay };
  }

  // No delivery + a physical location → self-pickup is the honest answer.
  if (!producer.offers_delivery && producer.has_physical_location) {
    // MEH-1512: a multi-pickup business must not claim one city. Derive the
    // distinct pickup / market_stand cities from locations[]: exactly one → name
    // it; more than one → null (renders the "no city" copy, honest for a
    // multi-point business); none → the producer's own city as before.
    const pickupCities = [
      ...new Set(
        (producer.locations || [])
          .filter((l) => l && (l.kind === "pickup" || l.kind === "market_stand") && l.city)
          .map((l) => l.city),
      ),
    ];
    const city =
      pickupCities.length === 1
        ? pickupCities[0]
        : pickupCities.length > 1
          ? null
          : producer.city || null;
    return { kind: "pickup_only", city };
  }

  return null;
}

/**
 * Does the business page render its «משלוח» section (`#section-delivery`)?
 * The ONE copy of that gate: ProducerSections renders the section on it,
 * section-nav.js shows the «משלוח» pill on it, and WhatsAppQuestionChips does
 * not ask the delivery question on it — the FAQ section sits right under the
 * delivery section, which is the full answer (Sapir 19–20/11).
 *
 * @param {object|null|undefined} producer
 * @returns {boolean}
 */
export function hasDeliverySection(producer) {
  return !!(
    producer &&
    (producer.offers_delivery ||
      producer.delivery_areas?.length > 0 ||
      producer.pickup_points)
  );
}
