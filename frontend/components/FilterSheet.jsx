"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { TOGGLE_CHIPS } from "@/lib/map-chips";
import { chipIcon } from "@/lib/chip-icons";
import { BADGE_CONFIG } from "@/lib/badges";

/**
 * Module:   FilterSheet
 * Purpose:  MEH-1075 /map filter IA — the grouped filter surface opened by
 *           the "סינון" button on the /map quick-chip row. Mobile (below lg,
 *           matching the /map shell switch): bottom sheet with backdrop +
 *           drag-down close, portaled to <body>. Desktop (lg+): panel
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
 * History:  MEH-1075 (creation); MEH-1418 (per-toggle Phosphor icon + muted
 *           explainer line); MEH-1423 (chip+paragraph → full-width row+Switch;
 *           subtext narrowed from all 7 toggles to the 3 unfamiliar terms —
 *           kosher · verified · grass_fed — so the sheet fits one 375px screen);
 *           MEH-1478 (diet group → 2-col pill grid; service group reordered
 *           רישוי מאומת → משלוח — layout only, TOGGLE_CHIPS untouched);
 *           MEH-1481 (desktop-only density: rows+pills min-h 36px, 13px labels,
 *           tighter gaps + capped scroll body + sticky footer — all lg:-gated,
 *           mobile byte-identical); MEH-1507 (Label Scope Contract: diet group
 *           reverts from the MEH-1478 pill grid to full-width rows so every diet
 *           term shows its scope-explicit subtext; subtext source moved from the
 *           SUBTEXT_KEYS/BADGE_CONFIG narrowing to per-chip contract metadata).
 */

// Sheet section order per spec: תזונה · מקור ואיכות · שירות ואמון.
const GROUP_ORDER = ["diet", "quality", "service"];

// MEH-1507 — Label Scope Contract: each chip carries its own scope-explicit
// `subtext` (attribute-labels.js, and the /map-local grass_fed object). The diet
// rows now render the LOCKED "עסקים עם מוצרים … בקטלוג" copy that names the
// any-product scope MEH-293 introduced; grass_fed reads "לפי הצהרת בית העסק". The
// trust rows (kosher · verified) have no contract subtext of their own, so they
// fall back to the BADGE_CONFIG tooltip MEH-1418 wired (has_delivery has neither
// → no subtext, unchanged). This REVERSES the MEH-1423/1478 narrowing to 3 rows:
// every diet term now explains its scope in-component (Baymard).
function chipSubtext(chip) {
  return chip.subtext ?? BADGE_CONFIG[chip.key]?.tooltip ?? null;
}

