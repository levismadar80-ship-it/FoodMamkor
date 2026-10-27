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

// The token after /claim/, with or without a locale prefix. It is matched by
// its shape, a compact JWT: three base64url segments, the first one the
// encoded '{"' header, so always "eyJ". Matching anything after /claim/ would
// also rewrite the route's own files in stack frames (claim/page-<hash>.js,
// claim/ClaimClient.jsx), and the frames would lose their link to the source.
const JWT = String.raw`eyJ[\w-]*\.[\w-]+\.[\w-]+`;
const CLAIM_PATH = new RegExp(String.raw`/claim/${JWT}`, "g");
const REDACTED = "/claim/[token]";
// The same path percent-encoded, as in a ?redirect= built with
// encodeURIComponent (auth-context's session-expired link). A JWT has no
// character that encoding changes, so the token itself is the same.
const CLAIM_PATH_ENCODED = new RegExp(String.raw`(%2F(?:[a-z]{2}%2F)?claim)%2F${JWT}`, "gi");

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
// so a cyclic payload still terminates.
//
// Only plain objects and arrays are walked, and a value is written back only
// when redaction changed it. A server event also holds Sentry's own objects
// (Scope instances under sdkProcessingMetadata, which Sentry strips before
// sending) and can hold Buffers or frozen data. A throw here drops the whole
// event, and on the server that would be every error, not only claim ones.
function isPlainContainer(value) {
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function scrubClaimTokens(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactClaimPath(value);
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  if (!isPlainContainer(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (key === "sdkProcessingMetadata") continue;
    try {
      const before = value[key];
      const after = scrubClaimTokens(before, seen);
      if (after !== before) value[key] = after;
    } catch {
      // A throwing getter or a read-only property: leave it rather than lose
      // the event.
    }
  }
  return value;
}
