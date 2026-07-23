/**
 * MEH-1082 [T-C]: single source of truth for shared attribute chip labels.
 *
 * Both the /producers filter row (`producer-filters.js` CHIPS_CONFIG) and the
 * /map filter chips (`map-chips.js` TOGGLE_CHIPS) render these, so the taxonomy
 * reads identically on both surfaces ("רישוי מאומת" / "משלוח").
 *
 * MEH-1418: `verified` → "רישוי מאומת" (was "מאומתים") — names WHAT was verified
 * (a license or exemption document checked against the Ministry of Health
 * registry; badges.js verified tooltip, ADR-022), the industry "Verified
 * License" pattern. `kosher` joined this shared map with the Sapir-LOCKED
 * "כשרות מאומתת" (MEH-1087) so /producers and /map read alike — it was the
 * /producers-only "כשר" before.
 *
 * Surface-specific keys stay LOCAL, on purpose — they are NOT in this map:
 *   - `grass_fed` — /map only.
 *
 * MEH-1418: labels stay text-only (Emoji-LOCK v2 forbids emoji literals). The
 * chips now carry Phosphor LEADING ICONS via lib/chip-icons.js — aria-hidden
 * glyphs, the approved substitute (MEH-990 precedent), NOT part of the label.
 */
export const ATTRIBUTE_LABELS = {
  verified:      "רישוי מאומת",
  has_delivery:  "משלוח",
  // MEH-1418: verified-only kosher label, unified across surfaces (was the
  // /producers-local "כשר"). Sapir-LOCKED wording per MEH-1087 — do not
  // paraphrase. Backend maps ?kosher=true to kashrut_verified_at only.
  kosher:        "כשרות מאומתת",
  // MEH-1259: `organic` label removed — the public organic chip/badge/filter is
  // gone (self-declared organic, חוק תוצרת אורגנית 2005). Removed from the SoT so
  // it can't be re-surfaced accidentally before an admin-verified flow exists.
  vegan:         "טבעוני",
  // MEH-1438: vegetarian axis. A vegan product counts as vegetarian (the
  // ?vegetarian filter matches is_vegetarian OR is_vegan) — see badges.js.
  vegetarian:    "צמחוני",
  gluten_free:   "ללא גלוטן",
  lactose_free:  "ללא לקטוז",
};
