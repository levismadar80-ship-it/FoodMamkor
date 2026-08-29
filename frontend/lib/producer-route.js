/**
 * Module:   producer-route
 * Purpose:  Single source of truth for "is this the public producer detail
 *           page?" — BOTH surfaces that render it: the `/producer/[id]` leaf
 *           (excluding the `/producer/dashboard/...` owner subtree) and the
 *           canonical `/[slug]` root leaf. Several components gate their own
 *           chrome off this route (chat FAB, BottomNav).
 * Does NOT: strip the locale — callers must pass a locale-stripped pathname
 *           (`usePathname` from `@/i18n/navigation`, NOT next/navigation).
 *           Does NOT resolve the slug to a producer: this is a route-SHAPE
 *           question asked during render, with no data available.
 * Related:  frontend/components/ChatWidgetLazy.jsx (MEH-1168 P3 gate),
 *           frontend/components/BottomNav.jsx (MEH-1202 gate),
 *           frontend/lib/slug.js (RESERVED + the shape check).
 * History:  MEH-1202 (extracted from ChatWidgetLazy's inline copy so the two
 *           gates share one owner — no "keep in sync" drift);
 *           MEH-2148 (the `/[slug]` arm — see below).
 */

import { isSlugShaped } from "@/lib/slug";

/**
 * True for the public producer detail page, on either URL that renders it.
 *
 * Arm 1 — `/producer/<id>`. The negative lookahead keeps the
 * `/producer/dashboard/...` owner subtree OUT, and the `$` anchor matches the
 * leaf only so a hypothetical future nested public route wouldn't accidentally
 * inherit the gate.
 *
 * Arm 2 — `/<slug>` (MEH-2148). Since MEH-1060 the CANONICAL business URL is
 * the root catch-all (`app/[locale]/[slug]/page.js` renders the very same
 * `ProducerDetail`), and the MEH-1202 gate never fired there: BottomNav
 * (z-1000) kept drawing over StickyContactBar (z-598) and clipped the primary
 * CTA on exactly the URL outreach sends businesses to.
 *
 * The distinction between "a business slug" and "a real route" is
 * `isSlugShaped`, whose RESERVED set lists every real root path — so this arm
 * is only as correct as that set is complete, which is why MEH-2148 also added
 * the 16 missing directories and a drift test that reads the router's own
 * directory listing. A false positive here does not 404 a page; it silently
 * removes the mobile nav from one. Leaf only: `/x/recipes` keeps its chrome.
 *
 * @param {string} pathname locale-stripped path (e.g. "/producer/123", "/maafiat-dana")
 * @returns {boolean}
 */
export function isProducerDetail(pathname) {
  const path = pathname || "";
  if (/^\/producer\/(?!dashboard(\/|$))[^/]+$/.test(path)) return true;
  const leaf = /^\/([^/]+)$/.exec(path);
  return leaf ? isSlugShaped(leaf[1]) : false;
}
