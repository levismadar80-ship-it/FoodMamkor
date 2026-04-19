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
  Plant,
  Cheese,
  Bread,
  JarLabel,
  FlowerTulip,
  Leaf,
} from "@phosphor-icons/react";

export const CATEGORY_STYLES = {
  "בשר, עוף ודגים":      { color: "#c04040", icon: Cow,         iconName: "Cow" },
  "ירקות, פירות ומשקים": { color: "#2e6853", icon: Plant,       iconName: "Plant" },
  "חלב וגבינות":         { color: "#4a90d9", icon: Cheese,      iconName: "Cheese" },
  "לחמים ואפייה":        { color: "#8B6914", icon: Bread,       iconName: "Bread" },
  "שמנים ודבש":          { color: "#e8a020", icon: JarLabel,    iconName: "JarLabel" },
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
