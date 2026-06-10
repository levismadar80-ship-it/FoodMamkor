"use client";

import { useEffect, useState } from "react";
import { MapPin, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

const DISMISS_KEY = "location_banner_dismissed";

export default function LocationBanner({ hasCity, onOpenModal }) {
  const t = useTranslations("location.banner");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasCity) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [hasCity]);

  if (!visible || hasCity) return null;

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
          className="w-7 h-7 rounded-full hover:bg-primary/10 flex items-center justify-center transition"
          aria-label={t("close_aria")}
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
