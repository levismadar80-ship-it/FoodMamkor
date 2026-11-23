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
 * History:  MEH-151 (the logic); MEH-3628 (throws at run time, see below); MEH-0000 (moved out of page.js so it can be
 *           TESTED. Its test file imported nothing from the page and re-
 *           implemented the function inline — "inline the same logic to verify
 *           contract", in its own words — so all six cases would have passed
 *           with the real function deleted.)
 */
import { serverFetch } from "@/lib/server-fetch";
import { API_URL } from "@/lib/env";

/**
 * @returns {Promise<Array<{id: string, name?: string, city?: string, slug?: string}>>}
 *   the businesses. At build time a miss returns [] (CI builds with no API, and
 *   this index is additive). At run time a miss THROWS: /map is prerendered and
 *   regenerated hourly since MEH-3628, and a thrown regeneration keeps the last
 *   good page, where [] would cache an empty index for an hour.
 */
export async function fetchProducersForSSR() {
  try {
    const res = await serverFetch(`${API_URL}/producers?limit=100&offset=0`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`/producers answered ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("/producers did not return a list");
    return data;
  } catch (err) {
    // MEH-3628: only the build may swallow the miss.
    if (process.env.NEXT_PHASE === "phase-production-build") return [];
    throw err;
  }
}
