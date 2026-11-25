// @ts-check
/**
 * Module:   cookie-banner-height-inline
 * Purpose:  Publish the cookie banner's height as --cookie-banner-h on <html>
 *           while the banner is being parsed, so /map reserves the banner's
 *           strip from the first paint instead of after hydration (MEH-3820:
 *           0.118 CLS ~6 s into a slow phone load).
 * Does NOT: run in <head>. It must sit right after the banner's server-HTML
 *           copy (it reads its previous sibling), which is why it is not part
 *           of lib/prehydration-flags-inline.js. It also does not keep the
 *           value live: CookieBanner's ResizeObserver takes over after mount.
 * Related:  components/CookieBanner.jsx (renders it until mount) ·
 *           app/globals.css `[data-map-banner-reserve]` (reads the var) ·
 *           docs/SECURITY.md §8-CSP (inline scripts a nonce CSP must cover).
 * History:  MEH-3820 (creation).
 */

// Skipped when the visitor already answered (lib/prehydration-flags-inline.js
// marks <html> first, and that copy is hidden). No value is spliced in.
export const COOKIE_BANNER_HEIGHT_SCRIPT =
  '(function(){try{var d=document.documentElement,b=document.currentScript&&document.currentScript.previousElementSibling;if(b&&!d.hasAttribute("data-cookie-answered")&&b.offsetHeight>0)d.style.setProperty("--cookie-banner-h",b.offsetHeight+"px")}catch(e){}})();';
