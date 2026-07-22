import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Faders } from "@phosphor-icons/react";

import ChipScrollRow from "@/components/ChipScrollRow";
import { CATEGORY_ICONS } from "@/lib/category-registry";
import FilterSheet from "@/components/FilterSheet";
import { countActiveSheetOnlyFilters } from "@/lib/map-chips";

/**
 * The /map filter bar: one category chip row + a "סינון" button + a
 * conditional active-filter tag list. MEH-1368 consolidated the prior TWO
 * chip rows into one — the inline quick-chip toggle row (verified /
 * has_delivery) was removed because those attributes already live in
 * FilterSheet, so the row was pure duplication (both surfaces rendered
 * them). The "סינון" button opens FilterSheet (mobile bottom sheet / lg+
 * panel anchored to this button's `relative` wrapper); sheet state is
 * per-instance, and the desktop and mobile shells each mount their own bar
 * (only one displayed at a time).
 *
 * Props are state and handlers from useMapFilters. `onToggleChipClick` is
 * retained for the active-attribute tag row's per-tag removal (no longer
 * for an inline quick-chip row).
 */
export default function FilterChipsBar({
  visibleCategoryChips,
  chipState,
  onCategoryChipClick,
  onToggleChipClick,
  onSheetToggleChip,
  clearSheetFilters,
  resultCount,
  activeFilterTags,
  resetAllFilters,
}) {
  const t = useTranslations();
  const [sheetOpen, setSheetOpen] = useState(false);
  // MEH-1441: attach a 16px CATEGORY_ICONS glyph (via the chip's `iconName`) to
  // each category chip at the render site — map-chips.js stays React-free (only
  // the string key lives there). "כל" has no iconName → text-only (reset). Memo
  // keyed on visibleCategoryChips (stable ref from useMapFilters) so a chipState
  // toggle re-render doesn't rebuild the glyph elements.
  // Category-tint: the chip's `iconColor` (declared in map-chips.js) flows
  // through the `{ ...chip }` spread to ChipScrollRow, which tints the glyph
  // only while the chip is INACTIVE (active stays white). No handling needed
  // here — it rides the spread.
  const categoryChipsWithIcons = useMemo(
    () =>
      visibleCategoryChips.map((chip) => {
        const Glyph = chip.iconName ? CATEGORY_ICONS[chip.iconName] : null;
        return Glyph ? { ...chip, icon: <Glyph size={16} /> } : chip;
      }),
    [visibleCategoryChips],
  );
  // Stable ref (PR #1565 review): an inline arrow would retrigger the sheet's
  // [open, onClose] keydown effect on every chipState re-render.
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const badgeCount = countActiveSheetOnlyFilters(chipState);
  return (
    <div dir="rtl" className="min-w-0">
      {/* MEH-1368: consolidated to ONE row — the scrollable category chips
          (flex-1) share the line with the "סינון" button (pinned inline-end).
          The old second row (inline quick-chip toggles [מאומתים] [משלוח]) is
          gone; every attribute filter now lives only in FilterSheet. */}
      <div className="flex items-center gap-2 min-w-0">
        <ChipScrollRow
          variant="category"
          chips={categoryChipsWithIcons}
          activeKey={chipState.categoryKey}
          onChipClick={onCategoryChipClick}
          className="flex-1"
          // MEH-1108: ChipScrollRow's default fadeBg is #ffffff, which smears
          // white at the scroll edges on the cream /map surface (#F5F0E8).
          fadeBg="#F5F0E8"
        />
        {/* Anchor wrapper — FilterSheet's md+ panel positions off this
            `relative` wrapper. */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            aria-controls="filter-sheet-panel"
            // REUSES: frontend/components/ChipScrollRow.jsx:118-122 — chip
            // visuals, inactive variant (the button itself is not a filter).
            className="inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium border transition bg-white text-text border-border hover:border-primary hover:text-primary"
          >
            <Faders size={16} aria-hidden="true" />
            {t("filters.button")}
            {badgeCount > 0 && (
              <span className="numeric inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[11px] px-1">
                {badgeCount}
              </span>
            )}
          </button>
          <FilterSheet
            open={sheetOpen}
            onClose={closeSheet}
            chipState={chipState}
            onToggleChip={onSheetToggleChip}
            resultCount={resultCount}
            onClearAll={clearSheetFilters}
          />
        </div>
      </div>
      {activeFilterTags.length > 0 && (
        <div
          dir="rtl"
          className="mt-2 flex flex-wrap items-center gap-1.5"
          aria-live="polite"
        >
          {activeFilterTags.map((tag) => (
            // MEH-825: ≥44px hit area via the transparent button (min-h-[44px]
            // + -my-2.5 keeps the visible row compact); the visible pill is the
            // inner span (~24px, AA floor).
            <button
              key={`${tag.kind}:${tag.key}`}
              type="button"
              onClick={() =>
                tag.kind === "category"
                  ? onCategoryChipClick("all")
                  : onToggleChipClick(tag.key)
              }
              aria-label={t("map.filter.aria.remove", { label: tag.label })}
              className="group inline-flex items-center min-h-[44px] -my-2.5"
            >
              <span className="inline-flex items-center gap-1 rounded-md bg-green-50 text-primary px-2 py-1 text-[11px] group-hover:bg-green-50/80 transition">
                <span aria-hidden="true">×</span>
                {tag.label}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={resetAllFilters}
            className="inline-flex items-center min-h-[44px] -my-2.5 text-primary text-[11px] no-underline hover:opacity-80 transition"
          >
            {t("map.filter.clear_all")}
          </button>
        </div>
      )}
    </div>
  );
}
