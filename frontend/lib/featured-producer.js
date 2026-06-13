/**
 * Module:   featured-producer
 * Purpose:  Pick + shape the single producer that lights up the homepage
 *           §10 "Meet a Producer" editorial feature (MEH-542).
 * Does NOT: render anything — see app/[locale]/home/HomeStaticBlocks.jsx
 *           (HomeFeaturedProducer); does NOT fetch — consumes the already
 *           loaded /producers list from use-home-page.js.
 * Related:  frontend/components/ProducerCard.jsx:185 (slug → href rule),
 *           HomeStaticBlocks.jsx:199 (the null ⇒ self-hide guard).
 * History:  MEH-542 (creation — extracted from use-home-page.js for unit
 *           testability).
 */

/**
 * Map the first eligible recommended producer to the editorial shape the
 * §10 feature expects. Reuses the existing is_recommended ("recommended")
 * flag — zero schema, zero new endpoint.
 *
 * Eligibility: is_recommended === true AND a non-blank short_description
 * (the magazine pull-quote). No eligible producer ⇒ null ⇒ the section
 * self-hides. No fictional content ever ships.
 *
 * `attribution` is intentionally omitted: the component already renders a
 * "name · category, city" meta line, so a separate credit line would
 * duplicate it.
 *
 * @param {Array<object>} producers - the loaded /producers list.
 * @returns {?{
 *   name: string, city?: string, category?: string, photo?: string,
 *   quote: string, story?: string, href: string
 * }} editorial object, or null when nothing is featurable.
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
