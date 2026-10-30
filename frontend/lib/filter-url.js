import { FILTER_AXES, homeParamFor } from "@/lib/filter-taxonomy";

/**
 * Module:   filter-url
 * Purpose:  MEH-2598 follow-up (Sapir 30/10, «תחקור מה הפתרון הכי טוב
 *           ומאשרת») — the list and the map are two views of ONE search, so
 *           the attribute filters travel between them in the URL, the way
 *           Airbnb / Booking / Google Maps keep filters across a list↔map
 *           switch, a back press and a shared link.
 *
 * One vocabulary: `?<axis key>=1`, which is what /producers already hydrates
 * (ProducersClient initChipsFromParams). Home's own alias (`?delivery=1` for
 * has_delivery, FILTER_AXES[key].homeParam) is ACCEPTED on read so an old home
 * URL still lands right, but never written — a link carries one spelling.
 *
 * Each surface passes the keys it renders: an axis the receiver does not offer
 * is dropped on read rather than applied invisibly (an active filter with no
 * chip to switch it off strands the visitor — the MEH-2131 carve-out reason).
 * Categories are NOT carried: home/list use category ids, /map uses legend
 * keys, and a category is a separate dimension with its own exit («כל»).
 */

// Read accepts "true" as well (the API's own spelling, in case a hand-typed
// link uses it); write is always "1".
const isOn = (v) => v === "1" || v === "true";

/** `query` is a URLSearchParams or a plain `{ param: value }` record
 *  (a server page's `searchParams`). Returns `{ key: true }` for each of
 *  `keys` that is switched on. */
export function chipsFromQuery(query, keys) {
  const get = (name) => {
    if (!query) return undefined;
    if (typeof query.get === "function") return query.get(name);
    const v = query[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const out = {};
  for (const key of keys) {
    if (!FILTER_AXES[key]) continue;
    if (isOn(get(key)) || isOn(get(homeParamFor(key)))) out[key] = true;
  }
  return out;
}

/** `?a=1&b=1` for the axes switched on in `chips` (any surface's chip state;
 *  non-axis entries such as `categoryKeys` are ignored), or "" when none. */
export function chipsToQuery(chips) {
  const on = Object.keys(FILTER_AXES).filter((key) => chips?.[key] === true);
  return on.length ? `?${on.map((k) => `${k}=1`).join("&")}` : "";
}
