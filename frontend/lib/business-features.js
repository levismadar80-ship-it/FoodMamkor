/**
 * Module:   business-features
 * Purpose:  Single owner of the tools a business gets on mehamakor — what
 *           exists, which group it belongs to, and which file implements it.
 *           The new /join design renders from this (separate PR); nothing
 *           renders from it yet.
 * Touches:  nothing — pure data + pure helpers, no React, no fetch. The one
 *           runtime input is `isRescueEnabled()`, read through a thunk so this
 *           module stays importable without the env being set.
 * Does NOT: own the WORDS — every label, lead and tip lives in
 *           messages/{he,en}.json under `business_features`, read at render
 *           time (the lib/diet-pages + lib/chip-copy pattern). Does NOT decide
 *           who may USE a tool: the code and its flags do that, and this
 *           registry only says what exists and how it is described. Does NOT
 *           carry per-plan tiers — everything here is free.
 * Related:  lib/diet-pages.js and lib/category-registry.js (the pure-data
 *           module style this follows); lib/rescue.js:39 (rescueBagsEnabled);
 *           __tests__/BusinessFeaturesRegistry.test.js (the drift guard).
 * History:  MEH-2791 (creation, 2026-11-07).
 *
 * WHY A REGISTRY AND WHY IT IS TESTED AGAINST THE CODE.
 * GitLab consolidated the same kind of list into `data/features.yml` in 2017
 * and found it stale in audits in 2020 and again in 2025 — one tool listed
 * four times under different names, basic tools missing — because nothing
 * connected the list to the product. Their October 2026 rebuild added a check
 * that reconciles the registry against the app. That is what `codeRef` is for
 * here: every entry names a file that must exist, so an entry describing a
 * tool that has been removed fails CI instead of quietly going on selling it.
 *
 * A `codeRef` is evidence, not architecture: it is the file a reviewer should
 * open to confirm the tool is real. It is deliberately not exhaustive.
 */
// MEH-2791 cites this as `isRescueEnabled()` at rescue.js:40. The real export
// is `rescueBagsEnabled()` at rescue.js:39 — flagged in the PR rather than
// silently corrected, since the card's name does not exist.
import { rescueBagsEnabled } from "./rescue";

/**
 * Tab order on /join, locked. Grouped by what the BUSINESS wants, not by our
 * internal subsystems — the Toast "Bring guests in / Bring guests back"
 * shape. Sapir's GO, 07/11.
 */
export const BUSINESS_FEATURE_GROUPS = [
  "page",
  "found",
  "contact",
  "return",
  "trust",
  "insights",
];

/**
 * status:
 *   'live'       — shipped and reachable by a business today.
 *   'soon'       — committed, not yet reachable. Shown, marked as coming.
 *   'unverified' — Phase 0 could not find the implementing code. NEVER shown.
 *                  Kept in the list on purpose so it is visible to the next
 *                  reader instead of being silently dropped.
 *
 * flag: a thunk, not a boolean — the env is read at call time, so importing
 * this module never depends on env ordering.
 */
