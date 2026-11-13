/**
 * The one path to a business page.
 *
 * Two public routes reach a business, and each takes a different key:
 *   - `/{slug}`          → app/[locale]/[slug]      (the slug, Hebrew or Latin)
 *   - `/producer/{id}`   → app/[locale]/producer/[id] (the UUID ONLY — it
 *     calls GET /producers/{id}, which answers 422 for anything that is not a
 *     UUID, and the page turns that into «בית העסק הזה לא נמצא»)
 *
 * So `/producer/${slug}` is always a dead link. That is exactly what the
 * surprise-bag row shipped with (`/producer/${producer.slug || producer.id}`)
 * — every bag on staging opened the not-found page. Build the path here and
 * nowhere else; `__tests__/ProducerPathGuard.test.js` fails on a hand-written
 * `/producer/${…slug…}`.
 *
 * @param {{ slug?: string|null, id?: string|null }} producer
 * @param {string} [hash] optional section anchor, without the `#`
 * @returns {string|null} null when neither key is present
 */
export function producerPath(producer, hash) {
  if (!producer) return null;
  const base = producer.slug
    ? `/${producer.slug}`
    : producer.id
      ? `/producer/${producer.id}`
      : null;
  if (!base) return null;
  return hash ? `${base}#${hash}` : base;
}

/** The business page, scrolled to its surprise-bag section (RescueSection's id). */
export const RESCUE_SECTION_ID = "section-rescue";

export function rescueBagPath(producer) {
  return producerPath(producer, RESCUE_SECTION_ID);
}
