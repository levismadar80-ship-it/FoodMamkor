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

// MEH-1082: shared attribute labels come from ATTRIBUTE_LABELS (unified with the
// /producers CHIPS_CONFIG); `grass_fed` is /map-only so its label stays local.
// MEH-1418: `kosher` moved into the shared ATTRIBUTE_LABELS map ("כשרות מאומתת").
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";

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
// MEH-1441: category chips now also carry a 16px LEADING GLYPH — from
// CATEGORY_ICONS via the `iconName` key above (built at the render site;
// "כל" stays iconless). Labels stay text-only — Emoji LOCK v2 forbids emoji
// literals, aria-hidden Phosphor glyphs are the approved substitute (MEH-990).
// MEH-1075: `group` drives the FilterSheet sections (diet | quality | service).
// Within-group render order = array order (diet order per spec, MEH-1438:
// טבעוני · צמחוני · ללא גלוטן · ללא לקטוז).
// MEH-1087: a VERIFIED-ONLY kosher chip ("כשרות מאומתת") IS now allowed — it
// filters ?kosher=true, which the backend maps to kashrut_verified_at ONLY
// (producer_listing.py:153 _kosher_condition, MEH-986 ch3b + MEH-1260 expiry),
// never the free-text Producer.kosher. A FREE-TEXT kosher chip stays forbidden
// (חוק איסור הונאה בכשרות, MEH-986). Copy is Sapir-LOCKED — MEH-1418 sourced it
// from the shared ATTRIBUTE_LABELS.kosher so /producers + /map read identically.
// MEH-1507: grass_fed is /map-only, so its scope×evidence object stays LOCAL
// (never entered the shared ATTRIBUTE_LABELS). It is a producer-level boolean
// column (models.py:111 `grass_fed`), owner-declared → business scope,
// self-declared evidence. Subtext LOCKED per MEH-1507 §hebrew_copy. Shape
// matches an ATTRIBUTE_LABELS entry so the contract guard treats it uniformly.
const GRASS_FED_LABEL = {
  label: "גראס פד",
  scope: "business",
  evidence: "self-declared",
  subtext: "לפי הצהרת בית העסק",
};

// MEH-1507: each entry spreads its {label, scope, evidence, subtext} object so
// `chip.label` stays a plain string (chip row unchanged) while every entry
// carries the scope+evidence the contract guard (LabelScopeContract.test.js)
// requires. `group` stays a TOGGLE_CHIPS-local field.
export const TOGGLE_CHIPS = [
  { key: "has_delivery",  ...ATTRIBUTE_LABELS.has_delivery,  group: "service" },
  { key: "verified",      ...ATTRIBUTE_LABELS.verified,      group: "service" },
  // MEH-1259: organic chip removed — self-declared organic is no longer a
  // public filter (חוק תוצרת אורגנית 2005). Column + owner toggle kept.
  { key: "kosher",        ...ATTRIBUTE_LABELS.kosher,        group: "quality" },
  { key: "grass_fed",     ...GRASS_FED_LABEL,                group: "quality" },
  { key: "vegan",         ...ATTRIBUTE_LABELS.vegan,         group: "diet" },
  { key: "vegetarian",    ...ATTRIBUTE_LABELS.vegetarian,    group: "diet" },  // MEH-1438
  { key: "gluten_free",   ...ATTRIBUTE_LABELS.gluten_free,   group: "diet" },
  { key: "lactose_free",  ...ATTRIBUTE_LABELS.lactose_free,  group: "diet" },
  // MEH-1934: appended AFTER lactose_free so the MEH-1438 diet order
  // (טבעוני · צמחוני · ללא גלוטן · ללא לקטוז) does not shift.
  { key: "no_added_sugar", ...ATTRIBUTE_LABELS.no_added_sugar, group: "diet" },
  { key: "low_carb",      ...ATTRIBUTE_LABELS.low_carb,      group: "diet" },
];

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
  if (state.has_delivery) params.has_delivery = true;
  if (state.verified) params.verified = true;
  // MEH-1087: verified-only kosher — backend maps ?kosher=true to
  // kashrut_verified_at only (producer_listing.py:153).
  if (state.kosher) params.kosher = true;
  if (state.grass_fed) params.grass_fed = true;
  if (state.gluten_free) params.gluten_free = true;
  if (state.vegan) params.vegan = true;
  if (state.vegetarian) params.vegetarian = true;  // MEH-1438
  if (state.lactose_free) params.lactose_free = true;
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