export const BUSINESS_FEATURES = [
  // ── page ────────────────────────────────────────────────────────────────
  { id: "gallery_story", group: "page", status: "live", tile: { icon: "Image" }, codeRef: ["frontend/app/[locale]/producer/[id]/components/OwnerCard.jsx", "frontend/components/ImageGallery.jsx"] },
  { id: "product_details", group: "page", status: "live", tile: { icon: "Tag" }, codeRef: ["frontend/components/ProductsSection.jsx", "frontend/components/public/ProductSheet.jsx"] },
  { id: "top_product", group: "page", status: "live", codeRef: ["frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx"] },
  { id: "hours", group: "page", status: "live", tile: { icon: "Clock" }, codeRef: ["frontend/lib/hours.js", "frontend/app/[locale]/producer/[id]/lib/order-status.js"] },
  { id: "vacation_mode", group: "page", status: "live", codeRef: ["frontend/app/[locale]/producer/[id]/components/ProducerHeader.jsx"] },
  { id: "map_precision", group: "page", status: "live", tip: true, codeRef: ["frontend/lib/producerPoints.js", "frontend/app/[locale]/producer/dashboard/edit/LocationsEditor.jsx"] },
  { id: "multi_locations", group: "page", status: "live", codeRef: ["frontend/app/[locale]/producer/dashboard/edit/LocationsEditor.jsx"] },
  { id: "draft_claim", group: "page", status: "live", tile: { icon: "PencilSimple" }, codeRef: ["backend/app/routers/producer_claim.py", "frontend/components/admin/ClaimLinkPanel.jsx"] },
  { id: "ai_writer", group: "page", status: "live", codeRef: ["backend/app/services/bio_generator.py"] },
  { id: "guides", group: "page", status: "live", codeRef: ["frontend/app/[locale]/about/for-businesses/guides/page.js"] },
  { id: "social_signup", group: "page", status: "live", codeRef: ["backend/app/routers/auth.py", "frontend/app/[locale]/register/RegisterClient.jsx"] },
  { id: "wa_approval", group: "page", status: "live", codeRef: ["backend/app/services/whatsapp_templates.py"] },
  { id: "onboarding_emails", group: "page", status: "live", codeRef: ["backend/app/services/pending_nudge.py"] },

  // ── found ───────────────────────────────────────────────────────────────
  { id: "vanity_link", group: "found", status: "live", tile: { icon: "LinkSimple" }, codeRef: ["frontend/app/[locale]/producer/dashboard/page.js"] },
  { id: "discovery", group: "found", status: "live", tile: { icon: "MapPin" }, codeRef: ["frontend/app/[locale]/producers/diet/[dietSlug]/page.js", "frontend/app/sitemap.js"] },
  { id: "similar_businesses", group: "found", status: "live", codeRef: ["frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx"] },
  { id: "share_cards", group: "found", status: "live", tile: { icon: "ShareNetwork" }, codeRef: ["frontend/components/StoryCardCanvas.jsx", "frontend/components/ReviewCardCanvas.jsx"] },
  // MEH-2791 said 'soon' "until MEH-2785 merges". It merged on 07/11 (PR
  // #4104), so this is live — see the PR body.
  { id: "qr_code", group: "found", status: "live", tile: { icon: "QrCode" }, codeRef: ["frontend/components/producer/BusinessQrCard.jsx", "frontend/lib/qr.js"], dashboard: { home: "tools", href: "/producer/dashboard/qr-card" } },
  { id: "structured_data", group: "found", status: "live", tip: true, codeRef: ["frontend/lib/seo.js"] },

  // ── contact ─────────────────────────────────────────────────────────────
  { id: "primary_cta", group: "contact", status: "live", tile: { icon: "ChatCircleText" }, codeRef: ["frontend/app/[locale]/producer/[id]/components/ContactCard.jsx", "frontend/app/[locale]/producer/[id]/components/StickyContactBar.jsx"] },
  { id: "wa_prefill", group: "contact", status: "live", tile: { icon: "PaperPlaneTilt" }, codeRef: ["frontend/app/[locale]/producer/[id]/components/ContactCard.jsx"] },
  { id: "product_wa", group: "contact", status: "live", codeRef: ["frontend/components/public/ProductSheet.jsx"] },
  { id: "faq_answers", group: "contact", status: "live", tip: true, codeRef: ["frontend/app/[locale]/producer/dashboard/edit/page.js", "frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx", "frontend/app/[locale]/producer/dashboard/edit/PaymentInfoEditor.jsx"] },
  { id: "delivery_areas", group: "contact", status: "live", codeRef: ["frontend/app/[locale]/producer/dashboard/edit/LocationsEditor.jsx", "frontend/lib/delivery-coverage.js"] },
  { id: "delivery_checker", group: "contact", status: "live", tile: { icon: "Truck" }, codeRef: ["frontend/components/DeliveryChecker.jsx"] },
  { id: "wa_group", group: "contact", status: "live", codeRef: ["frontend/app/[locale]/producer/[id]/components/ContactCard.jsx"] },
  { id: "nav_buttons", group: "contact", status: "live", tile: { icon: "NavigationArrow" }, codeRef: ["frontend/components/NavAppGlyphs.jsx"] },
  { id: "save_share", group: "contact", status: "live", codeRef: ["frontend/components/ShareButton.jsx", "frontend/app/[locale]/favorites/FavoritesClient.jsx"] },

  // ── return ──────────────────────────────────────────────────────────────
  { id: "offer", group: "return", status: "live", tip: true, codeRef: ["frontend/components/OfferBadge.jsx", "frontend/app/[locale]/producer/dashboard/edit/cards.jsx"] },
  { id: "group_buys", group: "return", status: "live", highlight: true, tip: true, tile: { icon: "UsersThree" }, codeRef: ["frontend/app/[locale]/group-buys/GroupBuysClient.jsx", "frontend/app/[locale]/producer/dashboard/group-buys"], dashboard: { home: "tools", href: "/producer/dashboard/group-buys" } },
  { id: "events", group: "return", status: "live", highlight: true, tile: { icon: "CalendarBlank" }, codeRef: ["frontend/app/[locale]/events/EventsClient.jsx", "frontend/app/[locale]/producer/dashboard/events"], dashboard: { home: "tools", href: "/producer/dashboard/events" } },
  // MEH-2885: experiences (hosted visits) — he copy approved word for word by Sapir 10/11.
  { id: "experiences", group: "return", status: "live", codeRef: ["frontend/app/[locale]/experiences/page.js", "frontend/app/[locale]/producer/dashboard/experiences/page.js"], dashboard: { home: "tools", href: "/producer/dashboard/experiences" } },
  { id: "recipes", group: "return", status: "live", highlight: true, tile: { icon: "CookingPot" }, codeRef: ["frontend/app/[locale]/[slug]/recipes/[recipe_id]/page.jsx", "backend/app/routers/producer_recipes.py"], dashboard: { home: "tools", href: "/producer/dashboard/recipes" } },
  { id: "follower_updates", group: "return", status: "live", codeRef: ["frontend/app/[locale]/producer/dashboard/insights/page.js"], dashboard: { home: "insights", href: "/producer/dashboard/insights" } },
  { id: "waitlist", group: "return", status: "live", codeRef: ["backend/app/services/delivery_waitlist.py", "frontend/components/DeliveryWaitlistForm.jsx"] },
  { id: "rescue_bags", group: "return", status: "live", highlight: true, tip: true, flag: () => rescueBagsEnabled(), tile: { icon: "ShoppingBag" }, codeRef: ["frontend/components/rescue/RescueSection.jsx", "frontend/lib/rescue.js"], dashboard: { home: "tools", href: "/producer/dashboard/rescue" } },

  // ── trust ───────────────────────────────────────────────────────────────
  { id: "verified_badge", group: "trust", status: "live", tile: { icon: "ShieldCheck" }, codeRef: ["frontend/lib/badges.js"] },
  { id: "kashrut_verified", group: "trust", status: "live", tile: { icon: "Certificate" }, codeRef: ["frontend/app/[locale]/admin/kashrut/page.js", "frontend/lib/badges.js"] },
  { id: "editor_pick", group: "trust", status: "live", tile: { icon: "Medal" }, codeRef: ["frontend/lib/featured-producer.js", "frontend/lib/badges.js"] },
  { id: "reservist_diet_tags", group: "trust", status: "live", codeRef: ["frontend/app/[locale]/producer/[id]/components/ReservistBadgeLine.jsx", "frontend/lib/badges.js"] },
  { id: "reviews_contacted", group: "trust", status: "live", tile: { icon: "Star" }, codeRef: ["backend/app/routers/reviews.py", "frontend/components/ReviewsSection.jsx", "frontend/app/[locale]/producer/dashboard/reviews/page.js"], dashboard: { home: "tools", href: "/producer/dashboard/reviews" } },
  { id: "review_request", group: "trust", status: "live", codeRef: ["frontend/components/producer/RequestReviewCard.jsx"] },

  // ── insights ────────────────────────────────────────────────────────────
  { id: "views", group: "insights", status: "live", tile: { icon: "Eye" }, codeRef: ["frontend/app/[locale]/producer/dashboard/insights/page.js", "backend/app/routers/producer_me.py"] },
  { id: "search_impressions", group: "insights", status: "live", codeRef: ["backend/app/routers/producer_me.py", "frontend/app/[locale]/producer/dashboard/insights/page.js"] },
  { id: "contact_clicks", group: "insights", status: "live", tile: { icon: "CursorClick" }, codeRef: ["backend/app/routers/producer_me.py", "frontend/app/[locale]/producer/dashboard/insights/page.js"] },
  { id: "favorites_rating", group: "insights", status: "live", codeRef: ["backend/app/routers/producer_me.py"] },
  { id: "top_cities", group: "insights", status: "live", tile: { icon: "MapPin" }, codeRef: ["backend/app/routers/producer_me.py", "frontend/app/[locale]/producer/dashboard/insights/page.js"] },
  { id: "demand_cities", group: "insights", status: "live", tile: { icon: "TrendUp" }, codeRef: ["frontend/app/[locale]/producer/dashboard/insights/page.js"] },
  { id: "drop_point_hosts", group: "insights", status: "live", tip: true, codeRef: ["frontend/app/[locale]/producer/dashboard/insights/page.js", "backend/app/services/delivery_waitlist.py"] },
  { id: "email_alerts", group: "insights", status: "live", codeRef: ["backend/app/services/email.py"] },
  { id: "completeness", group: "insights", status: "live", codeRef: ["frontend/lib/producer-completeness.js", "frontend/components/ProfileCompletenessCard.jsx"] },
];

