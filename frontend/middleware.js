import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { isSlugShaped } from "./lib/slug";

// ---- MEH-1398 SPIKE (middleware existence-check → real 404) ----------------
// Turn matched-route producer misses (/[locale]/<slug>, /[locale]/producer/<id>)
// into a REAL HTTP 404 by checking existence in the edge middleware — which
// runs ABOVE the [locale]/loading.js streaming boundary that pins page-level
// notFound() at 200 (measured, MEH-918/1398). On a miss we rewrite to a
// guaranteed-unmatched path so experimental.globalNotFound (PR #1995) renders
// its real-404 page.
//
// SPIKE CAVEAT (Phase 0): the middleware must NOT existence-check real static
// routes. lib/slug.js RESERVED is INCOMPLETE, so this spike hardcodes the
// current static-route manifest — a drift-prone registry that must stay in
// sync with app/[locale]/*/ (architectural smell; noted for the report).
const STATIC_ROUTES = new Set([
  "about", "accessibility", "admin", "contact", "dev", "events",
  "experiences", "favorites", "forgot-password", "group-buys", "home",
  "join", "login", "map", "messages", "newsletter", "p", "privacy",
  "producer", "producers", "rate", "ref", "register", "reset-password",
  "search", "settings", "share", "terms", "upgrade", "verify-email",
]);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const intlMiddleware = createMiddleware(routing);

async function producerExists(url) {
  try {
    // revalidate:60 mirrors the page fetches so the Data Cache CAN dedupe
    // (whether edge-middleware and node-page fetches share the cache is
    // exactly what the spike measures).
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
