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
 */

export const CATEGORY_STYLES = {
  "בשר, עוף ודגים": { color: "#c04040", emoji: "🥩" },
  "ירקות, פירות ומשקים": { color: "#2e6853", emoji: "🥬" },
  "חלב וגבינות": { color: "#4a90d9", emoji: "🥛" },
  "לחמים ואפייה": { color: "#8B6914", emoji: "🍞" },
  "שמנים ודבש": { color: "#e8a020", emoji: "🫒" },
  "טיפוח וסבונים": { color: "#9b59b6", emoji: "🧴" },
};

export const DEFAULT_CATEGORY_STYLE = { color: "#2e6853", emoji: "🌿" };

/**
 * Array form — used by the legend widget on the map page. Order is
 * the visual display order in the sidebar.
 */
export const CATEGORY_LEGEND = Object.entries(CATEGORY_STYLES).map(
  ([name, { color, emoji }]) => ({ name, color, emoji }),
);

/** Resolve the style for a producer from its first category. */
export function styleForProducer(producer) {
  const firstCategory = producer?.categories?.[0]?.name;
  return (firstCategory && CATEGORY_STYLES[firstCategory]) || DEFAULT_CATEGORY_STYLE;
}
