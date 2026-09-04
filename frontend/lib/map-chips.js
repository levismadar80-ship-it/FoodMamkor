/**
 * Map filter chips (MEH-14). Category chips per spec:
 *   כל · בשר ודגים · ירקות ופירות · חלב וגבינות · לחמים ואפייה · משלוח
 *   (MEH-1259: the "אורגני" quality toggle was removed — see TOGGLE_CHIPS.)
 *
 * Layout:
 *   - MEH-1465: category chips are MULTI-select (OR union) — any subset of
 *     {בשר, ירקות, חלב, לחם} can be active at once. "כל" is the reset sentinel.
 *   - delivery is an independent toggle (on top of the above).
 *
 * Category chips map to real DB category IDs at runtime via the
 * Hebrew-name lookup below. If a chip has no matching category in the DB,
 * it is hidden — so the chip bar silently adapts to whatever categories
 * exist without throwing.
 */

// MEH-2130: the toggle chips are DERIVED from lib/filter-taxonomy.js — one
// declaration per axis, filtered to the axes whose `surfaces` includes "map".
// This replaces the hand-written TOGGLE_CHIPS array plus the two /map-local
// label objects (PICKUP_POINTS_LABEL, GRASS_FED_LABEL) that used to sit here.
// `grass_fed` stays /map-only because its declaration says so, not because a
// second list keeps it out. The rendered row is byte-identical (same keys, same
// order, same labels, same groups) — asserted by mapChips.test.js.
import {
  MAP_CHIP_ORDER,
  axisKeysFor,
  chipsForKeys,
  mapEmitsParam,
} from "@/lib/filter-taxonomy";
import { DIET_CHIP_MIN } from "@/lib/producer-filters";

// `matches` lists every DB category.name variant the chip should resolve to.
// Names drift between seed_data.py, CATEGORY_STYLES (map-categories.js), and
// older admin-created rows — covering all known variants means the chip shows
// whenever any of them exists, instead of silently disappearing.
// MEH-1441: `iconName` is the canonical CATEGORY_ICONS key (components/
// CategoryIcons.jsx) a chip's 16px leading glyph resolves to at the render site.
// These aggregate map chips ("בשר ודגים" etc.) don't equal a single DB name, so
// the glyph key is declared explicitly here (kept a plain STRING so this module
// stays React-free — the JSX element is built by the render site, mirroring how
// MEH-1418 threads toggle-chip icons via withChipIcons). The "כל" reset chip has
// no iconName → it renders text-only (the reset differentiator).
// Category-tint: `iconColor` tints the INACTIVE chip's glyph with the category
// colour (ChipScrollRow applies it only when !active; the active chip stays
// white). Declared explicitly for the same reason as iconName — an aggregate
// chip has no single CATEGORY_STYLES key — and kept a plain STRING (React-free).
// Values mirror lib/map-categories.js CATEGORY_STYLES (.textColor ?? .color):
//   meat "בשר"/"דגים" #c04040 · dairy "חלב וגבינות" textColor #3b72ad ·
//   bread "לחמים ואפייה" #896714 · produce = produce-green #2e6853 (the
//   "ירקות, פירות ומשקים" style / DEFAULT / primary — same as the map's DEFAULT
//   pin for the aggregate produce chip). All values ≥3:1 on white (WCAG 1.4.11);
//   no new palette colour is introduced. "כל" has no iconColor (iconless reset).
export const CATEGORY_CHIPS = [
  { key: "all", label: "כל", matches: null },
  // MEH-927: "בשר ודגים" split into "בשר" + "דגים"; "דגים" folded into the meat
  // chip for launch (legacy "בשר ודגים" kept for any pre-migration admin rows).
  { key: "meat", label: "בשר ודגים", matches: ["בשר ועוף", "בשר", "דגים", "בשר ודגים", "בשר, עוף ודגים"], iconName: "בשר", iconColor: "#c04040" },
  { key: "produce", label: "ירקות ופירות", matches: ["ירקות ופירות", "ירקות", "ירקות, פירות ומשקים"], iconName: "ירקות", iconColor: "#2e6853" },
  { key: "dairy", label: "חלב וגבינות", matches: ["חלב וגבינות", "חלב"], iconName: "חלב וגבינות", iconColor: "#3b72ad" },
  { key: "bread", label: "לחמים ואפייה", matches: ["לחם ומאפה", "לחם", "לחמים ואפייה", "לחמים"], iconName: "לחמים ואפייה", iconColor: "#896714" },
];

