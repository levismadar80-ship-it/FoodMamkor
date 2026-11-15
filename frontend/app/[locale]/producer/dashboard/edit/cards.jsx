"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards
 * Purpose:  The self-service editor cards for the producer edit tab —
 *           categories, gallery images, map location, and the description
 *           card (hero description + tagline + AI writing assist).
 *           Extracted VERBATIM from edit/page.js (MEH-1119, MEH-1157).
 * Does NOT: host the page shell, fetch, or the other cards (questions /
 *           contact channels) — those stay in edit/page.js.
 * Related:  app/[locale]/producer/dashboard/edit/page.js (imports these);
 *           __tests__/EditTab{Categories,Images,Location,DescriptionCard}*.test.jsx.
 * History:  MEH-3152 — each card moved to its own file under ./cards/; this
 *           file is now only the list of exports, so every existing import
 *           of "edit/cards" keeps working. A NEW card goes in its own file
 *           there and gets one line here.
 *           MEH-1119 — a non-Page `export` in edit/page.js broke the Next Page
 *           type contract under `next build --webpack`; moving the three
 *           test-exported cards here keeps the page file's export surface valid.
 *           MEH-1157 — BioPanelCard relocated here (same test-export reason)
 *           + generate() errors split by cause (401 / 429 / fail-open empty).
 *           MEH-1173 — BioPanelCard → DescriptionCard: Shopify-Magic redesign,
 *           structured 3-question assist replaces the Instagram scrape.
 */

export { ViewOnPageLink } from "./cards/ViewOnPageLink";
export { CategoriesCard } from "./cards/CategoriesCard";
export { ImagesCard } from "./cards/ImagesCard";
export { DescriptionCard } from "./cards/DescriptionCard";
export { OwnerStoryCard } from "./cards/OwnerStoryCard";
export { PricingCard } from "./cards/PricingCard";
export { LicenseCard } from "./cards/LicenseCard";
export { KashrutCard } from "./cards/KashrutCard";
export { DeliveryCard } from "./cards/DeliveryCard";
export { OffersCard } from "./cards/OffersCard";
export { BusinessNameCard } from "./cards/BusinessNameCard";
