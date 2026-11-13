/**
 * Module:   entity-registry
 * Purpose:  One list of the site's public entities (business, organizer,
 *           event, workshop, group buy, recipe, rescue bag) and, per entity,
 *           which shared building blocks its detail page uses — so a page
 *           cannot quietly re-implement one, and a block an entity lacks is
 *           written down with a reason instead of being discovered by a user.
 * Does NOT: render anything or hold copy. Enforcement lives in
 *           __tests__/EntityRegistryGuard.test.js.
 * Related:  lib/business-features.js (the same idea for business tools) ·
 *           docs/audits/2026-08-business-shape-matrix.md.
 * History:  MEH-2993 (creation, after three different contact-button builds
 *           were found for one set of fields — MEH-2990).
 *
 * How to read an entry:
 *   files   — the page's own code, relative to frontend/ (a directory is
 *             scanned recursively). The guard reads the imports in them.
 *   routes  — the app/[locale] route directories that render this entity.
 *   uses    — parts the page MUST import from the shared module.
 *   missing — parts the page should have and does not, with the reason / card.
 *             The guard fails when a "missing" part shows up (the entry is
 *             stale — move it to `uses`), so this list can only shrink.
 *   na      — parts that do not apply, with the reason.
 * Every part in PARTS appears exactly once in uses ∪ missing ∪ na.
 */

/** The shared module(s) that count as "using" each part. */
export const PARTS = {
  back: ["@/components/HistoryBackLink"],
  share: ["@/components/ShareButton"],
  save: ["@/components/SaveButton", "@/components/FavoriteButton"],
  owner: ["@/components/OwnerRow"],
  cover: ["@/components/EntityCover"],
  contact: ["@/lib/contact-method"],
};

export const ENTITIES = [
  {
    key: "business",
    routes: ["app/[locale]/producer/[id]", "app/[locale]/[slug]"],
    files: ["app/[locale]/producer/[id]"],
    uses: ["share", "save", "contact"],
    missing: {},
    na: {
      back: "removed on purpose (MEH-1146 chunk B): the breadcrumb and the back-to-map link cover it — decided again in MEH-3005",
      owner: "the business is the owner",
      cover: "own header with the photo gallery (ProducerHeader)",
    },
  },
  {
    key: "organizer",
    routes: ["app/[locale]/organizers/[slug]"],
    files: ["app/[locale]/organizers/[slug]"],
    uses: ["back", "contact", "share"],
    missing: {},
    na: {
      cover: "a profile masthead by design (photo + round initial, MEH-2547), not a copy of the item cover",
      owner: "the organizer is the owner",
      save: "saved items have no organizer type (backend SavedItem)",
    },
  },
  {
    key: "event",
    routes: ["app/[locale]/events/[id]"],
    files: ["app/[locale]/events/[id]"],
    uses: ["back", "share", "save", "cover"],
    missing: {},
    na: {
      // MEH-2989 (#4361): the bottom OwnerRow card repeated the byline, so it was removed on purpose.
      owner: "the byline under the title (event-byline) is the only owner link — MEH-2989",
      contact: "contact goes through the organizer/business page the byline links to",
    },
  },
  {
    key: "experience",
    routes: ["app/[locale]/experiences/[id]"],
    files: ["app/[locale]/experiences/[id]"],
    uses: ["back", "share", "save", "cover", "contact"],
    missing: {},
    na: {
      // MEH-2989 (#4361): same decision as the event page.
      owner: "the byline under the title (experience-byline) is the only owner link — MEH-2989",
    },
  },
  {
    key: "group_buy",
    routes: ["app/[locale]/group-buys/[id]"],
    files: ["app/[locale]/group-buys/[id]"],
    uses: ["back", "owner"],
    missing: {
      share: "own share button (MEH-2827); it runs the shared sequence in lib/share-link.js (MEH-2996) but is not the ShareButton component",
      save: "no save heart — MEH-2993 scan",
    },
    na: {
      cover: "header is the business photo with the deal on it, not an entity photo",
      contact: "joining is the action; contact is via the business OwnerRow",
    },
  },
  {
    key: "recipe",
    routes: ["app/[locale]/[slug]/recipes/[recipe_id]"],
    files: ["app/[locale]/[slug]/recipes/[recipe_id]", "components/public/RecipeDetail.jsx"],
    uses: ["back", "share", "save", "owner"],
    missing: {},
    na: {
      cover: "the recipe photo is the content, laid out by RecipeDetail",
      contact: "contact is on the business page the OwnerRow opens",
    },
  },
  {
    key: "rescue_bag",
    routes: [],
    files: [],
    uses: [],
    missing: {},
    na: {
      back: "no detail page — bags render inside the business page and /rescue",
      share: "no detail page",
      save: "no detail page",
      owner: "no detail page",
      cover: "no detail page",
      contact: "no detail page",
    },
  },
];

/** Dynamic public routes that are NOT an entity page, and why. */
export const NON_ENTITY_ROUTES = {
  "app/[locale]/claim/[token]": "one-time claim link",
  "app/[locale]/registration/[token]": "one-time registration-management link",
  "app/[locale]/p/[slug]": "redirect stub to /[slug] (MEH-2099)",
  "app/[locale]/producers/[category]/[region]": "listing page, not one entity",
  "app/[locale]/producers/diet/[dietSlug]": "listing page, not one entity",
};
