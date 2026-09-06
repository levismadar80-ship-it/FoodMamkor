/**
 * Module:   dashboard-edit-anchors
 * Purpose:  The deep-link registry for the producer dashboard's edit page —
 *           which card a URL hash means, where to scroll, and which accordion
 *           group to open.
 * Does NOT: render anything, and does not own the hub's completion count —
 *           GROUP_MEMBERS stays in page.js, because membership drives
 *           "{done}/{total}" and not every registered card is a step.
 * Related:  app/[locale]/producer/dashboard/edit/page.js (sole consumer),
 *           __tests__/DashboardEditAnchorRegistry.test.js (the guard)
 * History:  MEH-2262 (extracted from page.js so the registry can be asserted)
 *
 * THE INVARIANT, because it is not visible from any single map:
 *   the resolver reads the hash through ANCHOR_TO_KEY, looks the key up in
 *   KEY_TO_GROUP, and RETURNS EARLY when there is no group. A card missing
 *   from either map is unreachable by deep link — silently, with the card
 *   present in the DOM but `hidden` and the hub still on screen.
 *
 * Three cards each shipped missing from a DIFFERENT one of the three maps
 * (businessName, offer, specialHours), which is why this is a guarded
 * registry now and not three hand-edited object literals inside a 1200-line
 * client component.
 */

// MEH-1116: stable English anchor id per card → the page-local open-state key.
// The anchor ids are a public deep-link contract (#contact-channels …).
// Do not rename.
export const ANCHOR_TO_KEY = {
  // MEH-1872: business-name change-request card. Registered in BOTH maps —
  // this file's own note says a card added to the JSX without an entry renders
  // but is unreachable by anchor.
  "business-name": "businessName",
  bio: "bio",
  questions: "questions",
  "contact-channels": "contact",
  categories: "categories",
  // MEH-1258: license editor card (deep-linked from the "נשאר להשלים" banner).
  license: "license",
  // MEH-1167: kashrut-request card (badge request + cert photo + status).
  kashrut: "kashrut",
  images: "images",
  // MEH-2058: LocationsEditor's own anchorId — was unregistered while the
  // now-deleted LocationCard (anchor "location", singular) sat beside it as
  // the checklist deep-link target. Registering it keeps
  // ProfileCompletenessCard's "location" step CTA working.
  locations: "locations",
  products: "products",
  pricing: "pricing",
  delivery: "delivery",
  // MEH-2142: `hours` is gone from all four registries below. The
  // business-level opening-hours card was removed — store hours are a
  // per-location fact now, edited in LocationsEditor. A stale #hours deep link
  // (an old email, a bookmark) therefore falls through to the default group
  // rather than resolving to a card that no longer exists.
  "order-window": "orderWindow",
  // MEH-1335 chunk 3: owner-story editor (bio + photo behind the public
  // OwnerCard).
  "owner-story": "ownerStory",
  // MEH-1106 (PR #1621) alias anchors — ProfileCompletenessCard's checklist
  // steps deep-link #profile-* (it merged in parallel with wrapper-div ids);
  // under the accordion they resolve to the same cards, auto-expanded.
  "profile-contact": "contact",
  "profile-categories": "categories",
  "profile-images": "images",
  "profile-products": "products",
  // MEH-2262: `offer` (MEH-1823) and `special-hours` (MEH-2264) were each
  // registered in KEY_TO_ANCHOR and KEY_TO_GROUP but not here, so their deep
  // links resolved no key at all and the hub stayed on screen. Same silent
  // gap as `businessName` in KEY_TO_GROUP, one map over.
  offer: "offer",
  "special-hours": "specialHours",
};

// Canonical section id per open-state key — hash aliases above scroll to the
// section that actually carries the id attribute.
export const KEY_TO_ANCHOR = {
  businessName: "business-name",
  bio: "bio",
  // MEH-2262, found by the reviewer on the fix PR: the FOURTH instance of this
  // class, in the third distinct direction. "owner-story" is in ANCHOR_TO_KEY
  // and ownerStory is in KEY_TO_GROUP, so the deep link DID open the profile
  // group and the card — and then scrolled nowhere, because the resolver's
  // `getElementById(KEY_TO_ANCHOR[key])` (page.js:313) was
  // `getElementById(undefined)` and the optional chain swallowed the null.
  // Half-working is why nobody filed it. The element carries the id:
  // EditAccordionCard renders `id={anchorId}` (:143), mounted with
  // "owner-story" (page.js:855).
  ownerStory: "owner-story",
  questions: "questions",
  contact: "contact-channels",
  categories: "categories",
  license: "license",
  kashrut: "kashrut",
  images: "images",
  locations: "locations",
  products: "products",
  pricing: "pricing",
  delivery: "delivery",
  orderWindow: "order-window",
  // MEH-2264: sits directly under the order window it overrides.
  specialHours: "special-hours",
  // MEH-1823: registered here so #offer deep-links resolve like every other
  // card. These three maps are a guarded registry — a card added to the JSX
  // without an entry renders but is unreachable by anchor, which is the
  // silent-gap class .claude/rules/testing.md documents for path registries.
  offer: "offer",
};

// Card key → its group. Drives anchor→group deep-link resolution and the hub
// status/next-step aggregation. license/kashrut both live in the trust group
// (rendered as one card — see OPEN_KEY_FOR).
export const KEY_TO_GROUP = {
  images: "profile",
  categories: "profile",
  bio: "profile",
  products: "profile",
  pricing: "profile",
  ownerStory: "profile",
  // MEH-2262: the MEH-1872 business-name card had an ANCHOR_TO_KEY entry but
  // no group, so the resolver returned early and #business-name never opened
  // it. Deliberately NOT a GROUP_MEMBERS entry — a rename request is not a
  // profile completion step, the same reasoning orderWindow and offer carry.
  businessName: "profile",
  license: "trust",
  kashrut: "trust",
  // MEH-2058: not a GROUP_MEMBERS entry (LocationsEditor was never part of
  // the hub's "{done}/{total}" count, before or after this chunk) — only
  // registered here so a #locations deep link resolves to the right group.
  locations: "location",
  delivery: "location",
  orderWindow: "location",
  // MEH-2264: same group as the order window it overrides; NOT a
  // GROUP_MEMBERS entry, for exactly orderWindow's reason above.
  specialHours: "location",
  // MEH-1823: the offer lives in the location group — it is read against the
  // delivery terms above it. Deliberately NOT added to GROUP_MEMBERS below,
  // for the same reason orderWindow isn't: membership drives the hub's
  // "{done}/{total}", and an opt-in field would show every existing business
  // as 2/4 instead of 2/3 and nudge them into running promotions nobody asked
  // for — the GBP-staleness risk that note already cites.
  offer: "location",
  contact: "contact",
  questions: "contact",
};

// The accordion open-state key a card key maps to. The trust group renders ONE
// accordion card (anchorId "trust") composing the license + kashrut bodies, so
// both card keys open that single card; scroll still targets the inner
// #license / #kashrut sub-section (KEY_TO_ANCHOR unchanged).
export const OPEN_KEY_FOR = (key) =>
  key === "license" || key === "kashrut" ? "trust" : key;
