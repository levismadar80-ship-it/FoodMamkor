"use client";

import { useEffect, useState } from "react";
import { Cookie } from "@phosphor-icons/react";

/**
 * Cookie consent banner — compact bottom bar.
 *
 * Mobile: fixed bottom bar above BottomNav (bottom-14), single row with
 * icon + short text + 2 inline buttons. Max height ~64px.
 * Desktop: same compact bar at the bottom of the viewport.
 *
 * State persists in localStorage so the banner only appears once per
 * device. Two accept modes:
 *   - "all": full consent (analytics, etc.)
 *   - "essential": only required cookies (auth session, etc.)
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cookies_accepted");
      if (stored !== "all" && stored !== "essential") {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = (mode) => {
    try {
      localStorage.setItem("cookies_accepted", mode);
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-14 md:bottom-0 inset-x-0 z-[1500] bg-primary-dark text-light px-4 py-2.5 shadow-[0_-2px_12px_rgba(0,0,0,0.15)]"
      role="dialog"
      aria-label="הסכמה לעוגיות"
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Cookie size={20} weight="duotone" className="text-light shrink-0" aria-hidden="true" />
          <p className="text-xs md:text-sm text-light/90 truncate">
            אנחנו משתמשים בעוגיות לשיפור החוויה
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => accept("all")}
            className="bg-light text-primary-dark font-medium text-xs px-3 py-1.5 rounded-full hover:bg-white transition whitespace-nowrap"
          >
            אני מסכימה
          </button>
          <button
            type="button"
            onClick={() => accept("essential")}
            className="text-light/80 text-xs px-3 py-1.5 rounded-full border border-light/30 hover:bg-light/10 transition whitespace-nowrap"
          >
            רק הכרחיים
          </button>
        </div>
      </div>
    </div>
  );
}
