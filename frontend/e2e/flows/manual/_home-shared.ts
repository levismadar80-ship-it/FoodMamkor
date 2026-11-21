// MEH-3540: fixtures and helpers shared by the home*.spec.ts parts, moved
// here verbatim from the former home.spec.ts (only `export` was added).
import type { BrowserContext, Locator, Route, TestInfo } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import { layoutSettled } from "../_layout-settled";
import he from "../../../messages/he.json";
import en from "../../../messages/en.json";
// The app libs below are plain JS (the app is JS + JSDoc); tsconfig.e2e has no
// allowJs, so each import is TS7016 — the same shape as
// e2e/flows/manual/producers.spec.ts (chunk 5) and manual/map.spec.ts (chunk 6).
// Suppressed per line, not globally.
// @ts-expect-error TS7016 — generated zod module, no .d.ts (one line: a multi-line
// import puts the specifier past the directive's reach, so it reads as unused)
import { ListCategoriesCategoriesGetResponse, ListProducersProducersGetResponse, GetStatsStatsGetResponse } from "../../../lib/generated/api.zod.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { ProducersResponseSchema } from "../../../lib/schemas.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { CategoriesResponseSchema, StatsSchema } from "../../../lib/api-responses.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { FILTER_AXES, homeParamFor } from "../../../lib/filter-taxonomy.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { CHIPS_CONFIG } from "../../../lib/producer-filters.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { SERVICE_CHIP_KEYS } from "../../../lib/map-chips.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { DELIVERY_DAYS } from "../../../lib/delivery-days.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { ORDER_DAY_KEYS } from "../../../lib/orderWindow.js";
// @ts-expect-error TS7016 — JS data module, no .d.ts
import { REGIONS } from "../../../data/regions.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { CATEGORY_CARDS } from "../../../lib/home-categories.js";

// MEH-2308: the chat launcher's accessible name is its visible pill text on a
// first desktop visit and the aria-label once it is icon-only — match either.
const reEscChat = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const CHAT_LAUNCHER_NAME = new RegExp(
  `^(${reEscChat(he.chat.launcher_open_label)}|${reEscChat(he.chat.launcher_pill)})$`,
);

