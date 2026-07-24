/**
 * MEH-1082 [T-C]: single source of truth for shared attribute chip labels.
 *
 * Both the /producers filter row (`producer-filters.js` CHIPS_CONFIG) and the
 * /map filter chips (`map-chips.js` TOGGLE_CHIPS) render these, so the taxonomy
 * reads identically on both surfaces ("רישוי מאומת" / "משלוח").
 *
 * MEH-1507 — Label Scope Contract: every entry is now an OBJECT carrying the
 * label PLUS its scope×evidence metadata and (where it applies) an in-component
 * explanatory subtext. This closes the class of bugs where a consumer-facing
 * label silently over-claimed — a product-level filter reading as a whole-
 * business property (MEH-1439 diet tooltips), a self-declaration reading as a
 * certificate (MEH-986 kosher · MEH-1259 organic · MEH-1492 editor's-pick).
 *   - scope    ∈ business | any-product | facility — WHAT the label applies to.
 *   - evidence ∈ self-declared | admin-verified | system — WHO established it.
 *   - subtext  — in-component explanation (Baymard: explain filters in-place,
 *                not by lengthening the label). null when the FilterSheet falls
 *                back to a BADGE_CONFIG tooltip (kosher · verified). LOCKED copy
 *                per MEH-1507 §hebrew_copy — do not paraphrase.
 * Full contract + the four precedents: .claude/rules/labels.md.
 *
 * NOTE — `label` stays a plain string on every consumer: CHIPS_CONFIG /
 * TOGGLE_CHIPS spread these objects, so `chip.label` is unchanged and the chip
 * ROW renders byte-identical (no visual change). Only the FilterSheet subtext
 * and the /producers applied-filter framing are new.
 *
 * MEH-1418: `verified` → "רישוי מאומת" (was "מאומתים") — names WHAT was verified
 * (a license or exemption document checked against the Ministry of Health
 * registry; badges.js verified tooltip, ADR-022), the industry "Verified
 * License" pattern. `kosher` joined this shared map with the Sapir-LOCKED
 * "כשרות מאומתת" (MEH-1087) so /producers and /map read alike.
 *
 * Surface-specific keys stay LOCAL, on purpose — they are NOT in this map:
 *   - `grass_fed` — /map only (its own scope×evidence object lives in map-chips.js).
 *
 * MEH-1418: labels stay text-only (Emoji-LOCK v2 forbids emoji literals). The
 * chips now carry Phosphor LEADING ICONS via lib/chip-icons.js — aria-hidden
 * glyphs, the approved substitute (MEH-990 precedent), NOT part of the label.
 */
export const ATTRIBUTE_LABELS = {
  // Whole-business license, checked by an admin against the Ministry of Health
  // registry (ADR-022) — business scope, admin-verified evidence.
  verified: {
    label: "רישוי מאומת",
    scope: "business",
    evidence: "admin-verified",
    subtext: null, // FilterSheet uses BADGE_CONFIG.verified.tooltip
  },
  // Owner-toggled business property; no external check.
  has_delivery: {
    label: "משלוח",
    scope: "business",
    evidence: "self-declared",
    subtext: null,
  },
  // MEH-1418: verified-only kosher label, unified across surfaces (was the
  // /producers-local "כשר"). Sapir-LOCKED wording per MEH-1087 — do not
  // paraphrase. Backend maps ?kosher=true to kashrut_verified_at only, so this
  // is admin-verified at business scope (never the free-text Producer.kosher).
  kosher: {
    label: "כשרות מאומתת",
    scope: "business",
    evidence: "admin-verified",
    subtext: null, // FilterSheet uses BADGE_CONFIG.kosher.tooltip
  },
  // MEH-1259: `organic` label removed — the public organic chip/badge/filter is
  // gone (self-declared organic, חוק תוצרת אורגנית 2005). Removed from the SoT so
  // it can't be re-surfaced accidentally before an admin-verified flow exists.
  //
  // MEH-293: the diet filters are EXISTS-subqueries over products (at least one
  // matching product in the catalog), so their scope is any-product, NOT the
  // whole business — the exact over-claim MEH-1507 makes explicit. Subtext copy
  // LOCKED (MEH-1507 §hebrew_copy).
  vegan: {
    label: "טבעוני",
    scope: "any-product",
    evidence: "self-declared",
    subtext: "עסקים עם מוצרים טבעוניים בקטלוג",
  },
  // MEH-1438: vegetarian axis. A vegan product counts as vegetarian (the
  // ?vegetarian filter matches is_vegetarian OR is_vegan) — see badges.js.
  vegetarian: {
    label: "צמחוני",
    scope: "any-product",
    evidence: "self-declared",
    subtext: "עסקים עם מוצרים צמחוניים בקטלוג",
  },
  gluten_free: {
    label: "ללא גלוטן",
    scope: "any-product",
    evidence: "self-declared",
    subtext: "עסקים עם מוצרים ללא גלוטן בקטלוג",
  },
  lactose_free: {
    label: "ללא לקטוז",
    scope: "any-product",
    evidence: "self-declared",
    subtext: "עסקים עם מוצרים ללא לקטוז בקטלוג",
  },
};
