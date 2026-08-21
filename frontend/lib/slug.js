/**
 * Module:   slug
 * Purpose:  Cheap slug-shape guard for the root catch-all route — reject bot
 *           probes (/wp-admin, /.env, /xmlrpc.php …) BEFORE any backend fetch.
 * Does NOT: resolve slugs to producers (that's app/[locale]/[slug]/page.js).
 * History:  MEH-1045 (fast-404 bot-hardening); MEH-1119 (extracted out of
 *           [slug]/page.js so the page file exports only valid Next Page fields
 *           — a non-Page `export` breaks `next build --webpack` type-check);
 *           MEH-2148 (16 missing real routes added + `isReserved` for the
 *           drift guard — RESERVED now also gates the chrome-unmount decision
 *           in lib/producer-route.js, so a gap here hides the nav on a real
 *           page, not just skips a fetch).
 */

// Reserved root paths that must NOT be treated as a slug.
// Next.js static routes already win at routing, but this guards
// fetch attempts in case of edge cases / direct calls.
//
// MEH-2148: this set stopped being advisory. `isProducerDetail` (producer-route.js)
// now asks `isSlugShaped` whether a single-segment path is a business page, so a
// REAL route missing from here reads as a business slug and BottomNav +
// ChatWidgetLazy unmount on it. Sixteen real `app/[locale]/` directories were
// missing (measured, not assumed) — every one added below. The drift test in
// __tests__/ProducerRouteGate.test.jsx reads the directory listing and fails on
// the next one, so this list cannot silently fall behind the router again.
const RESERVED = new Set([
  "about", "admin", "favorites", "login", "map",
  "p", "producer", "rate", "register", "settings", "terms",
  "upgrade", "messages", "discover", "publish", "newsletter",
  "api", "_next", "favicon.ico", "manifest.json",
  "robots.txt", "sitemap.xml", "sw.js",
  // MEH-2148: real `app/[locale]/` route directories that were absent.
  "accessibility", "contact", "dev", "events", "experiences",
  "forgot-password", "group-buys", "home", "join", "privacy",
  "producers", "ref", "reset-password", "search", "share",
  "verify-email",
]);

// Real slugs are produced by backend _slugify
// (backend/app/services/producer_import.py:34-41 — lowercase, charset
// [\w ֐-׿ -], max 100 chars, never contains a dot), so anything
// outside that shape can be rejected BEFORE the backend fetch.
const SLUG_SHAPE = /^[a-z0-9_֐-׿-]{1,100}$/;
// Well-known scanner path prefixes that ARE slug-shaped (wp-admin etc.).
const SCANNER_PREFIXES = ["wp-", "wordpress", "xmlrpc", "phpmyadmin", "cgi-"];

/**
 * MEH-2148: read-only view of RESERVED for the drift test. Exported as a
 * predicate rather than the Set itself so no caller can mutate the live set —
 * the guard needs to READ the list, not own it.
 * @param {string} name
 * @returns {boolean}
 */
export function isReserved(name) {
  return RESERVED.has(String(name || "").toLowerCase());
}

/**
 * True when `slug` could be a real producer slug (cheap shape check only).
 * @param {string} slug
 * @returns {boolean}
 */
export function isSlugShaped(slug) {
  if (!slug) return false;
  const s = slug.toLowerCase();
  if (RESERVED.has(s)) return false;
  // Dots never appear in generated slugs — kills /.env, /foo.php, /a.txt.
  if (s.includes(".")) return false;
  if (SCANNER_PREFIXES.some((p) => s.startsWith(p))) return false;
  return SLUG_SHAPE.test(s);
}
