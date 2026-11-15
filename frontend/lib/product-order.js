// @ts-check
/**
 * Module:   product-order
 * Purpose:  The ONE place that decides the order products are shown in, for
 *           the public business page and the owner's dashboard alike
 *           (MEH-3055). Two surfaces, one rule — never re-sort elsewhere.
 * Rule:     1. The owner set an order (any product has a `position`) → her
 *              order, products she never placed at the end in API order.
 *              Otherwise → photos first (MEH-3021), each half in API order.
 *           2. Groups: when the business has groups, products are laid out
 *              group by group in the groups' order, ungrouped ones last. The
 *              order inside each group is rule 1.
 * Does NOT: fetch, render, or decide whether group chips are shown — that is
 *           `chipGroups` below plus ProductGroupChips.jsx.
 * History:  MEH-3055 (creation; MEH-3021's photo-first sort moved here).
 */

/** @typedef {{ id: string|number, image_url?: string|null, position?: number|null, group_id?: string|null }} OrderedProduct */
/** @typedef {{ id: string, name: string }} ProductGroup */

/**
 * @template {OrderedProduct} T
 * @param {T[]} products
 * @returns {T[]}
 */
function baseOrder(products) {
  const owned = products.some((p) => p.position != null);
  if (owned) {
    // Array.prototype.sort is stable, so unplaced products keep API order.
    return [...products].sort(
      (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
    );
  }
  return [...products.filter((p) => p.image_url), ...products.filter((p) => !p.image_url)];
}

/**
 * @template {OrderedProduct} T
 * @param {T[]} products
 * @param {ProductGroup[]} [groups]
 * @returns {T[]}
 */
export function orderProducts(products, groups = []) {
  const ordered = baseOrder(products || []);
  if (!groups.length) return ordered;
  const rank = new Map(groups.map((g, i) => [g.id, i]));
  const rankOf = (/** @type {T} */ p) =>
    p.group_id != null && rank.has(p.group_id) ? /** @type {number} */ (rank.get(p.group_id)) : groups.length;
  return ordered
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rankOf(a.p) - rankOf(b.p) || a.i - b.i)
    .map(({ p }) => p);
}

/**
 * The groups a visitor can filter by: only groups that hold at least one of
 * `products`. Chips are worth showing only when this has 2+ entries.
 *
 * @param {OrderedProduct[]} products
 * @param {ProductGroup[]} [groups]
 * @returns {ProductGroup[]}
 */
export function chipGroups(products, groups = []) {
  const used = new Set((products || []).map((p) => p.group_id).filter(Boolean));
  return groups.filter((g) => used.has(g.id));
}

/**
 * True when some product sits in no (live) group — the «עוד מוצרים» chip.
 *
 * @param {OrderedProduct[]} products
 * @param {ProductGroup[]} [groups]
 */
export function hasUngrouped(products, groups = []) {
  const ids = new Set(groups.map((g) => g.id));
  return (products || []).some((p) => p.group_id == null || !ids.has(p.group_id));
}
