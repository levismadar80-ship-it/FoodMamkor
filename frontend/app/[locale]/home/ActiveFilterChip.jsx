"use client";

import { MapPin, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

/**
 * ActiveFilterChip — dismissible location-filter chip shown above the
 * producers grid (MEH-1269). Makes the previously-invisible "קרוב אליי"
 * filter state visible and reversible.
 *
 * Renders at most one chip (geo and city are mutually exclusive location
 * modes in useHomePage):
 *   - geoActive           → "עסקים ליד המיקום שלך ✕"
 *   - cityActive (string) → "עסקים באזור {city} ✕"
 * Clicking the chip fires onClear, which drops the active location filter and
 * reloads the grid. Self-hides when neither filter is active.
 *
 * ADR-024: functional UI copy → ungendered. Tokens only (bg-green-50 /
 * text-primary), Phosphor icons, RTL logical props (ps-/pe-).
 *
 * Does NOT: own filter state or fetching (useHomePage) — purely presentational.
 */
export function ActiveFilterChip({ geoActive, cityActive, onClear }) {
  const t = useTranslations();
  if (!geoActive && !cityActive) return null;

  const label = geoActive
    ? t("home.producers.geo_chip")
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
