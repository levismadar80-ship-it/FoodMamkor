import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { isSlugShaped } from "./lib/slug";
import staticRoutes from "./lib/static-routes.json";

/**
 * Module:   middleware
 * Purpose:  next-intl locale routing + MEH-1398 real-HTTP-404 for matched-route
 *           producer misses. A miss on /[locale]/<slug> is detected here (edge,
 *           ABOVE the [locale]/loading.js streaming boundary that pins
 *           page-level notFound() at 200 — measured MEH-918/1398) and rewritten
 *           to an unmatched path so experimental.globalNotFound (PR #1995)
 *           renders a real 404.
 * Does NOT: own the 404 status for VALID pages (those pass straight through).
 *           Does NOT existence-check /[locale]/producer/<id> — the edge is
 *           permanently unauthenticated, so that check could not distinguish
 *           the owner of a pending business from a stranger and hard-404'd her
 *           own page (MEH-1632; full reasoning at the call site below).
 *           Producer data-loading + not-found UI still live in [slug]/page.js +
 *           producer/[id]/page.js.
 * Related:  lib/static-routes.json (the guarded manifest this skips),
 *           app/global-not-found.js (real-404 renderer), lib/slug.js.
 * History:  MEH-1398 (creation — middleware existence-check);
 *           MEH-1632 (dropped the /producer/<id> branch — owner-facing 404).
 */

// Real static route segments under app/[locale]/ (excluding the [slug]
// catch-all). The middleware must NOT existence-check these — lib/slug.js
// RESERVED is INCOMPLETE, so we use the full manifest. Kept honest by
// __tests__/RouteManifestSync.test.js (bidirectional filesystem sync, CI-gated
// via frontend-vitest) + scripts/validate-registry-paths.py.
const STATIC_ROUTES = new Set(staticRoutes.routes);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const intlMiddleware = createMiddleware(routing);

// MEH-1899: the ONLY status that means "this business does not exist".
const HTTP_NOT_FOUND = 404;

/**
 * Report an existence-check that could not be answered. Structured so it can be
 * grepped out of Vercel runtime logs, single-line so it survives log shipping.
 *
 * console, not Sentry, and that is a deliberate stop rather than a fallback:
 * `sentry.edge.config.js` DOES init the SDK for this runtime ("middleware, edge
 * routes"), so an event here is feasible — but nothing in this repo has ever
 * demonstrated one arriving from middleware, and it cannot be demonstrated from
 * a sandbox with no edge deploy. Claiming Sentry coverage we have not observed
 * would be the same unverified-diagnosis move this ticket exists to correct.
 * Wiring + verifying the Sentry path belongs to MEH-1521, which owns the
 * fail-open observability decision.
 */
function reportUnresolved(slug, detail) {
  console.warn(
    `[middleware] producer existence check unresolved — failing OPEN. ` +
      `slug=${slug} ${detail}. A hard 404 here would tell crawlers a live ` +
      `business is gone on its canonical URL (MEH-1899).`,
  );
}

async function producerExists(url, slug) {
  try {
    // NOTE: the `next.revalidate` hint below is honored by Next's Data Cache
    // only in the Node page / Server-Component runtime — NOT in Edge Middleware,
    // which runs on the native Web fetch. So treat every call here as an UNCACHED
    // backend lookup: each slug-shaped request (hit OR miss) costs one GET to the
    // producers API. Abuse is bounded by the backend's slowapi rate limiting, not
    // by an edge cache. (The hint is kept so the fetch can still ride Vercel's
    // edge respect of the backend's Cache-Control, if any — best-effort, not relied on.)
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (res.ok) return true;

    // MEH-1899: `return res.ok` used to live here, which collapsed THREE states
    // into one. Only a real 404 is "this business does not exist"
    // (producers.py:274 raises it for a genuine miss). Everything else is the
    // backend answering badly:
    //   429 — the slowapi limiter (producers.py:256, "120/minute") under a
    //         burst. Measured: E2E turned this into an intermittent hard 404 on
    //         a live business, 4 of 7 runs (PR #2592).
    //   5xx — a real fault. Measured HTTP 500 from this endpoint on run
    //         30887201635 while /producers stayed 200.
    // Mapping either to a 404 tells Google the business is GONE on the URL it
    // actually crawls (lib/seo.js:120 makes the slug canonical), where a 5xx
    // would have said "come back later". So fail OPEN — the same decision the
    // catch below already makes for an unreachable backend — and report it.
    if (res.status === HTTP_NOT_FOUND) return false;
    reportUnresolved(slug, `backend responded ${res.status}`);
    return true;
  } catch (error) {
    // Backend unreachable → fail OPEN (let the page handle it) rather than
    // false-404 a possibly-valid page on a transient blip.
    reportUnresolved(slug, `fetch threw ${error?.name || "Error"}: ${error?.message || error}`);
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
  // MEH-1899: hoisted out of the block below so an unresolved check can name
  // which slug it was about. A log line that says only "a check failed" cannot
  // be acted on.
  let checkedSlug = null;
  if (segs.length === 1) {
    const slug = segs[0];
    if (!STATIC_ROUTES.has(slug.toLowerCase()) && isSlugShaped(slug)) {
      existsUrl = `${API_URL}/producers/by-slug/${encodeURIComponent(slug)}`;
      checkedSlug = slug;
    }
  }
  // MEH-1632: /producer/{id} is deliberately NOT existence-checked here.
  //
  // DO NOT re-add it — the check cannot tell an owner from a stranger, and
  // re-adding it 404s three owner-facing surfaces for every business that is
  // not yet approved (tools/page.js reviews card, dashboard/layout.js
  // "צפייה בדף", Header.jsx account menu).
  //
  // Why the edge cannot authenticate: producers.py:265-271 serves a
  // non-approved producer only to its owner or an admin, and identifies the
  // caller from the Bearer access token (auth.py:233). That token lives in
  // localStorage and is attached per-request by the axios interceptor
  // (lib/api.js:15-22), so it does not exist at the edge. Forwarding cookies
  // would not help either: `refresh_token` is scoped to path=/api/auth
  // (auth.py:107-116) and so is not sent on a page request at all, and
  // `__Secure-Fgp` is a fingerprint that is inert without the token. The
  // fetch below is therefore permanently anonymous, and to producers.py an
  // anonymous caller IS a stranger — including the owner herself.
  //
  // What this costs: a by-id miss now renders the page's own not-found UI
  // instead of a real HTTP 404. Bounded — by-id URLs already emit
  // robots:{index:false} on a miss (producer/[id]/page.js:36) and are never
  // the canonical form (lib/seo.js:120 prefers the slug). The /[slug] check
  // above is untouched, so the canonical, indexable, crawler-facing shape
  // keeps its real 404 and MEH-1398's SEO guarantee holds where it matters.

  if (existsUrl && !(await producerExists(existsUrl, checkedSlug))) {
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
