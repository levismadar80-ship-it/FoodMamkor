// §10 "Meet a Producer" selector — extracted from use-home-page.js for unit
// testability (MEH-542). Reuses the existing is_recommended flag (no schema).

/**
 * First recommended producer with a usable short_description, mapped to the
 * §10 editorial shape; null ⇒ section self-hides (HomeStaticBlocks.jsx:199).
 * attribution is omitted — it duplicates the component's meta line.
 * @param {Array<object>} producers loaded /producers list
 * @returns {?object} editorial object, or null when nothing is featurable
 */
export function selectFeaturedProducer(producers) {
  const source = (producers || []).find(
    (producer) => producer.is_recommended && (producer.short_description || "").trim(),
  );
  if (!source) return null;
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
