// @ts-check
/**
 * Module:   sentry-replay-gate
 * Purpose:  decide when the browser may record a Sentry error replay. Two
 *           conditions, both required: the visitor accepted ALL cookies (a
 *           replay is a session recording, the same class as Clarity), and the
 *           page is not a bearer-token link (/claim/<token>,
 *           /owner-invite/<token>) — rrweb sends the URL without beforeSend.
 * Does NOT: scrub events (lib/claim-token.js) or read storage itself.
 * History:  MEH-2324 (claim-link carve-out). MEH-3193 (owner-invite + consent).
 */

/** Same pattern ClarityScript.jsx uses — one list of token paths. */
// MEH-3896: /c/<code>, the short claim link, is the same credential.
// MEH-3975: /verify-email carries the verify token and, from the claim
// page, ?claim=<code> in its query; the gate sees the path only, so the whole
// page is off.
const TOKEN_LINK_PATH = /\/(claim|owner-invite|staff-invite|c)\/[^/]|\/verify-email(?:$|[/?])/;

/**
 * @param {string} pathname
 * @param {boolean} fullConsent  hasFullCookieConsent()
 * @returns {boolean}
 */
export function replayAllowed(pathname, fullConsent) {
  return Boolean(fullConsent) && !TOKEN_LINK_PATH.test(pathname || "");
}