/**
 * Spec:     manual/home
 * Purpose:  docs/MANUAL_TESTING.md — the `/` (home) page group, converted under
 *           MEH-1249 stage 2 (chunk 7 — one page per PR). Twenty-one sections,
 *           184 items (both counts DERIVED from the document, not copied from
 *           docs/qa/conversion-page-map.md — they agree).
 *
 * Section keys — every test carries `// MT:<key>:<row>`, where <row> is the
 * item's 1-based position under its `##` heading in MANUAL_TESTING.md:
 *
 *   2197   MEH-2197 + MEH-2198 — מצב אפס של סינון-יום (27/08)
 *   1800   MEH-1800 — מחרוזות ה-placeholder בשדה החיפוש (31/07)
 *   1309   MEH-1309 — כפתור "חזרה לראש העמוד" צף (18/07)
 *   1418   MEH-1418 — צ'יפי toggle: אייקונים + שורות הסבר ב-FilterSheet (21/07)
 *   1269   MEH-1269 — "קרוב אליי" בבית = גאו אמיתי + צ'יפ סינון נראה (17/07)
 *   1224   MEH-1224 — רצועת כיתוב מתחת לתמונה + זום ב-hover
 *   1174   MEH-1174 — seam גילוי בבית
 *   1142   MEH-1142 — יישור גבהי כרטיסים ב-grids
 *   1085   MEH-1085 — empty state מודע-סיבה בבית
 *   ODB    Overnight design batch 2026-06-12/13 (PRs #1073–#1080)
 *   FRI    Friday-strip i18n fix (סרגל שישי)
 *   788    MEH-788 — hero דף הבית: תמונת תוצרת + Ken Burns
 *   607    Stats counter reframe + skeleton (MEH-607)
 *   604    HomepageMiniMap above the fold (MEH-604)
 *   CCI    Category card images — dairy + care          (0 converted — STALE)
 *   IOS    iOS Safari parallax verification             (0 converted — DEVICE-ONLY)
 *   T9     Producer cards — 2-column mobile grid (task 9)
 *   T13    Recently viewed businesses (task 13)
 *   T12    Advanced filter chips — homepage + /map (task 12)
 *   T11    "קרוב אלי" geolocation button on homepage (task 11)
 *   MEH-99 Smart Search — HeroSearch + /producers?q= (MEH-99, PR #199)
 *
 * Touches:  `/` and `/en` only, plus `/producers` ONCE as the same-component
 *           control for the floating back-to-top button (MT:1309:5) — the same
 *           cross-route-control shape chunk 6 used when it loaded `/` to prove
 *           the chat FAB's absence on `/map`. No auth, no writes.
 *
 * Data:     Phase 0 (04/09): `app/[locale]/page.js:39-55` SSR-fetches
 *           `/producers` + `/categories` and is FAIL-OPEN (`catch → null`), and
 *           `use-home-page.js` then client-fetches both plus `/stats`, every one
 *           of them `.catch()`-swallowed. Measured against a backend-less
 *           `next start` in the CC sandbox: the whole page renders — hero,
 *           mini-map, trust band, category grid, the producers section with its
 *           `empty-generic` block, (until MEH-2441) how-it-works and the comparison teaser, and the
 *           closing CTA. So every copy / geometry / order row below runs against
 *           the REAL page with no interception at all.
 *
 *           The data-dependent rows INTERCEPT four client endpoints —
 *           `GET /api/producers` (incl. its `/{id}` form for recently-viewed),
 *           `GET /api/categories`, `GET /api/stats`, `GET /api/search` (+ a
 *           `/api/search/trending` stub kept only to prove it is never asked
 *           for, MEH-3257).
 *
 *           ⚠️ `page.route` CANNOT REACH THE FIRST PAINT, and this paragraph
 *           used to claim the opposite ("the intercept is what keeps … all of
 *           it deterministic in both worlds"). That was false, and it is what
 *           reddened six rows on CI run 33919310192 while the same six passed
 *           locally. `app/[locale]/page.js:39-55` SSR-fetches `/producers` +
 *           `/categories` from the SERVER, which no browser-side route handler
 *           observes — and `lib/use-home-page.js` then SKIPS the client fetch
 *           the intercept would have answered:
 *             · categories — `:265`, `if (!initialCategories)`, unconditional;
 *             · producers  — `:287`, `serverCoversThisLoad`, whenever the URL
 *               carries no `category` / `city` / `day` / chip param.
 *           The CC sandbox has no backend, so both SSR fetches fail soft to
 *           `null`, the page client-fetches, and the fixture governs. CI sets
 *           `NEXT_PUBLIC_API_URL` to the live Railway staging backend
 *           (`e2e.yml:142`), so the SSR fetch SUCCEEDS and the page renders the
 *           BACKEND's catalog with the fixture entirely inert. Measured both
 *           ways: a `?category=` load requests `/api/producers` once, a
 *           param-less load requests it zero times, and `/api/categories` is
 *           requested zero times either way once the server has seeded it.
 *
 *           `gotoFixtureFeed` is the answer to the producers half and
 *           `activeCategoryFixture` to the categories half — both below, each
 *           carrying the reasoning at its definition. Same constraint
 *           `e2e/visual/parity.spec.ts:679` documents for `/[slug]`'s
 *           `initialProducer` and `e2e/visual/badge-overflow-collision.spec.ts:31`
 *           for `/producers`; home joined that list when MEH-1832 gave it an
 *           SSR first paint.
 *
 * Stubs:    Two INCIDENTAL calls are stubbed (not mocks — removing them changes
 *           nothing about what is asserted): OpenStreetMap tiles for the
 *           above-the-fold mini-map (→ 204) and Cloudinary via
 *           `_cloudinary-stub`. Taxonomy: e2e/CLAUDE.md § stub-vs-mock.
 *
 * ── MEH-1968 three-condition mock exception (e2e/CLAUDE.md), stated ────────
 *   1. MECHANICAL. No backend behaviour is asserted anywhere in this file.
 *      Every intercepted row is a frontend state machine: which heading the
 *      category id selects, which applied-filter tags render, which of the
 *      THREE mutually-exclusive zero states the grid picks, which query params
 *      the page sends, what the counter says for N shown of M. "Did the backend
 *      filter / geo-sort / search correctly" is tests/test_api.py +
 *      tests/test_search.py + tests/test_meh986_kosher_verified.py and is
 *      CITED, never re-asserted.
 *   2. MECHANICAL. The contract is generated and pinned: every fixture is
 *      `.parse`d in `beforeAll` against the generated response models
 *      (`ListProducersProducersGetResponse` / `ListCategoriesCategoriesGetResponse`
 *      / `GetStatsStatsGetResponse`) AND against the app-side schemas the page
 *      itself validates with (`ProducersResponseSchema` / `CategoriesResponseSchema`
 *      / `StatsSchema`, lib/schemas.js + lib/api-responses.js), so a response-model
 *      change reds THIS spec instead of drifting silently.
 *   3. ARGUED, not mechanical — flagged here and in the PR body. The unmocked
 *      alternative needs a shared catalog state no seed provides: a city whose
 *      businesses deliver on a KNOWN day set and NOT on another (the whole
 *      MEH-2197 zero-state matrix), a business with a `delivery_areas` row for
 *      the filter city carrying a null `delivery_day` (the "בתיאום מראש"
 *      caption), a business in the same REGION with no row for the city at all
 *      (the caption-absence row, which is the one that must stay silent), and a
 *      producer count either side of the MEH-1692 trust threshold. These fall
 *      under the SAME pending ruling as chunks 5 and 6's intercepts (the
 *      MEH-1968 policy card). Sapir decides.
 *   This is a MOCK where it hides the subject (removing it removes the row),
 *   not a stub.
 *
 * Locators: `getByTestId` first (docs/E2E-LOCATORS.md). Existing ids used:
 *           `hero-search` · `hero-search-submit` · `hero-search-dropdown` ·
 *           `hero-search-history` · `hero-chips-row` · `hero-delivery-cta` ·
 *           `trust-lead` · `trust-count` · `trust-count-value` · `trust-count-skeleton` · `home-filter-row` ·
 *           `home-promoted-chip-<key>` · `home-filters-button` ·
 *           `home-active-filter-<key>` · `location-filter-chip` ·
 *           `geo-empty-notice` · `producers-counter` · `day-empty-suggestion` ·
 *           `region-fallback` · `fallback-day-caption` · `empty-generic` ·
 *           `producer-card` · `location-line` · `chip-<key>` ·
 *           `chip-info-<key>` · `friday-delivery-strip` · `cookie-banner` ·
 *           `bottom-nav`. Added under this chunk (ATTRIBUTE-ONLY, zero
 *           behaviour change) — the file:line list is in the PR body.
 *
 * Copy:     every expected string is read from messages/he.json (en.json for
 *           `/en`) or from the lib that owns it (FILTER_AXES labels,
 *           DELIVERY_DAYS week order, REGIONS names, CATEGORY_CARDS names), so
 *           a copy edit moves the expectation instead of reddening the spec.
 *           The only literals are fixture data (ids, business names, cities) and
 *           three DENY-lists, which cannot be derived from the copy they forbid:
 *           `STALE_VERIFIED_LABEL`, `PLACEHOLDER_DENY` and `I18N_KEY_PATH`.
 *
 * Does NOT: convert 93 of the 184 items (91 are converted — the count is derived
 *           from the MT anchors in this file, not stated). Full per-row reasons live in
 *           docs/qa/conversion-progress.md; the classes are — 26 STALE (the
 *           whole `Category card images` section, 9 of the 14 task-11 rows, 9 of
 *           the 17 task-9 rows, …), 12 COVERED and cited (HomeEmptyStateCauseAware
 *           .test.jsx, EventsUrlSync.test.jsx, ProducersClientCategoryAxis.test.jsx,
 *           attributeLabels/mapChips.test.js, BadgeRow.test.jsx:105-131,
 *           ProducerCard.test.jsx:211-221, HomeCategoryGridLinks.test.jsx:41-58,
 *           e2e/flows/02-search-producer.spec.ts:4-27,
 *           e2e/flows/17-producers-search.spec.ts:22-65,
 *           frontend/__tests__/highlightMatch.test.jsx), 7 DEVICE-ONLY (the whole
 *           iOS-Safari section), 5 CONVERT-PYTEST (backend LIKE-escaping and the
 *           /search limiter — not PW rows), and the remainder re-homed to another
 *           chunk's page (`/favorites`, `/events`, `/map`, `/producer/[id]`,
 *           `/experiences`) or residual (paint-only, perf-profile, subjective).
 *
 * Related:  frontend/__tests__/HomeEmptyStateCauseAware.test.jsx ·
 *           HomePromotedFilters.test.jsx · HomeCategoryGridLinks.test.jsx ·
 *           useHomePageDietChipsUrl.test.jsx · ProducerCard.test.jsx ·
 *           BadgeRow.test.jsx · e2e/flows/02-search-producer.spec.ts ·
 *           e2e/flows/27-delivery-day-discoverability.spec.ts ·
 *           docs/qa/conversion-page-map.md · docs/qa/manual-testing-matrix.md.
 * History:  MEH-1249 chunk 7 (creation, 04/09).
 */

