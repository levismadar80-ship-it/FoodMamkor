// @ts-check
/**
 * Module:   site-pages
 * Purpose:  The paths the chat assistants may link to, and the function that
 *           splits an answer into text and links to exactly those paths.
 * Touches:  nothing — pure data + a pure function.
 * Does NOT: hold the list's names for the model (backend/app/site_pages.py)
 *           or the link labels (messages `chat.pages.<key>`).
 * Related:  backend/app/site_pages.py (the same paths; the pytest
 *           tests/test_site_pages_registry.py fails when the two differ) ·
 *           components/ChatMessageText.jsx (renders the parts).
 * History:  20/11 — the assistant named «מחירון» with no link.
 *
 * A path the model made up is not in this map, so it stays plain text: the
 * widget never renders a link that can 404.
 */

/** @type {Readonly<Record<string, string>>} path → label key */
export const SITE_PAGES = Object.freeze({
  "/map": "map",
  "/events": "events",
  "/experiences": "experiences",
  "/group-buys": "group_buys",
  "/favorites": "favorites",
  "/register": "register",
  "/login": "login",
  "/join": "join",
  "/register/producer": "register_business",
  "/join/pricing": "pricing",
  "/producer/dashboard": "dashboard",
  "/recommend": "recommend",
  "/about": "about",
  "/contact": "contact",
  "/terms": "terms",
  "/privacy": "privacy",
  "/accessibility": "accessibility",
  "/rescue": "rescue",
});

// A site path: "/" then lowercase segments. Not preceded by a letter, digit,
// "/" or ":" so "https://x.com/map" and "a/map" are left alone. One flat
// character class, no nested quantifier (security/detect-unsafe-regex); a
// trailing "/" or "-" is trimmed off below and stays text.
const PATH_RE = /(?<![A-Za-z0-9/:.])\/[a-z][a-z0-9/-]*/g;

/**
 * @param {string} text
 * @returns {Array<{ type: "text", value: string } | { type: "link", href: string, key: string }>}
 */
export function splitSiteLinks(text) {
  /** @type {Array<{ type: "text", value: string } | { type: "link", href: string, key: string }>} */
  const parts = [];
  let last = 0;
  for (const match of String(text ?? "").matchAll(PATH_RE)) {
    let href = match[0];
    while (href.endsWith("/") || href.endsWith("-")) href = href.slice(0, -1);
    const key = SITE_PAGES[href];
    if (!key) continue;
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "link", href, key });
    last = start + href.length;
  }
  if (last < String(text ?? "").length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
