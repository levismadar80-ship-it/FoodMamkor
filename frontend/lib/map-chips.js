/**
 * Map filter chips (MEH-14). Category chips per spec:
 *   כל · בשר ודגים · ירקות ופירות · חלב וגבינות · לחמים ואפייה · משלוח
 *   (MEH-1259: the "אורגני" quality toggle was removed — see TOGGLE_CHIPS.)
 *
 * Layout:
 *   - ONE of {כל, בשר, ירקות, חלב, לחם} is active at a time (radio-group
 *     semantics). "כל" is the reset sentinel.
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
export const CATEGORY_CHIPS = [
  { key: "all", label: "כל", matches: null },
  // MEH-927: "בשר ודגים" split into "בשר" + "דגים"; "דגים" folded into the meat
  // chip for launch (legacy "בשר ודגים" kept for any pre-migration admin rows).
  { key: "meat", label: "בשר ודגים", matches: ["בשר ועוף", "בשר", "דגים", "בשר ודגים", "בשר, עוף ודגים"], iconName: "בשר" },
  { key: "produce", label: "ירקות ופירות", matches: ["ירקות ופירות", "ירקות", "ירקות, פירות ומשקים"], iconName: "ירקות" },
  { key: "dairy", label: "חלב וגבינות", matches: ["חלב וגבינות", "חלב"], iconName: "חלב וגבינות" },
  { key: "bread", label: "לחמים ואפייה", matches: ["לחם ומאפה", "לחם", "לחמים ואפייה", "לחמים"], iconName: "לחמים ואפייה" },
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
// Within-group render order = array order (diet order per spec: טבעוני ·
// ללא גלוטן · ללא לקטוז).
// MEH-1087: a VERIFIED-ONLY kosher chip ("כשרות מאומתת") IS now allowed — it
// filters ?kosher=true, which the backend maps to kashrut_verified_at ONLY
// (producer_listing.py:153 _kosher_condition, MEH-986 ch3b + MEH-1260 expiry),
// never the free-text Producer.kosher. A FREE-TEXT kosher chip stays forbidden
// (חוק איסור הונאה בכשרות, MEH-986). Copy is Sapir-LOCKED — MEH-1418 sourced it
// from the shared ATTRIBUTE_LABELS.kosher so /producers + /map read identically.
export const TOGGLE_CHIPS = [
  { key: "has_delivery",  label: ATTRIBUTE_LABELS.has_delivery,  group: "service" },
  { key: "verified",      label: ATTRIBUTE_LABELS.verified,      group: "service" },
  // MEH-1259: organic chip removed — self-declared organic is no longer a
  // public filter (חוק תוצרת אורגנית 2005). Column + owner toggle kept.
  { key: "kosher",        label: ATTRIBUTE_LABELS.kosher,        group: "quality" },
  { key: "grass_fed",     label: "גראס פד",                      group: "quality" },
  { key: "vegan",         label: ATTRIBUTE_LABELS.vegan,         group: "diet" },
  { key: "gluten_free",   label: ATTRIBUTE_LABELS.gluten_free,   group: "diet" },
  { key: "lactose_free",  label: ATTRIBUTE_LABELS.lactose_free,  group: "diet" },
];

// MEH-1075: the two toggles that stay inline on the /map quick-chip row.
// Everything else is reachable only through FilterSheet — the badge on the
// "סינון" button counts those sheet-only actives.
export const QUICK_CHIP_KEYS = ["verified", "has_delivery"];

/**
 * Count active toggles that are NOT exposed as quick chips — the number
 * shown on the "סינון" button badge (hidden at 0).
 */
export function countActiveSheetOnlyFilters(state) {
  return TOGGLE_CHIPS.filter(
    (c) => !QUICK_CHIP_KEYS.includes(c.key) && !!state?.[c.key],
  ).length;
}

/**
 * Resolve a category chip's `matches` array against the loaded DB
 * categories (`[{id, name, emoji}, ...]`) to an ID. Returns null when
 * no match is found — caller should hide the chip.
 */
export function resolveCategoryId(chip, dbCategories) {
  if (!chip?.matches) return null;
  for (const candidate of chip.matches) {
    const hit = dbCategories.find((c) => c.name === candidate);
    if (hit) return hit.id;
  }
  return null;
}

/**
 * Build the query params object to send to GET /producers given the
 * active chip state.
 */
export function chipStateToParams(state, dbCategories) {
  const params = {};
  if (state.categoryKey && state.categoryKey !== "all") {
    const chip = CATEGORY_CHIPS.find((c) => c.key === state.categoryKey);
    const id = resolveCategoryId(chip, dbCategories);
    if (id != null) params.category = id;
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
