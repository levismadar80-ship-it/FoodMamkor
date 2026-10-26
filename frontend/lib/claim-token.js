/**
 * Module:   claim-token
 * Purpose:  Keep the owner-claim token (MEH-2321) out of every URL after the
 *           first one. The link the admin sends is /claim/<token>; the claim
 *           page moves the token into this tab's sessionStorage and swaps the
 *           address to /claim, so login/register redirects, analytics and
 *           error reports never carry it. The scrubbers cover what was already
 *           recorded before that swap (the first page view, a navigation
 *           breadcrumb).
 * Touches:  window.sessionStorage only.
 * Does NOT: validate the token — the server does (POST /producer-claim/preview).
 * Related:  app/[locale]/claim/ClaimClient.jsx · sentry.*.config.js ·
 *           components/SpeedInsightsRedacted.jsx · backend producer_claim.py.
 * History:  MEH-2324.
 *
 * The link is a bearer credential: whoever holds it and is signed in can take
 * the draft. That is why it must not sit in a URL a third party records.
 */

const STORAGE_KEY = "mehamakor.claimToken";

// The path segment after /claim/, with or without a locale prefix, up to the
// next delimiter. JWTs are base64url + dots, so this stops at / ? # and quotes.
// A segment starting with [ or %5B is the route's own name ([token]) in a
// chunk URL, which a stack frame must keep; no token starts that way.
const CLAIM_PATH = /\/claim\/(?!\[|%5B)[^/?#\s"'&]+/gi;
const REDACTED = "/claim/[token]";
// The same path percent-encoded, as in a ?redirect= built with
// encodeURIComponent (auth-context's session-expired link). A JWT has no %, so
// the token ends at the next escape.
const CLAIM_PATH_ENCODED = /(%2F(?:[a-z]{2}%2F)?claim)%2F[^/?#\s"'&%]+/gi;

export function stashClaimToken(token) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
    return window.sessionStorage.getItem(STORAGE_KEY) === token;
  } catch {
    return false;
  }
}

export function readClaimToken() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearClaimToken() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing was stored.
  }
}

export function redactClaimPath(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(CLAIM_PATH, REDACTED)
    .replace(CLAIM_PATH_ENCODED, "$1%2F[token]");
}

// Walks a telemetry payload (a Sentry event, a Speed Insights beacon) and
// redacts every string, in place. No depth cutoff: a redactor that gives up
// past some depth would let a deep token through. Each object is visited once,
// so a cyclic payload still terminates. A payload deep enough to overflow the
// stack throws, and Sentry drops that event, which fails safe.
export function scrubClaimTokens(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactClaimPath(value);
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) {
    value[key] = scrubClaimTokens(value[key], seen);
  }
  return value;
}
