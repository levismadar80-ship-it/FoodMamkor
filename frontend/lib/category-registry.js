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
 *           the CATEGORY_ICONS map through one import hub); MEH-2163 (the
 *           glyph lookup became TOTAL — resolveCategoryGlyph + one named
 *           fallback, replacing three inline per-call-site fallbacks; the key
 *           indirection moved into categoryGlyphKey so MEH-1456's slug swap is
 *           one line).
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
// MEH-2163: imported into local scope as well (a bare `export … from` does NOT
// bind the name here) so the resolver below can read it. The public export
// surface is unchanged — `import { CATEGORY_ICONS } from "@/lib/category-registry"`
// resolves exactly as before.
import { CATEGORY_ICONS } from "@/components/CategoryIcons";

export { CATEGORY_ICONS };

/**
 * MEH-2163 — the ONE fallback glyph.
 *
 * Before this ticket the fallback was re-decided at each call site: an inline
 * `<Leaf size={46} weight="light" />` in CategorySelector.jsx, a separate
 * inline `<Leaf weight="thin" />` in HomeCategoryGrid.jsx, and this module's
 * DEFAULT_CATEGORY_STYLE.icon for map pins — three owners of one decision,
 * each free to drift. It is the same component in all three, so naming it here
 * changes nothing that renders today; it just means there is now one place to
 * change it.
 *
 * `Leaf` deliberately: it is what the two inline sites and the default pin
 * style already used, so consolidating them is a no-op on screen. Swapping it
 * for a more neutral glyph is a design decision, not a registry one.
 */
export const CATEGORY_GLYPH_FALLBACK = Leaf;

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
  // textColor: the map pin keeps the vivid #e8a020, but that fails WCAG 1.4.11
  // as a chip glyph tint (2.22:1 on white). MEH-1452 darkened it to #bd8013,
  // which cleared white (3.35:1) but was only ever measured there — it FAILS on
  // the cream /map surface (#F5F0E8 → 2.96:1). MEH-1181 re-darkens to a same-hue
  // (H≈38°) #97690f that clears BOTH: 4.83:1 on #fff, 4.26:1 on cream. Also the
  // future MEH-1181-A category-chip ring colour (--cat-ring = textColor ?? color).
  "שמנים":               { color: "#e8a020", textColor: "#97690f", icon: OliveOil,    iconName: "OliveOil" },
  // textColor (MEH-1181): the pin/brand honey #C8821E clears 3:1 on white
  // (3.15:1) but FAILS on the cream /map surface (2.78:1) — the same-hue darker
  // #A8681A clears both (4.51:1 #fff / 3.97:1 cream). Serves the glyph tint AND
  // the MEH-1181-A ring. (The 3.15 vs 2.78 "discrepancy" was two backgrounds,
  // not a mistake: white vs cream — both correct.)
  "דבש":                 { color: "#C8821E", textColor: "#A8681A", icon: Hive,        iconName: "Hive" },
  // MEH-1453: stale combined key (see "ירקות, פירות ומשקים" above). Legend-only.
  "טיפוח וסבונים":       { color: "#9b59b6", icon: FlowerTulip, iconName: "FlowerTulip" },
};

export const DEFAULT_CATEGORY_STYLE = {
  color: "#2e6853",
  // MEH-2163: was a second literal `Leaf`. Same component, one owner now —
  // lib/marker-glyph.js keys its memo on this module-level identity, which is
  // unchanged by the indirection.
  icon: CATEGORY_GLYPH_FALLBACK,
  iconName: "Leaf",
};

/**
 * MEH-2163 — THE key indirection, and the only one.
 *
 * The glyph map is keyed by the canonical Hebrew DB `name` today. `slug`
 * (MEH-2139, `backend/app/services/category_slug.NAME_TO_SLUG`) is the stable
 * identity and is already serialized in `CategoryOut`, but the frontend has no
 * name→slug table and writing one would be a THIRD copy of that backend map,
 * in a language the test pinning the existing two cannot reach — the reasoning
 * spelled out at CategorySelector.jsx's POPULAR comment. So the key stays
 * `name`, and **MEH-1456 swaps it by changing the one `?? category.name` line
 * below** — no consumer moves, because no consumer indexes the map directly.
 *
 * @param {string|{name?: string, slug?: string}|null|undefined} category
 * @returns {string} the registry key, or "" when there is nothing to key on.
 */
export function categoryGlyphKey(category) {
  if (typeof category === "string") return category;
  // MEH-1456 swaps this line to `category?.slug ?? ""` once the glyph map is
  // re-keyed by slug. Until then `name` is the key the backend already exposes.
  return category?.name ?? "";
}