// MEH-58 Phase 3: RTL order right→left. Boolean toggles are
// independent; category is radio-group. NO "פתוחים השבוע" chip
// (is_available_today field does not exist on producers).
// MEH-1418: toggle chips carry Phosphor LEADING ICONS (lib/chip-icons.js,
// threaded via withChipIcons at the render call site).
// MEH-1075: `group` drives the FilterSheet sections (diet | quality | service).
// Within-group render order = array order (diet order per spec, MEH-1438:
// טבעוני · צמחוני · ללא גלוטן · ללא לקטוז).
// MEH-1507: each entry carries {label, scope, evidence, subtext} so `chip.label`
// stays a plain string (chip row unchanged) while every entry carries the
// scope+evidence the contract guard (LabelScopeContract.test.js) requires.
//
// MEH-2130: the array is now a projection of FILTER_AXES in MAP_CHIP_ORDER.
// Every rationale that used to live inline here moved WITH its axis into
// lib/filter-taxonomy.js and is unchanged there — the MEH-1087 verified-only
// kosher argument (חוק איסור הונאה בכשרות / MEH-986), MEH-1507's grass_fed
// scope×evidence note, MEH-2046's pickup predicate, MEH-1259's removed organic
// and MEH-2047's removed "דל פחמימות". Read the taxonomy for any of them.
export const TOGGLE_CHIPS = chipsForKeys(axisKeysFor("map", MAP_CHIP_ORDER));

// MEH-2170 (option ב׳, Sapir 25/08): the five diet axes are gated on /map the
// way /producers already gates them (DIET_CHIP_MIN, MEH-1934) — a toggle that
// is guaranteed to return "0 businesses" on the current catalog is not
// rendered. Only these five: verified / kosher / grass_fed / has_delivery /
// pickup_points / open_for_orders_now stay visible whatever they return
// (out of scope by decision; option א׳ — an unfiltered source of truth +
// catalogFullyLoaded — is post-launch).
//
// The count source is a ONE-TIME snapshot of the mount catalog
// (useProducersFeed.catalogSnapshot: the first, unfiltered, non-viewport
// fetch). NOT feed.allProducers — that is reloaded with the chip params after
// every toggle, so counting it is the circularity producer-filters.js
// `openNowChipVisible` warns about, and it is replaced by «חפשי באזור זה»
// with a viewport-bounded list. Gating from the snapshot is one-directional
// and never updates, which is exactly what makes both assertions in the
// e2e spec hold: the visible set is identical before and after a toggle,
// and before and after a geo-search.
export const DIET_GATED_KEYS = [
  "vegan",
  "vegetarian",
  "gluten_free",
  "lactose_free",
  "no_added_sugar",
];

// ProducerListOut boolean per axis (lib/schemas.js:215-222) — the same
// fields /producers counts (MEH-1934 `has_no_added_sugar_products`).
const DIET_FIELD = {
  vegan: "has_vegan_products",
  vegetarian: "has_vegetarian_products",
  gluten_free: "has_gluten_free_products",
  lactose_free: "has_lactose_free_products",
  no_added_sugar: "has_no_added_sugar_products",
};

/**
 * The toggle chips FilterSheet should offer on /map, given the mount snapshot.
 *
 * - `catalogSnapshot` null/undefined (not loaded yet, or the load failed):
 *   NO gating — every chip renders. Hiding on an unknown would be the
 *   "probe never ran" green in the other direction.
 * - An axis already active (deep link ?vegan=1 post MEH-2049): kept, so the
 *   visitor is never stranded with a filter she can see and cannot switch
 *   off — the same carve-out /producers makes.
 * - Otherwise a diet chip renders iff >= DIET_CHIP_MIN snapshot businesses
 *   carry its product flag.
 *
 * Pure: same snapshot + same chipState => same array, which is what keeps
 * the sheet stable across toggles and area searches.
 */
export function visibleMapToggleChips({
  catalogSnapshot,
  chipState = {},
  chips = TOGGLE_CHIPS,
}) {
  if (!Array.isArray(catalogSnapshot)) return chips;
  return chips.filter((chip) => {
    if (!DIET_GATED_KEYS.includes(chip.key)) return true;
    if (chipState[chip.key]) return true;
    const field = DIET_FIELD[chip.key];
    const n = catalogSnapshot.filter((p) => p && p[field]).length;
    return n >= DIET_CHIP_MIN;
  });
}

// The /map axes that actually emit a query param. See the note in
// chipStateToParams and the `mapParam` field in lib/filter-taxonomy.js.
const MAP_PARAM_KEYS = TOGGLE_CHIPS.map((c) => c.key).filter(mapEmitsParam);

// MEH-1468: QUICK_CHIP_KEYS + countActiveSheetOnlyFilters were removed here.
// The inline quick-chip toggle row was retired in MEH-1368 (every attribute
// filter lives in FilterSheet; the "סינון" button shows an inline "· N" count
// from useMapFilters.activeAttributeCount) — both symbols had zero production
// consumers left. The MEH-1461 "quick row capped at 2" LOCK is retired with them.

