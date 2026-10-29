import * as Sentry from "@sentry/nextjs";
import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { isSlugShaped, decodeSlugParam } from "./lib/slug";
import staticRoutes from "./lib/static-routes.json";

/**
 * Module:   middleware
 * Purpose:  next-intl locale routing + MEH-1398 real-HTTP-404 for matched-route
 *           producer misses. A miss on /[locale]/<slug> is detected here (edge,
 *           ABOVE the [locale]/loading.js streaming boundary that pins
 *           page-level notFound() at 200 — measured MEH-918/1398) and rewritten
 *           to an unmatched path so experimental.globalNotFound (PR #1995)
 *           renders a real 404.
 * Touches:  Sentry (edge runtime, sentry.edge.config.js) — MEH-1906 added a
 *           captureMessage on the backend-5xx fail-open branch only, so that
 *           path stops being silent past a Vercel runtime log line.
 * Does NOT: own the 404 status for VALID pages (those pass straight through).
 *           Does NOT existence-check /[locale]/producer/<id> — the edge is
 *           permanently unauthenticated, so that check could not distinguish
 *           the owner of a pending business from a stranger and hard-404'd her
 *           own page (MEH-1632; full reasoning at the call site below).
 *           Producer data-loading + not-found UI still live in [slug]/page.js +
 *           producer/[id]/page.js. Does NOT alert on 429 or on a network
 *           exception (unreachable backend) — MEH-1906 scoped the new Sentry
 *           event to 5xx responses only; both other fail-open causes still
 *           only log via `report()`, unchanged.
 * Related:  lib/static-routes.json (the guarded manifest this skips),
 *           app/global-not-found.js (real-404 renderer), lib/slug.js.
 * History:  MEH-1398 (creation — middleware existence-check);
 *           MEH-1632 (dropped the /producer/<id> branch — owner-facing 404);
 *           MEH-1906 (5xx fail-open now also reports to Sentry);
 *           MEH-2298 (/api/* pass-through stamps the visitor IP for the
 *           backend rate limiter — see apiPassThrough).
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
// `console.error` (not Sentry) covers every branch below unconditionally —
// Vercel captures middleware console output in runtime logs, which satisfies
// the DoD's log requirement regardless of Sentry reachability. MEH-1906
// layered a Sentry event ON TOP of this, but only for the 5xx branch (see
// reportFiveHundredToSentry below) — the observability.md dashboard-receipt
// step for THAT addition could not be run from the CC sandbox (no live
// deploy reachable) and is called out unverified in the MEH-1906 PR body;
// this function itself is unchanged from MEH-1521/1899.
function report(message, err) {
  console.error(`[middleware/producerExists] ${message}`, err ?? "");
}

// MEH-1906: the 5xx branch of the fail-open below was silent past the
// console.error above — no Sentry event, same unmonitored-log gap MEH-1899's
// comment already named for this file. Scoped to 5xx only (not 429, not the
// unreachable-backend catch) per the ticket. Rate-guarded per URL per warm
// Edge Function instance — a Set that resets on cold start — so a slug the
// backend keeps failing on doesn't storm the dashboard on every repeat hit;
// this does not change the fail-open decision itself, only whether THIS
// occurrence also gets reported.
const _reportedFiveHundredUrls = new Set();

// The Set is bounded, because it is keyed by URL and the URL space is
// attacker-reachable: every slug-shaped path is a distinct key, so a scanner
// walking random slugs during a backend outage would grow it without a
// ceiling inside a long-lived warm instance.
//
// On reaching the cap we CLEAR and carry on rather than stop reporting. The
// obvious guard — `if (size >= CAP) return;` — bounds memory by going SILENT,
// and going silent under a large multi-slug 5xx storm is precisely the state
// this whole change exists to make visible (MEH-1906; "fail open, never fail
// silent"). Clearing costs at most one repeat alert per slug per 1000 distinct
// failing URLs, which is far cheaper than losing the signal exactly when the
// outage is widest.
const REPORTED_URLS_CAP = 1000;

function reportFiveHundredToSentry(url, status) {
  if (_reportedFiveHundredUrls.has(url)) return;
  if (_reportedFiveHundredUrls.size >= REPORTED_URLS_CAP) {
    _reportedFiveHundredUrls.clear();
  }
  _reportedFiveHundredUrls.add(url);
  Sentry.captureMessage("producerExists: backend 5xx — failing open", {
    level: "error",
    extra: { url, status },
  });
}

// MEH-1521: an unreachable backend already fails open (see the catch below),
// but a SLOW backend previously had no bound at all — the edge request would
// hang for as long as the platform's own connect/read timeout, which is far
// longer than any user should wait for routing. AbortSignal.timeout() turns
// "slow" into "unreachable" at a fixed 3s, which then rides the identical
// fail-open path. 3s chosen to comfortably exceed a healthy backend response
// (typically <200ms) while bounding the worst case to something a page nav
// can absorb.
const EXISTENCE_CHECK_TIMEOUT_MS = 3000;

// producerExists() result for a deleted business (truthy: it is not a 404).
const GONE = "gone";

async function producerExists(url) {
  try {
    // NOTE: the `next.revalidate` hint below is honored by Next's Data Cache
    // only in the Node page / Server-Component runtime — NOT in Edge Middleware,
    // which runs on the native Web fetch. So treat every call here as an UNCACHED
    // backend lookup: each slug-shaped request (hit OR miss) costs one GET to the
    // producers API. Abuse is bounded by the backend's slowapi rate limiting, not
    // by an edge cache. (The hint is kept so the fetch can still ride Vercel's
    // edge respect of the backend's Cache-Control, if any — best-effort, not relied on.)
    const res = await fetch(url, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(EXISTENCE_CHECK_TIMEOUT_MS),
    });
    if (res.ok) return true;

    // MEH-1899: 404 is the ONLY status that answers the question we asked.
    // Everything else means the backend replied about something other than
    // this producer's existence, and must not be read as "no such business".
    if (res.status === 404) return false;

    // MEH-2534: 410 = a business that was deleted. Not a backend fault, and
    // not a plain miss: the caller serves the page's own "no longer listed"
    // screen with a real 410.
    if (res.status === 410) return GONE;

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
    if (res.status >= 500) reportFiveHundredToSentry(url, res.status);
    return true;
  } catch (err) {
    // Backend unreachable → fail OPEN (let the page handle it) rather than
    // false-404 a possibly-valid page on a transient blip.
    report(`fetch threw for ${url} — failing open`, err);
    return true;
  }
}

// MEH-2298: /api/* is rewritten to Railway by next.config.js from the Vercel
// edge, so the backend's TCP peer is Vercel, not the visitor. When
// EDGE_PROXY_SECRET is set (server-side only — never NEXT_PUBLIC_), stamp the
// visitor IP plus the shared secret onto the upstream request; the backend
// trusts the IP header only when the secret matches
// (backend/app/rate_limit.py::_edge_client_ip). Unset → plain pass-through,
// byte-for-byte the pre-MEH-2298 request.
//
// Vercel overwrites x-real-ip / x-forwarded-for on ingress with the visitor's
// public IP (vercel.com/docs/headers/request-headers), so neither is
// client-controlled here. Both of our own headers are deleted before being
// set, so a visitor cannot pre-load them either.
const EDGE_PROXY_SECRET = process.env.EDGE_PROXY_SECRET || "";

export function apiPassThrough(request) {
  if (!EDGE_PROXY_SECRET) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.delete("x-edge-secret");
  headers.delete("x-edge-client-ip");
  const visitorIp = (
    request.headers.get("x-real-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0] ||
    ""
  ).trim();
  headers.set("x-edge-secret", EDGE_PROXY_SECRET);
  if (visitorIp) headers.set("x-edge-client-ip", visitorIp);
  return NextResponse.next({ request: { headers } });
}

export default async function middleware(request) {
  // MEH-2298: API calls never reach locale routing or the slug check.
  if (request.nextUrl.pathname.startsWith("/api/")) return apiPassThrough(request);

  const intlResponse = intlMiddleware(request);
  // next-intl issued a redirect (locale negotiation) — never existence-check it.
  if (intlResponse.headers.get("location")) return intlResponse;

  const { pathname } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const locale = routing.locales.includes(parts[0]) ? parts[0] : null;
  const segs = locale ? parts.slice(1) : parts;

  let existsUrl = null;
  if (segs.length === 1) {
    // MEH-2534: the pathname is percent-encoded; a Hebrew slug never passed
    // isSlugShaped, so it skipped this check entirely.
    const slug = decodeSlugParam(segs[0]);
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

  const exists = existsUrl ? await producerExists(existsUrl) : true;
  if (!exists) {
    // Rewrite to a guaranteed-unmatched path → globalNotFound renders a real 404.
    const nf = request.nextUrl.clone();
    nf.pathname = "/__mm_not_found__";
    return NextResponse.rewrite(nf, { status: 404 });
  }
  if (exists === GONE) {
    // MEH-2534: the [slug] page renders ProducerGone for it; the rewrite only
    // carries the status. The page streams, so without this a crawler would
    // read 200 (+ noindex) where the backend said 410.
    const gone = request.nextUrl.clone();
    gone.pathname = `/${locale ?? routing.defaultLocale}/${segs[0]}`;
    const res = NextResponse.rewrite(gone, { status: 410 });
    // Carry next-intl's request-header overrides (the resolved locale) and
    // cookies, or /en/<slug> would render in the default locale.
    intlResponse.headers.forEach((value, key) => {
      // Its own routing verdict (rewrite / next) would contradict ours.
      if (key !== "x-middleware-rewrite" && key !== "x-middleware-next") {
        res.headers.set(key, value);
      }
    });
    return res;
  }

  return intlResponse;
}

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
    // MEH-2324: the owner-claim link /claim/<token>. The token is a JWT, so
    // the path has dots and the entry above skips it; without this it never
    // gets the locale rewrite and 404s. (Bare /claim matches both entries,
    // which is harmless.) Two segments, so no slug check below.
    // The locale-prefixed form is matched too, so it gets next-intl's locale.
    "/claim/:path*",
    "/:locale(he|en)/claim/:path*",
    // MEH-2298: API calls, for the visitor-IP stamp only (apiPassThrough).
    "/api/:path*",
  ],
};