export const FIRST_PAINT = { timeout: 15_000 };

// MEH-1792 (re-measured 2026-09-04 on chunks 1, 2 and 6): during the app's
// page-transition window a second copy of the page tree exists briefly OUTSIDE
// `#main-content`, so a page-wide `getByTestId` can resolve to TWO elements and
// fail strict mode ("resolved to 2 elements … unexpected value hidden"). Scoping
// every locator to the `#main-content` landmark (layout.js:254) names the live
// tree only. Same fix as e2e/flows/27-delivery-day-discoverability.spec.ts:73.
// Deliberately NOT `.first()`: a real permanent double-mount must still fail.
export const scope = (page: Page) => page.locator("#main-content");

// Project identity, never a count of what rendered (testing.md: a guard that
// consults its own subject turns "the thing is gone" into "nothing to check").
export const isDesktop = (info: TestInfo) => info.project.name === "desktop";
export const desktopOnly = (info: TestInfo, why: string) => test.skip(!isDesktop(info), why);
export const mobileOnly = (info: TestInfo, why: string) => test.skip(isDesktop(info), why);

// ── copy ────────────────────────────────────────────────────────────────────
export const HERO = he.home.hero;
export const SEARCH_PH = he.home.search.placeholders;
export const HERO_SEARCH = he.search.hero;
export const PROD = he.home.producers;
export const CATS_COPY = he.home.categories;
export const CTA = he.home.cta;
export const RECENT = he.home.recent;
export const TRUST = he.home.trust;
export const FILTERS_BTN = he.filters.button;
export const LOC_MODAL = he.modals.location;
export const FRIDAY_HE = he.group_buys.friday_delivery;
export const FRIDAY_EN = en.group_buys.friday_delivery;

export type Axis = { key: string; label: string; subtext?: string | null; group?: string; scope?: string };
// MEH-2748: the taxonomy holds keys only; the Hebrew label/subtext are read from
// the same he.json the app renders (`filter_axes.<key>`).
const AXIS_COPY = he.filter_axes as Record<string, { label: string; subtext?: string }>;
export const AXES = Object.fromEntries(
  Object.entries(FILTER_AXES as Record<string, object>).map(([key, axis]) => [
    key,
    { key, ...axis, label: AXIS_COPY[key].label, subtext: AXIS_COPY[key].subtext ?? null },
  ]),
) as Record<string, Axis>;
export type Chip = { key: string; label: string };
export const HOME_CHIPS = (CHIPS_CONFIG as { key: string }[]).map((c) => ({ ...c, label: AXIS_COPY[c.key].label })) as Chip[];

// MEH-2598: home promotes the shared service trio «משלוח · איסוף עצמי · קנייה
// במקום» out of CHIPS_CONFIG and files the rest — «מאומת» included — behind the
// sheet (HomeProducersGrid.jsx:43 PROMOTED_KEYS = SERVICE_CHIP_KEYS). It
// replaced MEH-2173's «מאומת» + «משלוח» pair. Read from the product constant so
// the order (PromotedServiceChips renders in SERVICE_CHIP_KEYS order) is too.
export const PROMOTED = SERVICE_CHIP_KEYS as readonly string[];

// DENY-lists — the three expectations that cannot be derived from the copy they
// forbid, so they are literals on purpose (same shape as chunk 2's
// HERO_FEES_VOCAB).
/** MT:1418:2 — the pre-MEH-1418 verification label that must not come back. */
export const STALE_VERIFIED_LABEL = "מאומתים";
/** MT:1800:4 — the known-broken query that must not return to the placeholder pool. */
export const PLACEHOLDER_DENY = "גבינת עיזים";
/** MT:FRI:1 — an untranslated key path rendering instead of its string. */
export const I18N_KEY_PATH = /group_buys\.friday_delivery/;

