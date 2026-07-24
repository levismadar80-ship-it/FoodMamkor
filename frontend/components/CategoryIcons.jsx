"use client";

/**
 * Module:   CategoryIcons
 * Purpose:  The single geometric icon set for every non-photo category surface
 *           (map pins, register selector, category-card glyph fallback). One
 *           unified line family — 11 Phosphor re-exports + 6 vendored glyphs
 *           (Tabler MIT ×5, Material Symbols Apache-2.0 ×1) normalized to the
 *           Phosphor line weight. Keyed by the canonical DB category name.
 * Touches:  nothing (pure presentational SVG; no hooks, no I/O).
 * Does NOT: own the taxonomy (backend/seed_data.py — 18 rows), the map colours
 *           (lib/map-categories.js), or the homepage photo cards
 *           (lib/home-categories.js + HomeCategoryGrid.jsx — MEH-1183, photos
 *           stay; glyphs are the no-photo FALLBACK only).
 * Related:  lib/map-categories.js (imports Meat/OliveOil/Hive/FishSimple),
 *           components/CategorySelector.jsx (popular-6 glyphs),
 *           frontend/lib/icons/LICENSES.md (MIT + Apache-2.0 + CC0 texts).
 * History:  PREMIUM_DESIGN (hand-drawn creation); MEH-683 (LOCKED v2.1 —
 *           supersedes the hand-drawn "Assembly v2" family with the unified
 *           Phosphor + vendored geometric set; re-keyed by canonical DB name).
 *
 * Weight normalization (MEH-683 V4): Tabler ships at 2/24 (≈8.3%); rendered
 * here at strokeWidth 1.5/24 (6.25%) to sit optically flush with Phosphor
 * "regular" in a 44px / 16px lineup. Material `hive` is an inherently filled
 * honeycomb (no stroke) — vendored as fill; it reads as one family at pin size.
 *
 * Colour: `currentColor` by default so a `text-*` token on the wrapper colours
 * the glyph (honey gold `#C8821E` is applied by the consumer, never here). The
 * map passes an explicit white via the `color` prop.
 */

import {
  FishSimple,
  Carrot,
  Cheese,
  Bread,
  Egg,
  Jar,
  CookingPot,
  Pepper,
  Wine,
  HandSoap,
  FlowerLotus,
} from "@phosphor-icons/react";

/* ---------- vendored line shell (Tabler MIT, viewBox 24, normalized) ----------
 * Reads size/color/className; ignores Phosphor's `weight` prop (the vendored
 * glyphs are single-weight line art). `weight` is left in props and never
 * spread onto the <svg>, so it can't leak to the DOM. */
