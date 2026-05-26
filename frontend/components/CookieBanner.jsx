"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Cookie consent — compact bottom bar (max ~80px).
 * Mobile: bottom-16 (above BottomNav). Desktop: bottom-0.
 * localStorage key: "cookieConsent" ("all" | "essential").
 * Fires CustomEvent("cookie-consent") on dismiss so ChatWidget repositions.
 */
export default function CookieBanner() {
  const t = useTranslations("modals.cookie_banner");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("cookieConsent");
      if (v !== "all" && v !== "essential") setVisible(true);
    } catch (e) {
      setVisible(true);
    }
  }, []);

  const accept = (mode) => {
    try { localStorage.setItem("cookieConsent", mode); } catch (e) {}
    setVisible(false);
    window.dispatchEvent(new CustomEvent("cookie-consent"));
  };

  if (!visible) return null;

  return (
    <div
      className="cookie-banner fixed bottom-16 md:bottom-0 inset-x-0 z-[599] bg-primary-dark text-green-50 shadow-[0_-2px_12px_rgba(0,0,0,0.15)]"
      role="dialog"
      aria-label={t("aria_label")}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs md:text-sm text-green-50/90 min-w-0">
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
            className="bg-green-50 text-primary-dark font-medium text-xs px-4 py-2 rounded-full hover:bg-white transition whitespace-nowrap"
          >
            {t("accept_all")}
          </button>
          <button
            type="button"
            onClick={() => accept("essential")}
            className="text-green-50/80 text-xs px-4 py-2 rounded-full border border-green-50/30 hover:bg-green-50/10 transition whitespace-nowrap"
          >
            {t("essential_only")}
          </button>
        </div>
      </div>
    </div>
  );
}
