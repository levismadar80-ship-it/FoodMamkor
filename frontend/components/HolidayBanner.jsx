"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { getActiveHoliday } from "@/lib/holidays";
import api from "@/lib/api";

const DISMISS_KEY = "holiday_banner_dismissed";

export default function HolidayBanner({ suppressed = false, onVisibilityChange }) {
  const t = useTranslations("producer.holiday_banner");
  const [holiday, setHoliday] = useState(null);
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    async function resolve() {
      let overrideKey = null;
      try {
        const r = await api.get("/holiday-mode");
        if (r.data.enabled && r.data.key) overrideKey = r.data.key;
      } catch { /* fail-open */ }

      const h = getActiveHoliday(overrideKey);
      if (!h) return;

      const dismissedKey = `${DISMISS_KEY}_${h.key}`;
      if (sessionStorage.getItem(dismissedKey)) return;

      setHoliday(h);
      setDismissed(false);
    }
    resolve();
  }, []);

  // MEH-879: report show-state up to the homepage banner single-slot so the
  // lower-precedence Location banner yields. Reports the banner's OWN
  // condition (independent of `suppressed`, which only gates the final render
  // when a higher-precedence banner — the Friday strip — is showing).
  const wouldShow = !!holiday && !dismissed;
  useEffect(() => {
    onVisibilityChange?.(wouldShow);
  }, [wouldShow, onVisibilityChange]);

  if (suppressed || !holiday || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    const dismissedKey = `${DISMISS_KEY}_${holiday.key}`;
    try { sessionStorage.setItem(dismissedKey, "1"); } catch { /* ignore */ }
  };

  const searchHref = `/producers?q=${encodeURIComponent(holiday.searchParams.q)}`;
  const label = holiday.upcoming
    ? t("approaching", { name: holiday.name, emoji: holiday.emoji })
    : `${holiday.name} ${holiday.emoji}`;

  return (
    <div
      role="region"
      aria-label={t("aria")}
      className="relative mx-4 md:mx-auto md:max-w-3xl rounded-[16px] px-5 py-4 flex items-center gap-4 shadow-sm"
      style={{ backgroundColor: holiday.color + "18", border: `1.5px solid ${holiday.color}40` }}
    >
      <span className="text-2xl shrink-0" aria-hidden="true">{holiday.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text text-sm leading-snug">{label}</p>
        <p className="text-fg-muted text-xs mt-0.5 leading-snug line-clamp-1">{holiday.tagline}</p>
      </div>
      <Link
        href={searchHref}
        className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full text-white transition hover:opacity-90"
        style={{ backgroundColor: holiday.color }}
      >
        {holiday.cta}
      </Link>
      <button
        onClick={dismiss}
        aria-label={t("close_aria")}
        className="shrink-0 text-fg-muted hover:text-text transition p-1 rounded-lg"
      >
        <X size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