function TablerGlyph({ size = 24, color = "currentColor", className, children }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// בשר · Tabler `meat` (MIT). See frontend/lib/icons/LICENSES.md.
export function Meat(props) {
  return (
    <TablerGlyph {...props}>
      <path d="M13.62 8.382l1.966 -1.967a2 2 0 1 1 3.414 -1.415a2 2 0 1 1 -1.413 3.414l-1.82 1.821" />
      <path d="M5.904 18.596c2.733 2.734 5.9 4 7.07 2.829c1.172 -1.172 -.094 -4.338 -2.828 -7.071c-2.733 -2.734 -5.9 -4 -7.07 -2.829c-1.172 1.172 .094 4.338 2.828 7.071" />
      <path d="M7.5 16l1 1" />
      <path d="M12.975 21.425c3.905 -3.906 4.855 -9.288 2.121 -12.021c-2.733 -2.734 -8.115 -1.784 -12.02 2.121" />
    </TablerGlyph>
  );
}

// פירות · Tabler `apple` (MIT).
export function Apple(props) {
  return (
    <TablerGlyph {...props}>
      <path d="M4 11.319c0 3.102 .444 5.319 2.222 7.978c1.351 1.797 3.156 2.247 5.08 .988c.426 -.268 .97 -.268 1.397 0c1.923 1.26 3.728 .809 5.079 -.988c1.778 -2.66 2.222 -4.876 2.222 -7.977c0 -2.661 -1.99 -5.32 -4.444 -5.32c-1.267 0 -2.41 .693 -3.22 1.44a.5 .5 0 0 1 -.672 0c-.809 -.746 -1.953 -1.44 -3.22 -1.44c-2.454 0 -4.444 2.66 -4.444 5.319" />
      <path d="M7 12c0 -1.47 .454 -2.34 1.5 -3" />
      <path d="M12 7c0 -1.2 .867 -4 3 -4" />
    </TablerGlyph>
  );
}

// שוקולד וממתקים בוטיק · Tabler `chocolate` (MIT).
export function Chocolate(props) {
  return (
    <TablerGlyph {...props}>
      <path d="M12 21v-16" />
      <path d="M6 15h12" />
      <path d="M6 9h10.5" />
      <path d="M10.05 3a2.5 2.5 0 0 0 3.987 1.47a3 3 0 0 0 2.047 2.387a2.504 2.504 0 0 0 1.916 3.093v9.05a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h2.05" />
    </TablerGlyph>
  );
}

// קוסמטיקה טבעית · Tabler `perfume` (MIT).
export function Perfume(props) {
  return (
    <TablerGlyph {...props}>
      <path d="M10 6v3" />
      <path d="M14 6v3" />
      <path d="M5 11a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -8" />
      <path d="M10 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M9 3h6v3h-6l0 -3" />
    </TablerGlyph>
  );
}

// נרות וארומה · Tabler `candle` (MIT) — Sapir's pick (MEH-683, 21/07).
export function Candle(props) {
  return (
    <TablerGlyph {...props}>
      <path d="M9 21h6v-10a1 1 0 0 0 -1 -1h-4a1 1 0 0 0 -1 1l0 10" />
      <path d="M12 2l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737" />
    </TablerGlyph>
  );
}

// דבש · Material Symbols `hive` (Apache-2.0). Filled honeycomb (no stroke);
// viewBox is Material's -960 baseline. `color` fills; `weight`/`size` ignored
// beyond dimensions so it slots into the same render contract as the others.
export function Hive({ size = 24, color = "currentColor", className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill={color}
      className={className}
      aria-hidden="true"
    >
      <path d="m394-80-70-123H189l-87-154 69-123-69-123 87-154h135l70-123h172l70 123h135l87 154-69 123 69 123-87 154H636L566-80H394Zm243-429h100l54-94-54-94H637l-54 94 54 94ZM430-388h100l54-92-54-92H430l-54 92 54 92Zm0-244h100l54-94-54-94H430l-54 94 54 94ZM224-509h100l54-94-54-94H224l-54 94 54 94Zm0 246h100l54-94-55-94H223l-54 94 55 94Zm206 123h100l54-94-54-94H430l-54 94 54 94Zm207-123h100l54-94-54-94H637l-51 94 51 94Z" />
    </svg>
  );
}

// שמנים · SVG Repo #201507 "olive-oil" (CC0, public domain) — Sapir's pick.
// Reproduced as line paths on the shared 24 grid (bottle + capped neck + a
// vertical almond "olive" label) so it sits flush with the Tabler family (V4:
// strokeWidth 1.5 = Phosphor 6.25%). svgrepo.com can't reach the CC sandbox
// (MEH-397 WebFetch allowlist + proxy 403), so the CC0 original was redrawn
// from its rendered form rather than byte-copied — CC0 permits reproduction.
// Provenance: frontend/lib/icons/LICENSES.md.
export function OliveOil(props) {
  return (
    <TablerGlyph {...props}>
      <path d="M10.5 4L10.5 6.2L7.2 9.2Q6.5 10 6.5 11.2L6.5 19.8Q6.5 22 8.7 22L15.3 22Q17.5 22 17.5 19.8L17.5 11.2Q17.5 10 16.8 9.2L13.5 6.2L13.5 4Z" />
      <path d="M10.5 4L10.5 2L13.5 2L13.5 4" />
      <path d="M12 10.6C14 10.6 15 13 15 15C15 17 14 19.4 12 19.4C10 19.4 9 17 9 15C9 13 10 10.6 12 10.6Z" />
    </TablerGlyph>
  );
}

// Phosphor re-exports — the 11 base glyphs, surfaced from this single module so
// consumers import the whole family from one place (MEH-683 V1).
export {
  FishSimple,
  Carrot,
  Cheese,
  Bread,
  Egg,
  Jar,
  CookingPot,
  Pepper,
  Wine,
  HandSoap,
  FlowerLotus,
};

/**
 * CATEGORY_ICONS — canonical DB category name → glyph component. Keys are the
 * exact strings from backend/seed_data.py CATEGORIES (18 rows, post-MEH-927).
 * A category with no key here has no glyph (add its row when the taxonomy grows).
 */
export const CATEGORY_ICONS = {
  "בשר": Meat,
  "דגים": FishSimple,
  "ירקות": Carrot,
  "פירות": Apple,
  "חלב וגבינות": Cheese,
  "לחמים ואפייה": Bread,
  "ביצים": Egg,
  "דבש": Hive,
  "שמנים": OliveOil,
  "מותססים וכבושים": Jar,
  "מוצרים מוכנים": CookingPot,
  "תבלינים וצמחי תיבול": Pepper,
  "יין, בירה ומשקאות": Wine,
  "שוקולד וממתקים בוטיק": Chocolate,
  "סבונים טבעיים": HandSoap,
  "קוסמטיקה טבעית": Perfume,
  "צמחי מרפא ותוספים": FlowerLotus,
  "נרות וארומה": Candle,
};
