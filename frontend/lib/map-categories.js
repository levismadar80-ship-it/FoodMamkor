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
 * `icon` is the Phosphor React component for the map pin glyph — white,
 * weight="fill", 14px inside the category-colored circle marker.
 * Replaces the emoji approach (which rendered inconsistently across
 * platforms and Android SVG `<text>` nodes).
 */

import {
  Cow,
  Fish,
  Plant,
  Cheese,
  Bread,
  JarLabel,
  Hexagon,
  FlowerTulip,
  Leaf,
} from "@phosphor-icons/react";

export const CATEGORY_STYLES = {
  // MEH-1268 (post-MEH-927 taxonomy): the combined "בשר, עוף ודגים" row was
  // split in the DB into standalone "בשר" + "דגים". Renamed the stale combined
  // key to "בשר" (identical meat style — #c04040 + Cow) so meat businesses stop
  // falling through to DEFAULT (Leaf/green) on all 4 map surfaces, and added
  // "דגים" reusing the SAME meat colour with a distinct Fish glyph — redundant
  // shape encoding (MEH-936) keeps the two apart without adding a palette colour
  // (stays within the MEH-763 F2 ≤-colours / deuteranopia-safe constraint).
  "בשר":                 { color: "#c04040", icon: Cow,         iconName: "Cow" },
  "דגים":                { color: "#c04040", icon: Fish,        iconName: "Fish" },
  "ירקות, פירות ומשקים": { color: "#2e6853", icon: Plant,       iconName: "Plant" },
  "חלב וגבינות":         { color: "#4a90d9", textColor: "#3b72ad", icon: Cheese,      iconName: "Cheese" },
  "לחמים ואפייה":        { color: "#896714", icon: Bread,       iconName: "Bread" }, // MEH-1065: accent token (retired stale gold)
  // MEH-743: honey split into its own DB category. MEH-763 (S5) gave it a
  // dedicated identity — brand honey #C8821E + Hexagon (honeycomb) — distinct
  // from oils (#e8a020 + JarLabel).
  "שמנים":               { color: "#e8a020", icon: JarLabel,    iconName: "JarLabel" },
  "דבש":                 { color: "#C8821E", icon: Hexagon,     iconName: "Hexagon" },
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
