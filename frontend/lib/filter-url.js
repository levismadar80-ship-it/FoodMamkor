import { FILTER_AXES, homeParamFor } from "@/lib/filter-taxonomy";
import { CATEGORY_CHIPS } from "@/lib/map-chips";

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
 * Categories are NOT carried between surfaces: home/list use category ids,
 * /map uses chip keys, and a category is a separate dimension with its own
 * exit («כל»).
 *
 * MEH-2049: /map's OWN category selection and city do live in /map's URL (a
 * refresh, Back and a shared link keep them) — the second half of this file.
 * Reader and writer share the param names below, so they cannot disagree (the
 * MEH-1826 trap: a well-formed param under the wrong name is dropped in
 * silence).
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

// ── MEH-2049: /map category selection + city ────────────────────────────────
//
// `city` is also the name /producers hydrates (ProducersClient cityFilter), and
// both carry a city NAME — but NOT the same filter: /producers sends it as
// delivery_city ("delivers here"), /map as near_city ("located in it OR
// delivering to it"), or delivery_city with the משלוח chip on
// (lib/map-city-params). A future list↔map hop that carries `city` must decide
// which question it is asking; it must not assume the result set is the same.
// The category param is deliberately NOT /producers' `category`: that one
// carries DB category ids, /map's selection is CATEGORY_CHIPS keys. Reusing the
// name would make `?category=meat` a URL /producers forwards to the API (422)
// and `?category=3` one /map reads as an unknown key — same name, two meanings.
export const MAP_CATEGORY_PARAM = "category_group";
export const CITY_PARAM = "city";

// "all" is the reset sentinel (`[]`), never a member of the selection.
const MAP_CATEGORY_KEYS = CATEGORY_CHIPS.map((c) => c.key).filter((k) => k !== "all");

const getAll = (query, name) => {
  if (!query) return [];
  if (typeof query.getAll === "function") return query.getAll(name);
  const v = query[name];
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
};

/** Unknown and duplicate keys dropped, URL order kept (the MEH-2036 day-set
 *  pattern: a hand-edited link is a recoverable typo, not an error). */
function normalizeCategoryKeys(values) {
  return (values || []).filter(
    (k, i, a) => MAP_CATEGORY_KEYS.includes(k) && a.indexOf(k) === i,
  );
}

// A city is free text (CitySearch), so "valid" is a shape, not a list: letters
// (any script, with marks for niqqud), spaces and the punctuation real names
// use — «תל אביב-יפו», «ג'סר א-זרקא», «ראשל"צ», «קריית מלאכי (מזרח)» — and the
// characters keyboards actually produce for it: iOS turns ' into a smart quote
// («מג’דל שמס»), and a Hebrew keyboard types the maqaf. At least two letters,
// at most 60 characters. Anything else is dropped, not sent.
const CITY_MAX_LENGTH = 60;
// \u05F3 \u05F4 = Hebrew geresh / gershayim · \u2018 \u2019 = smart single
// quotes (iOS) · \u05BE = maqaf · \u2013 \u2014 = en / em dash.
const CITY_SHAPE = /^[\p{L}\p{M}\s'"\u05F3\u05F4\u2018\u2019().\-\u05BE\u2013\u2014]+$/u;
const CITY_LETTER = /\p{L}/gu;

/** The trimmed city, or "" when it is empty or not shaped like a place name. */
function normalizeCity(value) {
  if (typeof value !== "string") return "";
  const city = value.trim();
  if (!city || city.length > CITY_MAX_LENGTH || !CITY_SHAPE.test(city)) return "";
  return (city.match(CITY_LETTER) || []).length >= 2 ? city : "";
}

/** `{ categoryKeys, city }` from a URLSearchParams or a plain record, with
 *  invalid values already dropped. */
export function mapFiltersFromQuery(query) {
  const cities = getAll(query, CITY_PARAM);
  return {
    categoryKeys: normalizeCategoryKeys(getAll(query, MAP_CATEGORY_PARAM)),
    city: normalizeCity(cities[0]),
  };
}

/** Rewrites the two params on `searchParams` (a URLSearchParams, mutated) from
 *  `{ categoryKeys, city }` — repeated `category_group=` in selection order,
 *  `city=` only when it would be read back. Other params are left alone. */
export function writeMapFilters(searchParams, { categoryKeys = [], city = "" } = {}) {
  searchParams.delete(MAP_CATEGORY_PARAM);
  searchParams.delete(CITY_PARAM);
  for (const key of normalizeCategoryKeys(categoryKeys)) searchParams.append(MAP_CATEGORY_PARAM, key);
  const c = normalizeCity(city);
  if (c) searchParams.set(CITY_PARAM, c);
  return searchParams;
}
