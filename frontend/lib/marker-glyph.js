/**
 * Module:   marker-glyph
 * Purpose:  Stringify a Phosphor icon component to a white, fill-weight SVG for
 *           the Leaflet divIcon marker fallback on /map (MEH-936).
 * Does NOT: pick WHICH glyph — that's styleForProducer in lib/map-categories.js;
 *           this only renders a given component to a cached SVG string.
 * Related:  components/MapComponent.jsx::createCategoryMarker (sole caller),
 *           components/HomepageMiniMap.jsx:64-67 (same renderToStaticMarkup path).
 * History:  MEH-936 (extracted from MapComponent.jsx so the glyph path is unit-
 *           testable without importing the leaflet-heavy module; re-keyed the
 *           memo on the component reference instead of an iconName string).
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Memoized by the icon COMPONENT reference (not a hand-maintained iconName
// string): keys are the stable module-level Phosphor refs from CATEGORY_STYLES
// + DEFAULT_CATEGORY_STYLE, so there are ≤8 distinct entries and no implicit
// "every entry must carry a matching iconName" contract to drift. renderToStatic-
// Markup runs once per glyph, reused across every marker + re-render (the /map
// feed renders up to ~100 producers).
// MEH-1412: nested Map<Component, Map<styleKey, svg>> so the secondary
// (pickup/market_stand outline) marker can render the same glyph in the
// category colour without invalidating the default white/fill cache entry.
const glyphSvgCache = new Map();

/**
 * @param {import("react").ComponentType<{size?: number, weight?: string, color?: string}>} IconComponent
 *   A Phosphor icon component (e.g. from styleForProducer(producer).icon).
 * @param {{size?: number, weight?: string, color?: string}} [style]
 *   Optional glyph style. Defaults to the MEH-936 primary-marker look
 *   (white fill, 18px) so existing callers are byte-identical.
 * @returns {string} static `<svg>` markup — safe to inject into the divIcon
 *   HTML string (no user data flows through here).
 */
export function categoryGlyphSvg(
  IconComponent,
  { size = 18, weight = "fill", color = "#ffffff" } = {},
) {
  let byStyle = glyphSvgCache.get(IconComponent);
  if (byStyle === undefined) {
    byStyle = new Map();
    glyphSvgCache.set(IconComponent, byStyle);
  }
  const styleKey = `${size}|${weight}|${color}`;
  let svg = byStyle.get(styleKey);
  if (svg === undefined) {
    svg = renderToStaticMarkup(createElement(IconComponent, { size, weight, color }));
    byStyle.set(styleKey, svg);
  }
  return svg;
}
