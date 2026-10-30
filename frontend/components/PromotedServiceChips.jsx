"use client";

import { Check } from "@phosphor-icons/react";

import { chipIcon } from "@/lib/chip-icons";
import { SERVICE_CHIP_KEYS } from "@/lib/map-chips";

/**
 * Module:   PromotedServiceChips
 * Purpose:  MEH-2598 — the promoted service chips «משלוח · איסוף עצמי · קנייה
 *           במקום», rendered identically on home, /producers and /map. Sapir
 *           29/10: one filter row across the three discovery surfaces, as
 *           Airbnb / Google Maps keep the same bar on the list and the map.
 * Does NOT: own the row (each surface keeps its own rail + sticky «סינון»
 *           anchor, MEH-2569 geometry), gate anything itself, or fetch.
 *
 * `chips` is the surface's ALREADY-GATED chip list, so a data gate (on_site,
 * MEH-2598) hides the promoted chip exactly where it hides the sheet switch —
 * and an active axis is kept by every gate's active carve-out, so a
 * deep-linked filter is never stranded. Order is SERVICE_CHIP_KEYS (one
 * constant: map-chips.js), not the incoming array's.
 *
 * Geometry REUSES ServiceChipRow (MEH-2046): rounded-md chip, Direction A
 * wash+ring when active, ✓ in place of the glyph (MEH-2500).
 */
export default function PromotedServiceChips({ chips = [], chipState = {}, onToggle, testIdPrefix }) {
  const promoted = SERVICE_CHIP_KEYS.map((key) => chips.find((c) => c.key === key)).filter(Boolean);
  return promoted.map((chip) => {
    const active = !!chipState[chip.key];
    return (
      <button
        key={chip.key}
        type="button"
        onClick={() => onToggle(chip.key)}
        aria-pressed={active}
        data-testid={`${testIdPrefix}-${chip.key}`}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium border transition shrink-0 ${
          active
            ? "bg-green-50 text-primary border-primary ring-1 ring-primary"
            : "bg-white text-text border-border hover:border-primary hover:text-primary"
        }`}
      >
        <span aria-hidden="true">{active ? <Check size={16} weight="bold" /> : chipIcon(chip.key)}</span>
        {chip.label}
      </button>
    );
  });
}
