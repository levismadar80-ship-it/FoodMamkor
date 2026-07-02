/**
 * Map filter chips (MEH-14). Seven chips per spec:
 *   כל · בשר ועוף · ירקות ופירות · חלב וגבינות · לחם ומאפה · אורגני · משלוח
 *
 * Layout:
 *   - ONE of {כל, בשר, ירקות, חלב, לחם} is active at a time (radio-group
 *     semantics). "כל" is the reset sentinel.
 *   - organic + delivery are independent toggles (on top of the above).
 *
 * Category chips map to real DB category IDs at runtime via the
 * Hebrew-name lookup below. If a chip has no matching category in the DB,
 * it is hidden — so the chip bar silently adapts to whatever categories
 * exist without throwing.
 */

// `matches` lists every DB category.name variant the chip should resolve to.
// Names drift between seed_data.py, CATEGORY_STYLES (map-categories.js), and
// older admin-created rows — covering all known variants means the chip shows
// whenever any of them exists, instead of silently disappearing.
export const CATEGORY_CHIPS = [
  { key: "all", label: "כל", matches: null },
  // MEH-927: "בשר ודגים" split into "בשר" + "דגים"; "דגים" folded into the meat
  // chip for launch (legacy "בשר ודגים" kept for any pre-migration admin rows).
  { key: "meat", label: "בשר ועוף", matches: ["בשר ועוף", "בשר", "דגים", "בשר ודגים", "בשר, עוף ודגים"] },
  { key: "produce", label: "ירקות ופירות", matches: ["ירקות ופירות", "ירקות", "ירקות, פירות ומשקים"] },
  { key: "dairy", label: "חלב וגבינות", matches: ["חלב וגבינות", "חלב"] },
  { key: "bread", label: "לחם ומאפה", matches: ["לחם ומאפה", "לחם", "לחמים ואפייה", "לחמים"] },
];

// MEH-58 Phase 3: RTL order right→left. Boolean toggles are
// independent; category is radio-group. NO "פתוחים השבוע" chip
// (is_available_today field does not exist on producers).
// MEH-657: map filter chips are text-only (Emoji LOCK v2 / a11y) — no glyph prefix.
export const TOGGLE_CHIPS = [
  { key: "has_delivery",  label: "משלוח אליי" },
  { key: "verified",      label: "מאומתים" },
  { key: "organic",       label: "אורגני" },
  { key: "grass_fed",     label: "גראס פד" },
  { key: "gluten_free",   label: "ללא גלוטן" },
  { key: "vegan",         label: "טבעוני" },
  { key: "lactose_free",  label: "ללא לקטוז" },
];

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
  if (state.organic) params.organic = true;
  if (state.has_delivery) params.has_delivery = true;
  if (state.verified) params.verified = true;
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
