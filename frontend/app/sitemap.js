// Dynamic sitemap (LAUNCH_CHECKLIST week 1 — SEO).
// Next.js App Router reads the default export and serves it at /sitemap.xml.
// SITE_URL + API_URL helpers are validated by Zod at build time (lib/env.js).
// MEH-476: emits one entry per locale (HE no prefix, EN /en prefix) with
// alternates.languages on every entry so Google reads <xhtml:link> hreflang
// inline; complements <head> hreflang from MEH-476 PR 2.
import { SITE_URL, API_URL } from "@/lib/env";
import { routing } from "@/i18n/routing";

// localePrefix is "as-needed": defaultLocale (he) has no prefix; others get /<locale>.
function urlForLocale(path, locale) {
  const base = locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`;
  return `${base}${path}`;
}

// Expands one logical path into one sitemap entry per locale. Every entry
// carries the full alternates.languages map so Next.js emits an <xhtml:link>
// per locale inside every <url> block.
function localizeEntry(path, meta) {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, urlForLocale(path, l)]),
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
    { path: "/register/producer", priority: 0.7, changeFrequency: "monthly" },
    { path: "/register", priority: 0.5, changeFrequency: "monthly" },
    { path: "/login", priority: 0.3, changeFrequency: "monthly" },
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
  try {
    const res = await fetch(`${API_URL}/producers`);
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
    }
  } catch {
    // API not available during build — skip dynamic pages
  }

  // Event detail pages — only future events
  let eventPages = [];
  try {
    const res = await fetch(`${API_URL}/events`);
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

  return [...staticPages, ...producerIndexPages, ...producerPages, ...eventPages];
}
