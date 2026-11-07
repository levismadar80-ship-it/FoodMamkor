// Dynamic sitemap (LAUNCH_CHECKLIST week 1 — SEO).
// Next.js App Router reads the default export and serves it at /sitemap.xml.
// SITE_URL + API_URL helpers are validated by Zod at build time (lib/env.js).
// MEH-476: emits one entry per locale (HE no prefix, EN /en prefix) with
// alternates.languages on every entry so Google reads <xhtml:link> hreflang
// inline; complements <head> hreflang from MEH-476 PR 2.
import { SITE_URL, API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { routing } from "@/i18n/routing";
// MEH-1574: single owner for the hreflang map. This file used to keep its own
// byte-identical copy of the same object — the exact two-owners drift class
// lib/i18n-seo.js:18 warns about. Import it; never re-declare it here.
import { HREFLANG_CODES } from "@/lib/i18n-seo";
// MEH-1935: the diet-landing config is the single owner of the slug set, the
// route path shape and the ≥5 threshold — never restate any of them here.
import {
  BACKED_DIET_PAGES,
  DIET_PAGE_MIN,
  dietPagePath,
} from "@/lib/diet-pages";
// MEH-2369: the three "something happening" hubs are listed only with supply.
import { HUBS, getAllHubCounts, hubBelongsInSitemap } from "@/lib/listing-supply";
// MEH-2478: one owner of "a group buy can still be joined" (open + before deadline).
import { isGroupBuyLive } from "@/lib/seo";

// localePrefix is "as-needed": defaultLocale (he) has no prefix; others get /<locale>.
function urlForLocale(path, locale) {
  const base = locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`;
  return `${base}${path}`;
}

// Expands one logical path into one sitemap entry per locale. Every entry
// carries the full alternates.languages map so Next.js emits an <xhtml:link>
// per locale inside every <url> block.
// MEH-1574: the `?? l` fallback mirrors buildAlternates (lib/i18n-seo.js:63) so
// both hreflang consumers degrade identically — a locale added to routing.locales
// without a HREFLANG_CODES entry emits its bare routing code instead of the
// `undefined` key this file used to produce.
function localizeEntry(path, meta) {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [HREFLANG_CODES[l] ?? l, urlForLocale(path, l)]),
  );
  return routing.locales.map((locale) => ({
    url: urlForLocale(path, locale),
    ...meta,
    alternates: { languages },
  }));
}

// MEH-2787 — the listing endpoint caps `limit` at 100
// (backend/app/routers/producers.py:220), so the whole catalog needs an
// offset walk. sitemaps.org allows 50,000 URLs per file and we are nowhere
// near it, so a loop is enough; `generateSitemaps` would be premature.
const PRODUCERS_PAGE_SIZE = 100;
const PRODUCERS_MAX_PAGES = 20; // 2,000 businesses
// The recipes fan-out calls a 120/minute endpoint from one IP. 10 in flight
// keeps a full 2,000-business walk comfortably under it.
const RECIPE_FAN_OUT_LIMIT = 10;

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
async function fetchAllProducers() {
  const all = [];
  for (let page = 0; page < PRODUCERS_MAX_PAGES; page++) {
    const offset = page * PRODUCERS_PAGE_SIZE;
    const res = await serverFetch(
      `${API_URL}/producers?limit=${PRODUCERS_PAGE_SIZE}&offset=${offset}`,
    );
    if (!res.ok) {
      // A mid-walk failure must not silently truncate the sitemap: the pages
      // already collected would look like the whole catalog.
      return page === 0 ? null : all;
    }
    const batch = await res.json();
    if (!Array.isArray(batch)) return page === 0 ? null : all;
    all.push(...batch);
    if (batch.length < PRODUCERS_PAGE_SIZE) return all;
  }
  console.warn(
    `[sitemap] producer walk hit the ${PRODUCERS_MAX_PAGES}-page cap ` +
      `(${PRODUCERS_MAX_PAGES * PRODUCERS_PAGE_SIZE} businesses). Businesses past ` +
      `that are NOT in the sitemap — raise PRODUCERS_MAX_PAGES or split the file.`,
  );
  return all;
}

/**
 * Run `task` over `items` with at most `limit` promises in flight, preserving
 * input order in the result.
 *
 * Order matters here: the caller zips the results back against `slugged` by
 * position, so a completion-ordered result would attach each business's
 * recipes to a different business.
 */
async function mapWithConcurrency(items, { limit, task }) {
  const queue = items.map((item, index) => ({ item, index }));
  const byIndex = new Map();
  const worker = async () => {
    for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
      byIndex.set(job.index, await task(job.item));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  // Rebuilt from `items`, so the result is in INPUT order rather than
  // completion order, with no sort and no indexed array write.
  return items.map((_item, index) => byIndex.get(index));
}

export default async function sitemap() {
  const now = new Date();

  const staticDefs = [
    { path: "", priority: 1.0, changeFrequency: "daily" },
    { path: "/map", priority: 0.9, changeFrequency: "daily" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    // MEH-875: secondary indexable landing routes (all under app/[locale]/).
    { path: "/about/process", priority: 0.5, changeFrequency: "monthly" },
    { path: "/about/for-businesses", priority: 0.5, changeFrequency: "monthly" },
    // MEH-1289: reader-facing "why local" editorial page.
    { path: "/about/why-local", priority: 0.5, changeFrequency: "monthly" },
    // MEH-2701: badges explainer («מה אומרים התגים»).
    { path: "/about/badges", priority: 0.4, changeFrequency: "monthly" },
    { path: "/register/producer", priority: 0.7, changeFrequency: "monthly" },
    // MEH-803: /register, /login, /contact intentionally NOT listed (/search
    // itself is gone — it 308s to /producers since MEH-819) —
    // each page sets robots:{index:false} (MEH-641 auth chrome / MEH-658 utility
    // route), so emitting them here produced GSC "Submitted URL marked 'noindex'".
    // The sitemap lists indexable URLs only; the pages' noindex directives stay.
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  ];
  // MEH-2369: /events, /experiences and /group-buys used to sit in staticDefs
  // unconditionally — three empty pages offered to Google daily while
  // production had zero of each. They join only when the hub is KNOWN to list
  // at least one item; an unknown count (API down at build) omits them, the
  // same fail-closed choice the diet pages below make.
  const hubCounts = await getAllHubCounts();
  for (const [key, hub] of Object.entries(HUBS)) {
    if (hubBelongsInSitemap(hubCounts[key])) {
      staticDefs.push({ path: hub.path, priority: 0.8, changeFrequency: "daily" });
    }
  }
  const staticPages = staticDefs.flatMap(({ path, priority, changeFrequency }) =>
    localizeEntry(path, { lastModified: now, priority, changeFrequency }),
  );

  // Producer pages — prefer slug URLs (SEO-friendly) when available.
  let producerPages = [];
  // MEH-23 — also emit /producers?page=1..N so Google can walk the
  // paginated index. 24 per page mirrors the SSR route.
  let producerIndexPages = [];
  // MEH-1062 (SEO-03): recipe detail pages (published+approved), slug-based.
  let recipePages = [];
  try {
    const producers = await fetchAllProducers();
    if (producers !== null) {
      producerPages = producers.flatMap((p) => {
        const path = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
        return localizeEntry(path, {
          lastModified: now,
          priority: 0.9,
          changeFrequency: "weekly",
        });
      });

      const PER_PAGE = 24;
      const totalPages = Math.max(1, Math.ceil(producers.length / PER_PAGE));
      for (let p = 1; p <= totalPages; p++) {
        const path = p === 1 ? "/producers" : `/producers?page=${p}`;
        producerIndexPages.push(
          ...localizeEntry(path, {
            lastModified: now,
            priority: 0.8,
            changeFrequency: "daily",
          }),
        );
      }

      // MEH-1062 (SEO-03): recipe detail URLs. Recipes are per-producer
      // (GET /producers/{slug}/recipes — published+approved only), so fan out
      // concurrently over slugged producers; each fetch fails open (recipes
      // are additive — a miss must never drop the producer/event sitemap).
      // MEH-2787: bounded at RECIPE_FAN_OUT_LIMIT. The bare `Promise.all`
      // this replaces fired one request per slugged business in a single
      // burst, from the build server's single IP, against an endpoint limited
      // to 120/minute (backend/app/routers/producer_recipes.py:358). Under
      // 120 businesses that was invisible; at the 2,000 ceiling the loop
      // above now reaches it would have been ~17× the limit, and because each
      // fetch fails open (`.catch(() => [])`) the overflow would return 429
      // and silently drop recipe URLs — the same shape of silent loss this
      // ticket exists to fix, reintroduced one line below the fix.
      const slugged = producers.filter((p) => p.slug);
      const recipeLists = await mapWithConcurrency(slugged, {
        limit: RECIPE_FAN_OUT_LIMIT,
        task: (producer) =>
          serverFetch(`${API_URL}/producers/${encodeURIComponent(producer.slug)}/recipes`)
            .then((response) => (response.ok ? response.json() : []))
            .catch(() => []),
      });
      recipePages = slugged.flatMap((p, i) =>
        (recipeLists[i] || []).flatMap((recipe) =>
          localizeEntry(`/${p.slug}/recipes/${recipe.id}`, {
            lastModified: now,
            priority: 0.6,
            changeFrequency: "monthly",
          }),
        ),
      );
    }
  } catch {
    // API not available during build — skip dynamic pages
  }

  // MEH-1935: diet landing pages (/producers/diet/[dietSlug]). Emitted ONLY for
  // slugs that clear DIET_PAGE_MIN — the route returns a real 404 below the
  // threshold, and listing a URL that 404s is a GSC error, the mirror of the
  // MEH-803 noindex rule above. The count comes from the SAME filtered endpoint
  // the page itself gates on, so sitemap and route cannot disagree.
  //
  // Fails OPEN (pages omitted) on any error: an absent sitemap entry costs
  // discovery latency, whereas a listed-but-404 URL is an indexing fault.
  let dietPages = [];
  try {
    const counts = await Promise.all(
      BACKED_DIET_PAGES.map((p) =>
        serverFetch(`${API_URL}/producers?${p.filterParam}=true&limit=1&offset=0`)
          .then((r) => (r.ok ? Number(r.headers.get("x-total-count") || 0) : 0))
          .catch(() => 0),
      ),
    );
    dietPages = BACKED_DIET_PAGES.flatMap((p, i) =>
      counts[i] >= DIET_PAGE_MIN
        ? localizeEntry(dietPagePath(p.slug), {
            lastModified: now,
            priority: 0.8,
            changeFrequency: "weekly",
          })
        : [],
    );
  } catch {
    // API unavailable during build — skip the diet pages.
  }

  // Event detail pages — only future events
  let eventPages = [];
  try {
    const res = await serverFetch(`${API_URL}/events`);
    if (res.ok) {
      const events = await res.json();
      eventPages = events.flatMap((e) =>
        localizeEntry(`/events/${e.id}`, {
          lastModified: now,
          priority: 0.7,
          changeFrequency: "weekly",
        }),
      );
    }
  } catch {
    // ignore
  }

  // MEH-2461: organizer pages are public (approved organizers only, via
  // GET /organizers) — listed under /organizers, never under /producers.
  let organizerPages = [];
  try {
    const res = await serverFetch(`${API_URL}/organizers`);
    if (res.ok) {
      const organizers = await res.json();
      organizerPages = organizers.flatMap((o) =>
        localizeEntry(`/organizers/${o.slug}`, {
          lastModified: now,
          priority: 0.6,
          changeFrequency: "weekly",
        }),
      );
    }
  } catch {
    // API unavailable during build — skip organizer pages.
  }

  // MEH-2478: experience detail pages. GET /experiences is the hub's own feed
  // and already returns only approved, upcoming, not-cancelled experiences of
  // an approved business (experiences.py _public_listing_query), so every id
  // it returns is listable — pending/hidden/past never reach this list.
  let experiencePages = [];
  try {
    const res = await serverFetch(`${API_URL}/experiences`);
    if (res.ok) {
      const experiences = await res.json();
      experiencePages = (Array.isArray(experiences) ? experiences : [])
        .filter((x) => x?.id)
        .flatMap((x) =>
          localizeEntry(`/experiences/${x.id}`, {
            lastModified: now,
            priority: 0.7,
            changeFrequency: "weekly",
          }),
        );
    }
  } catch {
    // API unavailable during build — skip experience pages.
  }

  // MEH-2478: group-buy detail pages. GET /group-buys returns status=open, but
  // nothing closes an open group buy when its deadline passes, so expired ones
  // are dropped here by the same rule the page's Offer availability uses.
  let groupBuyPages = [];
  try {
    const res = await serverFetch(`${API_URL}/group-buys`);
    if (res.ok) {
      const groupBuys = await res.json();
      groupBuyPages = (Array.isArray(groupBuys) ? groupBuys : [])
        .filter((g) => g?.id && isGroupBuyLive(g, now))
        .flatMap((g) =>
          localizeEntry(`/group-buys/${g.id}`, {
            lastModified: now,
            priority: 0.6,
            changeFrequency: "daily",
          }),
        );
    }
  } catch {
    // API unavailable during build — skip group-buy pages.
  }

  return [
    ...staticPages,
    ...producerIndexPages,
    ...dietPages,
    ...producerPages,
    ...recipePages,
    ...eventPages,
    ...organizerPages,
    ...experiencePages,
    ...groupBuyPages,
  ];
}
