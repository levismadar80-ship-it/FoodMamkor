// @ts-check
/**
 * Module:   map-ssr-producers
 * Purpose:  Fetch a representative batch of businesses server-side, for the
 *           sr-only index /map renders so Googlebot can see the businesses the
 *           interactive map holds (MEH-151).
 * Does NOT: feed the interactive map. That fetches live on the client
 *           (app/[locale]/map/state/useProducersFeed.js).
 * Related:  frontend/app/[locale]/map/page.js (its only caller),
 *           frontend/lib/server-fetch.js.
 * History:  MEH-151 (the logic); MEH-0000 (moved out of page.js so it can be
 *           TESTED. Its test file imported nothing from the page and re-
 *           implemented the function inline — "inline the same logic to verify
 *           contract", in its own words — so all six cases would have passed
 *           with the real function deleted.)
 */
import { serverFetch } from "@/lib/server-fetch";
import { API_URL } from "@/lib/env";

/**
 * @returns {Promise<Array<{id: string, name?: string, city?: string, slug?: string}>>}
 *   the businesses, or [] on any failure — this index is additive, and a miss
 *   must never take the map page down.
 */
export async function fetchProducersForSSR() {
  try {
    const res = await serverFetch(`${API_URL}/producers?limit=100&offset=0`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
