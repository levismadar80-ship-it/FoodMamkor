"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { TOGGLE_CHIPS } from "@/lib/map-chips";
import { chipIcon } from "@/lib/chip-icons";
import { BADGE_CONFIG } from "@/lib/badges";
import Popover from "@/components/ui/Popover";

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
 *           SUBTEXT_KEYS/BADGE_CONFIG narrowing to per-chip contract metadata);
 *           MEH-2169 (one screen: the 5 diet subtexts collapse into ONE group-level
 *           scope line + the diet group returns to the MEH-1478 2-col pill grid;
 *           every remaining per-row subtext becomes an ⓘ tap-Popover; aria-live on
 *           the apply count). MEH-1507's disclosure guarantee is preserved in both
 *           forms — nothing became undiscoverable, it moved from a permanent
 *           paragraph to a group line / an on-demand bubble.
 */

// Sheet section order per spec: תזונה · מקור ואיכות · שירות ואמון.
const GROUP_ORDER = ["diet", "quality", "service"];

// MEH-1507 — Label Scope Contract: each chip carries its own scope-explicit
// `subtext` (lib/filter-taxonomy.js FILTER_AXES). grass_fed reads "לפי הצהרת בית
// העסק"; the trust rows (kosher · verified) have no contract subtext of their own,
// so they fall back to the BADGE_CONFIG tooltip MEH-1418 wired (has_delivery has
// neither → nothing to disclose, unchanged).
//
// MEH-2169: the RESOLUTION is untouched — what changed is where the resolved
// string is PAINTED. It used to be a permanent <p> under every row; it is now the
// content of an ⓘ Popover beside the row (ui/Popover, not InfoTooltip — see the
// row block for the measured reason). The diet axes no longer consult this
// at all: their five subtexts were the same sentence with one word swapped, so the
// group says it once (filters.sheet.diet_scope) and the pills carry none.
function chipSubtext(chip) {
  return chip.subtext ?? BADGE_CONFIG[chip.key]?.tooltip ?? null;
}

