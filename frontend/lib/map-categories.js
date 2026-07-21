/**
 * Shared category styling for the map page — single source of truth.
 *
 * Previously duplicated between `components/MapComponent.jsx` and
 * `app/map/MapClient.jsx` because MapComponent is dynamically imported
 * with ssr:false, so its exports aren't available at server render time
 * in MapClient. Extracting here lets both import safely.
 *
 * Keys match `category.name` values from the DB. Add entries alongside
 * any new category rows in the backend.
 *
 * `icon` is the glyph component for the map pin — white, weight="fill",
 * 14px inside the category-colored circle marker. Replaces the emoji
 * approach (which rendered inconsistently across platforms and Android
 * SVG `<text>` nodes).
 *
 * MEH-683 (LOCKED v2.1): the active category glyphs come from the unified
 * geometric set in components/CategoryIcons.jsx — Cow→Meat (Tabler),
 * Fish→FishSimple (Phosphor), JarLabel→OliveOil, Hexagon→Hive (Material).
 * Colours are UNCHANGED (V2: colour lives on the map pin only; honey keeps
 * its gold #C8821E). The two stale combined keys below ("ירקות, פירות
 * ומשקים", "טיפוח וסבונים") predate the MEH-927/MEH-1098 taxonomy split and
 * no longer match a live DB category — left untouched here (a separate
 * taxonomy-alignment concern, not this glyph swap).
 */

// Vendored + re-exported glyphs from the single icon module (MEH-683 V1).
import { Meat, FishSimple, Cheese, Bread, OliveOil, Hive } from "@/components/CategoryIcons";
// Legacy stale-key glyphs + DEFAULT fallback stay on Phosphor.
import { Plant, FlowerTulip, Leaf } from "@phosphor-icons/react";

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
  "ירקות, פירות ומשקים": { color: "#2e6853", icon: Plant,       iconName: "Plant" },
  "חלב וגבינות":         { color: "#4a90d9", textColor: "#3b72ad", icon: Cheese,      iconName: "Cheese" },
  "לחמים ואפייה":        { color: "#896714", icon: Bread,       iconName: "Bread" }, // MEH-1065: accent token (retired stale gold)
  // MEH-743: honey split into its own DB category. MEH-763 (S5) gave it a
  // dedicated identity — brand honey #C8821E + honeycomb glyph — distinct
  // from oils (#e8a020). MEH-683: Hexagon→Hive (Material), JarLabel→OliveOil.
  "שמנים":               { color: "#e8a020", icon: OliveOil,    iconName: "OliveOil" },
  "דבש":                 { color: "#C8821E", icon: Hive,        iconName: "Hive" },
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
