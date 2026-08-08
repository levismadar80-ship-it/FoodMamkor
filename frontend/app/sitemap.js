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

export default async function sitemap() {
  const now = new Date();

  const staticDefs = [
    { path: "", priority: 1.0, changeFrequency: "daily" },
    { path: "/map", priority: 0.9, changeFrequency: "daily" },
    { path: "/events", priority: 0.8, changeFrequency: "daily" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    // MEH-875: secondary indexable landing routes (all under app/[locale]/).
    { path: "/experiences", priority: 0.8, changeFrequency: "daily" },
    { path: "/group-buys", priority: 0.8, changeFrequency: "daily" },
    { path: "/about/process", priority: 0.5, changeFrequency: "monthly" },
    { path: "/about/for-businesses", priority: 0.5, changeFrequency: "monthly" },
    // MEH-1289: reader-facing "why local" editorial page.
    { path: "/about/why-local", priority: 0.5, changeFrequency: "monthly" },
    { path: "/register/producer", priority: 0.7, changeFrequency: "monthly" },
    // MEH-803: /register, /login, /contact, /search intentionally NOT listed —
    // each page sets robots:{index:false} (MEH-641 auth chrome / MEH-658 utility
    // route), so emitting them here produced GSC "Submitted URL marked 'noindex'".
    // The sitemap lists indexable URLs only; the pages' noindex directives stay.
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  ];
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
    const res = await serverFetch(`${API_URL}/producers`);
    if (res.ok) {
      const producers = await res.json();
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
      const slugged = producers.filter((p) => p.slug);
      const recipeLists = await Promise.all(
        slugged.map((p) =>
          serverFetch(`${API_URL}/producers/${encodeURIComponent(p.slug)}/recipes`)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []),
        ),
      );
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

  return [
    ...staticPages,
    ...producerIndexPages,
    ...dietPages,
    ...producerPages,
    ...recipePages,
    ...eventPages,
  ];
}
