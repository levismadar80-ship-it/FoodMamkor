import * as Sentry from "@sentry/nextjs";
import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { isOwnerPreview } from "./lib/owner-preview";
import { routing } from "./i18n/routing";
import { isSlugShaped, decodeSlugParam } from "./lib/slug";
import { DIET_PAGE_MIN, getDietPage, isDietPageBacked } from "./lib/diet-pages";
import { movedSlugOf, recipeExists, regionCellExists } from "./lib/middleware-exists"; // MEH-2977 siblings
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
 *           /[locale]/producer/<id> is existence-checked again since
 *           MEH-3024 (owners of a non-approved business use the dashboard
 *           preview; reasoning at the call site below).
 *           Producer data-loading + not-found UI still live in [slug]/page.js +
 *           producer/[id]/page.js. Does NOT alert on 429 or on a network
 *           exception (unreachable backend) — MEH-1906 scoped the new Sentry
 *           event to 5xx responses only; both other fail-open causes still
 *           only log via `report()`, unchanged.
 * Related:  lib/static-routes.json (the guarded manifest this skips),
 *           app/global-not-found.js (real-404 renderer), lib/slug.js.
 * History:  MEH-1398 (creation — middleware existence-check);
 *           MEH-1632 (dropped the /producer/<id> branch — owner-facing 404);
 *           MEH-3024 (re-added it — owner links moved to the preview, 11/11);
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

// MEH-2706 / MEH-2977: detail routes whose missing id gets a real 404 here.
// The page segment equals the backend path (/events/<id>, /group-buys/<id>,
// /experiences/<id>). DO NOT add a segment that has a static child route.
// /organizers/<slug> joined 14/11 (measured 200 on production; backend 404s an
// unknown slug; app/[locale]/organizers/ holds only [slug]).
const ENTITY_404_SEGMENTS = new Set(["events", "group-buys", "experiences", "organizers"]);
// The two of them whose page renders an owner/admin preview (lib/owner-preview.js).
// /events/<id> has no preview branch, so it keeps its 404 check on ?preview=1.
const OWNER_PREVIEW_SEGMENTS = new Set(["group-buys", "experiences"]);

// MEH-3024: static routes under app/[locale]/producer/ besides [id]. The
// MEH-3024 case in MiddlewareProducerId404.test.js reads the directory and
// fails when a new static child is missing here.
const PRODUCER_STATIC_CHILDREN = new Set(["dashboard"]);

// producerExists() result for a deleted business (truthy: it is not a 404).
const GONE = "gone";

// MEH-2706: the same real-404 for two more page-level notFound() routes that
// were measured streaming 200 on staging (6/11, browser and Googlebot UA
// alike): /events/<id> and /producers/diet/<slug>. generateMetadata's
// notFound() no longer yields a 404 status once metadata streams, so — as for
// the slug route — the status has to be minted here. Same fail-open contract
// as producerExists: only an ANSWERED "absent" becomes a 404; anything else
// (5xx, 429, timeout, a missing count header) lets the page run.

// MEH-2977: a Next <Link> prefetch (or a browser speculative load) runs this
// middleware too; every card on a list page would cost a backend GET.
function isPrefetch(request) {
  const h = request.headers;
  return Boolean(
    h?.get?.("next-router-prefetch") ||
      h?.get?.("purpose") === "prefetch" ||
      /prefetch/.test(h?.get?.("sec-purpose") || ""),
  );
}

// /events/<id>: the backend answers 404 for an unknown id and 422 for one that
// is not a UUID (events/[id]/page.js treats both as "no such event").
//
// Owner check (the MEH-1632 trap for /producer/<id>): the backend also 404s an
// ANONYMOUS caller for an event of a not-yet-approved business, and this fetch
// is anonymous. That costs the owner nothing here, because the page's own
// server fetch (events/[id]/page.js getEvent) is anonymous too and already
// calls notFound() for her — the UI was the not-found page before this check;
// only the status code changes from 200 to 404.
// MEH-2977: the same reasoning holds for /group-buys/<id> and /experiences/<id>
// (anonymous 404 for a non-public one; their pages' own fetch is anonymous too).
async function entityExists(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(EXISTENCE_CHECK_TIMEOUT_MS) });
    if (res.status === 404 || res.status === 422) return false;
    if (!res.ok) report(`backend answered ${res.status} for ${url} — failing open`);
    return true;
  } catch (err) {
    report(`fetch threw for ${url} — failing open`, err);
    return true;
  }
}