/**
 * MEH-2885 — WHERE each tool lives in the owner dashboard. A tool with a page
 * under /producer/dashboard carries `dashboard: { home, href }` above: `home`
 * is the tab it hangs off («home» | «edit» | «insights» | «tools»), `href` its
 * landing page. __tests__/DashboardPlacementGuard.test.js checks, against the
 * real files, that every dashboard page is accounted for here, that every
 * entry's page has a link pointing at it, and that it is at most 2 taps from
 * the dashboard home (tab = 1, a link inside a tab = 2).
 *
 * Pages that are not one tool's landing page are listed here, each with why.
 */
export const DASHBOARD_FRAME_PAGES = {
  // The four tabs (DashboardLayoutClient.jsx TABS) — 1 tap, or 0 for home.
  "/producer/dashboard": "tab: overview (home)",
  "/producer/dashboard/edit": "tab: edit",
  "/producer/dashboard/insights": "tab: insights",
  "/producer/dashboard/tools": "tab: tools",
  // MEH-2884: redirect stub to insights, kept for old links.
  "/producer/dashboard/followers": "redirect → insights",
};

/** Forms and print views inside one tool — reached from the tool's own page. */
export const DASHBOARD_SUBPAGES = {
  "/producer/dashboard/events/new": "/producer/dashboard/events",
  "/producer/dashboard/events/[id]/edit": "/producer/dashboard/events",
  "/producer/dashboard/experiences/new": "/producer/dashboard/experiences",
  "/producer/dashboard/experiences/[id]/edit": "/producer/dashboard/experiences",
  "/producer/dashboard/recipes/[id]/edit": "/producer/dashboard/recipes",
  "/producer/dashboard/rescue/counter-card": "/producer/dashboard/rescue",
  // MEH-2916: a view of an existing surface (her own business page), not a new
  // tool — so a sub-page entry rather than a registry tool with its own copy.
  // Reached in 1 tap from anywhere in the dashboard: the «צפייה בדף» link in
  // the tab row points here while the business is unapproved.
  "/producer/dashboard/preview": "/producer/dashboard",
};

/**
 * A tool page with NO registry entry yet, and why. Same placement checks as
 * an entry (linked, ≤ 2 taps) — only the registry entry is missing. Adding one
 * is a launch-tier א׳ change: it needs approved he/en copy (workflow.md
 * «Launch tier»), so it is not invented here.
 */
export const DASHBOARD_PAGES_WITHOUT_ENTRY = {};

/** The four cards above the tabs. */
export const HIGHLIGHT_FEATURE_IDS = BUSINESS_FEATURES.filter((f) => f.highlight).map(
  (f) => f.id,
);

/**
 * What /join may render: live + soon, minus anything its flag turns off.
 * 'unverified' is never returned — an entry we cannot point at code for is not
 * something to promise a business.
 */
export function visibleBusinessFeatures() {
  return BUSINESS_FEATURES.filter((feature) => {
    if (feature.status !== "live" && feature.status !== "soon") return false;
    return feature.flag ? feature.flag() === true : true;
  });
}

/** The number in the total line. Derived — never write the count as copy. */
export function countVisibleBusinessFeatures() {
  return visibleBusinessFeatures().length;
}
