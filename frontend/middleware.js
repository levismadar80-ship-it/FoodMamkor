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

// MEH-1899: the failure this exists for ran with ZERO observability — no log,
// no Sentry — and was found only because an E2E spec happened to bite on it.
// `console.error` and not Sentry deliberately: whether Edge Middleware can
// reach Sentry at all is still an open Phase 0 question on MEH-1521, and a
// report that depends on an unverified transport is not a report. Vercel
// captures middleware console output in runtime logs, which is available today.
// If MEH-1521 establishes a Sentry path, this is the one place to change.
function report(message, err) {
  console.error(`[middleware/producerExists] ${message}`, err ?? "");
}

async function producerExists(url) {
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

    // MEH-1899: 404 is the ONLY status that answers the question we asked.
    // Everything else means the backend replied about something other than
    // this producer's existence, and must not be read as "no such business".
    if (res.status === 404) return false;

    // 5xx · 429 · anything else → fail OPEN, same decision as "unreachable".
    // `return res.ok` used to collapse these onto the 404 branch, so a backend
    // that stuttered produced a HARD 404 on the canonical, indexable URL
    // (lib/seo.js:120 prefers the slug). 404 tells Google the resource is GONE
    // and it gets deindexed; 5xx tells it to retry. A transient fault was
    // therefore presented as a permanent disappearance.
    //
    // 429 lands here too and that is not hypothetical: the comment above
    // records that every slug-shaped request costs one LIVE backend GET with no
    // edge cache, so a burst from one IP is rate-limited by slowapi — and a 429
    // was previously indistinguishable from "this business does not exist".
    report(`backend answered ${res.status} for ${url} — failing open`);
    return true;
  } catch (err) {
    // Backend unreachable → fail OPEN (let the page handle it) rather than
    // false-404 a possibly-valid page on a transient blip.
    report(`fetch threw for ${url} — failing open`, err);
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
