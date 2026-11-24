// @ts-check
"use client";

import { useEffect, useRef, useState } from "react";
// MEH-2578: locale-aware Link — the banner shows on every page for a first
// visit, and next/link dropped the /en prefix on its /privacy link.
import { Link } from "@/i18n/navigation";
// MEH-2850: every Link element in the site chrome carries prefetch={false}. The
// chrome is on screen on EVERY page, and since #4260 its targets (/, /about,
// /privacy, /login, /register) are static, so Next prefetches them IN FULL —
// their page JS plus the shared [locale] layout payload (~56 KB gz, mostly the
// messages the page already has). Measured 10/11: +121 KB JS on /map and
// +137 KB on /events after load, gone when only those prefetches are blocked.
// Navigation still works; it fetches on tap. Guarded by ChromePrefetchGuard.test.js.
import { useTranslations } from "next-intl";
import {
  COOKIE_SETTINGS_EVENT,
  hasCookieConsent,
  hasFullCookieConsent,
  setCookieConsent,
} from "@/lib/cookie-consent";

// MEH-3820: reads the banner just above it (the script's previous sibling).
// Skipped when the visitor already answered (lib/prehydration-flags-inline.js
// hides that copy). No value is spliced into the code.
const PUBLISH_HEIGHT_SCRIPT = `(function(){try{var d=document.documentElement,b=document.currentScript&&document.currentScript.previousElementSibling;if(b&&!d.hasAttribute("data-cookie-answered")&&b.offsetHeight>0)d.style.setProperty("--cookie-banner-h",b.offsetHeight+"px")}catch(e){}})();`;

/**
 * Cookie consent — compact bottom bar.
 * Mobile: sits ABOVE the floating BottomNav pill — bottom offset is DERIVED
 *   from the `--bottom-nav-clearance` CSS var BottomNav publishes (MEH-1950;
 *   live pill clearance incl. safe-area) + an 8px gap, falling back to the
 *   static expanded geometry (safe-area + 72px) where no pill renders. Never
 *   hardcode the pill height here — that magic-number twin is what MEH-1950
 *   removed. Stacks text-over-buttons so nothing clips at 360–390px.
 * Desktop: bottom-0. localStorage key: "cookieConsent" ("all" | "essential").
 * MEH-850: publishes its live rendered height to the `--cookie-banner-h` CSS var
 *   on <html> (ResizeObserver) so the chat FAB self-clears it via calc(); the var
 *   is removed on dismiss/unmount (FAB then falls back to clearing just the pill).
 *   The chat FAB reads that var instead of the old fixed-px guess. NOTE the
 *   "cookie-consent" CustomEvent still fires on accept — ClarityScript.jsx
 *   depends on it to activate analytics on consent.
 */
export default function CookieBanner() {
  const t = useTranslations("modals.cookie_banner");
  // MEH-2233: rendered in the server HTML (visible until the effect below
  // reads localStorage), so its text paints with the page instead of after
  // hydration, where it was the /map LCP at 6.4s. A visitor who already
  // answered never sees it: lib/prehydration-flags-inline.js marks <html>
  // before the first paint and app/globals.css hides the pre-mount copy.
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);
  const bannerRef = useRef(null);

  useEffect(() => {
    setVisible(!hasCookieConsent());
    setMounted(true);
    // MEH-3196: the footer's «הגדרות עוגיות» re-opens the banner.
    const reopen = () => setVisible(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  // MEH-850: publish the banner's live height to a CSS var so the chat FAB's
  // calc() self-clears it; remove the var when hidden/unmounted so the FAB falls
  // back to clearing just the pill. ResizeObserver covers wrap/height changes.
  useEffect(() => {
    const root = document.documentElement;
    const el = bannerRef.current;
    if (!visible || !el) {
      root.style.removeProperty("--cookie-banner-h");
      return;
    }
    const publish = () =>
      root.style.setProperty("--cookie-banner-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--cookie-banner-h");
    };
  }, [visible]);

  const accept = (mode) => {
    // setCookieConsent also fires the "cookie-consent" event. Still required:
    // ClarityScript.jsx listens for it to activate analytics on consent, and
    // LocationBanner.jsx arms its reveal on it (MEH-2394). MEH-850 only moved
    // the chat-FAB *positioning* off this event onto the --cookie-banner-h var.
    // MEH-3196: analytics, Clarity and session replay attach once and cannot
    // be detached in place. Withdrawing "all" therefore reloads the page, so
    // the next load starts with only the essential cookies.
    const withdrawing = mode === "essential" && hasFullCookieConsent();
    setCookieConsent(mode);
    setVisible(false);
    if (withdrawing) window.location.reload();
  };

  if (!visible) return null;

  return (
    <>
    <div
      ref={bannerRef}
      className="cookie-banner vv-pin print:hidden fixed bottom-[calc(var(--bottom-nav-clearance,calc(env(safe-area-inset-bottom)+72px))+8px)] md:bottom-0 inset-x-0 z-cookie-banner bg-primary-dark text-green-50 shadow-[0_-2px_12px_rgba(0,0,0,0.15)]"
      role="region"
      data-testid="cookie-banner"
      // MEH-3076: while the banner is up, the phone chat launcher steps aside
      // (the MEH-2835 mechanism) instead of stacking over the page above it.
      data-chat-hide=""
      data-prehydration={mounted ? undefined : ""}
      aria-label={t("aria_label")}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
        <p className="text-xs md:text-sm text-green-50/90">
          {t.rich("message", {
            link: (chunks) => (
              <Link prefetch={false} href="/privacy" className="underline hover:text-white">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => accept("all")}
            data-testid="cookie-accept-all"
            className="bg-green-50 text-primary-dark font-medium text-xs px-4 py-2 rounded-full hover:bg-surface transition whitespace-nowrap inline-flex items-center justify-center min-h-touch"
          >
            {t("accept_all")}
          </button>
          <button
            type="button"
            onClick={() => accept("essential")}
            data-testid="cookie-essential-only"
            className="text-green-50/80 text-xs px-4 py-2 rounded-full border border-green-50/30 hover:bg-green-50/10 transition whitespace-nowrap inline-flex items-center justify-center min-h-touch"
          >
            {t("essential_only")}
          </button>
        </div>
      </div>
    </div>
    {/* MEH-3820: the server-HTML copy publishes its own height before the first
        paint, so /map reserves the banner's strip from the start instead of
        shrinking the map ~5 s in on a slow phone, when the effect above runs.
        Rendered only until mount (server + hydration render alike). */}
    {!mounted && <script dangerouslySetInnerHTML={{ __html: PUBLISH_HEIGHT_SCRIPT }} />}
    </>
  );
}
