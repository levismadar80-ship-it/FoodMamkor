// §10 "Meet a Producer" selector — extracted from use-home-page.js for unit
// testability (MEH-542). Reuses the existing is_recommended flag (no schema).

/**
 * Newest recommended producer with a usable short_description, mapped to the
 * §10 editorial shape; null ⇒ section self-hides (HomeStaticBlocks.jsx:199).
 * attribution is omitted — it duplicates the component's meta line.
 *
 * MEH-1484: the module rotates through curation — the most recently added
 * recommended producer surfaces, instead of freezing on the first one loaded.
 * Recency key is `days_since_created` (smaller = newer), the recency proxy the
 * homepage payload already carries — `ProducerListOut` exposes it but NOT raw
 * `created_at`, so no schema/serializer change is needed. Ties (same day) and
 * rows missing the value fall back to stable load order.
 * @param {Array<object>} producers loaded /producers list
 * @returns {?object} editorial object, or null when nothing is featurable
 */
export function selectFeaturedProducer(producers) {
  const candidates = (producers || []).filter(
    (producer) => producer.is_recommended && (producer.short_description || "").trim(),
  );
  if (candidates.length === 0) return null;
  // Stable sort: equal keys keep load order; nulls sink to the end (oldest).
  const source = [...candidates].sort((a, b) => {
    const da = a.days_since_created;
    const db = b.days_since_created;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db; // ascending — fewer days since creation = newer = first
  })[0];
  return {
    name: source.name,
    city: source.city,
    category: source.categories?.[0]?.name,
    photo: source.images?.[0],
    quote: source.short_description.trim(),
    story: (source.description || "").trim(),
    // slug → pretty URL, else the UUID fallback (mirrors ProducerCard.jsx:185).
    href: source.slug ? `/${source.slug}` : `/producer/${source.id}`,
  };
}
