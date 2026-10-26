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
const CLAIM_PATH = /\/claim\/[^/?#\s"'&]+/g;
const REDACTED = "/claim/[token]";

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
  return typeof value === "string" ? value.replace(CLAIM_PATH, REDACTED) : value;
}

// Walks a telemetry payload (a Sentry event, a Speed Insights beacon) and
// redacts every string. Depth-capped so a cyclic or huge object cannot hang
// the reporter; past the cap the value is returned as is.
export function scrubClaimTokens(value, depth = 0) {
  if (depth > 8) return value;
  if (typeof value === "string") return redactClaimPath(value);
  if (Array.isArray(value)) return value.map((v) => scrubClaimTokens(v, depth + 1));
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      value[key] = scrubClaimTokens(value[key], depth + 1);
    }
  }
  return value;
}