// ── fixtures ────────────────────────────────────────────────────────────────
// Categories carry the FIRST TWO names lib/home-categories.js declares, so the
// category grid resolves real ids for its two hero cards (MEH-1080: a card whose
// id does not resolve renders inert, with no link) and the MT:1174 heading rows
// have a category to select. Names come from CATEGORY_CARDS, not from literals.
export type CategoryCard = { key: string; name: string; image?: string };
export const CARDS = CATEGORY_CARDS as CategoryCard[];
export const CAT_A = { id: 101, name: CARDS[0].name, requires_license: false };
const CAT_B = { id: 102, name: CARDS[1].name, requires_license: false };
/** A category id no fixture business carries — the MT:1085 zero-result branch. */
export const CAT_EMPTY = { id: 199, name: "קטגוריה ריקה", requires_license: false };
export const CATEGORIES = [CAT_A, CAT_B, CAT_EMPTY];

// The delivery city + the region that contains it, both read from data/regions.js
// rather than written down, so a regions edit moves the fixture with it.
export type Region = { key: string; name: string; cities: string[] };
export const REGION = (REGIONS as Region[])[0];
export const CITY = REGION.cities[0];
export const CITY_SIBLING = REGION.cities[1];
/** Sunday + Wednesday, declared OUT of week order so the "week order" row discriminates. */
export const DAYS_OUT_OF_ORDER = [DELIVERY_DAYS[3], DELIVERY_DAYS[0]] as [string, string];
export const DAYS_IN_ORDER = [DELIVERY_DAYS[0], DELIVERY_DAYS[3]] as [string, string];
/** A day no fixture business delivers on — the MEH-2197 day-zero trigger. */
export const DAY_NOBODY = DELIVERY_DAYS[5];

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export type DeliveryArea = { id: string; city: string; delivery_day?: string | null };
export type Producer = Record<string, unknown> & {
  id: string;
  name: string;
  city: string;
  slug: string;
  delivery_areas: DeliveryArea[];
};

export function producer(
  n: number,
  name: string,
  cat: { id: number; name: string } | null,
  extra: Record<string, unknown> = {},
): Producer {
  return {
    id: uuid(n),
    slug: `fixture-${n}`,
    name,
    city: CITY,
    status: "approved",
    categories: cat ? [cat] : [],
    images: [],
    delivery_areas: [],
    delivers: true,
    // MEH-1934 / MEH-2170: `no_added_sugar` is a RUNTIME-GATED axis — the sheet
    // withholds it until at least DIET_CHIP_MIN (5) loaded businesses declare it
    // (producer-filters.js visibleGatedDietKeys). Every fixture row declares the
    // diet flags so the sheet offers the full home axis set; the beforeAll block
    // asserts the census, so a gate change fails there rather than half-way
    // through a test that reads as an assertion about labels.
    has_vegan_products: true,
    has_vegetarian_products: true,
    has_gluten_free_products: true,
    has_lactose_free_products: true,
    has_no_added_sugar_products: true,
    // MEH-2598: `on_site` is gated the same way (GATED_DIET_KEYS, counted on
    // `sells_on_site`) — and it is PROMOTED, so the gate decides whether the
    // promoted row is two chips or three. Declared on every row so the row is
    // the full trio and the sheet the full home axis set; censused in beforeAll.
    sells_on_site: true,
    // MEH-2767: `grass_fed` reached home and is count-gated like the diet
    // axes, so every row declares it; censused in beforeAll.
    grass_fed: true,
    // MEH-2131: `open_for_orders_now` is the OTHER runtime-gated axis — the sheet
    // withholds it below OPEN_NOW_CHIP_MIN (5) declared windows, and again when
    // no business is open at the current clock. An all-week 00:00-23:59 window on
    // every row satisfies both for 1,439 minutes a day. NOT the last one: close
    // is exclusive (orderWindow.js `minutes < r.closeMin`), so at 23:59 Israel
    // every row reads closed and the chip leaves the DOM — the 21:59 UTC red on
    // PR #4811. A test that asserts this chip freezes the clock (MEH-2767).
    // Day keys come from lib/orderWindow.js, not from literals.
    order_window: Object.fromEntries(
      (ORDER_DAY_KEYS as string[]).map((d) => [d, [{ open: "00:00", close: "23:59" }]]),
    ),
    verification_tier: "declared",
    avg_rating: 0,
    reviews_count: 0,
    ...extra,
  } as Producer;
}
const area = (n: number, city: string, day: string | null): DeliveryArea => ({
  id: uuid(500 + n),
  city,
  delivery_day: day,
});

