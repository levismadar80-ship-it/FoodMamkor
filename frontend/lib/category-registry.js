/**
 * Module:   category-registry
 * Purpose:  Single source of truth for every category's presentation data —
 *           the map-PIN style (colour + pin glyph + the /map legend rows) AND
 *           the line-art glyph used on chips / register selector / home cards.
 *           Consolidates what was split across lib/map-categories.js (pin
 *           styles) and components/CategoryIcons.jsx (the name→glyph map).
 * Touches:  nothing (pure presentational data; no hooks, no I/O).
 * Does NOT: define the glyph SVG paths — those stay in components/CategoryIcons.jsx
 *           (this module only references the components). Does NOT own the
 *           taxonomy (backend/seed_data.py). Add a CATEGORY_STYLES entry here
 *           alongside any new category row in the backend.
 * Related:  components/CategoryIcons.jsx (glyph components + CATEGORY_ICONS map),
 *           components/MapComponent.jsx (styleForProducer → pin), app/[locale]/
 *           map/components/MapPane.jsx (CATEGORY_LEGEND → legend widget).
 * History:  MEH-1453 (creation — consolidated lib/map-categories.js + surfaced
 *           the CATEGORY_ICONS map through one import hub).
 *
 * MEH-1453 shape note: the pin-style map (CATEGORY_STYLES — 8 keys, incl. 2
 * STALE combined names "ירקות, פירות ומשקים" / "טיפוח וסבונים" that the /map
 * legend still renders) and the glyph map (CATEGORY_ICONS — 18 canonical DB
 * names) use DIFFERENT key sets. They are kept as two structures rather than
 * fused into one per-category {glyph, pinIcon, color, textColor} record —
 * fusing would have to drop or re-key the 2 stale legend rows, a visible
 * change on /map. Reconciling the stale taxonomy keys (and inventing category
 * slugs) is a separate ticket; this module just gives every consumer one place
 * to import from.
 */

// Pin-glyph components come from the single MEH-683 icon module (the SVG paths
// live there — this registry references them, never inlines). Legacy stale-key
// glyphs + the DEFAULT fallback stay on Phosphor (same as the pre-MEH-1453 source).
import { Meat, FishSimple, Cheese, Bread, OliveOil, Hive } from "@/components/CategoryIcons";
import { Plant, FlowerTulip, Leaf } from "@phosphor-icons/react";

// The chip / register-selector / home-card line-art glyph map (18 canonical DB
// names → component) is defined next to its components in CategoryIcons.jsx;
// re-exported here so the registry is the one import hub for category data.
export { CATEGORY_ICONS } from "@/components/CategoryIcons";

export const CATEGORY_STYLES = {
  // MEH-1268 (post-MEH-927 taxonomy): the combined "בשר, עוף ודגים" row was
  // split in the DB into standalone "בשר" + "דגים". Renamed the stale combined
  // key to "בשר" (identical meat style — #c04040 + Cow) so meat businesses stop
  // falling through to DEFAULT (Leaf/green) on all 4 map surfaces, and added
  // "דגים" reusing the SAME meat colour with a distinct Fish glyph — redundant
  // shape encoding (MEH-936) keeps the two apart without adding a palette colour
  // (stays within the MEH-763 F2 ≤-colours / deuteranopia-safe constraint).
  // MEH-683: glyphs swapped to the unified set; colours unchanged.
  "בשר":                 { color: "#c04040", icon: Meat,        iconName: "Meat" },
  "דגים":                { color: "#c04040", icon: FishSimple,  iconName: "FishSimple" },
  // MEH-1453: stale combined key — no live DB category matches it, but the /map
  // legend still renders it (CATEGORY_LEGEND below). Kept verbatim.
  "ירקות, פירות ומשקים": { color: "#2e6853", icon: Plant,       iconName: "Plant" },
  "חלב וגבינות":         { color: "#4a90d9", textColor: "#3b72ad", icon: Cheese,      iconName: "Cheese" },
  "לחמים ואפייה":        { color: "#896714", icon: Bread,       iconName: "Bread" }, // MEH-1065: accent token (retired stale gold)
  // MEH-743: honey split into its own DB category. MEH-763 (S5) gave it a
  // dedicated identity — brand honey #C8821E + honeycomb glyph — distinct
  // from oils (#e8a020). MEH-683: Hexagon→Hive (Material), JarLabel→OliveOil.
  // textColor (MEH-1452): the map pin keeps the vivid #e8a020, but that fails
  // WCAG 1.4.11 as a chip glyph tint on white (2.22:1). A same-hue (H≈38°)
  // darkened #bd8013 (3.35:1 on #fff) is used wherever the colour tints UI
  // text/glyphs, following the חלב וגבינות precedent (#4a90d9 pin → #3b72ad).
  "שמנים":               { color: "#e8a020", textColor: "#bd8013", icon: OliveOil,    iconName: "OliveOil" },
  // דבש #C8821E clears 3:1 on white (3.15:1) as-is — no textColor needed.
  "דבש":                 { color: "#C8821E", icon: Hive,        iconName: "Hive" },
  // MEH-1453: stale combined key (see "ירקות, פירות ומשקים" above). Legend-only.
  "טיפוח וסבונים":       { color: "#9b59b6", icon: FlowerTulip, iconName: "FlowerTulip" },
};

export const DEFAULT_CATEGORY_STYLE = {
  color: "#2e6853",
  icon: Leaf,
  iconName: "Leaf",
};

/**
 * Array form — used by the legend widget on the map page. Order is
 * the visual display order in the sidebar.
 */
export const CATEGORY_LEGEND = Object.entries(CATEGORY_STYLES).map(
  ([name, { color, icon, iconName }]) => ({ name, color, icon, iconName }),
);

/** Resolve the style for a producer from its first category. */
export function styleForProducer(producer) {
  const firstCategory = producer?.categories?.[0]?.name;
  return (firstCategory && CATEGORY_STYLES[firstCategory]) || DEFAULT_CATEGORY_STYLE;
}
