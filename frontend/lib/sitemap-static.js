// @ts-check
/**
 * Module:   sitemap-static
 * Purpose:  The fixed (non-data) pages the sitemap offers, in one list that
 *           app/sitemap.js emits and __tests__/PublicPageReachabilityGuard
 *           reads, so the guard tests the real list rather than a regex copy.
 * Does NOT: hold the supply-gated hubs (lib/listing-supply.js HUBS) or any
 *           data-driven family (businesses, recipes, organizers, diet and
 *           region pages) — those stay in app/sitemap.js.
 * History:  MEH-3265 (moved out of app/sitemap.js unchanged).
 */

/** @type {ReadonlyArray<{path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" | "yearly"}>} */
export const SITEMAP_STATIC_PAGES = Object.freeze([
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
  // MEH-2967: the business landing page (MEH-995). It was never listed, so
  // crawlers were offered only /register/producer, whose server HTML is a
  // loading placeholder.
  { path: "/join", priority: 0.7, changeFrequency: "monthly" },
  { path: "/join/pricing", priority: 0.5, changeFrequency: "monthly" },
  { path: "/register/producer", priority: 0.7, changeFrequency: "monthly" },
  // MEH-803: /register, /login, /contact intentionally NOT listed (/search
  // itself is gone — it 308s to /producers since MEH-819) —
  // each page sets robots:{index:false} (MEH-641 auth chrome / MEH-658 utility
  // route), so emitting them here produced GSC "Submitted URL marked 'noindex'".
  // The sitemap lists indexable URLs only; the pages' noindex directives stay.
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  // MEH-3177: indexable pages that were never offered.
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/accessibility", priority: 0.2, changeFrequency: "yearly" },
  { path: "/about/for-businesses/guides", priority: 0.4, changeFrequency: "monthly" },
  { path: "/about/for-businesses/guides/business-story", priority: 0.4, changeFrequency: "monthly" },
  { path: "/about/for-businesses/guides/customer-messages", priority: 0.4, changeFrequency: "monthly" },
  { path: "/about/for-businesses/guides/product-photography", priority: 0.4, changeFrequency: "monthly" },
]);
