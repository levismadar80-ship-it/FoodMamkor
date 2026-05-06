// Dynamic sitemap (LAUNCH_CHECKLIST week 1 — SEO).
// Next.js App Router reads the default export and serves it at /sitemap.xml.
// SITE_URL + API_URL helpers are validated by Zod at build time (lib/env.js).
import { SITE_URL, API_URL } from "@/lib/env";

export default async function sitemap() {
  const now = new Date();

  const staticPages = [
    { url: `${SITE_URL}`, lastModified: now, priority: 1.0, changeFrequency: "daily" },
    { url: `${SITE_URL}/map`, lastModified: now, priority: 0.9, changeFrequency: "daily" },
    { url: `${SITE_URL}/events`, lastModified: now, priority: 0.8, changeFrequency: "daily" },
    { url: `${SITE_URL}/about`, lastModified: now, priority: 0.6, changeFrequency: "monthly" },
    { url: `${SITE_URL}/register/producer`, lastModified: now, priority: 0.7, changeFrequency: "monthly" },
    { url: `${SITE_URL}/register`, lastModified: now, priority: 0.5, changeFrequency: "monthly" },
    { url: `${SITE_URL}/login`, lastModified: now, priority: 0.3, changeFrequency: "monthly" },
    { url: `${SITE_URL}/terms`, lastModified: now, priority: 0.2, changeFrequency: "yearly" },
  ];

  // Producer pages — prefer slug URLs (SEO-friendly) when available.
  let producerPages = [];
  // MEH-23 — also emit /producers?page=1..N so Google can walk the
  // paginated index. 24 per page mirrors the SSR route.
  let producerIndexPages = [];
  try {
    const res = await fetch(`${API_URL}/producers`);
    if (res.ok) {
      const producers = await res.json();
      producerPages = producers.map((p) => ({
        url: p.slug ? `${SITE_URL}/${p.slug}` : `${SITE_URL}/producer/${p.id}`,
        lastModified: now,
        priority: 0.9,
        changeFrequency: "weekly",
      }));

      const PER_PAGE = 24;
      const totalPages = Math.max(1, Math.ceil(producers.length / PER_PAGE));
      for (let p = 1; p <= totalPages; p++) {
        producerIndexPages.push({
          url: p === 1 ? `${SITE_URL}/producers` : `${SITE_URL}/producers?page=${p}`,
          lastModified: now,
          priority: 0.8,
          changeFrequency: "daily",
        });
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
      eventPages = events.map((e) => ({
        url: `${SITE_URL}/events/${e.id}`,
        lastModified: now,
        priority: 0.7,
        changeFrequency: "weekly",
      }));
    }
  } catch {
    // ignore
  }

  return [...staticPages, ...producerIndexPages, ...producerPages, ...eventPages];
}