// Ten businesses so the grid overflows PAGE_SIZE (8, use-home-page.js:48) and
// the "load more" button exists — MT:T12:20 needs it, and a 10-row feed also
// makes the counter's "8 of 10" first state assertable.
export const P1 = producer(1, "מחלבת הגבעה", CAT_A, {
  verification_tier: "verified",
  verified_at: "2026-01-01",
  delivery_areas: [area(1, CITY, DAYS_OUT_OF_ORDER[0]), area(2, CITY, DAYS_OUT_OF_ORDER[1])],
});
export const P2 = producer(2, "קצביית השכונה", CAT_A, {
  // A row for the city with NO day = "by arrangement" (MT:2197:6).
  delivery_areas: [area(3, CITY, null)],
});
export const P3 = producer(3, "עסק ארצי ללא שורת עיר", CAT_B, {
  // NO delivery_areas row for CITY at all — MT:2197:7, the caption that must
  // NOT be invented. It still reaches the region grid via its sibling city.
  city: CITY_SIBLING,
  delivery_areas: [area(4, CITY_SIBLING, DELIVERY_DAYS[1])],
});
const P4 = producer(4, "גבינות הנגב", CAT_B, { delivers: false });
const LONG_NAME = "חוות השקמה של משפחת אברהמי מרחובות והסביבה הקרובה מאוד";
export const P5 = producer(5, LONG_NAME, CAT_B, {
  // Deliberately far past any card width at either project (measured: the inner
  // clipping span is 224px on desktop, 141px on mobile), so the clip is real and
  // not a coin-flip against the font metrics.
  city: "עיר ארוכה מאוד מאוד מאוד עם שם שאין לו שום סוף בכלל בשום מצב ובשום תנאי שהוא",
  // A photo, so the card renders an <img> rather than the leaf placeholder —
  // MT:T9:9 asserts `object-fit`. Cloudinary delivery is stubbed suite-wide
  // (_cloudinary-stub), so no bandwidth is spent.
  images: ["https://res.cloudinary.com/dfzpscjks/image/upload/fixture/long-name.jpg"],
  short_description: "תיאור ארוך מאוד של בית העסק שנועד לבדוק את קיצור השורה בכרטיס",
});
// MEH-1508 chunk 3ב-2: one row declares both `*_scope === "all"`. Since
// MEH-2677 that pair is a card badge only (no sheet pill), so this row is what
// makes the sheet's "no whole-business pill" assertion discriminate.
const SCOPE_ALL_DECLARED = { vegan_scope: "all", vegetarian_scope: "all" };
const REST = [6, 7, 8, 9, 10].map((n) =>
  producer(n, `עסק לדוגמה ${n}`, CAT_B, n === 6 ? SCOPE_ALL_DECLARED : {}),
);
export const PRODUCERS: Producer[] = [P1, P2, P3, P4, P5, ...REST];
export const PAGE_SIZE = 8; // use-home-page.js:48
export const CAT_A_MEMBERS = PRODUCERS.filter(
  (p) => (p.categories as Array<{ id: number }>)[0]?.id === CAT_A.id,
);

/** The MEH-2197 region-fallback set: the businesses that reach the REGION when the city+day query returns nothing. */
export const REGION_FALLBACK = [P1, P2, P3];

/**
 * The DEFAULT feed: it honours `?category=` the way the backend does, so a
 * category deep-link narrows the grid instead of returning the whole catalog.
 * Written as a function rather than a constant on purpose — a fixture that
 * ignores the filter it is being asked about is a green with two causes.
 */
const categoryAwareFeed = (u: URL): Producer[] => {
  const cat = u.searchParams.get("category");
  if (!cat) return PRODUCERS;
  return PRODUCERS.filter((p) => String((p.categories as Array<{ id: number }>)[0]?.id) === cat);
};

/**
 * `categoryAwareFeed`, keyed on the id the seam is ACTUALLY being driven with
 * rather than on the fixture's own `CAT_A.id` — see `activeCategoryFixture`,
 * which explains why those two are not always the same number.
 *
 * It still discriminates, which is the property `categoryAwareFeed`'s own
 * comment is about: any OTHER category yields nothing, so a page that ignored
 * the filter would show 10 cards where 2 are asserted and fail.
 */
export const feedForCategory =
  (id: string) =>
  (u: URL): Producer[] => {
    const cat = u.searchParams.get("category");
    if (!cat) return PRODUCERS;
    return cat === id ? CAT_A_MEMBERS : [];
  };

export const STATS_ABOVE = { producers_count: PRODUCERS.length, categories_count: CATEGORIES.length };
// MEH-2804 follow-up: at/above TRUST_COUNT_THRESHOLD (25, use-home-page.js) so the
// band's count line renders. /stats is mocked on its own — it does not have to
// match the length of the producers fixture.
export const STATS_COUNTED = { producers_count: 31, categories_count: CATEGORIES.length };

// ── helpers ─────────────────────────────────────────────────────────────────
/**
 * `stats` is a COUNT of requests received, not of responses sent, and it is
 * incremented before `statsDelayMs` is honoured — see `mountEffectRan`.
 */
export type Seen = { producers: URL[]; search: URL[]; stats: number };

/** Stub the one incidental external host the home page hits (mini-map tiles). */
export async function stubTiles(page: Page): Promise<void> {
  await page.route(/tile\.openstreetmap\.org\//, (route: Route) => route.fulfill({ status: 204, body: "" }));
}

/**
 * Intercept the home page's client endpoints and record every `/producers` and
 * `/search` URL. `list` may be a function of the request URL — the day / geo /
 * category rows need the response to depend on the query.
 */
export async function mockApi(
  page: Page,
  list: Producer[] | ((u: URL) => Producer[]) = PRODUCERS,
  opts: {
    stats?: Record<string, number>;
    statsDelayMs?: number;
    trending?: string[];
    search?: Record<string, unknown>;
  } = {},
): Promise<Seen> {
  const seen: Seen = { producers: [], search: [], stats: 0 };
  // Registered generic-first: Playwright matches routes in REVERSE registration
  // order, so the specific `/producers/<id>` handler below wins over this one.
  await page.route("**/api/producers**", (route: Route) => {
    const url = new URL(route.request().url());
    seen.producers.push(url);
    const body = typeof list === "function" ? list(url) : list;
    return route.fulfill({ json: body, headers: { "x-total-count": String(body.length) } });
  });
  await page.route(/\/api\/producers\/[0-9a-f-]{36}$/, (route: Route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const hit = PRODUCERS.find((p) => p.id === id);
    return hit ? route.fulfill({ json: hit }) : route.fulfill({ status: 404, json: { detail: "not found" } });
  });
  await page.route("**/api/categories**", (route: Route) => route.fulfill({ json: CATEGORIES }));
  await page.route("**/api/stats**", async (route: Route) => {
    // Counted BEFORE the delay: `mountEffectRan` needs "the mount effect issued
    // this", which the request itself proves. Counting after would make the
    // gate wait out `statsDelayMs` and defeat the one row that sets it (the
    // MEH-607 stats skeleton, which asserts the skeleton while stats is still
    // in flight).
    seen.stats += 1;
    if (opts.statsDelayMs) await new Promise((r) => setTimeout(r, opts.statsDelayMs));
    return route.fulfill({ json: opts.stats ?? STATS_ABOVE });
  });
  await page.route("**/api/search/trending**", (route: Route) => route.fulfill({ json: opts.trending ?? [] }));
  await page.route("**/api/search?**", (route: Route) => {
    seen.search.push(new URL(route.request().url()));
    return route.fulfill({ json: opts.search ?? { producers: [], categories: [], cities: [] } });
  });
  return seen;
}

export async function seedStorage(page: Page, key: string, value: string): Promise<void> {
  await page.addInitScript(
    ([k, v]) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* private mode — the page must still render */
      }
    },
    [key, value] as const,
  );
}