/**
 * MEH-2163 — the TOTAL glyph lookup. Never returns `undefined`.
 *
 * `Object.hasOwn` rather than `CATEGORY_ICONS[key] || FALLBACK`: a category
 * named `constructor` / `toString` / `valueOf` / `__proto__` resolves through
 * the prototype chain under the `||` form and hands the caller `Object` (or
 * `Object.prototype.toString`) as a "glyph component" — truthy, so the
 * fallback never fires and React is asked to render a builtin. The guard test
 * uses exactly those four keys, because any other unknown key cannot tell the
 * two forms apart.
 *
 * `isFallback` is returned rather than left for the caller to infer, because
 * the two surfaces disagree on what to do with it and both disagreements are
 * deliberate: the card surfaces (register selector, home grid) RENDER the
 * fallback, while the chip rows do NOT (MEH-1441 — an unknown admin category
 * gets no icon rather than a green Leaf that mis-signals "produce"). One total
 * lookup, two explicit policies, instead of the policy hiding inside whether a
 * bare index happened to return `undefined`.
 *
 * @param {string|{name?: string, slug?: string}|null|undefined} category
 * @returns {{glyph: Function, isFallback: boolean}}
 */
export function resolveCategoryGlyph(category) {
  const key = categoryGlyphKey(category);
  if (key && Object.hasOwn(CATEGORY_ICONS, key)) {
    return { glyph: CATEGORY_ICONS[key], isFallback: false };
  }
  return { glyph: CATEGORY_GLYPH_FALLBACK, isFallback: true };
}

/**
 * Array form — used by the legend widget on the map page. Order is
 * the visual display order in the sidebar.
 */
export const CATEGORY_LEGEND = Object.entries(CATEGORY_STYLES).map(
  ([name, { color, icon, iconName }]) => ({ name, color, icon, iconName }),
);

// MEH-2004: the category colour is interpolated into RAW MARKUP by every pin
// consumer — MapComponent's three divIcon builders, MiniMap's locationIcon,
// HomepageMiniMap's createPreviewMarker — and in one of those it lands inside
// a JS string literal (createCategoryMarker's `onerror` handler). That nesting
// (HTML attribute -> JS source) is why this is a VALIDATOR and not an escape:
// the browser decodes character references BEFORE the handler is parsed as JS,
// so `&#39;` arrives at the JS parser as a bare `'` and closes the string
// exactly as an unescaped quote would. Measured under MEH-1998, not assumed —
// `escapeHtmlAttr("#fff\';alert(1);\'")` produced a handler byte-identical to
// the unescaped one. HTML-escaping cannot defend that position; only refusing
// the value can.
//
// It lives HERE, on the registry's own resolver, rather than in each consumer:
// MEH-1998 fixed MapComponent alone and left MiniMap + marker-glyph + the
// homepage preview injecting the same value raw. One validator on the single
// source of truth covers every consumer, present and future, by construction.
//
// A colour is a closed vocabulary, so an allowlist costs nothing: every value
// in CATEGORY_STYLES above is #rrggbb and passes through untouched. Anything
// else degrades to the primary token. Dormant today (the palette is
// hardcoded); load-bearing the day the colour becomes DB-driven, which is the
// scenario this ticket was filed for.
// 3/4/6/8 digits are the only lengths CSS recognises. A lazier `{3,8}` would
// also admit 5 and 7 — not a security hole (the browser drops an unparseable
// declaration) but it would render the pin unstyled, a visual regression in
// exactly the DB-driven future this validator exists for.
const SAFE_HEX_COLOR = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * @param {unknown} value a candidate CSS colour from the registry.
 * @returns {string} `value` when it is a plain hex colour, else the primary
 *   token. Exported for the guard test; consumers get it via styleForProducer.
 */
export function safeCategoryColor(value) {
  const asString = String(value ?? "");
  return SAFE_HEX_COLOR.test(asString) ? asString : DEFAULT_CATEGORY_STYLE.color;
}

/**
 * Resolve the style for a producer from its first category.
 *
 * The returned `color` is always validated (safeCategoryColor above), so no
 * consumer needs its own guard before interpolating it into markup. The
 * registry object itself is returned unchanged when the colour is already
 * clean — the normal path allocates nothing and keeps object identity stable
 * for the memo in lib/marker-glyph.
 */
export function styleForProducer(producer) {
  const firstCategory = producer?.categories?.[0]?.name;
  const style = (firstCategory && CATEGORY_STYLES[firstCategory]) || DEFAULT_CATEGORY_STYLE;
  const color = safeCategoryColor(style.color);
  return color === style.color ? style : { ...style, color };
}
