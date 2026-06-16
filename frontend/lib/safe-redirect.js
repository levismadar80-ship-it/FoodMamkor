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
