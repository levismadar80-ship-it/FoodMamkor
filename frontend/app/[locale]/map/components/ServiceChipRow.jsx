"use client";

import { useMemo } from "react";

import { chipIcon } from "@/lib/chip-icons";
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

// MEH-2046: the two axes this row promotes, in RTL reading order
// (משלוח first). Both live in TOGGLE_CHIPS, so labels + scope/evidence come
// from ATTRIBUTE_LABELS and cannot drift from FilterSheet's copy of them.
const SERVICE_KEYS = ["has_delivery", "pickup_points"];

export default function ServiceChipRow({ chipState, onToggleChip, children }) {
  // REUSES: FilterChipsBar.jsx — glyphs attached at the render site so
  // map-chips.js stays React-free for its pure-logic tests.
  const chips = useMemo(
    () =>
      SERVICE_KEYS.map((key) => {
        const chip = TOGGLE_CHIPS.find((c) => c.key === key);
        return chip ? { ...chip, icon: chipIcon(key) } : null;
      }).filter(Boolean),
    [],
  );

  return (
    <div dir="rtl" className="mt-2 flex items-center gap-2 min-w-0">
      {chips.map((chip) => {
        const active = !!chipState[chip.key];
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onToggleChip(chip.key)}
            aria-pressed={active}
            // REUSES: ChipScrollRow.jsx:307 — identical chip geometry and the
            // MEH-764 rounded-md, minus the scroll-only `snap-start`. Active is
            // the Direction A wash+ring (MEH-1181-A), matching a selected
            // category chip rather than the solid toggle fill, because these
            // two sit in their own row and read as a pair.
            className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium border transition shrink-0 ${
              active
                ? "bg-green-50 text-primary border-primary ring-1 ring-primary"
                : "bg-white text-text border-border hover:border-primary hover:text-primary"
            }`}
          >
            <span aria-hidden="true">{chip.icon}</span>
            {chip.label}
          </button>
        );
      })}
      {/* The "סינון" trigger and its FilterSheet anchor are passed in rather
          than built here — FilterSheet's md+ panel positions off the parent's
          `relative` wrapper, so moving that wrapper into this component would
          have relocated the panel too. */}
      {children}
    </div>
  );
}
