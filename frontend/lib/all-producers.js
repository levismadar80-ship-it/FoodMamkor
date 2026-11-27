// @ts-check
/**
 * Module:   all-producers
 * Purpose:  Every approved business, walked page by page over GET /producers.
 *           One owner for the walk that /sitemap.xml and /llms.txt both need.
 * Touches:  Railway backend over HTTP (serverFetch).
 * Does NOT: decide what a consumer prints — sitemap.js and app/llms.txt do.
 * Related:  app/sitemap.js, app/llms.txt/route.js
 * History:  MEH-2787 (walk written in sitemap.js); MEH-3953 (moved here so
 *           /llms.txt reuses it instead of a second copy).
 */
import "server-only";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch";

// MEH-2787 — the listing endpoint caps `limit` at 100
// (backend/app/routers/producers.py:220), so the whole catalog needs an
// offset walk. sitemaps.org allows 50,000 URLs per file and we are nowhere
// near it, so a loop is enough; `generateSitemaps` would be premature.
const PRODUCERS_PAGE_SIZE = 100;
const PRODUCERS_MAX_PAGES = 20; // 2,000 businesses

/**
 * Every approved business, walked page by page.
 *
 * THE WALK IS ONLY SAFE BECAUSE THE LISTING IS TOTALLY ORDERED. Commit 1 of
 * this PR added `Producer.id.asc()` as a final unique key in
 * backend/app/services/producer_listing.py. Without it, two pages of the same
 * query are two statements over a non-unique order, and a row on the boundary
 * can repeat while another disappears — which in a sitemap means a business
 * silently missing from search. Do not port this loop to an endpoint whose
 * ordering you have not checked.
 *
 * @returns {Promise<Array|null>} the businesses, or null when the API is
 *   unreachable — null is distinct from [] so the caller keeps today's
 *   fail-closed behaviour (emit no producer URLs) rather than publishing a
 *   sitemap that claims the catalog is empty.
 */
export async function fetchAllProducers() {
  const all = [];
  for (let page = 0; page < PRODUCERS_MAX_PAGES; page++) {
    const offset = page * PRODUCERS_PAGE_SIZE;
    const res = await serverFetch(
      `${API_URL}/producers?limit=${PRODUCERS_PAGE_SIZE}&offset=${offset}`,
    );
    if (!res.ok) {
      // A mid-walk failure returns what was collected (the sitemap and llms.txt
      // then miss the rest until the next rebuild); a first-page failure
      // returns null so neither claims the catalog is empty.
      return page === 0 ? null : all;
    }
    const batch = await res.json();
    if (!Array.isArray(batch)) return page === 0 ? null : all;
    all.push(...batch);
    if (batch.length < PRODUCERS_PAGE_SIZE) return all;
  }
  console.warn(
    `[all-producers] producer walk hit the ${PRODUCERS_MAX_PAGES}-page cap ` +
      `(${PRODUCERS_MAX_PAGES * PRODUCERS_PAGE_SIZE} businesses). Businesses past ` +
      `that are NOT in /sitemap.xml or /llms.txt — raise PRODUCERS_MAX_PAGES.`,
  );
  return all;
}

