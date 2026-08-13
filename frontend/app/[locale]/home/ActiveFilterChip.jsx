"use client";

import { MapPin, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { DELIVERY_DAYS } from "@/lib/delivery-days";

// MEH-2036: above this many selected days the chip collapses to "<first> +N"
// rather than growing without bound — the chip sits inline above the grid and
// a 7-day list would wrap the row on a 390px viewport.
const DAYS_CHIP_INLINE_MAX = 2;

/** Canonical week order (sun→sat), so {שישי, שלישי} always reads "שלישי · שישי"
 *  regardless of the order the user tapped them in. */
const sortByWeek = (days) =>
  [...days].sort((a, b) => DELIVERY_DAYS.indexOf(a) - DELIVERY_DAYS.indexOf(b));

/**
 * ActiveFilterChip — dismissible location-filter chip shown above the
 * producers grid (MEH-1269). Makes the previously-invisible "קרוב אליי"
 * filter state visible and reversible.
 *
 * Renders at most one chip (geo and city are mutually exclusive location
 * modes in useHomePage):
 *   - geoActive                 → "עסקים ליד המיקום שלך ✕"
 *   - cityActive (string)       → "עסקים באזור {city} ✕"
 *   - cityActive + daysActive   → "משלוח ל{city} · יום {days} ✕" (MEH-1645,
 *                                 multi-select since MEH-2036)
 * Clicking the chip fires onClear, which drops the active location filter and
 * reloads the grid. Self-hides when neither filter is active.
 *
 * MEH-2036 — the day slot takes a SET. Its rendering is length-dependent:
 *   1 day  → "שישי"            (unchanged from MEH-1645)
 *   2 days → "שלישי · שישי"
 *   3+     → "שלישי +2"        (home.producers.days_chip_more)
 * The visible label truncates, so the FULL set always rides the chip's
 * aria-label — a screen-reader user must never get the lossy form. That split
 * is the whole reason the count lives in the label and not only in the row of
 * pills below it.
 *
 * ADR-024: functional UI copy → ungendered. Tokens only (bg-green-50 /
 * text-primary), Phosphor icons, RTL logical props (ps-/pe-).
 *
 * Does NOT: own filter state or fetching (useHomePage) — purely presentational.
 * The day picker that renders beside it is DeliveryDayRow, which MEH-1825
 * moved to components/DeliveryDayRow.jsx so /producers mounts the same one.
 */
export function ActiveFilterChip({ geoActive, cityActive, daysActive, onClear }) {
  const t = useTranslations();
  if (!geoActive && !cityActive) return null;

  const days = sortByWeek(daysActive || []);
  // MEH-2036: the visible (possibly truncated) day string vs the full one. Keep
  // them derived from the same sorted array so they can never disagree.
  const daysFull = days.join(" · ");
  const daysLabel =
    days.length > DAYS_CHIP_INLINE_MAX
      ? t("home.producers.days_chip_more", {
          day: days[0],
          count: days.length - 1,
        })
      : daysFull;

  const label = geoActive
    ? t("home.producers.geo_chip")
    : days.length
      ? t("home.producers.city_day_chip", { city: cityActive, day: daysLabel })
      : t("home.producers.city_chip", { city: cityActive });

  // The full set, always — `daysLabel` above may have dropped day names.
  const ariaLabel = days.length
    ? `${t("home.producers.clear_location_filter")} (${daysFull})`
    : t("home.producers.clear_location_filter");

  return (
    <div className="mb-6" aria-live="polite">
      <button
        type="button"
        onClick={onClear}
        aria-label={ariaLabel}
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
