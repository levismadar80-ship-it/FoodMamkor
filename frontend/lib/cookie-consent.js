/**
 * Cookie-consent storage contract — the ONE place that knows the localStorage
 * key, the accepted values and the event name (MEH-2394 reviewer note: the
 * key/values used to be duplicated in CookieBanner.jsx and LocationBanner.jsx).
 *
 * CookieBanner.jsx writes; LocationBanner.jsx / analytics.js / ClarityScript
 * read. A localStorage that throws (private mode, blocked storage) reads as
 * "no consent" — the banner shows itself in that case too.
 */
export const COOKIE_CONSENT_KEY = "cookieConsent";
export const COOKIE_CONSENT_EVENT = "cookie-consent";
const CONSENT_VALUES = new Set(["all", "essential"]);

/** @returns {boolean} true once the visitor answered the cookie banner. */
export function hasCookieConsent() {
  try {
    return CONSENT_VALUES.has(localStorage.getItem(COOKIE_CONSENT_KEY));
  } catch {
    return false;
  }
}

/** Persist the answer ("all" | "essential") and notify listeners. */
export function setCookieConsent(mode) {
  try { localStorage.setItem(COOKIE_CONSENT_KEY, mode); } catch {}
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT));
}
