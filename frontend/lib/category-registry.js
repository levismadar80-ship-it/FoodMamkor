// @ts-check
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
 *           taxonomy (backend/seed_data.py) or the category list
 *           (lib/category-taxonomy.js) — a new category gets a row THERE and a
 *           glyph in CategoryIcons.jsx; its style here follows.
 * Related:  components/CategoryIcons.jsx (glyph components + CATEGORY_ICONS map),
 *           components/MapComponent.jsx (styleForProducer → pin), app/[locale]/
 *           map/components/MapPane.jsx (CATEGORY_LEGEND → legend widget).
 * History:  MEH-1453 (creation — consolidated lib/map-categories.js + surfaced
 *           the CATEGORY_ICONS map through one import hub); MEH-2163 (the
 *           glyph lookup became TOTAL — resolveCategoryGlyph + one named
 *           fallback, replacing three inline per-call-site fallbacks; the key
 *           indirection moved into categoryGlyphKey so MEH-1456's slug swap is
 *           one line); MEH-3076 (keyed by slug, pins coloured by group).
 *
 * MEH-3076 shape: every per-category table here is DERIVED from one list,
 * lib/category-taxonomy.js (slug, Hebrew name, group), plus the slug-keyed
 * glyphs and the six group colours. MEH-1453's two hand-kept tables (8 pin
 * keys with 2 stale names / 18 glyph names) are gone; the stale names went
 * with them, and every category now has a pin style (colour by group, glyph
 * by category — Sapir 21/11).
 */

// Pin glyphs are the category glyphs of the single MEH-683 icon module (the SVG
// paths live there — this registry references them, never inlines). The
// DEFAULT fallback stays on Phosphor (same as the pre-MEH-1453 source).
import { Leaf } from "@phosphor-icons/react";

// MEH-3076: glyphs are keyed by slug (CATEGORY_GLYPHS, next to their
// components). The name-keyed CATEGORY_ICONS below is DERIVED from it through
// the one taxonomy list, kept for the callers that still hold a bare name
// string (a map chip's iconName) — it is no longer a second hand-kept table.
import { CATEGORY_GLYPHS } from "@/components/CategoryIcons";
import { CATEGORY_GROUPS, CATEGORY_TAXONOMY, taxonomyEntry } from "./category-taxonomy";
import { COLOR } from "./color-tokens";

export { CATEGORY_GLYPHS };

/** Hebrew DB name → glyph, derived (MEH-3076). */
export const CATEGORY_ICONS = Object.freeze(
  Object.fromEntries(
    CATEGORY_TAXONOMY.filter((c) => Object.hasOwn(CATEGORY_GLYPHS, c.slug)).map((c) => [
      c.name,
      CATEGORY_GLYPHS[c.slug],
    ]),
  ),
);

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

/**
 * MEH-3076 (Sapir 21/11, «צבע לקבוצה»): a pin's COLOUR is its group's, its
 * GLYPH is its own category's. Six colours, all already in the palette (no new
 * colour — the MEH-763 F2 limit), each the colour that group's categories
 * already wore: meat #c04040 (MEH-1268), produce the primary green, dairy
 * #4a90d9, bread the accent token (MEH-1065), pantry the brand honey (MEH-763
 * S5 — oil moves off its own #e8a020 onto it), care #9b59b6. The glyph keeps
 * two categories of one group apart (MEH-936 redundant shape encoding).
 *
 * `textColor` is the WCAG 1.4.11 tint for a glyph on white AND on the cream
 * /map surface where the pin colour is too light (MEH-1181): dairy #3b72ad,
 * pantry #A8681A (4.51:1 white / 3.97:1 cream). The others pass as they are.
 *
 * @type {Readonly<Record<import("./category-taxonomy").CategoryGroup, {color: string, textColor?: string}>>}
 */
export const CATEGORY_GROUP_STYLES = Object.freeze({
  meat: { color: "#c04040" },
  produce: { color: COLOR.primary },
  dairy: { color: "#4a90d9", textColor: "#3b72ad" },
  bread: { color: COLOR.accent },
  pantry: { color: COLOR.honey, textColor: "#A8681A" },
  care: { color: "#9b59b6" },
});