/** A manual tester has consented already — otherwise the CookieBanner reserves footprint (MEH-945) and moves every floating-element measurement below. */
export const consent = (page: Page) => seedStorage(page, "cookieConsent", "essential"); // CookieBanner.jsx:30

/** Navigate to home and gate on the transition being over BEFORE any strict locator runs. */
export async function gotoHome(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  // Count gates first (they RETRY; the strict checks the tests run would throw
  // instead of waiting if a stray copy ever landed INSIDE the landmark).
  await expect(scope(page).getByTestId("hero-search")).toHaveCount(1, FIRST_PAINT);
  await expect(scope(page).getByTestId("home-filter-row")).toHaveCount(1, FIRST_PAINT);
}

/**
 * Wait until `use-home-page`'s mount effect has actually run.
 *
 * That effect is where the URL becomes state — `setFilters(initFilters)` and
 * `setChips(initChips)` (`:259-260`) — and it ends by issuing `GET /stats`
 * unconditionally (`:297`), which no other code path requests. So a stats hit
 * is a positive, causal signal that the URL→state write has happened.
 *
 * Why any of this matters: `gotoHome` gates on markup that exists in the SERVER
 * HTML, so it returns while the page may still be pre-hydration. A chip clicked
 * in that window is then overwritten when the effect lands, which is the shape
 * of the intermittence two rows in this file already carry comments about
 * ("observed once in 5 runs", "2 of 7 runs", both on the mobile project) and of
 * the MT:T12:4 flake on CI run 33919310192. Gating here fixes the class in ONE
 * place instead of per row.
 *
 * It fails loudly, never silently: if `/stats` were ever to stop being
 * requested, every caller times out here with this message rather than
 * quietly going back to racing.
 */
export async function mountEffectRan(seen: Seen): Promise<void> {
  await expect
    .poll(() => seen.stats, {
      message: "use-home-page's mount effect must have run (it always requests /stats) before the page is driven",
      timeout: FIRST_PAINT.timeout,
    })
    .toBeGreaterThan(0);
}

/** Mock, navigate, and wait for the page to be past its mount effect. */
export async function gotoWithFeed(
  page: Page,
  path = "/",
  list: Producer[] | ((u: URL) => Producer[]) = categoryAwareFeed,
  opts: Parameters<typeof mockApi>[2] = {},
): Promise<Seen> {
  await consent(page);
  await stubTiles(page);
  const seen = await mockApi(page, list, opts);
  await gotoHome(page, path);
  await mountEffectRan(seen);
  return seen;
}

export const cards = (page: Page) => scope(page).getByTestId("producer-card");

// ── the SSR first paint, and how these rows get out from under it ───────────
// Read the ⚠️ block in the file header first; this is the machinery it names.

/**
 * The URL params `use-home-page.js:275-287` folds into `initParams` — the set
 * whose emptiness makes `serverCoversThisLoad` true and cancels the client
 * fetch. Derived from the app's own taxonomy, so a new axis joins it here for
 * free. (`day` is deliberately absent: `:241` only honours it beside a `city`.)
 */
const FORCING_PARAMS = new Set<string>([
  "category",
  "city",
  ...HOME_CHIPS.map((c) => homeParamFor(c.key) as string),
]);

/**
 * Add a filter param unless the path already carries one, so the page CLIENT-
 * fetches its feed and `mockApi`'s handler is the thing that answers.
 *
 * `verified` is the filler: it is PROMOTED, so it shows its active state on its
 * own chip instead of adding a row to the applied-filters strip
 * (`HomeProducersGrid.jsx:249-251`), and it is not one of the runtime-gated diet
 * axes, so it is present on every feed. The mock ignores the query anyway — the
 * param exists to defeat the skip, not to filter anything.
 */
