// @ts-check
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
// MEH-3661: browsers drop tab / newline / other C0 controls while parsing a
// URL, so "/\t/evil.com" resolves to //evil.com — a protocol-relative jump.
// Any control character makes a candidate unsafe, wherever it sits.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * @param {unknown} raw       candidate redirect target (e.g. searchParams value)
 * @param {string}  fallback  returned when `raw` is not a safe internal path
 * @returns {string} `raw` when it is a same-origin path, else `fallback`
 */
export function safeInternalRedirect(raw, fallback = "/") {
  if (typeof raw !== "string" || raw === "") return fallback;
  return INTERNAL_PATH.test(raw) && !CONTROL_CHARS.test(raw) ? raw : fallback;
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

// Pages a guest has no reason to be returned to after signing in: the home
// page (the default anyway), the auth screens, and the three token flows —
// their address can carry a credential, which has no business in a second URL.
const NO_RETURN =
  /^\/(?:$|\?|(?:login|register|verify-email|reset-password|forgot-password|registration|owner-invite|claim)(?:[/?]|$))/;

/**
 * MEH-3026 (F2): the href for a «כניסה» LINK.
 *
 * Two different shapes in one URL, on purpose. The link itself is rendered
 * through the locale-aware Link, which adds the locale, so the PATH is a bare
 * "/login". The `redirect` VALUE is pushed after sign-in by a router that adds
 * none (LoginClient.jsx), so it must carry "/en" itself or an English reader
 * comes back to the Hebrew page — the same reason loginHrefBackHere above
 * keeps the prefix.
 *
 * @param {string|null|undefined} path  the page WITHOUT a locale prefix
 *        (path + query), e.g. "/ruach-hasadeh" or "/map?city=x"
 * @param {string} [localePrefix]  "" for Hebrew, "/en" for English
 * @returns {string} "/login?redirect=<prefix + path>", or a bare "/login" from
 *          the home page, the auth screens and the token flows.
 */
export function loginLinkFor(path, localePrefix = "") {
  if (typeof path !== "string" || !INTERNAL_PATH.test(path) || CONTROL_CHARS.test(path) || NO_RETURN.test(path)) return "/login";
  return `/login?redirect=${encodeURIComponent(localePrefix + path)}`;
}

// MEH-3661: more pages whose address can carry a token or that only make
// sense once — never stored for 24 h by lib/post-auth-return.js. Kept apart
// from NO_RETURN so the «כניסה» links of MEH-3026 do not change.
const TOKEN_PAGES =
  /^\/(?:draft-preview|delivery-waitlist|newsletter|freshness|unsubscribe|account-deleted|business-gone)(?:[/?]|$)/;

/**
 * MEH-3661: may a signed-in reader be sent back to `path`? Internal, not the
 * home page, not an auth screen or a token flow (NO_RETURN above). A leading
 * "/en" is looked through, so "/en/login" is refused like "/login".
 * @param {unknown} path
 * @returns {boolean}
 */
export function isReturnablePath(path) {
  if (typeof path !== "string" || !INTERNAL_PATH.test(path) || CONTROL_CHARS.test(path)) return false;
  const stripped = path.replace(/^\/(?:he|en)(?=\/|$|\?)/, "");
  const bare = stripped.startsWith("/") ? stripped : `/${stripped}`;
  return !NO_RETURN.test(bare) && !TOKEN_PAGES.test(bare);
}

/** The «כניסה» link for the page the browser is on. Client only. */
export function loginLinkBackHere() {
  if (typeof window === "undefined") return "/login";
  const { pathname, search } = window.location;
  const prefix = /^\/en(?=\/|$)/.test(pathname) ? "/en" : "";
  const bare = pathname.replace(/^\/(?:he|en)(?=\/|$)/, "") || "/";
  return loginLinkFor(bare + search, prefix);
}
