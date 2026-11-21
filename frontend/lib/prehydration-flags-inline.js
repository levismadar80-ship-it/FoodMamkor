// @ts-check
/**
 * Module:   prehydration-flags-inline
 * Purpose:  MEH-2233 — two facts that live only in localStorage, published on
 *           <html> before the first paint, so content that depends on them can
 *           be in the server HTML instead of waiting for hydration:
 *             data-cookie-answered — the visitor already answered the cookie
 *               banner (CookieBanner.jsx renders in the first HTML and this
 *               hides it until React takes over);
 *             data-has-token — a stored session (the login form renders in
 *               the first HTML and this hides it while /auth/me decides).
 *           Before, both waited for the JS bundle, and on a phone that put the
 *           LCP at 5.5s (/login) and 6.4s (/map, the banner's text).
 * Does NOT: read or trust the token's value, and it is not a security
 *           boundary: it only hides markup a visitor could see anyway.
 *           The rules that use the flags are in app/globals.css.
 * Related:  lib/cookie-consent.js (key and values), lib/auth-context.js
 *           ("token" key), lib/prehydration-capture-inline.js (same idea).
 * History:  MEH-2233 (creation).
 *
 * CSP: script-src already allows 'unsafe-inline' (next.config.js).
 */

// Keys and values are written out, not interpolated: no value is spliced into
// code. PrehydrationFlags.test.jsx pins them to cookie-consent.js and auth.
// It also stops the browser's own submit of a form marked
// data-no-native-submit (the login form): before hydration that would be a GET
// with the password in the URL. React's own onSubmit still runs after
// hydration, because preventDefault does not stop propagation.
export const PREHYDRATION_FLAGS_SCRIPT = `(function(){document.addEventListener("submit",function(e){var f=e.target;if(f&&f.hasAttribute&&f.hasAttribute("data-no-native-submit"))e.preventDefault()},true);try{var d=document.documentElement,s=window.localStorage,c=s.getItem("cookieConsent");if(c==="all"||c==="essential")d.setAttribute("data-cookie-answered","");if(s.getItem("token"))d.setAttribute("data-has-token","")}catch(e){}})();`;