function withForcedFetch(path: string): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (![...params.keys()].some((k) => FORCING_PARAMS.has(k))) {
    params.set(homeParamFor("verified") as string, "1");
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

/** A fixture business present in EVERY feed this spec serves (`PRODUCERS` and `CAT_A_MEMBERS` both open with P1). */
const FIXTURE_SENTINEL = P1.name;

/**
 * `gotoWithFeed` for the rows whose SUBJECT is the fixture's own contents, with
 * the two things a runner that has a live backend needs:
 *
 *   1. a filter param (`withForcedFetch`), so the client fetch the intercept
 *      answers actually happens;
 *   2. a gate on a FIXTURE business being on screen. This half matters as much
 *      as the first: "8 cards rendered" is equally true of the backend's own
 *      catalog, so gating on a COUNT is a green with two causes — it is exactly
 *      how `card photos are object-cover` reached `toHaveCount(PAGE_SIZE)` on
 *      CI and then failed on the very next line looking for a fixture business.
 *      Gating on a name the backend cannot supply collapses that to one cause.
 */
export async function gotoFixtureFeed(
  page: Page,
  path = "/",
  list: Producer[] | ((u: URL) => Producer[]) = categoryAwareFeed,
  opts: Parameters<typeof mockApi>[2] = {},
): Promise<Seen> {
  const seen = await gotoWithFeed(page, withForcedFetch(path), list, opts);
  await expect(
    cards(page).filter({ hasText: FIXTURE_SENTINEL }),
    "the FIXTURE feed must be what rendered — a card count alone is also true of the backend's catalog",
  ).toHaveCount(1, FIRST_PAINT);
  return seen;
}

/**
 * The category the page can actually resolve an id against, plus its name.
 *
 * `activeCategory` is `categories.find((c) => String(c.id) === filters.category)`
 * (`HomeProducersGrid.jsx:233-235`), so the whole discovery seam depends on the
 * deep-linked id being IN the list the page holds — and per the header, that
 * list is the SERVER's whenever the server supplied one, with no client fetch
 * to intercept. Deep-linking the fixture's `CAT_A.id` against a live backend
 * therefore resolves to nothing: the heading keeps its default and the tag never
 * renders, which is precisely how these rows failed on CI.
 *
 * The seam itself is sound — measured against a seeded list, an id the page DOES
 * hold renames the heading to «בתי עסק · {name}» and renders «נקה סינון {name}».
 * So this asks the page which categories it has instead of assuming.
 *
 * `page.request` does NOT pass through `page.route` (measured), which is the
 * point: it reads past the intercept to the same list the server component read.
 */
export async function activeCategoryFixture(page: Page): Promise<{ id: string; name: string }> {
  let seeded: unknown;
  // MEH-3427: one non-OK answer used to drop straight to the CAT_A fixture. On
  // staging that happened mid-deploy (run 44377981988): this read got a 5xx
  // while the page's own SSR read, a moment later, got the real list — so the
  // test deep-linked a fixture id the page did not hold and «נקה סינון …» never
  // rendered. A 5xx is the backend restarting, not "no backend": ask again for
  // a few seconds before falling back. A thrown network error (no backend at
  // all, the CC sandbox) still falls back at once.
  for (let attempt = 0; attempt < 5; attempt++) {
    let status = 0;
    try {
      const res = await page.request.get("/api/categories");
      status = res.status();
      if (res.ok()) seeded = await res.json();
    } catch {
      break; // No backend at all — handled as the fixture case below.
    }
    if (seeded !== undefined || status < 500) break;
    await page.waitForTimeout(2_000);
  }
  if (Array.isArray(seeded)) {
    // An array — even an empty one — is what `page.js:44` returns to
    // `initialCategories`, so the client fetch is skipped and THIS is the list
    // the page will hold. Empty means the seam has no resolvable subject on
    // this backend: fail loudly and say why, never quietly pass.
    const parsed = CategoriesResponseSchema.safeParse(seeded);
    if (!parsed.success) throw new Error("the seeded /categories payload does not satisfy CategoriesResponseSchema");
    if (parsed.data.length === 0)
      throw new Error(
        "the backend seeded an EMPTY category list, so no id can resolve and the discovery seam has no subject — " +
          "this is a data problem on the target, not a flake",
      );
    const first = parsed.data[0] as { id: number | string; name: string };
    return { id: String(first.id), name: first.name };
  }
  // No usable payload ⇒ the server's own fetch failed the same way ⇒
  // `initialCategories` is null ⇒ the page client-fetches `/categories` ⇒ the
  // CATEGORIES fixture governs and CAT_A is the resolvable one.
  return { id: String(CAT_A.id), name: CAT_A.name };
}

/**
 * A computed colour read only once it has STOPPED changing. Three equal
 * consecutive samples, no fixed pause — on a settled chip it returns on the
 * third round-trip.
 *
 * MEH-3468 — the cause, measured. A Tailwind `transition` chip keeps a CSS
 * transition even under `reducedMotion: "reduce"`: `globals.css` collapses its
 * DURATION to 0.01ms, but a transition still starts, and its progress only
 * advances when the page renders a frame. Until that frame, `getComputedStyle`
 * returns the transition's START value, the old fill. On a loaded runner three
 * reads can land inside one frame, so they agree on the stale colour and the
 * "settled" check accepts it. CI run on #4895 (job 136004973994): `aria-pressed`
 * was `"true"` and the read was `rgb(255, 255, 255)`, the inactive fill; the
 * retry passed.
 *
 * Reproduced in isolation (a 0.01ms-transition button, click, three reads):
 * 25 of 40 toggles read the pre-click colour three times in a row. The same
 * page with no transition: 0 of 40. The earlier note here ruled the transition
 * out because of the 0.01ms duration; the duration is not the problem, the
 * missing frame is.
 *
 * So each read first waits for every running animation on the element to
 * finish (`getAnimations()` includes CSS transitions) and for one rendered
 * frame. With that, the same probe: 0 of 40.
 */
export async function settledBackgroundColor(l: Locator): Promise<string> {
  const read = () =>
    l.evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return getComputedStyle(el as HTMLElement).backgroundColor;
    });
  let stable = 0;
  let last = await read();
  for (let i = 0; i < 60; i++) {
    const current = await read();
    stable = current === last ? stable + 1 : 0;
    last = current;
    if (stable >= 2) return current;
  }
  throw new Error(`background-color never settled over 60 samples (last: ${last})`);
}

