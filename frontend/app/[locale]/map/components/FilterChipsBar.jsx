import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Faders } from "@phosphor-icons/react";

import ChipScrollRow from "@/components/ChipScrollRow";
import FilterSheet from "@/components/FilterSheet";
import {
  TOGGLE_CHIPS,
  QUICK_CHIP_KEYS,
  countActiveSheetOnlyFilters,
} from "@/lib/map-chips";

// MEH-1075: row 2 shows only the two quick chips ([מאומתים] [משלוח אליי],
// QUICK_CHIP_KEYS order); the other 5 toggles moved into FilterSheet behind
// the "סינון" button. Chip visuals unchanged (same ChipScrollRow).
const QUICK_CHIPS = QUICK_CHIP_KEYS.map((key) =>
  TOGGLE_CHIPS.find((c) => c.key === key),
).filter(Boolean);

/**
 * Two rows of filter chips + active-filter tag list. Verbatim
 * extraction from MapClient.jsx:527-574 (the `filterChipsBar`
 * JSX const that the source rendered in both desktop and mobile
 * shells). MEH-1075 reshaped row 2: quick chips + "סינון" button
 * (badge = active sheet-only filters) opening FilterSheet — mobile
 * bottom sheet / lg+ panel anchored to this button's `relative`
 * wrapper. Sheet state is per-instance; the desktop and mobile
 * shells each mount their own bar, only one is displayed at a time.
 *
 * Props are state and handlers from useMapFilters.
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
  // Stable ref (PR #1565 review): an inline arrow would retrigger the sheet's
  // [open, onClose] keydown effect on every chipState re-render.
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const badgeCount = countActiveSheetOnlyFilters(chipState);
  return (
    <div dir="rtl" className="min-w-0">
      <ChipScrollRow
        variant="category"
        chips={visibleCategoryChips}
        activeKey={chipState.categoryKey}
        onChipClick={onCategoryChipClick}
        // MEH-1108: /map filter bar sits on the cream `background` token
        // (#F5F0E8 — globals.css body / mobile bar `bg-background/95`), not the
        // ChipScrollRow default white. Without this the edge-fade gradients
        // painted white smears at the scroll edges (reported as "blank white
        // pills" / a floating white block on a mid-scroll clipped chip). Every
        // other consumer already passes this same value (ProducersClient /
        // EventsClient / HomeProducersGrid) — this aligns /map with them.
        fadeBg="#F5F0E8"
      />
      <div className="mt-2 flex items-center gap-2 min-w-0">
        <ChipScrollRow
          variant="toggle"
          chips={QUICK_CHIPS}
          activeKeys={chipState}
          onChipClick={onToggleChipClick}
          className="flex-1"
          fadeBg="#F5F0E8"
        />
        {/* Anchor wrapper — FilterSheet's md+ panel positions off this. */}
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
