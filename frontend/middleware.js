import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { isSlugShaped } from "./lib/slug";
import staticRoutes from "./lib/static-routes.json";

/**
 * Module:   middleware
 * Purpose:  next-intl locale routing + MEH-1398 real-HTTP-404 for matched-route
 *           producer misses. A miss on /[locale]/<slug> or /[locale]/producer/
 *           <id> is detected here (edge, ABOVE the [locale]/loading.js streaming
 *           boundary that pins page-level notFound() at 200 — measured MEH-918/
 *           1398) and rewritten to an unmatched path so experimental.
 *           globalNotFound (PR #1995) renders a real 404.
 * Does NOT: own the 404 status for VALID pages (those pass straight through).
 *           Producer data-loading + not-found UI still live in [slug]/page.js +
 *           producer/[id]/page.js.
 * Related:  lib/static-routes.json (the guarded manifest this skips),
 *           app/global-not-found.js (real-404 renderer), lib/slug.js.
 * History:  MEH-1398 (creation — middleware existence-check).
 */

// Real static route segments under app/[locale]/ (excluding the [slug]
// catch-all). The middleware must NOT existence-check these — lib/slug.js
// RESERVED is INCOMPLETE, so we use the full manifest. Kept honest by
// __tests__/RouteManifestSync.test.js (bidirectional filesystem sync, CI-gated
// via frontend-vitest) + scripts/validate-registry-paths.py.
const STATIC_ROUTES = new Set(staticRoutes.routes);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const intlMiddleware = createMiddleware(routing);

async function producerExists(url) {
  try {
    // revalidate:60 matches the page fetches — it is ALSO the negative cache:
    // a 404 response is cached for 60s, so repeated misses on the same path do
    // NOT re-query the backend. On a VALID cold page the middleware fetch and
    // the page fetch don't share a cache entry (edge vs node), so a cold valid
    // page pays 1 extra lookup; within the 60s window it is served from cache.
    const res = await fetch(url, { next: { revalidate: 60 } });
    return res.ok;
  } catch {
    // Backend unreachable → fail OPEN (let the page handle it) rather than
    // false-404 a possibly-valid page on a transient blip.
    return true;
  }
}

export default async function middleware(request) {
  const intlResponse = intlMiddleware(request);
  // next-intl issued a redirect (locale negotiation) — never existence-check it.
  if (intlResponse.headers.get("location")) return intlResponse;

  const { pathname } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const locale = routing.locales.includes(parts[0]) ? parts[0] : null;
  const segs = locale ? parts.slice(1) : parts;

  let existsUrl = null;
  if (segs.length === 1) {
    const slug = segs[0];
    if (!STATIC_ROUTES.has(slug.toLowerCase()) && isSlugShaped(slug)) {
      existsUrl = `${API_URL}/producers/by-slug/${encodeURIComponent(slug)}`;
    }
  } else if (segs.length === 2 && segs[0] === "producer" && segs[1] !== "dashboard") {
    existsUrl = `${API_URL}/producers/${encodeURIComponent(segs[1])}`;
  }

  if (existsUrl && !(await producerExists(existsUrl))) {
    // Rewrite to a guaranteed-unmatched path → globalNotFound renders a real 404.
    const nf = request.nextUrl.clone();
    nf.pathname = "/__mm_not_found__";
    return NextResponse.rewrite(nf, { status: 404 });
  }

  return intlResponse;
}

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