export const promotedChip = (page: Page, key: string) => scope(page).getByTestId(`home-promoted-chip-${key}`);
export const filtersButton = (page: Page) => scope(page).getByTestId("home-filters-button");
export const sheetPanel = (page: Page) => page.locator("#filter-sheet-panel"); // portalled to <body> — unscoped
export const counter = (page: Page) => scope(page).getByTestId("producers-counter");
export const heroSearch = (page: Page) => scope(page).getByTestId("hero-search");
export const backToTop = (page: Page) => page.getByTestId("back-to-top"); // position:fixed, mounted inside the landmark
export const nearMe = (page: Page) => scope(page).getByTestId("hero-chips-row").getByRole("button", { name: HERO.near_me });

export type Box = { x: number; y: number; width: number; height: number };
export async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}
export const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export async function noHorizontalOverflow(page: Page): Promise<void> {
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidth, "the page must not scroll horizontally").toBeLessThanOrEqual(clientWidth + 1);
}

/**
 * The X scale factor of an element's computed transform. `none` and an identity
 * matrix both mean 1 — treating them differently is what made a first version of
 * the hover-zoom row intermittent: it compared a BEFORE string to an AFTER string,
 * and the resting value flips between "none" and "matrix(1, 0, 0, 1, 0, 0)"
 * depending on when the enter animation last touched the node. The number is the
 * thing under test, so read the number.
 */
export function scaleX(l: Locator): Promise<number> {
  return l.evaluate((el) => {
    const t = getComputedStyle(el as HTMLElement).transform;
    if (!t || t === "none") return 1;
    const m = /matrix\(([^,]+),/.exec(t);
    return m ? Number(m[1]) : 1;
  });
}

/** The number of columns the CSS grid resolves to — read from the computed template, not counted from what rendered. */
export function columnCount(l: Locator): Promise<number> {
  return l.evaluate((el) => getComputedStyle(el as HTMLElement).gridTemplateColumns.split(" ").length);
}

/**
 * Instrument `navigator.geolocation.getCurrentPosition` from inside the page:
 * every call is COUNTED (`window.__geoCalls` — MT:1269:8's "no second prompt"
 * needs a number, not a hope), and with `error` set the call fails synchronously
 * with that GeolocationPositionError code (1 = PERMISSION_DENIED,
 * 2 = POSITION_UNAVAILABLE) instead of reaching the browser. The denial is
 * FORCED rather than left to an ungranted context: an ungranted context does not
 * reliably deliver code 1, and a "denied" that is really a "pending" is not the
 * state these rows describe (measured on chunk 6, 04/09).
 */
export async function installGeo(page: Page, error?: 1 | 2 | 3): Promise<void> {
  await page.addInitScript((code) => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    const orig = Geolocation.prototype.getCurrentPosition;
    Object.defineProperty(Geolocation.prototype, "getCurrentPosition", {
      configurable: true,
      value: function (this: Geolocation, ...args: Parameters<Geolocation["getCurrentPosition"]>) {
        w.__geoCalls += 1;
        if (code) {
          args[1]?.({ code, message: "" } as GeolocationPositionError);
          return;
        }
        return orig.apply(this, args);
      },
    });
  }, error ?? 0);
}
export const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);
export const GPS = { latitude: 32.79, longitude: 34.99 };
export async function grantGps(context: BrowserContext): Promise<void> {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(GPS);
}

/**
 * The blocks sitting between the businesses grid and the mini-map, as DESCRIPTIONS rather
 * than a bare count: a red that prints "1" says nothing about what is there,
 * and this row's whole subject is which block is second.
 *
 * `template` and the other non-rendering tags are skipped, and that is the fix
 * for a MEASURED flake rather than a convenience. On CI the order row went red
 * once and passed on retry with exactly ONE element between the two sections;
 * sampling the live DOM 40x over a second (04/09, mobile, 1 run in 8) caught it
 * at t0 and it was gone by t+25ms: `template.(no class)` — React's streaming-SSR
 * placeholder, which renders nothing and is removed as hydration completes. A
 * `<template>` is not a block, so counting it was the bug; skipping it makes the
 * read deterministic instead of racing hydration.
 *
 * Its own self-test lives in the test below, and drives THIS function — not a
 * copy of it — on three inputs whose answers are known.
 */
const NON_RENDERING = ["template", "script", "style", "link", "noscript"];

// MEH-2747: the rescue-bags module is the one block that may sit between the
// grid and the map (MEH-2648 puts it right after the grid); it renders null
// unless the pilot is on for the visitor's town.
const ALLOWED_BETWEEN = ["rescue-home-module"];

export function strangersBetweenGridAndMap(page: Page): Promise<string[]> {
  return page.evaluate(([skip, allowed]) => {
    const heroEl = document.getElementById("producers-grid");
    const mapEl = document.querySelector('[data-testid="home-minimap"]');
    if (!heroEl || !mapEl) return ["(businesses grid or mini-map is not in the document)"];
    // `?? heroEl` rather than a non-null assertion, and the symmetry with the
    // map branch below is the point: if the hero ever renders outside a
    // <section>, the assertion must report the strangers it finds — not throw a
    // TypeError out of page.evaluate, which reads as harness breakage rather
    // than as the structural regression it would be.
    const hero = heroEl.closest("section") ?? heroEl;
    const mapSection = mapEl.closest("section") ?? mapEl;
    const out: string[] = [];
    let n: Element | null = hero.nextElementSibling;
    while (n && n !== mapSection && !n.contains(mapSection)) {
      const tag = n.tagName.toLowerCase();
      if (!skip.includes(tag) && !allowed.includes(n.getAttribute("data-testid") ?? "")) {
        const testid = n.getAttribute("data-testid");
        out.push(`${tag}${testid ? `[${testid}]` : ""}.${n.className || "(no class)"}`.slice(0, 90));
      }
      n = n.nextElementSibling;
    }
    return n ? out : ["(the mini-map is not a following sibling of the businesses grid at all)"];
  }, [NON_RENDERING, ALLOWED_BETWEEN] as const);
}