// /producers/diet/<slug>: unknown or un-backed slug → absent without a fetch;
// otherwise absent only when X-Total-Count is READ and below DIET_PAGE_MIN.
// An absent or unparsable header is "unknown", never "zero" (MEH-1754, same
// rule as fetchDietProducers in the page).
async function dietPageExists(slug) {
  const entry = getDietPage(slug);
  if (!isDietPageBacked(entry)) return false;
  const url = `${API_URL}/producers?${entry.filterParam}=true&limit=1&offset=0`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(EXISTENCE_CHECK_TIMEOUT_MS) });
    if (!res.ok) {
      report(`backend answered ${res.status} for ${url} — failing open`);
      return true;
    }
    const raw = res.headers?.get?.("x-total-count") ?? null;
    const total = Number(raw);
    // Number("") is 0, so a blank header must be caught before it reads as zero.
    if (raw === null || raw.trim() === "" || !Number.isFinite(total)) return true;
    return total >= DIET_PAGE_MIN;
  } catch (err) {
    report(`fetch threw for ${url} — failing open`, err);
    return true;
  }
}

// MEH-3336: { moved: "<slug>" } for a renamed business, else false. Only a
// Latin slug is followed — the backend mints nothing else since MEH-3336, and
// it keeps a crafted body from steering the redirect anywhere odd. The shape
// check lives in lib/middleware-exists.js (MEH-3342: recipes share it).
async function movedSlugFrom(res) {
  const slug = await movedSlugOf(res);
  return slug ? { moved: slug } : false;
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
    const res = await fetch(url, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(EXISTENCE_CHECK_TIMEOUT_MS),
    });
    if (res.ok) return true;

    // MEH-1899: 404 is the ONLY status that answers the question we asked.
    // Everything else means the backend replied about something other than
    // this producer's existence, and must not be read as "no such business".
    // MEH-3336: a 404 may carry the business's NEW slug (a rename) — the
    // caller then 301s to it. Any body that is not that shape is a plain miss.
    if (res.status === 404) return movedSlugFrom(res);

    // MEH-2534: 410 = a business that was deleted. Not a backend fault, and
    // not a plain miss: the caller rewrites to the business-gone page.
    //
    // MEH-2576: never as `rewrite(..., { status: 410 })` — on Vercel a 410
    // from middleware is served as the platform's own `x-vercel-error: GONE`
    // "deployment removed" page (measured on staging 29/10; `next dev` does
    // not reproduce it).
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
  // MEH-1632 → MEH-3024: /producer/{id} IS existence-checked now (below,
  // next to the entity routes). MEH-1632 dropped the check because the edge
  // is anonymous and the backend 404s a not-yet-approved business to anyone
  // but its owner/admin (producers.py; the token lives in localStorage, so it
  // never reaches the edge). That reason no longer holds: the page's own SSR
  // fetch is anonymous too and calls notFound() for her (producer/[id]/
  // page.js, MEH-2101), and since 11/11 (Sapir) the owner's links for a
  // non-approved business go to /producer/dashboard/preview, which fetches
  // with her token (DashboardLayoutClient.jsx «צפייה בדף»). So the check
  // changes only the status code of a page that already showed «לא נמצא»,
  // 200 → 404 — the same reasoning as /events/<id> (entityExists above).
  // DO NOT check /producer/dashboard — a static child of the segment.

  let exists = existsUrl ? await producerExists(existsUrl) : true;
  // MEH-2706: entity detail and diet pages (see entityExists / dietPageExists). These
  // branches never overlap the slug check above (that one needs segs.length 1).
  // DO NOT add a static route under /events/ (e.g. /events/new) without
  // excluding it here: the backend would 404/422 it and this would mint a
  // real 404 for a real page. app/[locale]/events/ today holds only [id].
  // Cost: one uncached backend GET (≤3 s, then fail-open) per request on
  // these routes — the same trade the slug check already makes. The fetch
  // comes from Vercel's IP, so it shares the backend's 120/min per-IP bucket
  // with the pages' own server fetches; a <Link> prefetch is therefore
  // skipped (MEH-2977) — its status code is never shown to anyone.
  // MEH-2977: /group-buys/<id> and /experiences/<id> have the same shape
  // (notFound() in generateMetadata, which streams) and the same backend
  // contract (404 unknown / 422 not a UUID, anonymous 404 for a non-public
  // one — their pages' own fetch is anonymous too), so they ride the same
  // check. app/[locale]/group-buys/ and experiences/ hold only [id] + the
  // list; /experiences/new is a next.config redirect, which runs before this.
  // An owner/admin preview (?preview=1 / ?pending=1) is left to the page,
  // which asks again with her token (lib/owner-preview.js).
  const ownerPreview = segs.length === 2 && OWNER_PREVIEW_SEGMENTS.has(segs[0]) &&
    isOwnerPreview(request.nextUrl.searchParams);
  if (segs.length === 2 && ENTITY_404_SEGMENTS.has(segs[0]) && segs[1] && !isPrefetch(request) &&
    !ownerPreview) {
    // decodeSlugParam: the pathname is percent-encoded, and an organizer slug can
    // be Hebrew (re-encoding it raw would send %25D7… and mint a false 404).
    exists = await entityExists(`${API_URL}/${segs[0]}/${encodeURIComponent(decodeSlugParam(segs[1]))}`);
  } else if (segs.length === 2 && segs[0] === "producer" && segs[1] &&
    !PRODUCER_STATIC_CHILDREN.has(segs[1]) && !isPrefetch(request)) {
    // MEH-3024: /producer/<id> — see the MEH-1632 → MEH-3024 note above.
    exists = await entityExists(`${API_URL}/producers/${encodeURIComponent(decodeSlugParam(segs[1]))}`);
  } else if (segs.length === 3 && segs[0] === "producers" && segs[1] === "diet") {
    exists = await dietPageExists(decodeSlugParam(segs[2]));
  } else if (segs.length === 3 && segs[0] === "producers" && !isPrefetch(request)) {
    // MEH-2977 sibling: category × region pages (lib/middleware-exists.js).
    exists = await regionCellExists(API_URL, decodeSlugParam(segs[1]), decodeSlugParam(segs[2]), report);
  } else if (segs.length === 3 && segs[1] === "recipes" && !isPrefetch(request) &&
    !STATIC_ROUTES.has(decodeSlugParam(segs[0]).toLowerCase()) && isSlugShaped(decodeSlugParam(segs[0]))) {
    // MEH-2977 sibling: /<business-slug>/recipes/<id>.
    exists = await recipeExists(API_URL, decodeSlugParam(segs[0]), decodeSlugParam(segs[2]), report);
  }
  if (exists && typeof exists === "object" && exists.moved) {
    // MEH-3336: a renamed business — a permanent 301 to its current URL, so a
    // link shared before the rename keeps working and search engines move
    // the page. The query string is kept.
    const to = request.nextUrl.clone();
    // localePrefix is "as-needed": keep the request's own prefix (none for he).
    to.pathname = locale ? `/${locale}/${exists.moved}` : `/${exists.moved}`;
    const moved = NextResponse.redirect(to, 301);
    // MEH-3336 (review): a business may take an old slug back (rename A→B→A);
    // an indefinitely cached A→B 301 would then loop that browser. One hour
    // bounds it; search engines still read the 301 as a permanent move.
    moved.headers.set("Cache-Control", "public, max-age=3600");
    return moved;
  }
  if (!exists) {
    // Rewrite to a guaranteed-unmatched path → globalNotFound renders a real 404.
    const nf = request.nextUrl.clone();
    nf.pathname = "/__mm_not_found__";
    return NextResponse.rewrite(nf, { status: 404 });
  }
  if (exists === GONE) {
    // MEH-2576: not the [slug] page — its Data Cache keeps serving the
    // business's last 200 after the delete (only 200s are cached, so the
    // revalidating 410 is dropped). This lookup is uncached; trust it.
    const gone = request.nextUrl.clone();
    gone.pathname = `/${locale ?? routing.defaultLocale}/business-gone`;
    const res = NextResponse.rewrite(gone);
    // Carry next-intl's request-header overrides (the resolved locale) and
    // cookies, or /en/<slug> would render in the default locale. Its own
    // routing verdict (rewrite / next) would contradict ours.
    intlResponse.headers.forEach((value, key) => {
      if (key !== "x-middleware-rewrite" && key !== "x-middleware-next") {
        res.headers.set(key, value);
      }
    });
    return res;
  }

  // A preview URL is never indexed, whatever the streamed metadata says: the
  // header does not depend on where Next places the robots <meta>.
  if (ownerPreview) intlResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
  return intlResponse;
}

export const config = {
  matcher: [
    // MEH-2976: `monitoring` is the Sentry tunnel (next.config.js tunnelRoute);
    // the locale redirect must not turn it into /he/monitoring.
    "/((?!api|_next|_vercel|monitoring(?:/|$)|.*\\..*).*)",
    // MEH-2324: the owner-claim link /claim/<token>. The token is a JWT, so
    // the path has dots and the entry above skips it; without this it never
    // gets the locale rewrite and 404s. (Bare /claim matches both entries,
    // which is harmless.) Two segments, so no slug check below.
    // The locale-prefixed form is matched too, so it gets next-intl's locale.
    "/claim/:path*",
    "/:locale(he|en)/claim/:path*",
    // MEH-3377: the draft preview link /draft-preview/<token> — a JWT too, so
    // the same two entries for the same reason.
    "/draft-preview/:path*",
    "/:locale(he|en)/draft-preview/:path*",
    // MEH-2298: API calls, for the visitor-IP stamp only (apiPassThrough).
    "/api/:path*",
  ],
};
