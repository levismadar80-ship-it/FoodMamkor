/**
 * Module:   webkit-tls
 * Purpose:  Put the WebKit (iPhone) project behind HTTPS on the CI runner, so
 *           the app's `Secure` cookies are kept the way real Safari keeps them
 *           on https://mehamakor.co.il.
 * Does NOT: change any cookie flag in the app or the backend — the cookies stay
 *           `Secure` (security.md). Only the test transport changes.
 * Related:  e2e/tls-proxy.mjs (the proxy) · playwright.config.ts (webServer +
 *           project baseURL) · e2e/global-setup.ts (storageState origin) ·
 *           backend/app/routers/auth.py:108-140 (secure=True cookies)
 * History:  MEH-3153 (creation)
 *
 * Why: WebKit does not store a `Secure` cookie set over plain http, not even on
 * localhost (WebKit bug 281149; Chromium and Firefox treat localhost as secure).
 * The nightly WebKit job served the app on http://localhost:3000, so every
 * login and every role fixture lost the refresh + fingerprint cookies, and ~30
 * admin / owner / consumer tests failed for a reason no iPhone user ever meets.
 */

/** Same flag e2e.yml sets for the WebKit job. */
const WEBKIT_RUN = process.env.PW_WEBKIT === "1";

/** The plain-http target the workflow starts with `next start`. */
const PLAIN_LOCAL = /^http:\/\/localhost:3000\/?$/;

export const WEBKIT_TLS_PORT = 3443;
export const WEBKIT_TLS_URL = `https://localhost:${WEBKIT_TLS_PORT}`;

/** True only for the WebKit run against the local plain-http server. */
export function webkitTlsEnabled(): boolean {
  const base = process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_URL || "http://localhost:3000";
  return WEBKIT_RUN && PLAIN_LOCAL.test(base);
}
