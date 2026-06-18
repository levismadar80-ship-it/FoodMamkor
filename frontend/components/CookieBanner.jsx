"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Cookie consent — compact bottom bar.
 * Mobile: sits ABOVE the floating BottomNav pill (bottom = safe-area +
 *   pill-clearance) and stacks text-over-buttons so nothing clips at 360–390px.
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
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("cookieConsent");
      if (v !== "all" && v !== "essential") setVisible(true);
    } catch (e) {
      setVisible(true);
    }
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
    try { localStorage.setItem("cookieConsent", mode); } catch (e) {}
    setVisible(false);
    // Still required: ClarityScript.jsx listens for this to activate analytics on
    // consent. MEH-850 only moved the chat-FAB *positioning* off this event onto
    // the --cookie-banner-h var; the consent signal itself stays.
    window.dispatchEvent(new CustomEvent("cookie-consent"));
  };

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      className="cookie-banner fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] md:bottom-0 inset-x-0 z-[1100] bg-primary-dark text-green-50 shadow-[0_-2px_12px_rgba(0,0,0,0.15)]"
      role="dialog"
      aria-label={t("aria_label")}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
        <p className="text-xs md:text-sm text-green-50/90">
          {t.rich("message", {
            link: (chunks) => (
              <Link href="/privacy" className="underline hover:text-white">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => accept("all")}
            className="bg-green-50 text-primary-dark font-medium text-xs px-4 py-2 rounded-full hover:bg-white transition whitespace-nowrap inline-flex items-center justify-center min-h-[44px]"
          >
            {t("accept_all")}
          </button>
          <button
            type="button"
            onClick={() => accept("essential")}
            className="text-green-50/80 text-xs px-4 py-2 rounded-full border border-green-50/30 hover:bg-green-50/10 transition whitespace-nowrap inline-flex items-center justify-center min-h-[44px]"
          >
            {t("essential_only")}
          </button>
        </div>
      </div>
    </div>
  );
}
