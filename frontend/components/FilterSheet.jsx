"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { TOGGLE_CHIPS } from "@/lib/map-chips";

/**
 * Module:   FilterSheet
 * Purpose:  MEH-1075 /map filter IA — the grouped filter surface opened by
 *           the "סינון" button on the /map quick-chip row. Mobile: bottom
 *           sheet with backdrop + drag-down close. Desktop (md+): panel
 *           anchored under the trigger (the caller wraps trigger + sheet in
 *           a `relative` container). Toggles write the SHARED chipState
 *           immediately via onToggleChip — there is no staged draft state;
 *           the apply button only closes the sheet (results are already live).
 * Does NOT: own filter state or fetch producers (useMapFilters.js does —
 *           including the has_delivery→CityPickerModal flow, which the
 *           caller's onToggleChip must route through); render the quick-chip
 *           row or the "סינון" trigger button (FilterChipsBar.jsx does);
 *           touch the producer-list bottom sheet (MapBottomSheet.jsx, z-600).
 * Related:  frontend/app/[locale]/map/state/useMapFilters.js:94-106 (the
 *           shared toggle handler), frontend/lib/map-chips.js (TOGGLE_CHIPS
 *           group metadata), frontend/components/AccountSheet.jsx:40-68
 *           (focus-trap pattern source).
 * History:  MEH-1075 (creation).
 */

// Sheet section order per spec: תזונה · מקור ואיכות · שירות ואמון.
const GROUP_ORDER = ["diet", "quality", "service"];

// Drag-down distance (px) on the mobile handle that dismisses the sheet.
const DRAG_CLOSE_PX = 80;

// z-[1200] per the /map token ledger (.claude/rules/rtl.md): above
// controls/BottomNav (1000) and the cookie banner (1100), below chat (9999).
export default function FilterSheet({
  open,
  onClose,
  chipState,
  onToggleChip,
  resultCount,
  onClearAll,
}) {
  const t = useTranslations();
  const panelRef = useRef(null);
  const dragStartY = useRef(null);

  // REUSES: frontend/components/AccountSheet.jsx:40-68 — modal a11y: focus
  // moves into the panel on open, Escape closes, Tab is trapped, and focus
  // returns to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement;
    const items = () =>
      panelRef.current
        ? panelRef.current.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')
        : [];
    items()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prevActive instanceof HTMLElement) prevActive.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  // MEH-1075 adversarial-review fix: on /map the mobile trigger lives inside
  // the sticky filter bar (MapClient.jsx:456), whose `backdrop-blur` makes it
  // the CONTAINING BLOCK for fixed descendants and traps z-[1200] inside the
  // bar's z-[50] stacking context — an in-place `fixed` sheet renders clipped
  // inside the bar, below the map controls. Below md, portal the overlay to
  // <body>. Safe to read matchMedia during render: `open` is only ever set by
  // a client-side click, so this branch never runs on the server. Desktop
  // (md+) stays in place — the anchored panel needs the trigger's `relative`
  // wrapper. (Resize while open is a known cosmetic edge; reopen recovers.)
  const isMdUp =
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px)").matches;

  const onHandleTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const onHandleTouchEnd = (e) => {
    if (dragStartY.current == null) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    dragStartY.current = null;
    if (dy > DRAG_CLOSE_PX) onClose();
  };

  const overlay = (
    <div>
      {/* Backdrop — dimmed scrim on mobile, invisible click-away layer on
          desktop (the anchored panel needs outside-click close, not dimming). */}
      <button
        type="button"
        aria-label={t("filters.sheet.close_aria")}
        onClick={onClose}
        className="fixed inset-0 z-[1200] bg-green-900/50 md:bg-transparent"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
        dir="rtl"
        className="fixed inset-x-0 bottom-0 z-[1200] rounded-t-3xl border-t border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] max-h-[80dvh] overflow-y-auto md:absolute md:inset-x-auto md:bottom-auto md:top-full md:end-0 md:mt-2 md:w-80 md:rounded-xl md:border md:shadow-lg md:max-h-[70vh]"
      >
        {/* Drag handle — mobile-only close affordance (MapBottomSheet 44×5 chrome). */}
        <div
          className="flex justify-center pb-2 cursor-grab md:hidden"
          onTouchStart={onHandleTouchStart}
          onTouchEnd={onHandleTouchEnd}
          aria-hidden="true"
        >
          <div className="w-11 h-[5px] rounded-full bg-[#D4C5A9]" />
        </div>

        <h2 id="filter-sheet-title" className="font-headline-md text-lg font-bold text-text m-0">
          {t("filters.sheet.title")}
        </h2>

        {GROUP_ORDER.map((group) => (
          <div key={group}>
            <h3 className="text-sm font-medium text-fg-muted mt-4 mb-2">
              {t(`filters.sheet.group_${group}`)}
            </h3>
            <div className="flex flex-wrap gap-2">
              {TOGGLE_CHIPS.filter((chip) => chip.group === group).map((chip) => {
                const active = !!chipState[chip.key];
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => onToggleChip(chip.key)}
                    aria-pressed={active}
                    // REUSES: frontend/components/ChipScrollRow.jsx:118-122 —
                    // identical chip visuals so sheet chips match the quick row.
                    className={`inline-flex items-center whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium border transition shrink-0 ${
                      active
                        ? "bg-state-selected text-white border-state-selected"
                        : "bg-white text-text border-border hover:border-primary hover:text-primary"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Apply = close (state is shared + already applied live); count is the
            live client-side visibleProducers.length passed by the caller.
            Zero state keeps apply enabled — the clear link sits beside it. */}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-md bg-primary text-white text-sm font-medium px-4 py-2.5 hover:opacity-90 transition"
          >
            {t("filters.sheet.apply", { count: resultCount })}
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="min-h-[44px] text-primary text-sm font-medium hover:opacity-80 transition"
          >
            {t("filters.sheet.clear")}
          </button>
        </div>
      </div>
    </div>
  );

  return isMdUp ? overlay : createPortal(overlay, document.body);
}
