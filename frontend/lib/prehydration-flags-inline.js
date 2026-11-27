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
 *               the first HTML and this hides it while /auth/me decides);
 *             data-friday-mode — Thu 18:00 → Fri 14:00 Israel time, or the
 *               override: the same test as lib/friday-mode.js, so the home
 *               hero line and the Friday strip's slot are right from the first
 *               paint (MEH-3860; FridayModeBeforePaint.test.jsx pins parity);
 *             data-from-map — the URL says ?from=map (MapProducerCard's
 *               link), so the business page's «חזרה למפה» row is in the
 *               server HTML and shows from the first paint instead of
 *               pushing the gallery down after hydration (MEH-3856). The
 *               value is lib/map-view-state.js MAP_REFERRER, written out.
 *           Before, both waited for the JS bundle, and on a phone that put the
 *           LCP at 5.5s (/login) and 6.4s (/map, the banner's text).
 * Does NOT: read or trust the token's value, and it is not a security
 *           boundary: it only hides markup a visitor could see anyway.
 *           The rules that use the flags are in app/globals.css.
 * Related:  lib/cookie-consent.js (key and values), lib/auth-context.js
 *           ("token" key), lib/prehydration-capture-inline.js (same idea).
 * History:  MEH-2233 (creation); MEH-3860 (data-friday-mode); MEH-3856
 *           (data-from-map).
 *
 * CSP: script-src already allows 'unsafe-inline' (next.config.js).
 */

// The Friday-mode clock below is a copy of lib/friday-mode.js (an inline
// script cannot import); FridayModeBeforePaint.test.jsx holds them equal.
// Keys and values are written out, not interpolated: no value is spliced into
// code. PrehydrationFlags.test.jsx pins them to cookie-consent.js and auth.
// It also stops the browser's own submit of a form marked
// data-no-native-submit (the login form): before hydration that would be a GET
// with the password in the URL. React's own onSubmit still runs after
// hydration, because preventDefault does not stop propagation.
// guard-ok: an inline <head> script cannot import israel-date.js (MEH-3860)
export const PREHYDRATION_FLAGS_SCRIPT = `(function(){document.addEventListener("submit",function(e){var f=e.target;if(f&&f.hasAttribute&&f.hasAttribute("data-no-native-submit"))e.preventDefault()},true);try{var d=document.documentElement,s=window.localStorage,c=s.getItem("cookieConsent");if(c==="all"||c==="essential")d.setAttribute("data-cookie-answered","");if(s.getItem("token"))d.setAttribute("data-has-token","")}catch(e){}try{if(new URLSearchParams(window.location.search).get("from")==="map")document.documentElement.setAttribute("data-from-map","")}catch(e){}try{var o=false;try{o=window.localStorage.getItem("friday_mode_override")==="1"}catch(e){}var p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Jerusalem",weekday:"short",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),w="",h=0;for(var i=0;i<p.length;i++){if(p[i].type==="weekday")w=p[i].value;if(p[i].type==="hour")h=parseInt(p[i].value,10)}if(o||(w==="Thu"&&h>=18)||(w==="Fri"&&h<14))document.documentElement.setAttribute("data-friday-mode","")}catch(e){}})();`;
