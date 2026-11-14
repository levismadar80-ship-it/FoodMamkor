// @ts-check
/**
 * Module:   middleware-exists
 * Purpose:  Existence checks the middleware runs so a missing recipe or an
 *           unservable category × region page answers a REAL 404 instead of
 *           a streamed 200 (their notFound() runs after the shell flushes).
 * Does NOT: decide the page's content — the pages keep their own resolvers
 *           (`[slug]/recipes/[recipe_id]/page.jsx` getJson,
 *           `producers/[category]/[region]/page.js` resolveCell). This only
 *           mirrors their "answered absence" cases.
 * Contract: fail OPEN. Only an answered absence returns false; a 5xx, a 429,
 *           a timeout or a missing X-Total-Count returns true and the page
 *           runs as before (same rule as dietPageExists in middleware.js).
 * History:  MEH-2977 siblings (14/11/2026) — measured on production:
 *           /<slug>/recipes/<missing>, /producers/<cat>/<region> missing → 200.
 */
import { REGION_PAGE_MIN, getRegion, regionCities } from "./region-pages";

const TIMEOUT_MS = 3000;

/**
 * @param {string} url
 * @param {(msg: string, err?: unknown) => void} report
 * @returns {Promise<Response | null>} null when the fetch threw
 */
async function get(url, report) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    report(`fetch threw for ${url} — failing open`, err);
    return null;
  }
}

/**
 * /<slug>/recipes/<id>. The page 404s on a 404 or 410 from the recipe
 * endpoint (410 = business deleted); 422 is a malformed id.
 * @param {string} apiUrl @param {string} slug @param {string} recipeId
 * @param {(msg: string, err?: unknown) => void} report
 */
export async function recipeExists(apiUrl, slug, recipeId, report) {
  const url = `${apiUrl}/producers/${encodeURIComponent(slug)}/recipes/${encodeURIComponent(recipeId)}`;
  const res = await get(url, report);
  if (!res) return true;
  if (res.status === 404 || res.status === 410 || res.status === 422) return false;
  if (!res.ok) report(`backend answered ${res.status} for ${url} — failing open`);
  return true;
}

/**
 * /producers/<categorySlug>/<regionKey>: absent for an unknown region (no
 * fetch), an unknown category slug, or a READ count under REGION_PAGE_MIN.
 * @param {string} apiUrl @param {string} categorySlug @param {string} regionKey
 * @param {(msg: string, err?: unknown) => void} report
 */
export async function regionCellExists(apiUrl, categorySlug, regionKey, report) {
  if (!getRegion(regionKey)) return false;
  const catRes = await get(`${apiUrl}/categories`, report);
  if (!catRes || !catRes.ok) return true;
  let categories;
  try {
    categories = await catRes.json();
  } catch {
    return true;
  }
  if (!Array.isArray(categories)) return true;
  const category = categories.find((c) => c && c.slug === categorySlug);
  if (!category) return false;
  const cities = regionCities(regionKey).map((c) => `cities=${encodeURIComponent(c)}`).join("&");
  const url = `${apiUrl}/producers?category=${encodeURIComponent(category.id)}&${cities}&limit=1&offset=0`;
  const res = await get(url, report);
  if (!res || !res.ok) return true;
  const raw = res.headers?.get?.("x-total-count") ?? null;
  const total = Number(raw);
  // Number("") is 0: a blank header is "unknown", never "zero" (MEH-1754).
  if (raw === null || raw.trim() === "" || !Number.isFinite(total)) return true;
  return total >= REGION_PAGE_MIN;
}
