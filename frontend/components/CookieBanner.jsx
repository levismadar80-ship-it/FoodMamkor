"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "@phosphor-icons/react";

/**
 * Cookie consent banner — compact bottom bar, max ~80px.
 *
 * Positioning:
 *   Mobile: fixed at bottom-16 (above BottomNav ~56px).
 *   Desktop: fixed at bottom-0 (no BottomNav).
 *
 * When dismissed, fires a `cookie-consent` CustomEvent on window so
 * ChatWidget can adjust its position without needing a shared context.
 * State persists in localStorage under `cookies_accepted`.
 */
const STORAGE_KEY = "cookies_accepted";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== "all" && stored !== "essential") {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = (mode) => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
    setVisible(false);
    // Notify ChatWidget to reposition
    window.dispatchEvent(new CustomEvent("cookie-consent"));
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-16 md:bottom-0 inset-x-0 z-[1500] bg-primary-dark text-light shadow-[0_-2px_12px_rgba(0,0,0,0.15)]"
      role="dialog"
      aria-label="הסכמה לעוגיות"
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Cookie size={18} weight="duotone" className="text-light shrink-0" aria-hidden="true" />
          <p className="text-xs md:text-sm text-light/90">
            אנחנו משתמשים בעוגיות לשיפור החוויה —{" "}
            <Link href="/privacy" className="underline hover:text-white">מדיניות פרטיות</Link>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => accept("all")}
            className="bg-light text-primary-dark font-medium text-xs px-4 py-2 rounded-full hover:bg-white transition whitespace-nowrap"
          >
            אני מסכימה
          </button>
          <button
            type="button"
            onClick={() => accept("essential")}
            className="text-light/80 text-xs px-4 py-2 rounded-full border border-light/30 hover:bg-light/10 transition whitespace-nowrap"
          >
            רק הכרחיים
          </button>
        </div>
      </div>
    </div>
  );
}
