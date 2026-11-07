/**
 * Module:   region-pages
 * Purpose:  Single owner of the category x region landing pages (MEH-2790) —
 *           the threshold, the path shape, and the region lookup. Consumed by
 *           the route (app/[locale]/producers/[category]/[region]) and by
 *           sitemap.js, which must agree with it exactly.
 * Touches:  nothing — pure data + pure helpers, no React, no fetch.
 * Does NOT: own the region → cities mapping (data/regions.js is the SoT, per
 *           MEH-1256), the category slugs (the backend owns those —
 *           CategoryOut.slug, MEH-2139), or the page copy (messages/*.json
 *           under `region_pages`).
 * Related:  lib/diet-pages.js (the module this mirrors); MEH-1204 §B
 *           (hub-and-spoke internal linking); MEH-1754 (a 404 must mean
 *           "genuinely absent").
 * History:  MEH-2790 (creation, 2026-11-07).
 */
import { REGIONS } from "@/data/regions";

/**
 * A cell needs at least this many approved businesses before its page exists
 * at all. Below it the route returns a REAL 404 and the cell is withheld from
 * the sitemap and from every chip.
 *
 * Same number and same reasoning as DIET_PAGE_MIN (lib/diet-pages.js) and
 * MEH-1881's OPEN_NOW_CHIP_MIN: a landing page showing one lonely business is
 * a doorway page to Google and an insult to the business that happens to be
 * the only one on it. Deliberately a RUNTIME data gate, not a feature flag —
 * the page turns itself on when the catalog arrives, with nobody remembering
 * to flip anything.
 */
export const REGION_PAGE_MIN = 5;

/** The route path for a cell. English only — no Hebrew in URLs. */
export function regionPagePath(categorySlug, regionKey) {
  return `/producers/${categorySlug}/${regionKey}`;
}

/** The region entry for a key, or null. `null` is the 404 signal. */
export function getRegion(regionKey) {
  return REGIONS.find((r) => r.key === regionKey) ?? null;
}

/** Every region key, in data/regions.js order. */
export const REGION_KEYS = REGIONS.map((r) => r.key);

/**
 * RESERVED PATH. `/producers/diet/<slug>` is the MEH-1935 diet route and must
 * keep resolving there, so no category slug may ever be "diet" — in Next's
 * App Router a static segment wins over a dynamic one, but a category with
 * this slug would still be unreachable, which is a silent content bug rather
 * than an error. The registry test asserts the backend never mints it.
 */
export const RESERVED_CATEGORY_SLUGS = ["diet"];

/**
 * The cities whose businesses belong on a region's page.
 *
 * Returned as a plain array so the caller can spread it into repeated
 * `?cities=` params. The backend caps the list at 40 and 422s above it; the
 * largest region here is ~18, so the cap is headroom, not a constraint.
 */
export function regionCities(regionKey) {
  return getRegion(regionKey)?.cities ?? [];
}
