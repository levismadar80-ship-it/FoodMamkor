"use client";

import { MapPin, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

/**
 * ActiveFilterChip — dismissible location-filter chip shown above the
 * producers grid (MEH-1269). Makes the previously-invisible "קרוב אליי"
 * filter state visible and reversible.
 *
 * LOCATION-ONLY since MEH-2186. Renders at most one chip (geo and city are
 * mutually exclusive location modes in useHomePage):
 *   - geoActive           → "עסקים ליד המיקום שלך ✕"
 *   - cityActive (string) → "עסקים באזור {city} ✕"
 * Clicking the chip fires onClear, which drops the active location filter and
 * reloads the grid. Self-hides when neither filter is active.
 *
 * MEH-2186 — the DAY slot is gone from here. It used to render a third form,
 * "משלוח ל{city} · יום {days}", off a combined city+day key that is now
 * deleted from both locales, while
 * DeliveryDayRow showed the same days as pressed pills two lines below — one
 * value on screen twice, with one ✕ that dropped BOTH axes at once. One axis
 * per chip now: the day value and its own ✕ live on the day chip
 * (components/DeliveryDayRow.jsx), which clears days without touching the
 * city; this chip clears the location. `sortByWeek`, DAYS_CHIP_INLINE_MAX and
 * the days_chip_more collapse moved there with the value — they are not in a
 * shared lib because after the move exactly one component needs them.
 *
 * ADR-024: functional UI copy → ungendered. Tokens only (bg-green-50 /
 * text-primary), Phosphor icons, RTL logical props (ps-/pe-).
 *
 * Does NOT: own filter state or fetching (useHomePage) — purely presentational.
 * The day chip that renders beside it is DeliveryDayRow, which MEH-1825 moved
 * to components/DeliveryDayRow.jsx so /producers mounts the same one.
 */
export function ActiveFilterChip({ geoActive, cityActive, onClear }) {
  const t = useTranslations();
  if (!geoActive && !cityActive) return null;

  const label = geoActive
    ? t("home.producers.geo_chip")
    : t("home.producers.city_chip", { city: cityActive });

  // MEH-2186: no longer varies. It used to append the full day set because the
  // visible label could drop day names; with the days gone there is nothing
  // for it to compensate for, so one string covers both forms.
  const ariaLabel = t("home.producers.clear_location_filter");

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
