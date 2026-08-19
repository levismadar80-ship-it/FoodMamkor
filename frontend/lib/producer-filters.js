/**
 * The home + /producers filter config, DERIVED from lib/filter-taxonomy.js.
 *
 * MEH-2130: this module used to hand-declare three things that the taxonomy now
 * owns — which axes each surface offers (CHIPS_CONFIG / PRODUCERS_CHIPS_CONFIG),
 * which FilterSheet group each belongs to (PRODUCERS_CHIP_GROUPS), and which
 * query param each emits (buildChipParams). All three are computed here from
 * ONE declaration, so /map and the listing surfaces cannot drift apart again.
 * The exported names and shapes are unchanged — every consumer and test reads
 * exactly what it read before.
 *
 * What is NOT derived, on purpose: the runtime DATA GATES below
 * (OPEN_NOW_CHIP_MIN / DIET_CHIP_MIN / GATED_DIET_KEYS). A gate is about how
 * much data the catalog carries today, not about what the axis IS — it turns
 * itself off when the data arrives — so it is listing-surface policy, not
 * taxonomy.
 *
 * MEH-1418: attribute chips carry Phosphor LEADING ICONS (lib/chip-icons.js,
 * threaded at the render call site via withChipIcons). Labels stay text-only —
 * Emoji LOCK v2 forbids emoji literals; aria-hidden Phosphor glyphs are the
 * approved substitute (MEH-990 precedent).
 * MEH-1507: each chip carries {label, scope, evidence, subtext}; `chip.label`
 * stays a string (chip row unchanged) while the scope×evidence metadata the
 * contract guard (LabelScopeContract.test.js) requires rides along.
 */
import {
  LISTING_CHIP_ORDER,
  axisKeysFor,
  chipsForKeys,
  defaultsForKeys,
} from "@/lib/filter-taxonomy";

// The HOME row. MEH-2130: `pickup_points` joins it here — the pair
// משלוח + איסוף עצמי now reads the same on home, /producers and /map.
// Shared with /producers, which renders a superset (see PRODUCERS_* below).
const HOME_KEYS = axisKeysFor("home", LISTING_CHIP_ORDER);
const PRODUCERS_KEYS = axisKeysFor("producers", LISTING_CHIP_ORDER);

export const CHIPS_CONFIG = chipsForKeys(HOME_KEYS);

// MEH-1881: /producers renders one axis home does not (open_for_orders_now).
// Pre-MEH-2130 that superset was built by spreading CHIPS_CONFIG and appending
// a locally-declared chip — the arrangement that made it easy to append to the
// SHARED array by mistake and leak a chip onto home (which is exactly what
// happened while writing MEH-1934, caught only by a toHaveLength pin). Both
// arrays are now projections of the same declaration filtered by `surfaces`,
// so an axis lands on a surface only by being declared for it.
export const PRODUCERS_CHIPS_CONFIG = chipsForKeys(PRODUCERS_KEYS);

export const CHIPS_DEFAULT = defaultsForKeys(HOME_KEYS);
export const PRODUCERS_CHIPS_DEFAULT = defaultsForKeys(PRODUCERS_KEYS);

// MEH-1881: the chip stays out of the DOM until at least this many loaded
// producers have declared a window. A filter that returns an empty list
// looks broken AND punishes the businesses that joined first — before the
// catalog has the data, the honest thing is not to offer the filter.
// Deliberately a runtime data gate, not a flag: the feature turns itself on
// when the data arrives, with nobody remembering to flip anything.
export const OPEN_NOW_CHIP_MIN = 5;

// MEH-1934: same runtime-data-gate reasoning as OPEN_NOW_CHIP_MIN, applied to
// the NEW diet axis only (MEH-2047 withdrew the second, low_carb). Until the
// catalog carries the markings, a chip that returns an empty list looks broken
// and punishes the businesses that joined first — so it stays OUT of the DOM
// rather than rendering disabled.
//
// Deliberately NOT applied to the four older axes: they already have data and
// gating them now would REMOVE working filters. New axes start gated; existing
// ones are never retro-gated.
//
// MEH-2130 deliberately does NOT gate `pickup_points`: its data comes from the
// location rows owners already create in LocationsEditor (the same rows the
// /map layer has been drawing since MEH-2046), so it is an existing axis being
// exposed on more surfaces — not a new axis awaiting data. Retro-gating it here
// would hide a filter that already works on /map.
export const DIET_CHIP_MIN = 5;
export const GATED_DIET_KEYS = ["no_added_sugar"];

/**
 * Which gated diet chips have earned their place, given the loaded producers.
 *
 * Counts businesses whose aggregate flag is true — the same has_X_products
 * field the badge layer reads, so chip visibility and badge display cannot
 * disagree. An ACTIVE filter always keeps its chip (`active`), or a
 * deep-linked ?no_added_sugar=1 would strand the visitor with a filter she can
 * see the effect of and cannot switch off — the identical carve-out
 * ProducersClient makes for open_for_orders_now.
 */
export function visibleGatedDietKeys(producers = [], chips = {}) {
  const field = {
    no_added_sugar: "has_no_added_sugar_products",
  };
  return GATED_DIET_KEYS.filter((key) => {
    if (chips[key]) return true;
    const n = producers.filter((p) => p && p[field[key]]).length;
    return n >= DIET_CHIP_MIN;
  });
}

/**
 * Attach FilterSheet group metadata to a /producers chip list (MEH-1862).
 *
 * MEH-2130: the group now RIDES ON the chip (it comes from the axis
 * declaration), so this is a passthrough with a fallback rather than a lookup
 * into a second hand-written key→group map. That map was the drift risk
 * MEH-1862 covered with a test — /producers and /map filing a shared key under
 * different groups. It cannot happen now: both surfaces read the same field.
 *
 * The function is kept (rather than inlined at the call site) because it is the
 * documented seam where sheet metadata is attached, and ProducersFilterSheet's
 * suite exercises it directly.
 *
 * Takes the ALREADY-GATED list, so the MEH-1881 open-now and MEH-1934 diet
 * gates keep deciding what exists — moving the chips into a sheet changes where
 * they render, never whether they are offered. A chip with no group falls back
 * to "service" so it stays reachable rather than vanishing; the test above is
 * what stops that fallback from ever being the answer in practice.
 */
export function withChipGroups(chips = []) {
  return chips.map((chip) => ({
    ...chip,
    group: chip.group ?? "service",
  }));
}

/**
 * The GET /producers query params for an active chip state.
 *
 * MEH-2130: derived from the /producers axis list instead of nine hand-written
 * `if` lines. Every axis param name IS its key on this surface, which is what
 * lets ProducersClient hydrate `?<key>=1` back out of the URL by iterating the
 * same array — the round-trip holds by construction rather than by two lists
 * agreeing. `pickup_points` is emitted for the first time here; the backend has
 * accepted it globally since MEH-2046 (producers.py:136).
 *
 * A state object missing a key (home passes its own, smaller chip state) yields
 * `undefined` → falsy → no param, exactly as the hand-written version did.
 */
export function buildChipParams(chips, overrides = {}) {
  const c = { ...chips, ...overrides };
  const p = {};
  for (const key of PRODUCERS_KEYS) {
    if (c[key]) p[key] = true;
  }
  return p;
}
