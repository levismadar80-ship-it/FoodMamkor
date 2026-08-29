/**
 * Module:   chip-icons
 * Purpose:  MEH-1418 — leading Phosphor icons for the toggle/attribute filter
 *           chips (verified · delivery · kosher · diet · quality) across the
 *           three discovery surfaces (home · /producers · /map) + FilterSheet.
 * Touches:  none — pure presentation, returns React elements only.
 * Does NOT: own chip labels (lib/attribute-labels.js) or chip config
 *           (lib/producer-filters.js CHIPS_CONFIG · lib/map-chips.js
 *           TOGGLE_CHIPS); render FilterSheet subtext (FilterSheet.jsx owns
 *           that, sourced from lib/badges.js BADGE_CONFIG tooltips). CATEGORY
 *           chips are text-only (MEH-683 D4) — their keys are absent from the
 *           map below, so their chips render byte-identical.
 * Related:  frontend/components/ChipScrollRow.jsx:236 (renders chip.icon inside
 *           an aria-hidden span, gap-1.5 before the label).
 * History:  MEH-1418 (creation). Emoji-LOCK v2 forbids emoji literals; Phosphor
 *           aria-hidden glyphs are the approved substitute (MEH-990 precedent).
 *
 * Kept separate from attribute-labels.js / map-chips.js on purpose: those are
 * React-free data modules imported by pure-logic tests (attributeLabels.test.js,
 * mapChips.test.js). Folding Phosphor JSX into them would pull a rendering
 * dependency into modules that are deliberately DOM-free.
 */
import {
  SealCheck,
  Truck,
  Package,
  Certificate,
  Leaf,
  Carrot,
  GrainsSlash,
  Barn,
  DropSlash,
  Cube,
  Clock,
} from "@phosphor-icons/react";

// key → Phosphor icon component. Keys mirror the attribute chip keys in
// CHIPS_CONFIG / TOGGLE_CHIPS. A key absent here (every category chip) yields
// no icon → the chip renders text-only, unchanged.
const CHIP_ICON_COMPONENTS = {
  verified: SealCheck,
  has_delivery: Truck,
  pickup_points: Package,  // MEH-2046
  kosher: Certificate,
  vegan: Leaf,
  // MEH-2169: vegetarian + no_added_sugar had NO entry here, so both rendered
  // text-only while their diet siblings carried a glyph. That was invisible while
  // the diet group was a vertical row list; the 2-col pill grid this ticket
  // restores puts the five pills side by side, where one iconless pill among
  // iconed ones reads as a different KIND of control. Both names were verified
  // present in @phosphor-icons/react 2.1.10 BEFORE being written here
  // (dist/csr/Carrot.es.js, dist/csr/Cube.es.js), with SealCheck/Leaf as positive
  // controls and a nonexistent name as the negative one — the card required a
  // STOP if either were absent, so the probe had to be able to answer "absent".
  vegetarian: Carrot,
  gluten_free: GrainsSlash,
  grass_fed: Barn,
  lactose_free: DropSlash,
  no_added_sugar: Cube,
  open_for_orders_now: Clock,  // MEH-2131
};

const CHIP_ICON_SIZE = 16;

/**
 * A 16px leading icon element for a chip key, or null when the key has no icon
 * (category chips). currentColor is Phosphor's default, so the glyph inherits
 * the chip's text color (active white / inactive text) — no raw hex. The caller
 * wraps it in an aria-hidden span, so the label stays the accessible name.
 */
export function chipIcon(key) {
  const Icon = CHIP_ICON_COMPONENTS[key];
  return Icon ? <Icon size={CHIP_ICON_SIZE} /> : null;
}

/**
 * Shallow copy of a chip-config array with a rendered `icon` element attached
 * to each chip that has one (ChipScrollRow reads chip.icon). Chips with no icon
 * pass through by identity — category chips stay byte-identical.
 */
export function withChipIcons(chips) {
  return chips.map((chip) => {
    const icon = chipIcon(chip.key);
    return icon ? { ...chip, icon } : chip;
  });
}
