// @ts-check
import { serverFetch } from "@/lib/server-fetch";
import { API_URL } from "@/lib/env";

/**
 * Module:   server-first-json
 * Purpose:  Read one API response on the server for a page's first paint
 *           (60s ISR), so the first HTML already holds the content instead of
 *           a skeleton that waits for the JS bundle and a client request.
 * Does NOT: throw, or decide what a failure looks like. Any failure (network,
 *           non-2xx, a body `accept` rejects) is `null`, and the client then
 *           fetches it itself, exactly as it did before.
 * Related:  app/[locale]/group-buys/page.js (MEH-2233).
 * History:  MEH-2233 (creation).
 */

/**
 * @param {string} path API path with its query, e.g. "/group-buys?status=open".
 * @param {(json: unknown) => boolean} accept the shape the client expects.
 * @returns {Promise<any>} the parsed body, or null.
 */
export async function serverFirstJson(path, accept) {
  try {
    const res = await serverFetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json = await res.json();
    return accept(json) ? json : null;
  } catch {
    return null;
  }
}
