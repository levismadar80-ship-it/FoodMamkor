// @ts-check
/**
 * Module:   guest-to-login-inline
 * Purpose:  Send a visitor with no stored session from a signed-in-only page
 *           to /login before the page's JavaScript loads, instead of after it
 *           hydrates and the auth check runs (MEH-2233: a guest on /favorites
 *           saw the login form at 6.5s on a phone, 1.7s for /login itself).
 * Does NOT: decide who is signed in. A stored token, valid or not, leaves the
 *           page to the existing auth check, which still redirects a guest on
 *           a client-side navigation (where this inline script never runs).
 * Related:  lib/safe-redirect.js loginHrefBackHere (the same target, kept equal
 *           by __tests__/GuestToLoginInline.test.js); favorites/page.js.
 * History:  MEH-2233 (creation).
 */

// replace(), not assign(): Back from /login must not return to a page that
// sends the guest straight back (the client redirect used push()).
export const GUEST_TO_LOGIN_SCRIPT =
  '(function(){try{if(localStorage.getItem("token"))return;var l=location,p=/^\\/en(?=\\/|$)/.test(l.pathname)?"/en":"";l.replace(p+"/login?redirect="+encodeURIComponent(l.pathname+l.search))}catch(e){}})();';
