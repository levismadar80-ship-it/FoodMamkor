/**
 * MEH-1082 [T-C]: single source of truth for shared attribute chip labels.
 *
 * Both the /producers filter row (`producer-filters.js` CHIPS_CONFIG) and the
 * /map filter chips (`map-chips.js` TOGGLE_CHIPS) render these, so the taxonomy
 * reads identically on both surfaces ("מאומתים" / "משלוח", not the old
 * surface-divergent "מאומת בלבד" / "משלוח אליי").
 *
 * Surface-specific keys stay LOCAL, on purpose — they are NOT in this map:
 *   - `kosher`    — /producers only (map is verified-only, MEH-986).
 *   - `grass_fed` — /map only.
 *
 * MEH-657: text-only labels — no emoji / glyph (Emoji LOCK v2 / a11y).
 */
export const ATTRIBUTE_LABELS = {
  verified:      "מאומתים",
  has_delivery:  "משלוח",
  // MEH-1259: `organic` label removed — the public organic chip/badge/filter is
  // gone (self-declared organic, חוק תוצרת אורגנית 2005). Removed from the SoT so
  // it can't be re-surfaced accidentally before an admin-verified flow exists.
  vegan:         "טבעוני",
  gluten_free:   "ללא גלוטן",
  lactose_free:  "ללא לקטוז",
};
