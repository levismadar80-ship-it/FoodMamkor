// @ts-check
/**
 * Module:   ssr-entity-fetch
 * Purpose:  The server-side fetch at the top of the four detail pages
 *           (producer, event, experience, group-buy): one request, one
 *           three-way answer, one way of reporting it.
 * Does NOT: decide what a page does with `null` (each page calls notFound()
 *           itself) or build metadata / JSON-LD.
 * Related:  app/[locale]/{producer,events,experiences,group-buys}/[id]/page.js
 *           (callers); __tests__/ssr-metadata-validation.test.js (behaviour,
 *           all four routes); docs/audits/producer-detail-page-validation.md §6.
 * History:  MEH-1885 (inline reporting at four sites); MEH-2101 (the
 *           three-way table); MEH-2552 (422 = missing); MEH-3465 (the four
 *           identical copies became this helper, which retires MEH-1885's
 *           "four call sites, one pattern, inline" guard).
 */
import * as Sentry from "@sentry/nextjs";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry

/**
 * `null` means ONE thing: the entity does not exist (404, or 422 = the backend
 * rejected the id itself). Every other failure is reported and THROWN, so it
 * reaches app/[locale]/error.js with a 5xx — a 404 would tell Google the page
 * is gone (MEH-2101).
 *
 * The payload is safeParse'd as a probe and reported on a mismatch, but the
 * RAW object is returned: the metadata schemas are minimal by design, and
 * `parsed.data` would strip every field the JSON-LD builders read (MEH-901).
 *
 * @param {{
 *   path: string,
 *   id: string,
 *   route: string,
 *   noun: string,
 *   schema: { safeParse: (data: unknown) => { success: boolean, error?: { issues: unknown } } },
 * }} opts  path e.g. "/events"; noun names the entity in the thrown message
 * @returns {Promise<any>}
 */
export async function fetchSsrEntity({ path, id, route, noun, schema }) {
  let res;
  try {
    res = await serverFetch(`${API_URL}${path}/${id}`, {
      next: { revalidate: 60 },
    });
  } catch (err) {
    // Network failure or timeout — not a missing entity. Report, then rethrow.
    Sentry.captureException(err, { extra: { route, id } });
    throw err;
  }

  if (res.status === 404 || res.status === 422) return null;

  if (!res.ok) {
    Sentry.captureMessage("SSR fetch failed", {
      level: "error",
      extra: { route, id, status: res.status },
    });
    /** @type {Error & { status?: number, entityId?: string }} */
    const err = new Error(`${noun} lookup failed: ${res.status} ${res.statusText} (id=${id})`);
    // Read by Sentry in app/[locale]/error.js; keeps id+status on the event.
    err.status = res.status;
    err.entityId = id;
    throw err;
  }

  const data = await res.json();
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    Sentry.captureMessage("SSR payload failed schema validation", {
      level: "warning",
      extra: { route, id, issues: parsed.error?.issues },
    });
  }
  return data;
}