// MEH-1478: within-group render order. Default = TOGGLE_CHIPS array order; the
// service group leads with "רישוי מאומת" (verified) and trails with "משלוח"
// (has_delivery) per spec — a FilterSheet-LOCAL presentation reorder that leaves
// lib/map-chips.js TOGGLE_CHIPS untouched (scope lock: the array order there
// still drives /producers + every other consumer).
// MEH-2046: pickup_points appended AFTER has_delivery, so the MEH-1478 order
// above (verified leads, משלוח trails) is extended rather than disturbed — and
// the sheet's service group now mirrors the promoted row's pairing
// (משלוח then איסוף עצמי) instead of splitting the two apart.
const GROUP_CHIP_ORDER = {
  service: ["verified", "has_delivery", "pickup_points"],
};
// MEH-1862: the chip SET is now a parameter, so /producers can mount this sheet
// with its own axes. `source` defaults to TOGGLE_CHIPS, which is what /map has
// always passed implicitly — that surface is unchanged in behaviour and output.
//
// A key absent from GROUP_CHIP_ORDER sorts AFTER every enumerated one, keeping
// array order among themselves — so a surface-specific chip appended to a group
// this map does not enumerate (/producers' open_for_orders_now in `service`)
// lands last instead of jumping the explicit verified → has_delivery order.
//
// `order.length`, not a raw `indexOf`. The first version of this used the bare
// difference and a comment asserting that -1 was "a stable tie": that is only
// true when BOTH keys are missing. With one present, `-1 - 0 = -1` sorts the
// UNTRACKED key FIRST — the exact inverse of the intent. Measured on the built
// app before the fix: the service group rendered open_for_orders_now ahead of
// verified and has_delivery, contradicting producer-filters.js:118-120, which
// puts that chip last on purpose ("it reads as a refinement of the durable
// attributes above rather than as a peer of them"). Infinity is not used
// either — `Infinity - Infinity` is NaN, which is an invalid comparator the
// moment a group has two untracked keys.
function chipsForGroup(group, source) {
  const chips = source.filter((chip) => chip.group === group);
  const order = GROUP_CHIP_ORDER[group];
  if (!order) return chips;
  const rank = (key) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  return [...chips].sort((a, b) => rank(a.key) - rank(b.key));
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
        // MEH-1945: the panel's bottom padding moves ONTO the sticky footer
        // below. `position: sticky; bottom-0` resolves against the scrollport —
        // the container's PADDING box — so a padding-bottom here parks the
        // footer that many px above the sheet's edge, with body content
        // scrolling through the gap. Measured at 390×844 rather than reasoned:
        // with the container's pb restored to 32px the footer's bottom lands at
        // 812 against a 844 viewport and a 844 panel edge; at pb-0 it lands at
        // 844, flush. The safe-area inset still has to be paid — it is paid by
        // the footer's own pb, where it sits UNDER the footer instead of under
        // a scrolling body. lg: restores the container pad: the anchored
        // desktop panel has no safe-area to clear and no notch to sit in.
        className="fixed inset-x-0 bottom-0 z-[1200] rounded-t-3xl border-t border-border bg-background p-4 pb-0 max-h-[80dvh] overflow-y-auto lg:absolute lg:inset-x-auto lg:bottom-auto lg:top-full lg:end-0 lg:mt-2 lg:w-80 lg:rounded-xl lg:border lg:shadow-lg lg:max-h-[min(600px,calc(100vh-220px))] lg:pb-4"
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
            <h3 className="text-sm font-medium text-fg-muted mt-2 mb-1 lg:mt-2 lg:mb-0.5">
              {t(`filters.sheet.group_${group}`)}
            </h3>
            {/* MEH-2169 — the diet group's ONE scope line, replacing five per-row
                paragraphs. MEH-1507 gave each diet axis a subtext of the form
                "עסקים עם מוצרים <X> בקטלוג"; across טבעוני · צמחוני · ללא גלוטן ·
                ללא לקטוז · ללא סוכר מוסף that is the same sentence five times with
                one word swapped, i.e. ~5 wrapped lines of height carrying one fact.
                Said once at group level it is the SAME disclosure: the any-product
                scope MEH-293 introduced is still stated on the surface, before the
                controls it governs, and is still impossible to miss — which is the
                property MEH-1507 exists to protect, not the per-row placement.
                Renders INSIDE the `groupChips.length` guard above, so a diet group
                emptied by runtime gating (/producers, MEH-1934 DIET_CHIP_MIN, and
                MEH-2170 next) cannot leave an orphan scope line explaining nothing —
                the 5-state 0-items branch covers the line and the heading together. */}
            {group === "diet" && (
              <p className="text-xs text-fg-muted m-0 mb-1 lg:mb-0.5">
                {t("filters.sheet.diet_scope")}
              </p>
            )}

            {group === "diet" ? (
              /* MEH-2169 — the diet axes return to the MEH-1478 2-col pill GRID
                 (grid-template-columns: repeat(2, minmax(0,1fr))). MEH-1507 had
                 reverted that grid to full-width rows for one reason only: a row
                 can carry a subtext line and a pill cannot. The group line above
                 removes that reason, so the compact form comes back and takes ~5
                 rows' worth of height out of the sheet.
                 DELIBERATE DEVIATION from MEH-1478, which used `aria-pressed`:
                 these stay role="switch" + aria-checked, like the sibling rows.
                 Not cosmetic — __tests__/ProducersFilterSheet.test.jsx:203-204
                 reads `chip-gluten_free`'s aria-checked on the /producers mount of
                 THIS component, and that file is outside this card's scope. Keeping
                 the ARIA identical also keeps "live-apply toggle" one vocabulary
                 across the sheet; only the visual form differs between the two
                 groups. Icon (aria-hidden) + label centred, label stays the
                 accessible name; data-testid preserved per docs/E2E-LOCATORS.md. */
              <div className="grid grid-cols-2 gap-1.5 lg:gap-1">
                {groupChips.map((chip) => {
                  const active = !!chipState[chip.key];
                  const icon = chipIcon(chip.key);
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      role="switch"
                      aria-checked={active}
                      data-testid={`chip-${chip.key}`}
                      onClick={() => onToggleChip(chip.key)}
                      // whitespace-nowrap: the card requires single-line pills at
                      // both densities. The longest diet label is "ללא סוכר מוסף";
                      // measured widths are in the PR body. nowrap makes a future
                      // longer label overflow VISIBLY (one pill wider than its
                      // column) instead of silently growing every pill's height,
                      // which is the failure this constraint exists to catch.
                      className={`flex items-center justify-center gap-1.5 min-h-[44px] lg:min-h-[36px] rounded-full border px-2.5 py-2 lg:py-1 text-sm lg:text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        active
                          ? "bg-primary text-white border-primary"
                          : "bg-surface text-text border-border hover:border-primary"
                      }`}
                    >
                      {icon && <span aria-hidden="true">{icon}</span>}
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            ) : (
            /* MEH-1507: the quality + service groups stay full-width ROWS —
                leading icon + label at the inline-start, a Switch at the
                inline-end, hairline divider between rows (divide-y). Each row is
                ONE role="switch" button (min-h 44px tap target); multi-select is
                unchanged. MEH-1478 service reorder (רישוי מאומת → משלוח) still
                applies via chipsForGroup. MEH-1481 desktop density preserved.
                REUSES: frontend/components/AlertPrefsPanel.jsx:165-186 — label+icon
                at start, role="switch" pill at end, knob start-1(off)→end-1(on)
                via logical insets (RTL-safe).
                MEH-2169: the permanent <p> subtext under each row is gone; the
                same string is now the ⓘ InfoTooltip's content (see below). */
            <div className="divide-y divide-border">
              {groupChips.map((chip) => {
                const active = !!chipState[chip.key];
                const icon = chipIcon(chip.key);
                const subtext = chipSubtext(chip);
                return (
                  // MEH-2169 — three constraints decided this row's shape, all of
                  // them measured rather than assumed:
                  //
                  // 1. The ⓘ is a SIBLING of the switch, never a child. Its trigger
                  //    is a <button>, and a button inside a button is invalid HTML —
                  //    browsers unnest it, which would eject the disclosure from the
                  //    row. The switch keeps flex-1, so the full-width 44px tap
                  //    target is unchanged: no hit area was traded for this.
                  // 2. It is ui/Popover, NOT components/InfoTooltip, even though the
                  //    card names the latter. InfoTooltip is hover/focus-only by
                  //    design (its own docstring says so, and WhatsThis.jsx:11 names
                  //    it as such). Measured in Chromium at 390×844: a tap fires
                  //    `mouseenter → focus → click`, so onMouseEnter opens it and
                  //    onClick toggles it straight back SHUT — aria-expanded=false,
                  //    zero [role=tooltip] in the DOM, on both touch tap and mouse
                  //    click. On admin desktop pages that never showed, because a
                  //    real pointer hovers before it clicks. Shipping it here would
                  //    have put an unreachable glyph on the primary mobile surface,
                  //    which is exactly the dead `+N` <span> .claude/rules/labels.md
                  //    § Indicators & counters (MEH-1549) forbids. Popover is the
                  //    repo's tap-opened primitive and the precedent that rule cites.
                  //    Default anchored mode ONLY — `sheetOnMobile` would portal a
                  //    second focus trap to <body>, outside this dialog's own trap.
                  // 3. The ⓘ leads the row (inline-START, beside the label) rather
                  //    than trailing it. Popover's placement is `start-0`, so the
                  //    panel grows toward the inline-end — from the start edge that
                  //    is INWARD, from the end edge it would overflow the panel and
                  //    trip the horizontal-scroll assertion in
                  //    e2e/qa-meh1862-filter-sheet.mjs. Rows with nothing to disclose
                  //    (has_delivery) get the same-width spacer so every label in the
                  //    group still starts on one line.
                  <div key={chip.key} className="flex items-center gap-1">
                    <span className="shrink-0 w-5 flex justify-center">
                      {subtext && (
                        <Popover
                          placement="bottom"
                          contentClassName="w-56"
                          contentTestId={`chip-info-panel-${chip.key}`}
                          trigger={
                            <button
                              type="button"
                              data-testid={`chip-info-${chip.key}`}
                              aria-label={t("common.info_tooltip.trigger_aria")}
                              // The glyph is a 20px circle; the BUTTON is the full
                              // row height (h-11 = 44px, lg:h-9 = 36px to match the
                              // denser row). Measured: the row is already 44px, so
                              // this buys a 20×44 hit area for zero extra height.
                              // It grows vertically ONLY — a horizontally padded
                              // target would eat into the switch beside it and
                              // steal taps meant for the row.
                              className="inline-flex items-center justify-center w-5 h-11 lg:h-9 text-fg-muted focus:outline-none focus-visible:outline-none group"
                            >
                              <span
                                aria-hidden="true"
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-fg-muted/40 text-[10px] leading-none transition group-hover:bg-fg-muted/10 group-focus-visible:ring-2 group-focus-visible:ring-primary/40"
                              >
                                i
                              </span>
                            </button>
                          }
                        >
                          {subtext}
                        </Popover>
                      )}
                    </span>
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
                      className="flex flex-1 items-center justify-between gap-3 min-h-[44px] lg:min-h-[36px] py-1.5 lg:py-1 text-start rounded-md hover:bg-background-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
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
                  </div>
                );
              })}
            </div>
            )}
          </div>
          );
        })}

        {/* Apply = close (state is shared + already applied live); count is the
            live client-side visibleProducers.length passed by the caller.
            Zero state keeps apply enabled — the clear link sits beside it.
            MEH-1481: the footer is STICKY to the bottom of this overflow-y-auto
            panel so apply + ניקוי הכל stay visible when the (capped) body
            scrolls — an opaque bg + top hairline hide the content scrolling
            under it. No structural change: the panel div is already the scroll
            container.
            MEH-1481 gated all of that behind lg: because its card scoped it to
            desktop — scope, not a product call. MEH-1945 un-gates it: mobile
            has the same Apply-visibility bug and worse, measured on #2690 at
            390×844 (scrollHeight 749 > clientHeight 674, footer at y=859 — off
            the viewport, reachable only by scrolling). Only the density values
            stay lg:-gated. `pb` carries the safe-area inset the panel gave up:
            the footer is the bottommost painted element now, so the notch
            clearance belongs to it. */}
        <div
          // MEH-1945: the guards for this footer (the vitest tripwires and
          // e2e/qa-meh1945-sticky-apply.mjs) used to reach it as the panel's
          // lastElementChild. That is a POSITIONAL handle: append anything
          // after this div and both silently start asserting about a different
          // element — still green, no longer measuring the footer. Anchored to
          // identity instead, per docs/E2E-LOCATORS.md. Raised by the CI
          // adversarial reviewer on PR #2695.
          data-testid="filter-sheet-apply-footer"
          className="sticky bottom-0 -mx-4 mt-2 flex items-center gap-3 border-t border-border bg-background px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] lg:mt-2 lg:pt-3 lg:pb-1"
        >
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] lg:min-h-[36px] rounded-md bg-primary text-white text-sm lg:text-[13px] font-medium px-4 py-2.5 lg:py-1.5 hover:opacity-90 transition"
          >
            {/* MEH-2169: the count is the sheet's only feedback that a toggle did
                anything — filters apply LIVE, so nothing else on this surface
                changes when a switch flips. Sighted users see the number move;
                without a live region a screen-reader user hears nothing at all.
                aria-live sits on the inner span, not the button: announcing the
                region does not disturb the button's accessible name, which the
                existing name-based queries and the footer guards rely on. */}
            <span aria-live="polite">
              {t("filters.sheet.apply", { count: resultCount })}
            </span>
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
