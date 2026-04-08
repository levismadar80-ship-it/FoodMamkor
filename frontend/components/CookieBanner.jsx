"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * GDPR-ish cookie consent banner (FIXES_V2.md fix 6).
 *
 * State persists in localStorage so the banner only appears once per
 * device. Two accept modes:
 *   - "all": full consent (analytics, etc.)
 *   - "essential": only required cookies (auth session, etc.)
 *
 * The banner is SSR-safe — it renders nothing on the server and only
 * appears on the client after hydration + localStorage check, so the
 * initial HTML doesn't flash it for returning users.
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
      // localStorage unavailable — show the banner, let user accept
      setVisible(true);
    }
  }, []);

  const accept = (mode) => {
    try {
      localStorage.setItem("cookies_accepted", mode);
    } catch {
      // ignore — we'll just show the banner again next time
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-4 inset-x-4 md:inset-x-auto md:right-4 md:max-w-md z-[1500] bg-primary-dark text-light rounded-[16px] shadow-2xl border border-primary-dark/50 p-4 md:p-5"
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-body"
    >
      <h2 id="cookie-banner-title" className="font-headline text-lg font-bold mb-1 text-white">
        🍪 שימוש בעוגיות
      </h2>
      <p id="cookie-banner-body" className="text-sm leading-relaxed mb-4 text-light/90">
        אנחנו משתמשות בעוגיות כדי לשמור אותך מחוברת ולשפר את החוויה שלך.{" "}
        <Link href="/terms#privacy" className="underline hover:text-white">
          מדיניות פרטיות
        </Link>
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => accept("all")}
          className="bg-light text-primary-dark font-medium px-5 py-2 rounded-[8px] hover:bg-white transition focus-visible:ring-2 focus-visible:ring-white"
        >
          אני מסכימה ✓
        </button>
        <button
          type="button"
          onClick={() => accept("essential")}
          className="bg-transparent text-light border border-light/40 px-5 py-2 rounded-[8px] hover:bg-light/10 transition focus-visible:ring-2 focus-visible:ring-light"
        >
          רק הכרחיים
        </button>
      </div>
    </div>
  );
}
