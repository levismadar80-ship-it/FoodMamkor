/**
 * Module:   safe-redirect
 * Purpose:  Clamp a post-login `?redirect=` value to an internal, same-origin
 *           path so an attacker-supplied param can't bounce the user off-site.
 * Does NOT: parse or validate full URLs — it deliberately only accepts paths
 *           that begin with a single "/". Anything else falls back.
 * Related:  app/[locale]/login/LoginClient.jsx:63 and
 *           app/[locale]/register/RegisterClient.jsx (consumers).
 * History:  MEH-810 (creation) — open-redirect hardening; sibling of MEH-805;
 *           MEH-837 (added /register OAuth-success as a second consumer).
 */

// Accept only a leading single "/" NOT followed by "/" or "\".
// Rejects: absolute ("https://evil.com"), protocol-relative ("//evil.com"),
// backslash tricks ("/\\evil.com" — browsers fold "\" to "/"), and non-path
// schemes ("javascript:..."). Bare "/" is allowed (next char is end-of-string).
const INTERNAL_PATH = /^\/(?![/\\])/;

/**
 * @param {unknown} raw       candidate redirect target (e.g. searchParams value)
 * @param {string}  fallback  returned when `raw` is not a safe internal path
 * @returns {string} `raw` when it is a same-origin path, else `fallback`
 */
export function safeInternalRedirect(raw, fallback = "/") {
  if (typeof raw !== "string" || raw === "") return fallback;
  return INTERNAL_PATH.test(raw) ? raw : fallback;
}

/**
 * MEH-2982: the login URL that brings a signed-out reader back to the page she
 * is on. A guest redirected to a bare "/login" lands on "/" after signing in
 * and loses the page that sent her there.
 * REUSES: components/LoginPromptModal.jsx:103 — same `?redirect=` shape,
 * clamped on the login side by safeInternalRedirect above.
 *
 * @returns {string} "[/en]/login?redirect=<current path + query>", or
 *          "/login" when there is no window (server render).
 */
export function loginHrefBackHere() {
  if (typeof window === "undefined") return "/login";
  const { pathname, search } = window.location;
  // Callers push with next/navigation's router, which adds no locale prefix,
  // so an /en reader would otherwise land on the Hebrew login page (the
  // MEH-1157 family). Hebrew is the as-needed default and carries no prefix.
  const prefix = /^\/en(?=\/|$)/.test(pathname) ? "/en" : "";
  return `${prefix}/login?redirect=${encodeURIComponent(pathname + search)}`;
}
