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
 * The sibling DeliveryDayRow below is the day picker; since MEH-1771 it is
 * always rendered (muted "ghost" row + hint without a city).
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

// MEH-1771: id of the ghost-state hint, referenced by every pill's
// aria-describedby so a screen reader announces WHY the row is inert.
const DAY_HINT_ID = "delivery-day-hint";

/**
 * DeliveryDayRow (MEH-1645, discoverability reworked in MEH-1771) — day
 * refinement for the delivery-city filter. ALWAYS rendered on the home
 * surface: without a city it shows a muted "ghost" row plus a hint, so the
 * filter is discoverable before an area is picked instead of appearing out
 * of nowhere once a city lands. One pill per canonical day
 * (lib/delivery-days.js — the exact values GET /producers?delivery_day=
 * accepts); tapping the active day clears it (useHomePage.handleDaySelected).
 *
 * MEH-1771 — the row is a permanent anchor, not progressive disclosure:
 * Baymard "Consider Promoting Important Filters (61% Don't)" — a filter with
 * no fixed anchor is found by accident. The city PRECONDITION is unchanged
 * and still correct (a day without a city yields meaningless results); only
 * the VISIBILITY changed. Ghost pills carry aria-disabled (NOT the disabled
 * attribute) so they stay focusable and clickable — a click routes into the
 * LocationModal via handleDaySelected, which is the prerequisite the hint
 * names. Pattern: MDN aria-disabled + Smashing "Usability Pitfalls of
 * Disabled Buttons" (hint next to the control beats hiding it).
 *
 * Placement note (MEH-1645 Phase 0 correction): the MEH-1645 spec names
 * "FilterSheet", but FilterSheet.jsx is mounted only by /map's
 * FilterChipsBar — and /map was out of that ticket's scope. The home has no
 * filter sheet; this row beside the ActiveFilterChip is the home equivalent.
 *
 * Does NOT: own filter state, fetching, or the modal (useHomePage).
 */
export function DeliveryDayRow({ cityActive, dayActive, onSelectDay }) {
  const t = useTranslations();
  const ghost = !cityActive;

  return (
    <div className="mb-6" data-testid="delivery-day-row" data-ghost={ghost ? "true" : "false"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-fg-muted">{t("home.producers.day_row_label")}</span>
        {DELIVERY_DAYS.map((day) => {
          const active = !ghost && day === dayActive;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              aria-pressed={active}
              aria-disabled={ghost}
              aria-describedby={ghost ? DAY_HINT_ID : undefined}
              aria-label={t("home.producers.day_option_aria", { day })}
              data-testid={`delivery-day-pill-${day}`}
              className={`px-3 py-1 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                active
                  ? "bg-primary text-white border-primary"
                  : ghost
                    ? "bg-surface text-fg-muted border-border opacity-60"
                    : "bg-surface text-text border-border hover:bg-green-50"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      {ghost && (
        <p id={DAY_HINT_ID} data-testid="delivery-day-hint" className="mt-2 text-sm text-fg-muted">
          {t("home.producers.day_row_hint")}
        </p>
      )}
    </div>
  );
}