/**
 * Resolve a category chip's `matches` array against the loaded DB
 * categories (`[{id, name, emoji}, ...]`) to EVERY matching ID.
 *
 * MEH-1465: an aggregate chip ("בשר ודגים") covers several DB category rows
 * (בשר ועוף · דגים · …). The public ?category filter is OR over the whole
 * list, so the chip must contribute ALL of them — sending only the first
 * matched id (the pre-1465 behaviour) hid producers filed under the chip's
 * other names. Returns [] when nothing matches.
 */
export function resolveCategoryIds(chip, dbCategories) {
  if (!chip?.matches) return [];
  const ids = [];
  for (const candidate of chip.matches) {
    const hit = dbCategories.find((c) => c.name === candidate);
    if (hit) ids.push(hit.id);
  }
  return ids;
}

/**
 * First matched category ID, or null when none match. Retained for the
 * "does this chip match anything in the DB?" visibility check
 * (useMapFilters.js — a chip with no match is hidden). Filter params go
 * through resolveCategoryIds instead (all ids, MEH-1465).
 */
export function resolveCategoryId(chip, dbCategories) {
  const ids = resolveCategoryIds(chip, dbCategories);
  return ids.length > 0 ? ids[0] : null;
}

/**
 * Build the query params object to send to GET /producers given the
 * active chip state.
 */
export function chipStateToParams(state, dbCategories) {
  const params = {};
  // MEH-1465: multi-select OR — union the resolved ids of EVERY selected chip.
  // Dedup via a Set because aggregate chips can resolve to overlapping DB ids.
  // Always a list so the backend `category: list[int]` contract is uniform; the
  // api-client paramsSerializer (indexes:null) renders it as ?category=1&category=2.
  const keys = state.categoryKeys ?? [];
  if (keys.length > 0) {
    const ids = new Set();
    for (const key of keys) {
      const chip = CATEGORY_CHIPS.find((c) => c.key === key);
      for (const id of resolveCategoryIds(chip, dbCategories)) ids.add(id);
    }
    if (ids.size > 0) params.category = [...ids];
  }
  // MEH-1259: organic param no longer built — chip + backend filter removed.
  //
  // MEH-2130: one loop over the /map axes replaces nine hand-written lines, and
  // the loop now emits for EVERY /map axis. The one that did not was
  // `no_added_sugar` — a chip TOGGLE_CHIPS listed and FilterSheet rendered
  // while chipStateToParams sent nothing, so toggling it returned the
  // unfiltered set. MEH-2130 declared that gap as `mapParam: false` rather than
  // closing it inside a refactor bound to leave /map result sets identical; its
  // follow-up ticket removed the flag, which is the whole of the fix. Full
  // history on the axis in lib/filter-taxonomy.js.
  //
  // Per-axis notes that used to sit on these lines live on the axes now:
  // MEH-1087 (verified-only kosher → kashrut_verified_at), MEH-2046 (pickup is
  // OR-ed with the delivery axes server-side, so both chips on = union), and
  // MEH-1438 (vegetarian).
  for (const key of MAP_PARAM_KEYS) {
    if (state[key]) params[key] = true;
  }
  return params;
}

/**
 * Map center + corner → approximate radius in kilometers (haversine
 * to the northwest corner of the viewport). Used by the
 * "חפש באזור זה" button to fetch producers inside the viewport.
 *
 * Duplicated here in a trimmed form rather than importing haversineKm
 * from lib/distance.js to keep this file DOM-free for easy testing.
 */
const EARTH_RADIUS_KM = 6371;
function toRad(deg) {
  return (deg * Math.PI) / 180;
}
export function boundsToCenterRadius(bounds) {
  if (
    !bounds ||
    typeof bounds.north !== "number" ||
    typeof bounds.south !== "number" ||
    typeof bounds.east !== "number" ||
    typeof bounds.west !== "number"
  ) {
    return null;
  }
  const lat = (bounds.north + bounds.south) / 2;
  const lng = (bounds.east + bounds.west) / 2;
  // Haversine from center to NE corner.
  const dLat = toRad(bounds.north - lat);
  const dLng = toRad(bounds.east - lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) *
      Math.cos(toRad(bounds.north)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // Round up so the fetched ring just covers the viewport. Clamp at 50 km:
  // the backend Haversine-in-SQL path full-scans the producers table and
  // 500s on very large radii (≥70 km observed). 50 km still covers the
  // largest realistic "zoomed-out Israel" viewport without the timeout.
  const radius_km = Math.min(50, Math.ceil(EARTH_RADIUS_KM * c));
  return { lat, lng, radius_km };
}
