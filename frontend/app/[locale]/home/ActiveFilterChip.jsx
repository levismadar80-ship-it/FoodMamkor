"use client";

import { MapPin, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { DELIVERY_DAYS } from "@/lib/delivery-days";

/**
 * ActiveFilterChip — dismissible location-filter chip shown above the
 * producers grid (MEH-1269). Makes the previously-invisible "קרוב אליי"
 * filter state visible and reversible.
 *
 * Renders at most one chip (geo and city are mutually exclusive location
 * modes in useHomePage):
 *   - geoActive                 → "עסקים ליד המיקום שלך ✕"
 *   - cityActive (string)       → "עסקים באזור {city} ✕"
 *   - cityActive + dayActive    → "משלוח ל{city} · יום {day} ✕" (MEH-1645)
 * Clicking the chip fires onClear, which drops the active location filter and
 * reloads the grid. Self-hides when neither filter is active.
 *
 * ADR-024: functional UI copy → ungendered. Tokens only (bg-green-50 /
 * text-primary), Phosphor icons, RTL logical props (ps-/pe-).
 *
 * Does NOT: own filter state or fetching (useHomePage) — purely presentational.
 * The sibling DeliveryDayRow below is the MEH-1645 progressive-disclosure
 * day picker; it renders ONLY while a city filter is active.
 */
export function ActiveFilterChip({ geoActive, cityActive, dayActive, onClear }) {
  const t = useTranslations();
  if (!geoActive && !cityActive) return null;

  const label = geoActive
    ? t("home.producers.geo_chip")
    : dayActive
      ? t("home.producers.city_day_chip", { city: cityActive, day: dayActive })
      : t("home.producers.city_chip", { city: cityActive });

  return (
    <div className="mb-6" aria-live="polite">
      <button
        type="button"
        onClick={onClear}
        aria-label={t("home.producers.clear_location_filter")}
        data-testid="location-filter-chip"
        className="inline-flex items-center gap-1.5 bg-green-50 text-primary ps-3 pe-2 py-1 rounded-full text-sm hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <MapPin size={14} weight="bold" aria-hidden="true" />
        <span>{label}</span>
        <X size={12} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * DeliveryDayRow (MEH-1645) — progressive-disclosure day refinement for the
 * active city filter. Renders NULL unless a city filter is active (the day
 * is a refinement, never a primary chip — the MEH-1461 no-new-quick-chip
 * discipline). One pill per canonical day (lib/delivery-days.js — the exact
 * values GET /producers?delivery_day= accepts); tapping the active day
 * clears it (handled in useHomePage.handleDaySelected).
 *
 * Placement note (Phase 0 correction, documented in the PR): the MEH-1645
 * spec names "FilterSheet", but FilterSheet.jsx is mounted only by /map's
 * FilterChipsBar — and /map is explicitly out of the ticket's scope. The
 * home has no filter sheet; this row beside the ActiveFilterChip is the
 * home-surface equivalent.
 *
 * Does NOT: own filter state or fetching (useHomePage).
 */
export function DeliveryDayRow({ cityActive, dayActive, onSelectDay }) {
  const t = useTranslations();
  if (!cityActive) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="delivery-day-row">
      <span className="text-sm text-fg-muted">{t("home.producers.day_row_label")}</span>
      {DELIVERY_DAYS.map((day) => {
        const active = day === dayActive;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelectDay(day)}
            aria-pressed={active}
            aria-label={t("home.producers.day_option_aria", { day })}
            data-testid={`delivery-day-pill-${day}`}
            className={`px-3 py-1 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              active
                ? "bg-primary text-white border-primary"
                : "bg-surface text-text border-border hover:bg-green-50"
            }`}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}
