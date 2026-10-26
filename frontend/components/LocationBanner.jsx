"use client";

import { useEffect, useState } from "react";
import { MapPin, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

const DISMISS_KEY = "location_banner_dismissed";

export default function LocationBanner({ hasCity, onOpenModal, suppressed = false }) {
  const t = useTranslations("location.banner");
  const [visible, setVisible] = useState(false);

  // MEH-2394: one prompt at a time. On a first visit this banner used to
  // appear 3 s in, while the cookie banner was still open — two green boxes
  // asking for a decision before any content (and the coach-mark tour made a
  // third). The reveal timer is armed only once cookie consent exists: read
  // from localStorage when it is already there, else on the "cookie-consent"
  // event CookieBanner.jsx dispatches on accept. A localStorage that throws
  // counts as no consent (CookieBanner shows itself in that case too).
  useEffect(() => {
    if (hasCity) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    let timer;
    const arm = () => {
      timer = setTimeout(() => setVisible(true), 3000);
    };
    let consented = false;
    try {
      const v = localStorage.getItem("cookieConsent");
      consented = v === "all" || v === "essential";
    } catch {
      consented = false;
    }
    if (consented) arm();
    else window.addEventListener("cookie-consent", arm, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("cookie-consent", arm);
    };
  }, [hasCity]);

  // MEH-879: lowest banner precedence — `suppressed` (Friday or Holiday is
  // showing) forces null so at most one banner occupies the slot.
  if (suppressed || !visible || hasCity) return null;

  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
  };

  return (
    <div
      className="mx-4 md:mx-auto max-w-3xl mb-6 flex items-start justify-between gap-3 rounded-[10px] px-4 py-3"
      style={{ backgroundColor: "#EAF3DE", color: "#2e6853" }}
      role="status"
    >
      <div className="flex items-start gap-2 min-w-0">
        <MapPin size={20} weight="fill" className="shrink-0 mt-0.5" aria-hidden="true" />
        {/* MEH-233: was `truncate` — clipped the Hebrew prompt next to the
            shrink-0 CTA on mobile (≤390px). Wrap to 2 lines instead. */}
        <p className="text-sm font-medium">
          {t("message")}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenModal}
          className="bg-primary text-white text-sm font-medium px-4 py-1.5 rounded-[8px] hover:bg-primary-dark transition whitespace-nowrap"
        >
          {t("choose_city")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="w-11 h-11 rounded-full hover:bg-primary/10 flex items-center justify-center transition"
          aria-label={t("close_aria")}
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