// MEH-1478: within-group render order. Default = TOGGLE_CHIPS array order; the
// service group leads with "רישוי מאומת" (verified) and trails with "משלוח"
// (has_delivery) per spec — a FilterSheet-LOCAL presentation reorder that leaves
// lib/map-chips.js TOGGLE_CHIPS untouched (scope lock: the array order there
// still drives /producers + every other consumer).
const GROUP_CHIP_ORDER = {
  service: ["verified", "has_delivery"],
};
// MEH-1862: the chip SET is now a parameter, so /producers can mount this sheet
// with its own axes. `source` defaults to TOGGLE_CHIPS, which is what /map has
// always passed implicitly — that surface is unchanged in behaviour and output.
//
// A key absent from GROUP_CHIP_ORDER keeps array order (indexOf → -1 for both
// sides is a stable tie), so a surface-specific chip appended to a group it does
// not enumerate — /producers' open_for_orders_now in `service` — lands last
// rather than jumping the explicit verified → has_delivery order.
function chipsForGroup(group, source) {
  const chips = source.filter((chip) => chip.group === group);
  const order = GROUP_CHIP_ORDER[group];
  if (!order) return chips;
  return [...chips].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

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
  // MEH-1862: which axes this mount offers. Defaults to the /map set so the
  // existing call site (FilterChipsBar.jsx:96) is unchanged.
  chips = TOGGLE_CHIPS,
}) {
  const t = useTranslations();
  const panelRef = useRef(null);
  const dragStartY = useRef(null);

  const focusables = () =>
    panelRef.current
      ? panelRef.current.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')
      : [];

  // REUSES: frontend/components/AccountSheet.jsx:40-68 — modal a11y, split in
  // two effects (PR #1565 review): focus capture/restore keys on [open] ONLY,
  // so a caller re-render that recreates onClose (chipState changes on every
  // toggle) can't tear this down and yank focus back to the first chip
  // mid-interaction.
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement;
    focusables()[0]?.focus();
    return () => {
      if (prevActive instanceof HTMLElement) prevActive.focus();
    };
  }, [open]);

  // Escape closes, Tab is trapped inside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const list = focusables();
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
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // MEH-1075 adversarial-review fix: on /map the mobile trigger lives inside
  // the sticky filter bar (MapClient.jsx:456), whose `backdrop-blur` makes it
  // the CONTAINING BLOCK for fixed descendants and traps z-[1200] inside the
  // bar's z-[50] stacking context — an in-place `fixed` sheet renders clipped
  // inside the bar, below the map controls. Below lg, portal the overlay to
  // <body>. Safe to read matchMedia during render: `open` is only ever set by
  // a client-side click, so this branch never runs on the server. Desktop
  // (lg+) stays in place — the anchored panel needs the trigger's `relative`
  // wrapper. Breakpoint is lg (1024), NOT md: the /map shells switch at lg
  // (MapClient.jsx `hidden lg:grid` / `lg:hidden`), so the backdrop-blur bar
  // is live through 768–1023px — an md boundary would leave tablets with a
  // clipped un-portaled backdrop (PR #1565 review). All responsive classes
  // below use lg: to match. (Resize while open is a cosmetic edge; reopen
  // recovers.)
  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1024px)").matches;

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
        className="fixed inset-0 z-[1200] bg-green-900/50 lg:bg-transparent"
      />
      <div
        ref={panelRef}
        id="filter-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
        dir="rtl"
        className="fixed inset-x-0 bottom-0 z-[1200] rounded-t-3xl border-t border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] max-h-[80dvh] overflow-y-auto lg:absolute lg:inset-x-auto lg:bottom-auto lg:top-full lg:end-0 lg:mt-2 lg:w-80 lg:rounded-xl lg:border lg:shadow-lg lg:max-h-[min(600px,calc(100vh-220px))]"
      >
        {/* Drag handle — mobile-only close affordance (MapBottomSheet 44×5 chrome). */}
        <div
          className="flex justify-center pb-2 cursor-grab lg:hidden"
          onTouchStart={onHandleTouchStart}
          onTouchEnd={onHandleTouchEnd}
          aria-hidden="true"
        >
          <div className="w-11 h-[5px] rounded-full bg-[#D4C5A9]" />
        </div>

        <h2 id="filter-sheet-title" className="font-headline-md text-lg font-bold text-text m-0">
          {t("filters.sheet.title")}
        </h2>

        {GROUP_ORDER.map((group) => {
          const groupChips = chipsForGroup(group, chips);
          // MEH-1862 (5-state rule, 0 items): a group with no chips renders
          // NOTHING — not a bare heading. This is reachable, not defensive
          // padding: /producers has no grass_fed, and its diet axes are
          // runtime-gated (DIET_CHIP_MIN, MEH-1934), so a group can empty out
          // on real data. On /map every group is populated, so this branch
          // never fires there and that surface is unchanged.
          if (!groupChips.length) return null;
          return (
          <div key={group}>
            {/* MEH-1481: desktop-only density — tighter top/bottom gaps on lg+
                (mobile mt-4/mb-1 byte-identical). */}
            <h3 className="text-sm font-medium text-fg-muted mt-4 mb-1 lg:mt-3 lg:mb-0.5">
              {t(`filters.sheet.group_${group}`)}
            </h3>
            {/* MEH-1507: ALL groups (incl. diet) render as full-width ROWS —
                leading icon + label at the inline-start, a Switch at the
                inline-end, hairline divider between rows (divide-y), and a
                scope-explicit subtext BELOW the button (outside its accessible
                name). The MEH-1478 2-col diet pill GRID is retired: its rationale
                was "everyday terms, no subtext", but the Label Scope Contract now
                gives every diet term a subtext, so the row form (which carries a
                subtext line) is the fit. Each row is ONE role="switch" button
                (min-h 44px tap target); multi-select is unchanged. MEH-1478
                service reorder (רישוי מאומת → משלוח) still applies via
                chipsForGroup. MEH-1481 desktop density preserved.
                REUSES: frontend/components/AlertPrefsPanel.jsx:165-186 — label+icon
                at start, role="switch" pill at end, knob start-1(off)→end-1(on)
                via logical insets (RTL-safe). */}
            <div className="divide-y divide-border">
              {groupChips.map((chip) => {
                const active = !!chipState[chip.key];
                const icon = chipIcon(chip.key);
                const subtext = chipSubtext(chip);
                return (
                  <div key={chip.key} className="py-1 lg:py-0.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={active}
                      // MEH-1862: same locator ChipScrollRow's consumers already
                      // query (docs/E2E-LOCATORS.md). A chip that moves from the
                      // row into this sheet keeps its handle, so a spec asserting
                      // on it only has to open the sheet — it does not have to be
                      // rewritten around a different query.
                      data-testid={`chip-${chip.key}`}
                      onClick={() => onToggleChip(chip.key)}
                      className="flex w-full items-center justify-between gap-3 min-h-[44px] lg:min-h-[36px] py-1.5 lg:py-1 text-start rounded-md hover:bg-background-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm lg:text-[13px] font-medium text-text">
                        {icon && <span aria-hidden="true">{icon}</span>}
                        {chip.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${
                          active ? "bg-primary" : "bg-border"
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                            active ? "end-1" : "start-1"
                          }`}
                        />
                      </span>
                    </button>
                    {subtext && (
                      <p className="text-xs text-fg-muted ps-1 pb-1 m-0">{subtext}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}

        {/* Apply = close (state is shared + already applied live); count is the
            live client-side visibleProducers.length passed by the caller.
            Zero state keeps apply enabled — the clear link sits beside it.
            MEH-1481: on lg+ the footer is STICKY to the bottom of this
            overflow-y-auto panel so apply + ניקוי הכל stay visible when the
            (capped) body scrolls — an opaque bg + top hairline hide the content
            scrolling under it. No structural change: the panel div is already
            the scroll container. Mobile footer (mt-6, non-sticky) unchanged. */}
        <div className="mt-6 flex items-center gap-3 lg:sticky lg:bottom-0 lg:mt-4 lg:-mx-4 lg:px-4 lg:pt-3 lg:pb-1 lg:bg-background lg:border-t lg:border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] lg:min-h-[36px] rounded-md bg-primary text-white text-sm lg:text-[13px] font-medium px-4 py-2.5 lg:py-1.5 hover:opacity-90 transition"
          >
            {t("filters.sheet.apply", { count: resultCount })}
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="min-h-[44px] lg:min-h-[36px] text-primary text-sm lg:text-[13px] font-medium hover:opacity-80 transition"
          >
            {t("filters.sheet.clear")}
          </button>
        </div>
      </div>
    </div>
  );

  return isDesktop ? overlay : createPortal(overlay, document.body);
}
