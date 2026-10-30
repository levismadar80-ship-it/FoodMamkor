"use client";

import PromotedServiceChips from "@/components/PromotedServiceChips";
import { keepFocusedChipClear } from "@/lib/keepFocusedChipClear";
import { TOGGLE_CHIPS } from "@/lib/map-chips";

/**
 * Module:   ServiceChipRow
 * Purpose:  The /map fulfillment row — משלוח · איסוף עצמי as two promoted,
 *           always-visible service chips, plus the "סינון" trigger. OR
 *           semantics: both on = union, never intersection.
 * Does NOT: own chip state or fetching (that is useMapFilters), render the
 *           FilterSheet (FilterChipsBar owns the anchor wrapper so the md+
 *           panel keeps positioning off the button), or scroll — see below.
 * Related:  frontend/components/ChipScrollRow.jsx:307 (the chip visual this
 *           mirrors); frontend/lib/chip-icons.js (Truck / Package);
 *           frontend/app/[locale]/map/components/FilterChipsBar.jsx (parent).
 * History:  MEH-2046.
 *
 * A SIBLING of ChipScrollRow rather than a variant of it. ChipScrollRow's
 * container is `overflow-x-auto` with a fade mask and a scroll-end spacer
 * (:246, :328) — the whole point of this row is that its two chips never move
 * and are never half-hidden behind a fade, so forking it by prop would have
 * meant threading a flag through the scroll refs, the overflow observer and
 * the snap classes to switch all of it off. The chip BUTTON is what matters
 * for visual parity, and that is ~6 lines duplicated deliberately.
 *
 * Re-introducing a second chip row reverses MEH-1368, which deleted the old
 * inline quick-chip row as pure duplication of FilterSheet. Ratified in
 * MEH-2046 decision 5 on the grounds that this is not that row: two promoted
 * SERVICE chips, not a generic mirror of every attribute. FilterSheet keeps
 * both — the duplication is the point (Baymard: promoted filters), and the
 * shared `chipState` is what stops the two surfaces drifting.
 */

// MEH-2046: the two axes this row promotes (SERVICE_CHIP_KEYS, lib/map-chips —
// MEH-2425 moved it there so the tag row can skip them). Both live in
// TOGGLE_CHIPS, so labels + scope/evidence come from ATTRIBUTE_LABELS and
// cannot drift from FilterSheet's copy of them.

export default function ServiceChipRow({ chipState, onToggleChip, chips = TOGGLE_CHIPS, children }) {
  return (
    // MEH-2598 (Sapir 29/10, «אחיד»): the row now matches home and /producers
    // (MEH-2537 / MEH-2569) — «סינון» LEADS (children, sticky below lg), then
    // the promoted service trio. With three chips the row no longer fits a
    // phone, so below md it is the same sideways rail as the other two
    // surfaces, bled to the panel edge (-mx-3/px-3 against the bar's px-3);
    // py-1/-mt-1 keep focus rings inside the scrollport; overscroll-x-none per
    // MEH-2574. lg+ is the desktop side panel (MapClient `hidden lg:grid`, the
    // same lg FilterSheet switches at): overflow is visible so the anchored
    // panel is not clipped, and the row WRAPS rather than scrolls, because the
    // 25/75 split narrows the panel below the row's width.
    <div
      dir="rtl"
      data-testid="map-service-row"
      className="-mx-3 mt-1 flex items-center gap-2 min-w-0 overflow-x-auto overscroll-x-none px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0 lg:overflow-visible lg:flex-wrap"
      onFocus={keepFocusedChipClear}
    >
      {/* The "סינון" trigger and its FilterSheet anchor are passed in rather
          than built here — FilterSheet's lg+ panel positions off the parent's
          wrapper, so moving that wrapper into this component would have
          relocated the panel too. */}
      {children}
      {/* `chips` is the GATED list (visibleMapToggleChips), so on_site only
          appears once the catalog carries it — same gate as the sheet. */}
      <PromotedServiceChips
        chips={chips}
        chipState={chipState}
        onToggle={onToggleChip}
        testIdPrefix="map-service-chip"
      />
    </div>
  );
}
