/**
 * Module:   diet-pages
 * Purpose:  Single owner of the six indexable diet landing pages (MEH-1935) —
 *           slug → attribute key → API filter param → page path. Consumed by
 *           the route (app/[locale]/producers/diet/[dietSlug]), by sitemap.js,
 *           and by the sibling-chip internal linking row.
 * Touches:  nothing — pure data + pure helpers, no React, no fetch.
 * Does NOT: own the chip LABELS (lib/attribute-labels.js is the SoT — the H1
 *           reads from there, never a second copy) nor the page COPY (locked
 *           Hebrew lives in messages/*.json under the `diet_pages` namespace).
 * Related:  MEH-1204 §B (hub-and-spoke internal linking), MEH-1881
 *           (OPEN_NOW_CHIP_MIN — the runtime-data-gate pattern this mirrors),
 *           MEH-1934 (shipped the two attributes below).
 * History:  MEH-1935 (creation, 2026-08-07); MEH-1941 (both attributes
 *           flipped to `backed: true` once MEH-1934 landed, 2026-08-08).
 */
import { axisLabel } from "@/lib/chip-copy";

/**
 * MEH-1935: a diet page needs at least this many matching businesses before it
 * exists at all. Below the threshold the route returns a REAL 404 and the page
 * is withheld from the sitemap.
 *
 * Same number and same reasoning as MEH-1204 decision 2 (≥5 per cell → thin
 * content below it) and MEH-1881's OPEN_NOW_CHIP_MIN: a surface that renders
 * one lonely result is a doorway page to Google and an insult to the business
 * that happens to be the only one on it. Deliberately a RUNTIME data gate, not
 * a feature flag — the page turns itself on when the catalog arrives, with
 * nobody remembering to flip anything.
 */
export const DIET_PAGE_MIN = 5;

/**
 * The five pages, in the MEH-1438 chip order (טבעוני · צמחוני · ללא גלוטן ·
 * ללא לקטוז) with the surviving MEH-1934 addition appended — that order is locked
 * and must not be reshuffled here, because the sibling-chip row renders it.
 *
 *  - `slug`        URL segment. English, per the project-wide route rule.
 *  - `attribute`   filter-axis key; its label is messages `filter_axes.<key>.label`.
 *  - `filterParam` the existing /producers query param (MEH-293 EXISTS filter).
 *  - `backed`      does the BACKEND actually implement `filterParam` today?
 *
 * `backed` is not redundant with the ≥5 data gate, and this is the whole
 * reason the field exists. FastAPI IGNORES an unknown query param rather than
 * rejecting it, so `GET /producers?no_added_sugar=true` today returns the
 * ENTIRE approved catalog — which sails through a count-based gate and would
 * publish an indexable page whose grid contradicts its own H1. The count gate
 * cannot detect that; only this flag can. MEH-1934 shipped the two columns and
 * their filters; MEH-1941 flipped these to `true`, so all five are backed today
 * — the flag stays because it is what a NEW slug must declare before it can be
 * served, and because the count gate still cannot detect an ignored param.
 */
export const DIET_PAGES = [
  { slug: "vegan", attribute: "vegan", filterParam: "vegan", backed: true },
  { slug: "vegetarian", attribute: "vegetarian", filterParam: "vegetarian", backed: true },
  { slug: "gluten-free", attribute: "gluten_free", filterParam: "gluten_free", backed: true },
  { slug: "lactose-free", attribute: "lactose_free", filterParam: "lactose_free", backed: true },
  // MEH-1934 has landed, and MEH-1941 flipped these to `backed: true`.
  // MEH-2748 removed the old `pendingLabel` fallback: it never had a live
  // caller, and the label now comes from messages like every other axis.
  { slug: "no-added-sugar", attribute: "no_added_sugar", filterParam: "no_added_sugar", backed: true },
  // MEH-2047: the low-carb page is withdrawn with the claim itself — an
  // indexable page whose H1 states an unregulated nutrition claim is the same
  // over-claim on a louder surface. getDietPage("low-carb") now returns null,
  // so the route 404s and sitemap.js stops emitting it.
];

/**
 * The route lives at /producers/diet/[dietSlug] — a STATIC `diet` segment,
 * decided by Sapir on 2026-08-07 against the two alternatives.
 *
 * Why not the shorter /producers/[dietSlug]: MEH-1204 decision 3 (locked)
 * reserves /producers/[category]/[region] for the category×region pages. Next
 * refuses two different slug names under one parent —
 * node_modules/next/dist/shared/lib/router/utils/sorted-routes.js: "You cannot
 * use different slug names for the same dynamic path" — so taking the bare
 * first segment here would force child B to rename these URLs AFTER Google had
 * indexed them, the exact expensive-to-reverse move that EPIC warns about.
 * The static segment sidesteps it entirely and keeps the pages under the
 * /producers hub, which is what MEH-1204 §B's hub-and-spoke linking wants.
 *
 * Single owner of the shape: sitemap.js, the sibling chips and the breadcrumb
 * all call this, so the route can move by editing one line.
 */
export function dietPagePath(slug) {
  return `/producers/diet/${slug}`;
}

/** Config lookup. Returns null for an unknown slug — never throws. */
export function getDietPage(slug) {
  return DIET_PAGES.find((p) => p.slug === slug) ?? null;
}

/**
 * Can this page be served at all, ignoring the catalog count? False for a slug
 * whose backend filter does not exist yet (see `backed` above).
 */
export function isDietPageBacked(entry) {
  return Boolean(entry?.backed);
}

/** The pages whose filter the backend actually implements. */
export const BACKED_DIET_PAGES = DIET_PAGES.filter(isDietPageBacked);

/**
 * H1 / chip label. Reads the SAME message the filter chip renders
 * (`filter_axes.<attribute>.label`) so the page and the chip can never
 * disagree (MEH-1935: "H1 = label ה-chip, לא לנסח מחדש"). MEH-2748: `t` is a
 * ROOT-namespace translator — `getTranslations({ locale })` on the server.
 *
 * @param {object|null} entry  a DIET_PAGES entry
 * @param {(key: string) => string} t  required — there is no Hebrew fallback
 */
export function dietPageLabel(entry, t) {
  if (!entry) return null;
  return axisLabel(t, entry.attribute);
}
