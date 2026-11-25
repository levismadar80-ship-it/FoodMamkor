// @ts-check

/**
 * Module:   rescue-sort
 * Purpose:  The /rescue list's sort orders (MEH-3704): by pickup time (the
 *           server's order, the default), closest, cheapest, highest rated.
 * Does NOT: fetch or filter. The server already orders by pickup time
 *           (backend/app/services/rescue_reads.py `public_offers`), so
 *           "time" keeps the rows as they came.
 * Related:  components/rescue/RescueList.jsx (the control and the groups)
 * History:  MEH-3704 (creation)
 */

/** @typedef {"time" | "near" | "cheap" | "rating"} RescueSort */

/**
 * A missing value sorts last whichever way the order runs: a bag with no
 * distance or no rating yet is not "closest" or "best".
 * @param {number | null | undefined} a
 * @param {number | null | undefined} b
 * @param {1 | -1} dir
 */
function byValue(a, b, dir) {
  const missingA = a === null || a === undefined;
  const missingB = b === null || b === undefined;
  if (missingA || missingB) return Number(missingA) - Number(missingB);
  return (a - b) * dir;
}

/** @type {Record<Exclude<RescueSort, "time">, (o: any) => number | null | undefined>} */
const KEY = {
  near: (o) => o.distance_km,
  cheap: (o) => o.price_agorot,
  rating: (o) => o.producer?.avg_rating,
};

/**
 * A new array in the chosen order; ties keep the server's (pickup time).
 * @template T
 * @param {T[]} rows
 * @param {RescueSort} sort
 * @returns {T[]}
 */
export function sortBags(rows, sort) {
  if (sort === "time" || !KEY[sort]) return rows.slice();
  const key = KEY[sort];
  const dir = sort === "rating" ? -1 : 1;
  return rows.slice().sort((a, b) => byValue(key(a), key(b), dir));
}
