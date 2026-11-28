// @ts-check
/**
 * Module:   claim-return
 * Purpose:  Bring a business owner who signs up BY EMAIL from the claim page
 *           back to the claim after she verifies the address, from whichever
 *           browser opens the mail (MEH-3975).
 * Touches:  window.sessionStorage (through lib/claim-token.js) and the
 *           address bar of /verify-email (history.replaceState).
 * Does NOT: validate the code against the server (POST /producer-claim/preview
 *           does, on the claim page), or handle the old /claim/<JWT> links —
 *           only the short /c/<code> ones ride on the verification mail.
 * Related:  app/[locale]/register/RegisterClient.jsx (sends claim_code) ·
 *           app/[locale]/verify-email/VerifyEmailClient.jsx (reads it) ·
 *           backend/app/services/auth_emails.py send_verify_email (puts it on
 *           the link) · backend/app/services/share_links.py _CODE_RE (shape).
 * History:  MEH-3975 (creation): an owner verified in another tab, landed on
 *           the home page, and the page was never handed over.
 */
import { readClaimToken, stashClaimToken } from "@/lib/claim-token";

// Same shape as backend services/share_links.py _CODE_RE.
const CLAIM_CODE = /^[A-Za-z0-9]{12}$/;
const CLAIM_PATH = /^\/(?:en\/)?claim(?:[?#]|$)/;

/** @param {unknown} value @returns {value is string} */
function isClaimCode(value) {
  return typeof value === "string" && CLAIM_CODE.test(value);
}

/**
 * The short claim code to send with /auth/register, when the sign-up was
 * opened from the claim page (its redirect is /claim). Null otherwise, and for
 * an old JWT link.
 * @param {string} redirectTo  the clamped ?redirect= of /register
 * @returns {string | null}
 */
export function claimCodeForSignup(redirectTo) {
  if (typeof redirectTo !== "string" || !CLAIM_PATH.test(redirectTo)) return null;
  const stored = readClaimToken();
  return isClaimCode(stored) ? stored : null;
}

/**
 * On /verify-email: take `claim` off the address (so analytics never see it),
 * keep it in this tab the way the claim page does, and say where the owner
 * goes once she is signed in. Null when the link carries no valid code.
 * @param {string | null} code  the link's `claim` parameter
 * @returns {string | null}  "/claim" (or "/en/claim"), or "/c/<code>" when
 *          storage is refused and the code has to travel in the address.
 */
export function takeClaimLanding(code) {
  if (code === null || typeof globalThis.window === "undefined") return null;
  let prefix = "";
  try {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete("claim");
    globalThis.history.replaceState(globalThis.history.state, "", url.pathname + url.search + url.hash);
    prefix = /^\/en(?=\/|$)/.test(url.pathname) ? "/en" : "";
  } catch {
    // No address to clean (a test double or an odd embed): nothing to strip.
  }
  if (!isClaimCode(code)) return null;
  return stashClaimToken(code) ? `${prefix}/claim` : `${prefix}/c/${code}`;
}
