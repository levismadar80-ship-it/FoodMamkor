/**
 * Module:   producer-route
 * Purpose:  Single source of truth for "is this the public producer detail
 *           page?" — the `/producer/[id]` leaf, excluding the
 *           `/producer/dashboard/...` owner subtree. Several components gate
 *           their own chrome off this route (chat FAB, and now BottomNav).
 * Does NOT: strip the locale — callers must pass a locale-stripped pathname
 *           (`usePathname` from `@/i18n/navigation`, NOT next/navigation).
 * Related:  frontend/components/ChatWidgetLazy.jsx (MEH-1168 P3 gate),
 *           frontend/components/BottomNav.jsx (MEH-1202 gate).
 * History:  MEH-1202 (extracted from ChatWidgetLazy's inline copy so the two
 *           gates share one owner — no "keep in sync" drift).
 */

/**
 * True for the public producer detail leaf `/producer/<id>` (all locales,
 * once the pathname is locale-stripped). The negative lookahead keeps the
 * `/producer/dashboard/...` owner subtree OUT, and the `$` anchor matches the
 * leaf only so a hypothetical future nested public route wouldn't accidentally
 * inherit the gate.
 *
 * @param {string} pathname locale-stripped path (e.g. "/producer/123")
 * @returns {boolean}
 */
export function isProducerDetail(pathname) {
  return /^\/producer\/(?!dashboard(\/|$))[^/]+$/.test(pathname || "");
}
