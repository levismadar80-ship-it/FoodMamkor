import { useTranslations } from "next-intl";

import ChipScrollRow from "@/components/ChipScrollRow";
import { TOGGLE_CHIPS } from "@/lib/map-chips";

/**
 * Two rows of filter chips + active-filter tag list. Verbatim
 * extraction from MapClient.jsx:527-574 (the `filterChipsBar`
 * JSX const that the source rendered in both desktop and mobile
 * shells).
 *
 * Props are state and handlers from useMapFilters.
 */
export default function FilterChipsBar({
  visibleCategoryChips,
  chipState,
  onCategoryChipClick,
  onToggleChipClick,
  activeFilterTags,
  resetAllFilters,
}) {
  const t = useTranslations();
  return (
    <div dir="rtl" className="min-w-0">
      <ChipScrollRow
        variant="category"
        chips={visibleCategoryChips}
        activeKey={chipState.categoryKey}
        onChipClick={onCategoryChipClick}
        chipShape="rounded-md"
        selectedClassName="bg-state-selected text-white border-state-selected"
      />
      <ChipScrollRow
        variant="toggle"
        chips={TOGGLE_CHIPS}
        activeKeys={chipState}
        onChipClick={onToggleChipClick}
        className="mt-2"
        chipShape="rounded-md"
        selectedClassName="bg-state-selected text-white border-state-selected"
      />
      {activeFilterTags.length > 0 && (
        <div
          dir="rtl"
          className="mt-2 flex flex-wrap items-center gap-1.5"
          aria-live="polite"
        >
          {activeFilterTags.map((tag) => (
            <button
              key={`${tag.kind}:${tag.key}`}
              type="button"
              onClick={() =>
                tag.kind === "category"
                  ? onCategoryChipClick("all")
                  : onToggleChipClick(tag.key)
              }
              aria-label={t("map.filter.aria.remove", { label: tag.label })}
              className="inline-flex items-center gap-1 rounded-md bg-green-50 text-primary px-2 py-0.5 text-[11px] hover:bg-green-50/80 transition"
            >
              <span aria-hidden="true">×</span>
              {tag.label}
            </button>
          ))}
          <button
            type="button"
            onClick={resetAllFilters}
            className="text-primary text-[11px] no-underline hover:opacity-80 transition"
          >
            {t("map.filter.clear_all")}
          </button>
        </div>
      )}
    </div>
  );
}
