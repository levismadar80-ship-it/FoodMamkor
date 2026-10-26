import "server-only";

/**
 * Module:   listing-supply
 * Purpose:  MEH-2369 — how many public items each "something happening" hub
 *           (/events, /experiences, /group-buys) would list right now, so the
 *           sitemap and each hub's metadata can tell an empty shelf from a
 *           real one.
 * Touches:  Railway backend over HTTP via serverFetch (no DB).
 * Does NOT: gate client navigation (that is lib/use-*-nav-gate.js), and does
 *           NOT 404 an empty hub — the page still renders its empty state for
 *           a reader who arrives by link; it just stops being offered to
 *           search engines.
 * Related:  app/sitemap.js, app/[locale]/{events,experiences,group-buys}/page.js,
 *           backend/app/routers/{events,experiences,group_buys}.py.
 *
 * Each count reads the SAME endpoint the hub itself lists from, so the hub and
 * these counts cannot disagree.
 *
 * `null` means "unknown" (network error, non-2xx, unexpected body). Callers
 * decide what unknown means for them, and the two decide differently on
 * purpose:
 *   - the sitemap omits an unknown hub (an absent entry costs discovery
 *     latency; a listed empty page is an indexing fault — mirrors MEH-1935);
 *   - metadata keeps an unknown hub indexable (a backend wobble must never
 *     de-index a real page — the MEH-1754 lesson).
 */
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch";

export const HUBS = Object.freeze({
  events: { path: "/events", endpoint: "/events" },
  experiences: { path: "/experiences", endpoint: "/experiences/count" },
  groupBuys: { path: "/group-buys", endpoint: "/group-buys" },
});

/** Turns one response body into a count, or null when the shape is wrong. */
export function countFromBody(hubKey, body) {
  if (hubKey === "experiences") {
    const n = body?.count;
    return Number.isInteger(n) && n >= 0 ? n : null;
  }
  return Array.isArray(body) ? body.length : null;
}

async function fetchCount(hubKey) {
  try {
    const res = await serverFetch(`${API_URL}${HUBS[hubKey].endpoint}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return countFromBody(hubKey, await res.json());
  } catch {
    return null;
  }
}

/** @returns {Promise<number|null>} */
export function getHubCount(hubKey) {
  return fetchCount(hubKey);
}

/** @returns {Promise<{events: number|null, experiences: number|null, groupBuys: number|null}>} */
export async function getAllHubCounts() {
  const keys = Object.keys(HUBS);
  const counts = await Promise.all(keys.map(fetchCount));
  return Object.fromEntries(keys.map((k, i) => [k, counts[i]]));
}

/** Sitemap rule: list a hub only when it is known to have at least one item. */
export function hubBelongsInSitemap(count) {
  return typeof count === "number" && count >= 1;
}

/** Metadata rule: noindex only a hub that is known to be empty. */
export function hubRobots(count) {
  return count === 0 ? { index: false, follow: true } : undefined;
}