/**
 * Hebrew DB name → pin style {color, textColor?, icon, group}, DERIVED from
 * the taxonomy + the group colours + the slug glyphs (MEH-3076). It replaced
 * a hand-kept 8-key table, 2 of whose keys matched no live category (MEH-1453),
 * so vegetables, fruit, soaps and 8 more categories fell to the default pin.
 * Name-keyed because the chip rows (map-chips, ProducersClient) hold names.
 * Not frozen: the colour-injection guard test adds a hostile row to it.
 *
 * @type {Record<string, {color: string, textColor?: string, icon: import("react").ElementType, group: string}>}
 */
export const CATEGORY_STYLES = Object.fromEntries(
  CATEGORY_TAXONOMY.filter((c) => Object.hasOwn(CATEGORY_GLYPHS, c.slug)).map((c) => [
    c.name,
    { ...CATEGORY_GROUP_STYLES[c.group], icon: CATEGORY_GLYPHS[c.slug], group: c.group },
  ]),
);

/** The legend glyph of each group: the category that best stands for it. */
const GROUP_LEGEND_SLUG = Object.freeze({
  meat: "meat",
  produce: "veg",
  dairy: "dairy",
  bread: "bread",
  pantry: "honey",
  care: "care",
});

export const DEFAULT_CATEGORY_STYLE = {
  color: COLOR.primary,
  // MEH-2163: was a second literal `Leaf`. Same component, one owner now —
  // lib/marker-glyph.js keys its memo on this module-level identity, which is
  // unchanged by the indirection.
  icon: CATEGORY_GLYPH_FALLBACK,
};

/**
 * MEH-2163 — THE key indirection, and the only one.
 *
 * MEH-3076: the glyph map is keyed by `slug` (MEH-2139, the stable identity
 * serialized in `CategoryOut`). The objection MEH-2163 recorded here — that a
 * frontend name→slug table would be an unpinned third copy of the backend
 * map — is answered by lib/category-taxonomy.js plus
 * __tests__/CategoryTaxonomyGuard.test.js, which holds that list equal to
 * backend NAME_TO_SLUG. No consumer indexes the map directly, so none moved.
 *
 * @param {string|{name?: string, slug?: string}|null|undefined} category
 * @returns {string} the registry key, or "" when there is nothing to key on.
 */
export function categoryGlyphKey(category) {
  // MEH-3076: the key is the slug (MEH-1456's swap). A bare string or a row
  // with no slug is matched to its slug through the taxonomy by name; a
  // category the taxonomy does not know keys on nothing (fallback glyph).
  return taxonomyEntry(category)?.slug ?? "";
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
 * @returns {{glyph: import("react").ElementType, isFallback: boolean}}
 */
export function resolveCategoryGlyph(category) {
  const key = categoryGlyphKey(category);
  if (key && Object.hasOwn(CATEGORY_GLYPHS, key)) {
    return { glyph: CATEGORY_GLYPHS[key], isFallback: false };
  }
  return { glyph: CATEGORY_GLYPH_FALLBACK, isFallback: true };
}

/**
 * The /map legend: one row per GROUP, in chip-row order (MEH-3076). `key` is
 * the group, which is also the `map_category_chips.<key>` label and the value
 * the legend filter toggles (useMapFilters).
 */
export const CATEGORY_LEGEND = Object.freeze(
  CATEGORY_GROUPS.map((key) => ({
    key,
    ...CATEGORY_GROUP_STYLES[key],
    icon: CATEGORY_GLYPHS[GROUP_LEGEND_SLUG[key]],
  })),
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
function safeCategoryColor(value) {
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
  const first = producer?.categories?.[0];
  // MEH-3076: by slug first (a renamed or English-shown row still finds its
  // style), then by the row's own name (a row outside the taxonomy).
  // Object.hasOwn: a name like "constructor" must not reach Object's builtins.
  const name = taxonomyEntry(first)?.name ?? first?.name;
  const style = (name && Object.hasOwn(CATEGORY_STYLES, name) && CATEGORY_STYLES[name]) || DEFAULT_CATEGORY_STYLE;
  const color = safeCategoryColor(style.color);
  return color === style.color ? style : { ...style, color };
}
