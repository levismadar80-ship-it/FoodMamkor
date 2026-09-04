import type { BrowserContext, Locator, Route, TestInfo } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
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
import { CategoriesResponseSchema, StatsSchema } from "../../../lib/api-schemas.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { FILTER_AXES } from "../../../lib/filter-taxonomy.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { CHIPS_CONFIG } from "../../../lib/producer-filters.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { DELIVERY_DAYS } from "../../../lib/delivery-days.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { ORDER_DAY_KEYS } from "../../../lib/orderWindow.js";
// @ts-expect-error TS7016 — JS data module, no .d.ts
import { REGIONS } from "../../../data/regions.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { CATEGORY_CARDS } from "../../../lib/home-categories.js";

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
 *           `empty-generic` block, how-it-works, the comparison teaser and the
 *           closing CTA. So every copy / geometry / order row below runs against
 *           the REAL page with no interception at all.
 *
 *           The data-dependent rows INTERCEPT four client endpoints —
 *           `GET /api/producers` (incl. its `/{id}` form for recently-viewed),
 *           `GET /api/categories`, `GET /api/stats`, `GET /api/search` +
 *           `/api/search/trending`. CI runs this same spec against a
 *           `next start` whose proxy reaches the REAL staging backend; the
 *           intercept is what keeps the counter, the grid census, the applied-
 *           filter tags, the region fallback and the day captions deterministic
 *           in both worlds.
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
 *      / `StatsSchema`, lib/schemas.js + lib/api-schemas.js), so a response-model
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
 *           `trust-lead` · `trust-secondary` · `home-filter-row` ·
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
 *           frontend/__tests__/highlight.test.js:4-17), 7 DEVICE-ONLY (the whole
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

const FIRST_PAINT = { timeout: 15_000 };

// MEH-1792 (re-measured 2026-09-04 on chunks 1, 2 and 6): during the app's
// page-transition window a second copy of the page tree exists briefly OUTSIDE
// `#main-content`, so a page-wide `getByTestId` can resolve to TWO elements and
// fail strict mode ("resolved to 2 elements … unexpected value hidden"). Scoping
// every locator to the `#main-content` landmark (layout.js:254) names the live
// tree only. Same fix as e2e/flows/27-delivery-day-discoverability.spec.ts:73.
// Deliberately NOT `.first()`: a real permanent double-mount must still fail.
const scope = (page: Page) => page.locator("#main-content");

// Project identity, never a count of what rendered (testing.md: a guard that
// consults its own subject turns "the thing is gone" into "nothing to check").
const isDesktop = (info: TestInfo) => info.project.name === "desktop";
const desktopOnly = (info: TestInfo, why: string) => test.skip(!isDesktop(info), why);
const mobileOnly = (info: TestInfo, why: string) => test.skip(isDesktop(info), why);

// ── copy ────────────────────────────────────────────────────────────────────
const HERO = he.home.hero;
const SEARCH_PH = he.home.search.placeholders;
const HERO_SEARCH = he.search.hero;
const PROD = he.home.producers;
const CATS_COPY = he.home.categories;
const HOW = he.home.how_it_works;
const CTA = he.home.cta;
const TEASER = he.home.comparison_teaser;
const RECENT = he.home.recent;
const TRUST = he.home.trust;
const STATS = he.home.stats;
const FILTERS_BTN = he.filters.button;
const LOC_MODAL = he.modals.location;
const FRIDAY_HE = he.group_buys.friday_delivery;
const FRIDAY_EN = en.group_buys.friday_delivery;

type Axis = { key: string; label: string; subtext?: string | null; group?: string };
const AXES = FILTER_AXES as Record<string, Axis>;
type Chip = { key: string; label: string };
const HOME_CHIPS = CHIPS_CONFIG as Chip[];

// MEH-2173: home promotes exactly this pair out of CHIPS_CONFIG and files the
// rest behind the sheet (HomeProducersGrid.jsx:50 PROMOTED_KEYS).
const PROMOTED = ["verified", "has_delivery"] as const;

// DENY-lists — the three expectations that cannot be derived from the copy they
// forbid, so they are literals on purpose (same shape as chunk 2's
// HERO_FEES_VOCAB).
/** MT:1418:2 — the pre-MEH-1418 verification label that must not come back. */
const STALE_VERIFIED_LABEL = "מאומתים";
/** MT:1800:4 — the known-broken query that must not return to the placeholder pool. */
const PLACEHOLDER_DENY = "גבינת עיזים";
/** MT:FRI:1 — an untranslated key path rendering instead of its string. */
const I18N_KEY_PATH = /group_buys\.friday_delivery/;

// ── fixtures ────────────────────────────────────────────────────────────────
// Categories carry the FIRST TWO names lib/home-categories.js declares, so the
// category grid resolves real ids for its two hero cards (MEH-1080: a card whose
// id does not resolve renders inert, with no link) and the MT:1174 heading rows
// have a category to select. Names come from CATEGORY_CARDS, not from literals.
type CategoryCard = { key: string; name: string; image?: string };
const CARDS = CATEGORY_CARDS as CategoryCard[];
const CAT_A = { id: 101, name: CARDS[0].name };
const CAT_B = { id: 102, name: CARDS[1].name };
/** A category id no fixture business carries — the MT:1085 zero-result branch. */
const CAT_EMPTY = { id: 199, name: "קטגוריה ריקה" };
const CATEGORIES = [CAT_A, CAT_B, CAT_EMPTY];

// The delivery city + the region that contains it, both read from data/regions.js
// rather than written down, so a regions edit moves the fixture with it.
type Region = { key: string; name: string; cities: string[] };
const REGION = (REGIONS as Region[])[0];
const CITY = REGION.cities[0];
const CITY_SIBLING = REGION.cities[1];
/** Sunday + Wednesday, declared OUT of week order so the "week order" row discriminates. */
const DAYS_OUT_OF_ORDER = [DELIVERY_DAYS[3], DELIVERY_DAYS[0]] as [string, string];
const DAYS_IN_ORDER = [DELIVERY_DAYS[0], DELIVERY_DAYS[3]] as [string, string];
/** A day no fixture business delivers on — the MEH-2197 day-zero trigger. */
const DAY_NOBODY = DELIVERY_DAYS[5];

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type DeliveryArea = { id: string; city: string; delivery_day?: string | null };
type Producer = Record<string, unknown> & {
  id: string;
  name: string;
  city: string;
  slug: string;
  delivery_areas: DeliveryArea[];
};

function producer(
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
    // MEH-2131: `open_for_orders_now` is the OTHER runtime-gated axis — the sheet
    // withholds it below OPEN_NOW_CHIP_MIN (5) declared windows, and again when
    // no business is open at the current clock. An all-week 00:00-23:59 window on
    // every row satisfies both, whatever time the suite runs at, so the sheet
    // offers the full home axis set instead of a time-of-day-dependent subset.
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
const P1 = producer(1, "מחלבת הגבעה", CAT_A, {
  verification_tier: "verified",
  verified_at: "2026-01-01",
  delivery_areas: [area(1, CITY, DAYS_OUT_OF_ORDER[0]), area(2, CITY, DAYS_OUT_OF_ORDER[1])],
});
const P2 = producer(2, "קצביית השכונה", CAT_A, {
  // A row for the city with NO day = "by arrangement" (MT:2197:6).
  delivery_areas: [area(3, CITY, null)],
});
const P3 = producer(3, "עסק ארצי ללא שורת עיר", CAT_B, {
  // NO delivery_areas row for CITY at all — MT:2197:7, the caption that must
  // NOT be invented. It still reaches the region grid via its sibling city.
  city: CITY_SIBLING,
  delivery_areas: [area(4, CITY_SIBLING, DELIVERY_DAYS[1])],
});
const P4 = producer(4, "גבינות הנגב", CAT_B, { delivers: false });
const LONG_NAME = "חוות השקמה של משפחת אברהמי מרחובות והסביבה הקרובה מאוד";
const P5 = producer(5, LONG_NAME, CAT_B, {
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
const REST = [6, 7, 8, 9, 10].map((n) => producer(n, `עסק לדוגמה ${n}`, CAT_B));
const PRODUCERS: Producer[] = [P1, P2, P3, P4, P5, ...REST];
const PAGE_SIZE = 8; // use-home-page.js:48
const CAT_A_MEMBERS = PRODUCERS.filter(
  (p) => (p.categories as Array<{ id: number }>)[0]?.id === CAT_A.id,
);

/** The MEH-2197 region-fallback set: the businesses that reach the REGION when the city+day query returns nothing. */
const REGION_FALLBACK = [P1, P2, P3];

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

const STATS_ABOVE = { producers_count: PRODUCERS.length, categories_count: CATEGORIES.length };

test.beforeAll(() => {
  // A schema change reds the spec HERE, loudly, instead of letting the fixture
  // drift away from what the app is actually given — BOTH contracts: the
  // generated one (what the backend emits) and the app-side one the page
  // validates with before a single card is created.
  ListProducersProducersGetResponse.parse(PRODUCERS);
  ListCategoriesCategoriesGetResponse.parse(CATEGORIES);
  GetStatsStatsGetResponse.parse(STATS_ABOVE);
  ProducersResponseSchema.parse(PRODUCERS);
  CategoriesResponseSchema.parse(CATEGORIES);
  StatsSchema.parse(STATS_ABOVE);
  // Guards on the fixture's own premises — each is a condition a row below
  // depends on, so a fixture edit that breaks one fails here rather than
  // producing a test that is green for the wrong reason.
  if (PRODUCERS.length <= PAGE_SIZE) throw new Error("the feed must overflow PAGE_SIZE for the load-more row");
  if (CAT_A_MEMBERS.length !== 2) throw new Error(`CAT_A must hold exactly 2 businesses, got ${CAT_A_MEMBERS.length}`);
  if (PRODUCERS.some((p) => p.delivery_areas.some((a) => a.delivery_day === DAY_NOBODY)))
    throw new Error("DAY_NOBODY must be a day no fixture business delivers on");
  if (P3.delivery_areas.some((a) => a.city === CITY))
    throw new Error("P3 must carry NO delivery_areas row for CITY — that is MT:2197:7's whole subject");
  if (DAYS_OUT_OF_ORDER[0] === DAYS_IN_ORDER[0])
    throw new Error("the day fixture must be declared out of week order or MT:2197:5 cannot discriminate");
  if (PROMOTED.some((k) => !HOME_CHIPS.find((c) => c.key === k)))
    throw new Error("a promoted key vanished from CHIPS_CONFIG");
  const sugarDeclared = PRODUCERS.filter((p) => p.has_no_added_sugar_products).length;
  if (sugarDeclared < 5)
    throw new Error(`DIET_CHIP_MIN = 5 declared businesses are needed to un-gate no_added_sugar, got ${sugarDeclared}`);
  const windowed = PRODUCERS.filter((p) => p.order_window).length;
  if (windowed < 5)
    throw new Error(`OPEN_NOW_CHIP_MIN = 5 declared windows are needed to un-gate open_for_orders_now, got ${windowed}`);
});

// ── helpers ─────────────────────────────────────────────────────────────────
type Seen = { producers: URL[]; search: URL[] };

/** Stub the one incidental external host the home page hits (mini-map tiles). */
async function stubTiles(page: Page): Promise<void> {
  await page.route(/tile\.openstreetmap\.org\//, (route: Route) => route.fulfill({ status: 204, body: "" }));
}

/**
 * Intercept the home page's client endpoints and record every `/producers` and
 * `/search` URL. `list` may be a function of the request URL — the day / geo /
 * category rows need the response to depend on the query.
 */
async function mockApi(
  page: Page,
  list: Producer[] | ((u: URL) => Producer[]) = PRODUCERS,
  opts: {
    stats?: Record<string, number>;
    statsDelayMs?: number;
    trending?: string[];
    search?: Record<string, unknown>;
  } = {},
): Promise<Seen> {
  const seen: Seen = { producers: [], search: [] };
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

async function seedStorage(page: Page, key: string, value: string): Promise<void> {
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
const consent = (page: Page) => seedStorage(page, "cookieConsent", "essential"); // CookieBanner.jsx:30

/** Navigate to home and gate on the transition being over BEFORE any strict locator runs. */
async function gotoHome(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  // Count gates first (they RETRY; the strict checks the tests run would throw
  // instead of waiting if a stray copy ever landed INSIDE the landmark).
  await expect(scope(page).getByTestId("hero-search")).toHaveCount(1, FIRST_PAINT);
  await expect(scope(page).getByTestId("home-filter-row")).toHaveCount(1, FIRST_PAINT);
}

/** Mock, navigate, and wait for the fixture feed to land in the grid. */
async function gotoWithFeed(
  page: Page,
  path = "/",
  list: Producer[] | ((u: URL) => Producer[]) = categoryAwareFeed,
  opts: Parameters<typeof mockApi>[2] = {},
): Promise<Seen> {
  await consent(page);
  await stubTiles(page);
  const seen = await mockApi(page, list, opts);
  await gotoHome(page, path);
  return seen;
}

const cards = (page: Page) => scope(page).getByTestId("producer-card");
const promotedChip = (page: Page, key: string) => scope(page).getByTestId(`home-promoted-chip-${key}`);
const filtersButton = (page: Page) => scope(page).getByTestId("home-filters-button");
const sheetPanel = (page: Page) => page.locator("#filter-sheet-panel"); // portalled to <body> — unscoped
const counter = (page: Page) => scope(page).getByTestId("producers-counter");
const heroSearch = (page: Page) => scope(page).getByTestId("hero-search");
const backToTop = (page: Page) => page.getByTestId("back-to-top"); // position:fixed, mounted inside the landmark
const nearMe = (page: Page) => scope(page).getByTestId("hero-chips-row").getByRole("button", { name: HERO.near_me });

type Box = { x: number; y: number; width: number; height: number };
async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function noHorizontalOverflow(page: Page): Promise<void> {
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
function scaleX(l: Locator): Promise<number> {
  return l.evaluate((el) => {
    const t = getComputedStyle(el as HTMLElement).transform;
    if (!t || t === "none") return 1;
    const m = /matrix\(([^,]+),/.exec(t);
    return m ? Number(m[1]) : 1;
  });
}

/** The number of columns the CSS grid resolves to — read from the computed template, not counted from what rendered. */
function columnCount(l: Locator): Promise<number> {
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
async function installGeo(page: Page, error?: 1 | 2 | 3): Promise<void> {
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
const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);
const GPS = { latitude: 32.79, longitude: 34.99 };
async function grantGps(context: BrowserContext): Promise<void> {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(GPS);
}

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › hero — produce photo + Ken Burns (MEH-788)", () => {
  // MT:788:1 — the hero band carries the Cloudinary produce photo at full width
  //   with the slow Ken Burns drift.
  // NOTE the drift assertion MUST override `reducedMotion`: playwright.config.ts
  //   sets `reducedMotion: "reduce"` suite-wide, and globals.css:601-604 disables
  //   both kenburns keyframes under that query — so without the override this
  //   test would be green for the wrong reason on an app that had lost the
  //   animation entirely.
  test("the hero shows the Cloudinary produce photo and drifts (Ken Burns) when motion is allowed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const layer = scope(page).getByTestId("hero-image-layer");
    await expect(layer).toHaveCount(1, FIRST_PAINT);
    const style = await layer.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLElement);
      return { image: cs.backgroundImage, animation: cs.animationName, size: cs.backgroundSize };
    });
    expect(style.image, "the hero photo is served from Cloudinary").toContain("res.cloudinary.com");
    expect(style.image, "…and is the produce hero, not the old stock frame").toContain("home/hero-produce");
    expect(style.size).toBe("cover");
    expect(style.animation, "the Ken Burns drift is running").toBe("kenburns-right");
  });

  // MT:788:4 — device "reduce motion" ⇒ the image is static.
  //   This is ALSO the automatable half of MT:IOS:5, whose matrix verdict is
  //   DEVICE-ONLY while its own note says the media-query branch is PW-testable.
  //   Asserted once, here, and cited there rather than duplicated.
  test("with reduce-motion the hero photo is static", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const layer = scope(page).getByTestId("hero-image-layer");
    await expect(layer).toHaveCount(1, FIRST_PAINT);
    await expect(layer).toHaveCSS("animation-name", "none");
  });

  // MT:788:2 — headline + subtitle + the chips row are readable OVER the photo.
  //   "Readable" / "no glare" is subjective and is NOT asserted; what IS
  //   asserted is the structural claim underneath it — all three sit inside the
  //   hero band and none is clipped out of the first viewport.
  test("the headline, subtitle and chips row sit inside the hero band and in the viewport", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const hero = scope(page).getByTestId("home-hero");
    await expect(hero).toHaveCount(1, FIRST_PAINT);
    await expect(hero.getByRole("heading", { level: 1, name: HERO.title })).toBeVisible();
    await expect(hero.getByText(HERO.subtitle, { exact: true })).toBeVisible();
    const chips = scope(page).getByTestId("hero-chips-row");
    await expect(chips).toBeVisible();
    const vh = await page.evaluate(() => window.innerHeight);
    const heroBox = await box(hero);
    for (const [name, l] of [
      ["h1", hero.getByRole("heading", { level: 1 })],
      ["chips row", chips],
    ] as const) {
      const b = await box(l);
      expect(b.y, `${name} starts inside the hero band`).toBeGreaterThanOrEqual(heroBox.y - 1);
      expect(b.y + b.height, `${name} ends within the first viewport`).toBeLessThanOrEqual(vh + 1);
    }
  });

  // MT:788:3 — typing 2+ chars opens the dropdown FULLY; it overflows past the
  //   hero's bottom edge rather than being clipped by it.
  test("the hero search dropdown opens past the hero's bottom edge and is not clipped", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    // A POPULATED result set, not the default empty one. With no rows the dropdown
    // is the three-line "no results" block, and whether that clears the hero's
    // bottom edge depends on where the band happens to end — measured both ways
    // across runs (bottom 462.8 vs a hero ending at 504). The row is about a FULL
    // dropdown overflowing the band, so the fixture has to make it full.
    await mockApi(page, PRODUCERS, {
      search: {
        producers: PRODUCERS.slice(0, 3).map((p) => ({ id: p.id, name: p.name, city: CITY, slug: p.slug })),
        categories: CATEGORIES.slice(0, 2),
        cities: [CITY, CITY_SIBLING],
      },
    });
    await gotoHome(page);
    const hero = scope(page).getByTestId("home-hero");
    await heroSearch(page).fill("לח");
    const dropdown = scope(page).getByTestId("hero-search-dropdown");
    await expect(dropdown).toBeVisible(FIRST_PAINT);
    // Gate on the rows before measuring — the box grows as they land.
    await expect(dropdown.getByRole("option")).toHaveCount(7, FIRST_PAINT);
    const geometry = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="hero-search-dropdown"]')!.getBoundingClientRect();
      const h = document.querySelector('[data-testid="home-hero"]')!.getBoundingClientRect();
      const el = document.querySelector('[data-testid="hero-search-dropdown"]') as HTMLElement;
      return {
        dropBottom: d.top + d.height,
        heroBottom: h.top + h.height,
        clipped: el.scrollHeight - el.clientHeight,
      };
    });
    expect(geometry.dropBottom, "the dropdown extends below the hero band").toBeGreaterThan(geometry.heroBottom);
    // Not clipped: its painted height matches its own scroll height.
    expect(geometry.clipped, "the dropdown renders its whole content, not a clipped slice").toBeLessThanOrEqual(1);
  });

  // MT:788:5 — no horizontal overflow. Runs on BOTH projects: the row names
  //   375, and the mobile project is 393 wide, which is the same claim one
  //   notch wider — a desktop pass is not evidence for it, so both are asserted.
  test("the page does not scroll horizontally", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    await noHorizontalOverflow(page);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › hero search placeholders (MEH-1800)", () => {
  // MT:1800:3 — the home hero rotates FOUR placeholder strings, and the rotation
  //   stops while the field is focused. The row's other half ("each returns at
  //   least one result") is a BACKEND assertion and is deliberately NOT
  //   converted — see the header's MEH-1968 condition 1.
  test("the hero rotates exactly the four he.json placeholders and pauses on focus", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" }); // HeroSearch.jsx:123 skips rotation under reduce
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    const pool = [SEARCH_PH.q1, SEARCH_PH.q2, SEARCH_PH.q3, SEARCH_PH.q4];
    expect(new Set(pool).size, "the pool must hold four DISTINCT strings or rotation is unobservable").toBe(4);
    // The first paint is q1 (HeroSearch.jsx: phIdx starts at 0, SSR-stable).
    await expect(heroSearch(page)).toHaveAttribute("placeholder", pool[0]);
    // It rotates: within the interval the placeholder becomes a DIFFERENT pool member.
    await expect
      .poll(async () => heroSearch(page).getAttribute("placeholder"), { timeout: 12_000, message: "placeholder rotates" })
      .not.toBe(pool[0]);
    const afterRotate = await heroSearch(page).getAttribute("placeholder");
    expect(pool, "every rotated value comes from the he.json pool").toContain(afterRotate);
    // Focus freezes it (the row says so explicitly: "הרוטציה נעצרת בפוקוס").
    await heroSearch(page).focus();
    const frozen = await heroSearch(page).getAttribute("placeholder");
    await expect
      .poll(async () => heroSearch(page).getAttribute("placeholder"), { timeout: 8_000, message: "frozen while focused" })
      .toBe(frozen);
  });

  // MT:1800:4 — the known-broken string must not be back in the field. The row's
  //   other half ("typing it returns zero results") is backend behaviour.
  test("the broken query is not in the placeholder pool", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const pool = [SEARCH_PH.q1, SEARCH_PH.q2, SEARCH_PH.q3, SEARCH_PH.q4];
    expect(pool, "the MEH-1800 regression string must stay out of the pool").not.toContain(PLACEHOLDER_DENY);
    // …and it is not the static fallback either (HomeHero passes both).
    expect(he.home.search.placeholder).not.toBe(PLACEHOLDER_DENY);
    // The live pool is what the field actually shows — asserted, not assumed.
    expect(pool).toContain(await heroSearch(page).getAttribute("placeholder"));
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › floating back-to-top (MEH-1309)", () => {
  // MT:1309:1 — hidden on load, before any scroll.
  test("it is absent before the page is scrolled", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    await expect(backToTop(page)).toHaveCount(0);
  });

  // MT:1309:2 — appears past two viewport heights, in the bottom inline-END
  //   corner (the LEFT half under RTL), ABOVE the chat FAB with no overlap.
  test("past two viewport heights it appears in the bottom inline-end corner, clear of the chat FAB", async ({ page }, info) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await expect(backToTop(page)).toHaveCount(0);
    const vh = await page.evaluate(() => window.innerHeight);
    await page.evaluate((y) => window.scrollTo(0, y), vh * 2 + 40);
    await expect(backToTop(page)).toBeVisible(FIRST_PAINT);
    const b = await box(backToTop(page));
    const vw = await page.evaluate(() => window.innerWidth);
    expect(b.x + b.width / 2, "the button sits in the inline-END half of an RTL page").toBeLessThan(vw / 2);
    expect(b.y + b.height / 2, "…and in the bottom half").toBeGreaterThan(vh / 2);
    if (isDesktop(info)) {
      // The chat FAB is desktop-only (MEH-1410, ChatWidgetDesktopOnly.test.jsx:61),
      // so on mobile its absence has two causes and proves nothing.
      const fab = page.getByRole("button", { name: he.chat.launcher_open_label });
      await expect(fab).toHaveCount(1);
      const f = await box(fab);
      expect(overlaps(b, f), "back-to-top must not overlap the chat FAB").toBe(false);
      expect(b.y + b.height, "…and stacks ABOVE it").toBeLessThanOrEqual(f.y + 1);
    }
  });

  // MT:1309:3 — with the cookie banner up, the back-to-top button rides above it
  //   (via `--cookie-banner-h`) and stays clear of the other floating element in
  //   its corner.
  //
  //   ⚠️ SCOPE, and it is a real finding rather than a convenience. The row as
  //   written claims that all THREE floating elements never touch. Measured on
  //   this build at 1440×900 with the banner up:
  //       cookie banner  y 832 … 900   (--cookie-banner-h = 68px)
  //       chat FAB       y 830 … 876
  //       back-to-top    y 768 … 816
  //   The chat FAB overlaps the banner by ~46px; back-to-top clears both. That
  //   pair belongs to ChatWidget's own desktop clearance (MEH-850), NOT to
  //   MEH-1309, and this spec does not assert it green — it is reported as an
  //   unexplained-and-unfixed observation in docs/qa/conversion-progress.md.
  //   Asserting the FAB pair here would have reddened chunk 7 for a defect in
  //   another component; asserting it as passing would have been false.
  test("with the cookie banner showing, back-to-top clears the banner and its corner neighbour", async ({ page }, info) => {
    // NO consent seed here — the banner is the subject.
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    const banner = page.getByTestId("cookie-banner");
    await expect(banner).toBeVisible(FIRST_PAINT);
    const vh = await page.evaluate(() => window.innerHeight);
    await page.evaluate((y) => window.scrollTo(0, y), vh * 2 + 40);
    await expect(backToTop(page)).toBeVisible(FIRST_PAINT);
    const btt = await box(backToTop(page));
    const bannerBox = await box(banner);
    expect(overlaps(btt, bannerBox), "back-to-top must not overlap the cookie banner").toBe(false);
    expect(btt.y + btt.height, "…it rides ABOVE it, via --cookie-banner-h").toBeLessThanOrEqual(bannerBox.y + 1);
    const neighbour = isDesktop(info)
      ? page.getByRole("button", { name: he.chat.launcher_open_label })
      : page.getByTestId("bottom-nav");
    const n = await box(neighbour);
    expect(overlaps(btt, n), "back-to-top must not overlap its corner neighbour").toBe(false);
  });

  // MT:1309:4 — a tap returns the page to the top. The row also names the
  //   smooth-vs-instant distinction; only the END STATE is asserted, because the
  //   suite runs under `reducedMotion: reduce` (playwright.config.ts), which is
  //   the branch BackToTop.jsx:74 reads — so a "smooth" assertion here would be
  //   measuring the harness, not the app.
  test("tapping it returns the page to the top", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    const vh = await page.evaluate(() => window.innerHeight);
    await page.evaluate((y) => window.scrollTo(0, y), vh * 2 + 40);
    await expect(backToTop(page)).toBeVisible(FIRST_PAINT);
    await backToTop(page).click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { message: "back at the top" }).toBeLessThanOrEqual(2);
  });

  // MT:1309:5 — «חזרי על הבדיקות ב-/producers» is NOT converted here, and the
  //   reason is measured rather than a scope preference. `/producers` renders
  //   its own catalog; with the sandbox's empty backend the document is
  //   **1456px** tall at 1440×900, below the 2 × viewport + 40 = 1840px this
  //   button reveals at (BackToTop.jsx REVEAL_VIEWPORTS), so the control cannot
  //   be driven at all without a `/producers` fixture — and `/producers` is
  //   chunk 5's route, with chunk 5's fixture. Re-homed there rather than
  //   duplicated here. ProducersClient.jsx:996 mounts the same <BackToTop />,
  //   so the component itself is already covered by the four rows above.
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › filter chips + FilterSheet (MEH-1418 · task 12)", () => {
  // MT:1418:1 + MT:T12:1 — DRIFT, and it is the largest in this chunk. Both rows
  //   describe a FLAT chip row (the checklist says 4 chips, the matrix note says
  //   7). MEH-2173 replaced it with TWO promoted chips plus one «סינון» trigger,
  //   so the live row is asserted and the counts in the doc are recorded as
  //   stale in docs/qa/conversion-progress.md. What survives from MEH-1418
  //   unchanged is the claim under test here: each toggle carries a leading
  //   aria-hidden glyph and the taxonomy's own label.
  test("the home filter row is exactly the two promoted chips plus the sheet trigger, each with an aria-hidden glyph", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    const row = scope(page).getByTestId("home-filter-row");
    await expect(row.getByRole("button")).toHaveCount(PROMOTED.length + 1); // + the sheet trigger
    for (const key of PROMOTED) {
      const chip = promotedChip(page, key);
      await expect(chip).toBeVisible();
      await expect(chip).toHaveText(AXES[key].label);
      // The glyph is present AND hidden from the accessible name.
      await expect(chip.locator("[aria-hidden='true']")).toHaveCount(1);
    }
    await expect(filtersButton(page)).toContainText(FILTERS_BTN);
  });

  // MT:1418:2 — the pre-MEH-1418 label must be gone from every home surface.
  //   DRIFT: the row expects «רישוי מאומת»; MEH-2214 shortened the axis label to
  //   «מאומת» (filter-taxonomy.js:123). The live label is asserted from the
  //   taxonomy, and the DENY-list half of the row — no «מאומתים» — is asserted
  //   as written, since that is the part that is actually a regression guard.
  test("the verification chip carries the taxonomy label and «מאומתים» appears nowhere on the page", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await expect(promotedChip(page, "verified")).toHaveText(AXES.verified.label);
    await filtersButton(page).click();
    await expect(sheetPanel(page)).toBeVisible(FIRST_PAINT);
    await expect(sheetPanel(page).getByTestId("chip-verified")).toContainText(AXES.verified.label);
    const body = await page.locator("body").innerText();
    expect(body, "the superseded verification label must not come back").not.toContain(STALE_VERIFIED_LABEL);
  });

  // MT:1418:5 — every toggle in the sheet shows a glyph + label with its
  //   explanation reachable beside it; the sheet opens and closes normally (Esc).
  //
  //   DRIFT: the row describes a permanent muted line UNDER each toggle. MEH-2169
  //   replaced that with two shapes, and the split is by GROUP, not by axis:
  //     · non-diet rows  → a sibling ⓘ (`chip-info-<key>`) whose Popover carries
  //                        the string (FilterSheet.jsx:390); `verified` has no
  //                        subtext of its own and falls back to the badge tooltip
  //                        (`chipSubtext`, :68-70), so it gets one too.
  //     · the diet group → a 2-col pill grid with NO per-row ⓘ and ONE group-level
  //                        scope line, `filters.sheet.diet_scope` (:279-283).
  //   Both live shapes are asserted, derived from `FILTER_AXES[...].group`.
  test("the FilterSheet gives every toggle a label, keeps every explanation reachable, and Esc closes it", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await filtersButton(page).click();
    const panel = sheetPanel(page);
    await expect(panel).toBeVisible(FIRST_PAINT);
    const diet = HOME_CHIPS.filter((c) => AXES[c.key]?.group === "diet");
    const rows = HOME_CHIPS.filter((c) => AXES[c.key]?.group !== "diet");
    expect(diet.length, "the diet group must be non-empty or its branch asserts nothing").toBeGreaterThan(0);
    expect(rows.length, "the row group must be non-empty or its branch asserts nothing").toBeGreaterThan(0);
    // Every home axis is present and labelled, whichever shape it takes.
    for (const chip of HOME_CHIPS) {
      await expect(panel.getByTestId(`chip-${chip.key}`)).toContainText(chip.label);
    }
    // Non-diet rows: the explanation is reachable through the ⓘ, by tap.
    const withInfo = rows.find((c) => AXES[c.key]?.subtext);
    if (!withInfo) throw new Error("no non-diet home axis declares a subtext — the premise is gone");
    const info = panel.getByTestId(`chip-info-${withInfo.key}`);
    await expect(info).toBeVisible();
    await info.click();
    await expect(panel.getByTestId(`chip-info-panel-${withInfo.key}`)).toHaveText(String(AXES[withInfo.key].subtext));
    // The diet group carries its one shared scope line instead of per-row ones.
    await expect(panel).toContainText(he.filters.sheet.diet_scope);
    for (const chip of diet) {
      await expect(panel.getByTestId(`chip-info-${chip.key}`), "a diet pill carries no ⓘ of its own").toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  // MT:1418:6 — a screen reader hears the LABEL only: the glyph is aria-hidden
  //   and the explanation is not part of the toggle's accessible name. The ⓘ is a
  //   SIBLING button (FilterSheet.jsx:349-352 — a button inside a button is
  //   invalid HTML), which is exactly why the name stays clean.
  test("a toggle's accessible name is its label alone — not the glyph, not the explanation", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await filtersButton(page).click();
    await expect(sheetPanel(page)).toBeVisible(FIRST_PAINT);
    const target = HOME_CHIPS.find((c) => AXES[c.key]?.group !== "diet" && AXES[c.key]?.subtext);
    if (!target) throw new Error("no non-diet home axis declares a subtext — the premise is gone");
    const row = sheetPanel(page).getByTestId(`chip-${target.key}`);
    const name = await row.evaluate((el) => (el as HTMLElement).getAttribute("aria-label") || el.textContent || "");
    expect(name, "the accessible name carries the label").toContain(target.label);
    expect(name, "…and not the explanation").not.toContain(String(AXES[target.key].subtext));
    // The glyph beside the label is hidden from the name.
    await expect(row.locator("[aria-hidden='true']").first()).toBeAttached();
    // The explanation is nonetheless REACHABLE beside it.
    await expect(sheetPanel(page).getByTestId(`chip-info-${target.key}`)).toBeVisible();
  });

  // MT:T12:4 + MT:T12:5 — inactive vs active chip presentation. Asserted as the
  //   PRESSED STATE plus a background-colour CHANGE, not as literal hex: the
  //   row's "white bg / primary-green bg" names design tokens that MEH-2173
  //   restyled, and a hex literal here would pin a token rather than the state
  //   machine the row is really about.
  test("a promoted chip toggles its pressed state and its fill", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    const chip = promotedChip(page, "has_delivery");
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    const inactiveFill = await chip.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const activeFill = await chip.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
    expect(activeFill, "an active chip is filled differently from an inactive one").not.toBe(inactiveFill);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(chip).toHaveCSS("background-color", inactiveFill);
  });

  // MT:T12:6 + MT:T12:7 + MT:T12:9 — toggling a chip re-queries with that axis's
  //   own param, and toggling it off drops the param again.
  test("toggling a chip adds its query param, toggling it off removes it", async ({ page }) => {
    const seen = await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    const before = seen.producers.length;
    await promotedChip(page, "has_delivery").click();
    await expect.poll(() => seen.producers.length, { message: "a chip toggle re-queries" }).toBeGreaterThan(before);
    await expect
      .poll(() => seen.producers[seen.producers.length - 1].searchParams.has("has_delivery"), {
        message: "the request carries has_delivery",
      })
      .toBe(true);
    const afterOn = seen.producers.length;
    await promotedChip(page, "has_delivery").click();
    await expect(promotedChip(page, "has_delivery")).toHaveAttribute("aria-pressed", "false");
    // Same `some`-over-the-window framing as the compose row below: a request
    // fired AFTER the toggle-off must be free of the param. Indexing the last
    // entry would make this hostage to a trailing re-query.
    await expect
      .poll(() => seen.producers.slice(afterOn).some((u) => !u.searchParams.has("has_delivery")), {
        message: "…and a request without the param follows the toggle-off",
      })
      .toBe(true);
  });

  // MT:T12:8 — multi-select: two axes at once compose into ONE request carrying
  //   BOTH params. The row names כשר + אורגני; `organic` was removed outright
  //   (MEH-1259) and `kosher` is verified-only since MEH-986, so the pair used
  //   here is the live promoted pair. The claim under test — composition — is
  //   unchanged; the axes it is asserted on are not.
  test("two active chips compose into one request carrying both params", async ({ page }) => {
    const seen = await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    // Gate on the FIRST chip's own state before pressing the second. Clicking both
    // back-to-back is a race: the second handler can run against the pre-first
    // render, and the two axes then leave as two single-param requests instead of
    // one composed one — observed once in 5 runs on the mobile project, which is
    // exactly the intermittence a spec must not ship with.
    await promotedChip(page, "verified").click();
    await expect(promotedChip(page, "verified")).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => seen.producers[seen.producers.length - 1]?.searchParams.has("verified"), {
        message: "the first axis is applied before the second is pressed",
      })
      .toBe(true);
    await promotedChip(page, "has_delivery").click();
    // `some`, not "the LAST request". The claim under test is that the two axes
    // leave together on ONE request — which `some` states exactly. Reading the
    // last entry instead makes the assertion hostage to any trailing re-query the
    // page fires afterwards (the URL sync in use-home-page runs on its own
    // schedule), and that is what made this row intermittent on the mobile
    // project: 2 of 7 runs, always with both chips visibly pressed.
    await expect
      .poll(
        () =>
          seen.producers.some(
            (u) => u.searchParams.has("verified") && u.searchParams.has("has_delivery"),
          ),
        { message: "one request carries BOTH params" },
      )
      .toBe(true);
    // Both chips read as pressed at the same time — the multi-select claim.
    await expect(promotedChip(page, "verified")).toHaveAttribute("aria-pressed", "true");
    await expect(promotedChip(page, "has_delivery")).toHaveAttribute("aria-pressed", "true");
  });

  // MT:T12:13 — clearing the CATEGORY leaves the attribute chips standing.
  test("clearing the category keeps the attribute chips active", async ({ page }) => {
    await gotoWithFeed(page, `/?category=${CAT_A.id}`);
    await expect(cards(page)).toHaveCount(CAT_A_MEMBERS.length, FIRST_PAINT);
    await promotedChip(page, "has_delivery").click();
    await expect(promotedChip(page, "has_delivery")).toHaveAttribute("aria-pressed", "true");
    await scope(page)
      .getByRole("button", { name: `${PROD.clear_filter} ${CAT_A.name}` })
      .click();
    await expect(scope(page).getByRole("heading", { level: 2, name: PROD.heading })).toBeVisible();
    await expect(promotedChip(page, "has_delivery"), "the chip survives a category clear").toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // MT:T12:20 — "load more" still works after a chip-filtered result. DRIFT: the
  //   row calls it «הצגי עוד»; the live label is `home.producers.load_more`
  //   («עוד בתי עסק»), read from the JSON so a copy edit moves it.
  test("load-more expands a chip-filtered grid", async ({ page }) => {
    await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    await promotedChip(page, "has_delivery").click();
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
    await expect(counter(page)).toHaveText(
      PROD.counter.replace("{shown}", String(PAGE_SIZE)).replace("{total}", String(PRODUCERS.length)),
    );
    await scope(page).getByRole("button", { name: PROD.load_more }).click();
    await expect(cards(page)).toHaveCount(PRODUCERS.length);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › discovery seam — dynamic heading + removable tag (MEH-1174)", () => {
  // MT:1174:2 — no active category ⇒ the default heading.
  test("with no category active the section heading is the default", async ({ page }) => {
    await gotoWithFeed(page);
    await expect(scope(page).getByRole("heading", { level: 2, name: PROD.heading })).toBeVisible(FIRST_PAINT);
  });

  // MT:1174:3 + MT:1174:4 — `/?category=<id>` ⇒ the category heading and a
  //   removable tag; the ✕ clears both.
  test("a category deep-link renames the heading and adds a removable tag whose ✕ clears it", async ({ page }) => {
    await gotoWithFeed(page, `/?category=${CAT_A.id}`);
    const named = PROD.heading_category.replace("{name}", CAT_A.name);
    await expect(scope(page).getByRole("heading", { level: 2, name: named })).toBeVisible(FIRST_PAINT);
    await expect(cards(page)).toHaveCount(CAT_A_MEMBERS.length);
    const tag = scope(page).getByRole("button", { name: `${PROD.clear_filter} ${CAT_A.name}` });
    await expect(tag).toBeVisible();
    await tag.click();
    await expect(scope(page).getByRole("heading", { level: 2, name: PROD.heading })).toBeVisible();
    await expect(tag).toHaveCount(0);
    await expect(page).toHaveURL(/\/(he\/?)?(\?|$)/);
  });

  // MT:1174:5 — a chip AND a category are both listed in the applied row, and
  //   the counter keeps counting.
  test("an active chip and an active category both appear in the applied-filters row", async ({ page }) => {
    await gotoWithFeed(page, `/?category=${CAT_A.id}`);
    await expect(cards(page)).toHaveCount(CAT_A_MEMBERS.length, FIRST_PAINT);
    // `has_delivery` is PROMOTED, so its tag lives on the chip itself
    // (HomeProducersGrid.jsx:249-251 excludes promoted keys from the tag row) —
    // the tag row is exercised through the sheet, with a NON-promoted axis.
    await filtersButton(page).click();
    await expect(sheetPanel(page)).toBeVisible(FIRST_PAINT);
    const nonPromoted = HOME_CHIPS.find((c) => !(PROMOTED as readonly string[]).includes(c.key));
    if (!nonPromoted) throw new Error("every home axis is promoted — the tag row has no possible subject");
    await sheetPanel(page).getByTestId(`chip-${nonPromoted.key}`).click();
    await page.keyboard.press("Escape");
    await expect(scope(page).getByTestId(`home-active-filter-${nonPromoted.key}`)).toBeVisible();
    await expect(scope(page).getByRole("button", { name: `${PROD.clear_filter} ${CAT_A.name}` })).toBeVisible();
    await expect(counter(page)).toBeVisible();
  });

  // MT:1174:6 — the applied row reads in the RTL direction and nothing overflows.
  test("the applied-filters row is RTL and does not overflow", async ({ page }) => {
    await gotoWithFeed(page, `/?category=${CAT_A.id}`);
    const heading = scope(page).getByRole("heading", {
      level: 2,
      name: PROD.heading_category.replace("{name}", CAT_A.name),
    });
    await expect(heading).toBeVisible(FIRST_PAINT);
    await expect(heading).toHaveCSS("direction", "rtl");
    await noHorizontalOverflow(page);
  });

  // MT:1174:1 — the step-0 onboarding tip opens ABOVE the section heading (not
  //   between the heading and the chips row) after the 2 s delay, on a first
  //   visit; the CTA advances the tour.
  test("the onboarding tip opens above the section heading and advances", async ({ page }, info) => {
    mobileOnly(info, "the row specifies נייד; the tour's placement claim is about the mobile stack");
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    const tip = scope(page).getByTestId("onboarding-tip");
    await expect(tip).toBeVisible({ timeout: 20_000 }); // 2 s delay, use-home-page.js:199
    await expect(tip).toContainText(PROD.onboarding0.slice(0, 18));
    const heading = scope(page).getByRole("heading", { level: 2, name: PROD.heading });
    const [t, h] = [await box(tip), await box(heading)];
    expect(t.y + t.height, "the tip sits ABOVE the section heading").toBeLessThanOrEqual(h.y + 1);
    // The CTA ADVANCES the tour rather than ending it, and — measured here —
    // step 0's bubble does NOT unmount when step 1's appears: two
    // `onboarding-tip` elements co-exist (HomeProducersGrid.jsx:257 above the
    // heading, :363 beside the chips). A `toHaveCount(0)` would therefore assert
    // the tour is broken, and an unscoped `toContainText` throws on strict mode.
    // Both bubbles are asserted BY THEIR OWN TEXT, and the co-existence is
    // recorded as an observation in docs/qa/conversion-progress.md — it is a
    // 5-state question for MEH-1174's owner, not something this chunk decides.
    await tip.getByRole("button", { name: he.modals.onboarding_tip.cta_default }).click();
    const tips = scope(page).getByTestId("onboarding-tip");
    await expect(tips.filter({ hasText: PROD.onboarding1.slice(0, 18) })).toHaveCount(1, FIRST_PAINT);
    await expect(tips, "step 0 and step 1 are both mounted after the advance").toHaveCount(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › cause-aware empty state (MEH-1085)", () => {
  // MT:1085:2 — the empty state's «נקו את הסינון» drops the category from the
  //   URL and brings the grid back. Rows 1, 3-9 are COVERED at component level
  //   (HomeEmptyStateCauseAware.test.jsx:44-77, ProducersClientCategoryAxis
  //   .test.jsx:91-145, attributeLabels/mapChips.test.js, EventsUrlSync.test.jsx)
  //   and are cited, not duplicated.
  test("«נקו את הסינון» clears the category from the URL and restores the grid", async ({ page }) => {
    // The feed answers the FILTERED query with nothing and the unfiltered one
    // with everything — which is what makes the CTA's effect observable.
    await gotoWithFeed(page, `/?category=${CAT_EMPTY.id}`, (u: URL) =>
      u.searchParams.has("category") ? [] : PRODUCERS,
    );
    const empty = scope(page).getByTestId("empty-generic");
    await expect(empty).toBeVisible(FIRST_PAINT);
    await expect(empty.getByRole("heading", { level: 3, name: PROD.empty_heading_category })).toBeVisible();
    await empty.getByRole("button", { name: PROD.clear_category_cta }).click();
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
    await expect(page).toHaveURL(/\/(he\/?)?(\?|$)/);
    await expect(scope(page).getByRole("heading", { level: 2, name: PROD.heading })).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › day-filter zero state (MEH-2197 + MEH-2198)", () => {
  /**
   * A city+day query that returns nothing, with the REGION fallback answering.
   * `use-home-page.js:441` issues the region query as
   * `?delivery_cities=<region cities>`; the city+day query carries the day.
   */
  const dayZeroFeed = (u: URL): Producer[] => {
    if (u.searchParams.getAll("delivery_cities").length > 0) return REGION_FALLBACK;
    if (u.searchParams.getAll("delivery_days").length > 0 || u.searchParams.getAll("day").length > 0) return [];
    if (u.searchParams.has("delivery_city")) return [];
    return PRODUCERS;
  };

  /** Drive the UI into "city chosen" before the URL applies the day. */
  const seedCity = (page: Page) => seedStorage(page, "user_city", CITY); // lib/use-user-city.js STORAGE_KEY
  const dayUrl = `/?city=${encodeURIComponent(CITY)}&day=${encodeURIComponent(DAY_NOBODY)}`;
  const cityUrl = `/?city=${encodeURIComponent(CITY)}`;

  // MT:2197:1 + MT:2197:3 — the message is ONE compact line carrying an inline
  //   clear-day link, and it is the ONLY zero state on screen: the generic
  //   leaf-and-map block must not stack under it. The row's 36px/56px
  //   measurements are NOT asserted — a px height is a font-metric claim,
  //   recorded as residual in conversion-progress.md.
  test("a day that nobody delivers on shows one compact line with an inline clear-day link, and no second empty block", async ({ page }) => {
    await seedCity(page);
    await gotoWithFeed(page, dayUrl, dayZeroFeed);
    const note = scope(page).getByTestId("day-empty-suggestion");
    await expect(note).toBeVisible(FIRST_PAINT);
    await expect(note).toContainText(
      PROD.day_empty_suggestion.replace("{city}", CITY).replace("{day}", DAY_NOBODY),
    );
    await expect(note.getByRole("button", { name: PROD.day_empty_clear_cta })).toBeVisible();
    // The discriminating half: exactly ONE zero state.
    await expect(
      scope(page).getByTestId("empty-generic"),
      "the generic empty block must not stack under it",
    ).toHaveCount(0);
  });

  // MT:2197:2 — the header must not claim the city is unserved: with a day
  //   active it reads the "בינתיים" variant, never the "אין עדיין משלוחים" one.
  test("with a day active the fallback header is the region variant, not the unserved-city one", async ({ page }) => {
    await seedCity(page);
    await gotoWithFeed(page, dayUrl, dayZeroFeed);
    const fallback = scope(page).getByTestId("region-fallback");
    await expect(fallback).toBeVisible(FIRST_PAINT);
    const header = fallback.locator("> h3");
    await expect(header).toHaveText(PROD.region_fallback_header_days.replace("{region}", REGION.name));
    await expect(header).not.toContainText(PROD.region_fallback_header.split("{city}")[0]);
  });

  // MT:2197:4 — the CITY-ONLY path is untouched: the old header, and ZERO day
  //   captions on the fallback cards.
  test("the city-only path keeps the old header and shows no day captions", async ({ page }) => {
    await seedCity(page);
    await gotoWithFeed(page, cityUrl, dayZeroFeed);
    const fallback = scope(page).getByTestId("region-fallback");
    await expect(fallback).toBeVisible(FIRST_PAINT);
    await expect(fallback.locator("> h3")).toHaveText(
      PROD.region_fallback_header.replace("{city}", CITY).replace("{region}", REGION.name),
    );
    await expect(
      scope(page).getByTestId("fallback-day-caption"),
      "no day captions on the city-only path",
    ).toHaveCount(0);
  });

  // MT:2197:5 + MT:2197:6 + MT:2197:7 — the caption matrix, all three cells in
  //   one test because the third cell is an ABSENCE that only discriminates
  //   beside the two presences (a "no caption" assertion alone is green when the
  //   feature is deleted entirely).
  test("fallback captions: week-ordered days · by-arrangement · and NO caption for a business with no row for the city", async ({ page }) => {
    await seedCity(page);
    await gotoWithFeed(page, dayUrl, dayZeroFeed);
    const fallback = scope(page).getByTestId("region-fallback");
    await expect(fallback).toBeVisible(FIRST_PAINT);
    await expect(fallback.getByTestId("producer-card")).toHaveCount(REGION_FALLBACK.length);
    // Exactly two of the three fallback cards carry a caption — P3 has no
    // delivery_areas row for CITY, and inventing one there would be an
    // unverifiable delivery promise (HomeProducersGrid.jsx:55-68).
    await expect(fallback.getByTestId("fallback-day-caption")).toHaveCount(2);
    // (a) days in WEEK order, `·`-separated — the fixture declares them out of order.
    await expect(fallback.getByTestId("fallback-day-caption").first()).toHaveText(
      PROD.fallback_day_caption.replace("{city}", CITY).replace("{days}", DAYS_IN_ORDER.join(" · ")),
    );
    // (b) a row with a null day = by arrangement.
    await expect(fallback.getByTestId("fallback-day-caption").nth(1)).toHaveText(
      PROD.fallback_day_caption_flexible.replace("{city}", CITY),
    );
    // (c) the card with no row for the city carries NOTHING.
    const bare = fallback
      .getByTestId("producer-card")
      .filter({ has: page.getByRole("heading", { level: 3, name: P3.name, exact: true }) });
    await expect(bare).toHaveCount(1);
    await expect(bare.getByTestId("fallback-day-caption")).toHaveCount(0);
  });

  // MT:2197:8 — the caption stays INSIDE its own grid cell and does not run over
  //   the row beneath it (the 44px overflow this ticket fixed).
  test("a caption stays inside its own grid cell", async ({ page }, info) => {
    mobileOnly(info, "the row specifies 375; the overflow it names is a narrow-viewport failure");
    await seedCity(page);
    await gotoWithFeed(page, dayUrl, dayZeroFeed);
    const fallback = scope(page).getByTestId("region-fallback");
    await expect(fallback).toBeVisible(FIRST_PAINT);
    const caption = fallback.getByTestId("fallback-day-caption").first();
    const cell = fallback.locator("div.grid > div").first();
    const [c, cellBox] = [await box(caption), await box(cell)];
    expect(c.y + c.height, "the caption ends inside its own cell").toBeLessThanOrEqual(cellBox.y + cellBox.height + 1);
    expect(c.x, "…and inside it horizontally").toBeGreaterThanOrEqual(cellBox.x - 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › «קרוב אליי» is real geolocation (MEH-1269 · task 11)", () => {
  // MT:1269:1 + MT:T11:1 — the button is in the hero chips row, with a glyph,
  //   and no location chip exists before it is pressed.
  test("the near-me button is in the hero chips row and no location chip exists yet", async ({ page }) => {
    await gotoWithFeed(page);
    await expect(nearMe(page)).toBeVisible(FIRST_PAINT);
    await expect(nearMe(page).locator("svg")).toHaveCount(1);
    await expect(scope(page).getByTestId("location-filter-chip")).toHaveCount(0);
  });

  // MT:1269:2 + MT:T11:6 + MT:T11:7 — a GRANTED fix re-queries at radius 15,
  //   shows the location chip, and does it WITHOUT a reload.
  //   DRIFT, recorded: the whole task-11 block (rows 4-11) is marked STALE in
  //   the frozen matrix on the evidence that «handleNearMe no longer calls
  //   navigator.geolocation». That was true at the 13/07 triage and is FALSE
  //   today — MEH-1269 restored real geolocation four days later
  //   (use-home-page.js:645). The live behaviour is asserted.
  test("granting location re-queries at radius 15 and raises the location chip, with no reload", async ({ page, context }) => {
    await installGeo(page);
    await grantGps(context);
    const seen = await gotoWithFeed(page, "/", (u: URL) => (u.searchParams.has("lat") ? [P1, P2] : PRODUCERS));
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    await nearMe(page).click();
    const chip = scope(page).getByTestId("location-filter-chip");
    await expect(chip).toBeVisible(FIRST_PAINT);
    await expect(chip).toContainText(PROD.geo_chip);
    await expect(cards(page)).toHaveCount(2);
    const geoReq = seen.producers.filter((u) => u.searchParams.has("lat"));
    expect(geoReq.length, "a geo query fired").toBeGreaterThan(0);
    expect(geoReq[0].searchParams.get("radius_km"), "GEO_RADIUS_KM = 15 (use-home-page.js:66)").toBe("15");
    expect(geoReq[0].searchParams.get("lat")).toBe(String(GPS.latitude));
  });

  // MT:1269:3 — the chip's ✕ drops the location filter and reloads unfiltered.
  test("the location chip's ✕ clears the filter and reloads the full grid", async ({ page, context }) => {
    await installGeo(page);
    await grantGps(context);
    await gotoWithFeed(page, "/", (u: URL) => (u.searchParams.has("lat") ? [P1, P2] : PRODUCERS));
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    await nearMe(page).click();
    await expect(cards(page)).toHaveCount(2, FIRST_PAINT);
    await scope(page).getByTestId("location-filter-chip").click();
    await expect(scope(page).getByTestId("location-filter-chip")).toHaveCount(0);
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
  });

  // MT:1269:4 + MT:T11:8 — a DENIED prompt (code 1) opens the city modal. The
  //   row is explicit that it must not be an alert; asserted as the dialog
  //   opening AND the failure toast staying away.
  test("a denied prompt opens the city modal, not a toast", async ({ page }) => {
    await installGeo(page, 1);
    await gotoWithFeed(page);
    await nearMe(page).click();
    await expect(page.getByRole("dialog", { name: LOC_MODAL.title })).toBeVisible(FIRST_PAINT);
    await expect(page.getByText(HERO.geo_failure, { exact: true })).toHaveCount(0);
  });

  // MT:1269:5 — a TECHNICAL failure (code 2) toasts and leaves the grid alone.
  test("a technical geolocation failure toasts and does not change the grid", async ({ page }) => {
    await installGeo(page, 2);
    await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    await nearMe(page).click();
    await expect(page.getByText(HERO.geo_failure)).toBeVisible(FIRST_PAINT);
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
    await expect(scope(page).getByTestId("location-filter-chip")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: LOC_MODAL.title })).toHaveCount(0);
  });

  // MT:1269:6 — the empty-grid guard: nothing at 15 km ⇒ ONE automatic retry at
  //   30 km ⇒ still nothing ⇒ the chip goes, every business is shown, and the
  //   persistent notice explains why. The grid is never left silently empty.
  test("an empty near-me result retries once at 30 km, then falls back to the full list with a notice", async ({ page, context }) => {
    await installGeo(page);
    await grantGps(context);
    const seen = await gotoWithFeed(page, "/", (u: URL) => (u.searchParams.has("lat") ? [] : PRODUCERS));
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    await nearMe(page).click();
    await expect(scope(page).getByTestId("geo-empty-notice")).toBeVisible(FIRST_PAINT);
    await expect(scope(page).getByTestId("geo-empty-notice")).toHaveText(PROD.geo_empty);
    await expect(scope(page).getByTestId("location-filter-chip"), "the location chip is dropped").toHaveCount(0);
    await expect(cards(page), "the grid is never left empty").toHaveCount(PAGE_SIZE);
    const radii = seen.producers.filter((u) => u.searchParams.has("lat")).map((u) => u.searchParams.get("radius_km"));
    expect(radii, "exactly one widening retry, 15 → 30 (use-home-page.js:66-67)").toEqual(["15", "30"]);
  });

  // MT:1269:8 — a fix already in storage filters IMMEDIATELY, with no second
  //   browser prompt. The COUNT is what makes this discriminate: a
  //   "chip appears" assertion alone is green whether or not the browser was
  //   asked again.
  test("a stored fix filters immediately and never re-prompts the browser", async ({ page }) => {
    await installGeo(page); // counts calls; no denial
    await seedStorage(page, "user_location", JSON.stringify({ lat: GPS.latitude, lng: GPS.longitude }));
    await gotoWithFeed(page, "/", (u: URL) => (u.searchParams.has("lat") ? [P1, P2] : PRODUCERS));
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    expect(await geoCalls(page), "no prompt before the click").toBe(0);
    await nearMe(page).click();
    await expect(scope(page).getByTestId("location-filter-chip")).toBeVisible(FIRST_PAINT);
    await expect(cards(page)).toHaveCount(2);
    expect(await geoCalls(page), "the cached fix is used INSTEAD of a prompt").toBe(0);
  });

  // MT:1269:7 — choosing a city from the modal filters by it and raises the city
  //   variant of the chip; its ✕ clears.
  test("choosing a city from the modal raises the city chip, and its ✕ clears it", async ({ page }) => {
    await installGeo(page, 1); // denial is the documented route into the modal
    await gotoWithFeed(page, "/", (u: URL) => (u.searchParams.has("delivery_city") ? [P1] : PRODUCERS));
    await nearMe(page).click();
    const modal = page.getByRole("dialog", { name: LOC_MODAL.title });
    await expect(modal).toBeVisible(FIRST_PAINT);
    await modal.getByLabel(LOC_MODAL.search_label).fill(CITY);
    await modal.getByRole("option", { name: CITY, exact: true }).first().click();
    const chip = scope(page).getByTestId("location-filter-chip");
    await expect(chip).toBeVisible(FIRST_PAINT);
    await expect(chip).toContainText(PROD.city_chip.replace("{city}", CITY));
    await chip.click();
    await expect(chip).toHaveCount(0);
  });

  // MT:T11:5 — the in-flight label. DRIFT: the row quotes «מחפשת...»; the live
  //   string is `home.hero.searching`, read from he.json. The matrix marks this
  //   row STALE on the grounds that the loading state can never engage —
  //   refuted: use-home-page.js:643 sets it before the prompt.
  test("while locating, the button shows the searching label and is disabled", async ({ page }) => {
    // A prompt that never resolves holds the in-flight state open — the only
    // deterministic way to observe a state whose exit is a callback.
    await page.addInitScript(() => {
      Object.defineProperty(Geolocation.prototype, "getCurrentPosition", {
        configurable: true,
        value: () => {
          /* never calls back — the in-flight state stays up */
        },
      });
    });
    await gotoWithFeed(page);
    await nearMe(page).click();
    const busy = scope(page).getByTestId("hero-chips-row").getByRole("button", { name: HERO.searching });
    await expect(busy).toBeVisible(FIRST_PAINT);
    await expect(busy).toBeDisabled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › category cards — caption strip + hover zoom (MEH-1224)", () => {
  const catCards = (page: Page) => scope(page).getByTestId("home-category-card");

  // MT:1224:1 — the numeral + name sit on a solid strip BELOW the photo, and no
  //   text is painted over the image. Asserted geometrically (caption box
  //   entirely below the image box) plus the token claim that the strip is
  //   opaque — not as a hex literal.
  test("the caption sits on a solid strip below the photo, never over it", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await expect(catCards(page)).toHaveCount(CARDS.length, FIRST_PAINT);
    // The grid re-renders once `/categories` resolves (a card with an unresolved
    // id is an inert <div>, a resolved one a <Link>), which DETACHES the first
    // render's nodes. Gate on the resolved form before measuring anything.
    await expect(catCards(page).first()).toHaveAttribute("href", /category=/, FIRST_PAINT);
    const card = catCards(page).first();
    await card.scrollIntoViewIfNeeded();
    // Both rects in ONE evaluate: the card enters on a `whileInView` y-slide, so
    // two sequential boundingBox() reads can straddle the animation and report an
    // overlap that never existed on screen (measured: an 18px phantom).
    const rects = await card.evaluate((el) => {
      const f = el.querySelector('[data-testid="home-category-image-frame"]')!.getBoundingClientRect();
      const c = el.querySelector('[data-testid="home-category-caption"]')!.getBoundingClientRect();
      return { frameBottom: f.y + f.height, captionTop: c.y };
    });
    const caption = card.getByTestId("home-category-caption");
    await expect(card.getByTestId("home-category-image-frame")).toHaveCount(1);
    expect(rects.captionTop, "the caption starts at or below the image's bottom edge").toBeGreaterThanOrEqual(
      rects.frameBottom - 1,
    );
    const fill = await caption.evaluate((el) => {
      // Walk up to the first ancestor that paints a background — the strip's
      // fill comes from the card root (bg-surface-card), which is what makes it
      // opaque; a transparent chain would put the text over the photo.
      let n: HTMLElement | null = el as HTMLElement;
      while (n) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        n = n.parentElement;
      }
      return "rgba(0, 0, 0, 0)";
    });
    expect(fill, "the caption strip is painted, not transparent over the photo").not.toBe("rgba(0, 0, 0, 0)");
  });

  // MT:1224:2 — a motion-safe hover zoom on the photo (desktop).
  test("hovering an image card zooms the photo when motion is allowed", async ({ page }, info) => {
    desktopOnly(info, "the row specifies @1440px with a mouse; there is no hover state on the touch project");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await expect(catCards(page).first()).toHaveAttribute("href", /category=/, FIRST_PAINT);
    const card = catCards(page).first();
    const img = card.getByTestId("home-category-image");
    await card.scrollIntoViewIfNeeded();
    expect(await scaleX(img), "the photo is at rest before the hover").toBe(1);
    await card.hover();
    // Poll the NUMBER, not a before/after string comparison: the 300ms transition
    // means any single read can land mid-flight, and the resting value itself
    // alternates between "none" and an identity matrix.
    await expect
      .poll(() => scaleX(img), { message: "the photo scales UP on hover (motion-safe:group-hover:scale-105)" })
      .toBeGreaterThan(1);
  });

  // MT:1224:3 — under reduce-motion the photo does NOT zoom. This is the mirror
  //   of the test above, and the PAIR is what discriminates: either alone is
  //   green on an app that lost the hover zoom entirely.
  test("under reduce-motion the photo does not zoom on hover", async ({ page }, info) => {
    desktopOnly(info, "there is no hover state on the touch project");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await expect(catCards(page).first()).toHaveAttribute("href", /category=/, FIRST_PAINT);
    const card = catCards(page).first();
    const img = card.getByTestId("home-category-image");
    await card.scrollIntoViewIfNeeded();
    expect(await scaleX(img), "the photo is at rest before the hover").toBe(1);
    await card.hover();
    // Inverted bounded wait (.claude/rules/testing.md): await the UNWANTED event
    // and require that it times out. A single read straight after `hover()` would
    // be green on a build where the zoom IS live — it would just be sampling
    // before the 300ms transition started, which is the green-for-two-reasons
    // shape. This resolves instantly if the zoom fires and reports false after
    // the bound if it never does.
    const zoomed = await page
      .waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="home-category-image"]');
          if (!el) return false;
          const m = /matrix\(([^,]+),/.exec(getComputedStyle(el).transform);
          return m ? Number(m[1]) > 1.001 : false;
        },
        null,
        { timeout: 2_000 },
      )
      .then(() => true)
      .catch(() => false);
    expect(zoomed, "the photo must stay at rest under reduce-motion").toBe(false);
  });

  // MT:1224:4 — the image frame holds its proportion from the first paint (zero
  //   CLS), which is what the "slow connection" instruction is really testing.
  test("every image frame locks an aspect ratio, so the cards cannot jump as photos load", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await expect(catCards(page)).toHaveCount(CARDS.length, FIRST_PAINT);
    const frames = catCards(page).getByTestId("home-category-image-frame");
    await expect(frames).toHaveCount(CARDS.length);
    const ratios = await frames.evaluateAll((els) => els.map((el) => getComputedStyle(el as HTMLElement).aspectRatio));
    expect(ratios.length).toBe(CARDS.length);
    for (const r of ratios) expect(r, "every image frame declares an aspect-ratio (zero CLS)").not.toBe("auto");
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › producer grid geometry (MEH-1142 · task 9)", () => {
  // MT:T9:1 + MT:T9:6 — 2 columns on mobile, 4 on desktop.
  test("the producer grid is 2 columns on mobile and 4 on desktop", async ({ page }, info) => {
    await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    const grid = scope(page).getByTestId("home-producers-grid");
    await expect(grid).toHaveCount(1);
    expect(await columnCount(grid)).toBe(isDesktop(info) ? 4 : 2);
  });

  // MT:T9:5 — the tablet band (768–1023) stays 2 columns. Asserted by resizing
  //   INSIDE the desktop project rather than adding a third project.
  test("the tablet band stays 2 columns", async ({ page }, info) => {
    desktopOnly(info, "resizing is done from the desktop project so the mobile project keeps its device metrics");
    await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    const grid = scope(page).getByTestId("home-producers-grid");
    await page.setViewportSize({ width: 800, height: 900 });
    await expect.poll(() => columnCount(grid), { message: "tablet = 2 columns" }).toBe(2);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => columnCount(grid), { message: "desktop = 4 columns" }).toBe(4);
  });

  // MT:T9:2 — the gap is tighter on mobile than on desktop (gap-3 → md:gap-6).
  test("the grid gap is tighter on mobile than on desktop", async ({ page }, info) => {
    desktopOnly(info, "the row compares two viewports; the comparison is done in one run rather than across projects");
    await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    const grid = scope(page).getByTestId("home-producers-grid");
    const gapAt = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el as HTMLElement).columnGap));
    await page.setViewportSize({ width: 390, height: 900 });
    const mobileGap = await gapAt(grid);
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopGap = await gapAt(grid);
    expect(mobileGap, "mobile gap is 12px (gap-3)").toBe(12);
    expect(desktopGap, "desktop gap is 24px (md:gap-6)").toBe(24);
    expect(mobileGap).toBeLessThan(desktopGap);
  });

  // MT:1142:1 — every card in a row ends at the same height, including cards
  //   with no description or rating. Asserted as an EQUALITY across the row, not
  //   as a literal height.
  test("cards in the same row are the same height", async ({ page }, info) => {
    await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    const perRow = isDesktop(info) ? 4 : 2;
    const boxes = await cards(page).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), height: Math.round(r.height) };
      }),
    );
    // Group by row (same rounded top), then require ONE distinct height per row.
    const rows = new Map<number, number[]>();
    for (const b of boxes) rows.set(b.top, [...(rows.get(b.top) ?? []), b.height]);
    expect(rows.size, `${PAGE_SIZE} cards at ${perRow} per row`).toBe(Math.ceil(PAGE_SIZE / perRow));
    for (const [top, heights] of rows) {
      expect(new Set(heights).size, `row at y=${top} must have ONE card height, got ${heights.join("/")}`).toBe(1);
    }
  });

  // MT:T9:9 + MT:T9:11 — the photo fills its frame with object-cover, and the
  //   city/category line truncates rather than wrapping.
  test("card photos are object-cover and the city line truncates", async ({ page }) => {
    await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    const long = cards(page).filter({ has: page.getByRole("heading", { level: 3, name: P5.name, exact: true }) });
    await expect(long).toHaveCount(1);
    await long.scrollIntoViewIfNeeded();
    await expect(long.locator("img").first()).toHaveCSS("object-fit", "cover");
    // The clipping element is the INNER `truncate` span (ProducerCard.jsx:546),
    // not the flex `<p>` around it — the row overflows inside, so measuring the
    // wrapper reports scrollWidth === clientWidth and proves nothing.
    const line = long.getByTestId("location-line");
    await expect(line).toHaveCSS("text-overflow", "ellipsis");
    const inner = line.locator("span.truncate");
    await expect(inner).toHaveCSS("text-overflow", "ellipsis");
    const [scrollW, clientW] = await inner.evaluate((el) => [el.scrollWidth, (el as HTMLElement).clientWidth]);
    expect(scrollW, "the long city line is genuinely being clipped").toBeGreaterThan(clientW);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › above-the-fold mini-map + trust band (MEH-604 · MEH-607)", () => {
  // MT:604:1 — the map is the SECOND block, not section #7. Asserted as DOM
  //   order, read from the landmark rather than from a count of what happened
  //   to render.
  test("the mini-map is the second block on the page, right after the hero", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    for (const id of ["home-hero", "home-minimap", "home-trust-band"]) {
      await expect(scope(page).getByTestId(id), `${id} renders exactly once`).toHaveCount(1, FIRST_PAINT);
    }
    const between = await page.evaluate(() => {
      const hero = document.querySelector('[data-testid="home-hero"]')!.closest("section")!;
      const map = document.querySelector('[data-testid="home-minimap"]')!;
      const mapSection = map.closest("section") ?? map;
      let n: Element | null = hero.nextElementSibling;
      let count = 0;
      while (n && n !== mapSection && !n.contains(mapSection)) {
        count += 1;
        n = n.nextElementSibling;
      }
      return n ? count : -1;
    });
    expect(between, "the mini-map is the hero's immediate next block").toBe(0);
    // …and the trust band comes after it, not before.
    // `home-minimap` is a `dynamic({ ssr:false, loading })` slot: the skeleton is
    // REPLACED by the live map, which detaches the node a boundingBox() read was
    // about to measure (observed on the mobile project: "element has no box").
    // Both offsets in one evaluate, off the document rather than the viewport.
    const tops = await page.evaluate(() => {
      const y = (id: string) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el ? el.getBoundingClientRect().top + window.scrollY : NaN;
      };
      return { map: y("home-minimap"), trust: y("home-trust-band") };
    });
    expect(Number.isNaN(tops.map) || Number.isNaN(tops.trust), "both blocks are in the document").toBe(false);
    expect(tops.map, "the mini-map is above the trust band").toBeLessThan(tops.trust);
  });

  // MT:604:3 — three tile preconnect links, all crossOrigin="anonymous".
  test("the document head preconnects to all three OSM tile hosts", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const tiles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[rel="preconnect"]'))
        .map((l) => ({ href: (l as HTMLLinkElement).href, cors: (l as HTMLLinkElement).crossOrigin }))
        .filter((l) => /tile\.openstreetmap\.org/.test(l.href)),
    );
    expect(
      tiles.map((t) => t.href).sort(),
      "a, b and c — no more, no fewer",
    ).toEqual([
      "https://a.tile.openstreetmap.org/",
      "https://b.tile.openstreetmap.org/",
      "https://c.tile.openstreetmap.org/",
    ]);
    for (const t of tiles) expect(t.cors).toBe("anonymous");
  });

  // MT:607:2 — the trust band reserves its slot with a pulsing skeleton while
  //   /stats is in flight, and the real line replaces it in place.
  //   Rows 1, 3 and 4 are STALE (the גליון/month copy MEH-879 removed).
  //
  //   ⚠️ THE ROW'S "zero layout jump" HALF IS NOT SATISFIED ON THIS BUILD, AND IS
  //   DELIBERATELY NOT ASSERTED — in EITHER direction. Measured with a
  //   BELOW-threshold /stats payload (so the loaded band is one lead line, the
  //   fairest possible comparison), the band's own document offset moves between
  //   the busy state and the loaded one:
  //       desktop 1440×900   band top 1104 → 1140   (+36px)
  //       mobile   393×727   band top  879 →  915   (+36px)
  //   **The cause is NOT established.** The band's top moving means something
  //   ABOVE it grew, so the candidates are the band's own skeleton→text line-box
  //   swap (`<span class="h-5">` inside a `<p class="text-base">`,
  //   HomeClient.jsx:141-146), the mini-map's dynamic skeleton→Leaflet swap
  //   directly above it, or the hero image settling — and this spec did not
  //   separate them. Attributing it to one of the three would be exactly the
  //   unverified diagnosis workflow.md's Bug Protocol §6 forbids, so it ships as
  //   an unexplained observation in docs/qa/conversion-progress.md with the
  //   numbers above, for whoever owns MEH-607 / MEH-604 to bisect.
  //   What IS asserted is the part that holds and that the row is really about:
  //   the slot is reserved (aria-busy, non-zero height) and is REPLACED by the
  //   real lead in the same element rather than appearing from nothing.
  test("the trust band reserves a busy slot while /stats is in flight and the lead replaces it", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { statsDelayMs: 2_000, stats: { producers_count: 2, categories_count: 2 } });
    await page.goto("/");
    const band = scope(page).getByTestId("home-trust-band");
    await expect(band).toHaveCount(1, FIRST_PAINT);
    await expect(band).toHaveAttribute("aria-busy", "true");
    const skeleton = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="home-trust-band"]')!;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    expect(skeleton.height, "the skeleton reserves a real slot, not zero height").toBeGreaterThan(0);
    await expect(scope(page).getByTestId("trust-lead")).toBeVisible(FIRST_PAINT);
    await expect(band).not.toHaveAttribute("aria-busy", "true");
    const loaded = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="home-trust-band"]')!;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    // The band still occupies a real slot after the swap — i.e. the skeleton was
    // REPLACED, not removed and the section collapsed. The offset delta is
    // recorded (see the header block) rather than asserted, because its cause was
    // not isolated.
    expect(loaded.height, "the band still occupies a slot after the swap").toBeGreaterThan(0);
    expect(
      Math.abs(loaded.top - skeleton.top),
      "the observed shift stays in the range this chunk measured and reported (36px); a larger one is new breakage",
    ).toBeLessThanOrEqual(60);
  });

  // MT:607:1 replacement — the STALE «גליון מאי» copy is gone and the live lead
  //   comes from he.json; below the count threshold the secondary counter line
  //   is withheld. Written so the section is not left with zero live coverage.
  test("the trust band renders the he.json lead and, below the count threshold, no counter line", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { stats: { producers_count: 2, categories_count: 2 } });
    await gotoHome(page);
    await expect(scope(page).getByTestId("trust-lead")).toHaveText(TRUST.lead);
    await expect(
      scope(page).getByTestId("trust-secondary"),
      "below 5 businesses the secondary counter is withheld (use-home-page showStatsCounter)",
    ).toHaveCount(0);
    const body = await page.locator("body").innerText();
    expect(body, "the MEH-879-removed month framing must not come back").not.toContain("גליון");
  });

  // The discriminating twin of the test above: above the threshold the counter
  // line DOES render (either test alone is green on a band that never renders a
  // counter at all).
  test("above the count threshold the secondary line carries the category count and the countrywide phrase", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { stats: STATS_ABOVE });
    await gotoHome(page);
    const secondary = scope(page).getByTestId("trust-secondary");
    await expect(secondary).toBeVisible(FIRST_PAINT);
    await expect(secondary).toContainText(String(CATEGORIES.length));
    await expect(secondary).toContainText(STATS.categories);
    await expect(secondary).toContainText(STATS.countrywide);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › static home blocks (overnight design batch)", () => {
  // MT:ODB:3 — the how-it-works eyebrow + heading + three steps, with no
  //   terminal period on any heading.
  test("how-it-works renders its eyebrow, heading and three steps with no terminal period", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const block = scope(page).getByTestId("home-how-it-works");
    await expect(block).toHaveCount(1, FIRST_PAINT);
    await expect(block.getByRole("heading", { level: 2, name: HOW.heading })).toBeVisible();
    await expect(block).toContainText(HOW.eyebrow);
    const steps = [
      [HOW.step01_title, HOW.step01_text],
      [HOW.step02_title, HOW.step02_text],
      [HOW.step03_title, HOW.step03_text],
    ];
    await expect(block.getByTestId("home-how-step")).toHaveCount(steps.length);
    for (const [title, text] of steps) {
      await expect(block).toContainText(title);
      await expect(block).toContainText(text);
      expect(title.endsWith("."), `«${title}» must not end with a period`).toBe(false);
    }
    expect(HOW.heading.endsWith("."), "the section heading must not end with a period").toBe(false);
  });

  // MT:ODB:4 — the closing business block: heading + three body lines + button.
  test("the closing CTA renders its heading, three body lines and button", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const cta = scope(page).getByTestId("home-cta");
    await expect(cta).toHaveCount(1, FIRST_PAINT);
    await expect(cta.getByRole("heading", { level: 2, name: CTA.heading })).toBeVisible();
    for (const line of [CTA.body_l1, CTA.body_l2, CTA.body_l3]) await expect(cta).toContainText(line);
    await expect(cta.getByRole("link", { name: CTA.button })).toHaveAttribute("href", /\/register\/producer$/);
  });

  // MT:ODB:5 — the footer's copyright line: no leaf emoji. (The tagline's own
  //   copy is asserted from he.json rather than restated here.)
  test("the footer copyright line carries no leaf glyph", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible(FIRST_PAINT);
    const text = await footer.innerText();
    expect(text, "the copyright line must carry no leaf emoji").not.toContain("🌿");
    expect(text, "…and it does name the brand year line").toMatch(/©/);
  });

  // MT:ODB:2 (STALE, asserted as an absence beside a presence so it
  //   discriminates) + the home half of MEH-841 that chunk 3 deferred here: the
  //   comparison TEASER lives on home and links to /about, and the full
  //   comparison TABLE is gone from home.
  test("home carries the comparison teaser linking to /about, and no comparison table", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const teaser = scope(page).getByTestId("home-comparison-teaser");
    await expect(teaser).toHaveCount(1, FIRST_PAINT);
    await expect(teaser.getByRole("heading", { level: 2, name: TEASER.heading })).toBeVisible();
    await expect(teaser).toContainText(TEASER.eyebrow);
    await expect(teaser.getByRole("link", { name: new RegExp(TEASER.cta) })).toHaveAttribute("href", /\/about$/);
    await expect(scope(page).locator("table"), "the full comparison table moved to /about (MEH-841)").toHaveCount(0);
  });

  // MT:CCI adjacent — the live category grid, asserted so that section's seven
  //   STALE rows leave a live successor rather than a hole: TEN cards, each
  //   named by lib/home-categories.js, and NO tint layer over any photo (the
  //   65% green scrim MEH-1183 forbade).
  test("the category grid renders the ten declared cards with no tint over the photos", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    const grid = scope(page).getByTestId("home-category-grid");
    await expect(grid).toHaveCount(1, FIRST_PAINT);
    const names = await grid.getByTestId("home-category-card").getByRole("heading", { level: 3 }).allTextContents();
    expect(names, "one card per declaration in lib/home-categories.js").toEqual(CARDS.map((c) => c.name));
    await expect(grid.getByRole("heading", { level: 2, name: CATS_COPY.heading })).toBeVisible();
    // The forbidden scrim would be an absolutely-positioned sibling INSIDE the
    // image frame; there is exactly one child (the <img>) per frame.
    const overlays = await grid
      .getByTestId("home-category-image-frame")
      .evaluateAll((els) => els.map((el) => el.childElementCount));
    for (const n of overlays) expect(n, "no scrim/tint layer inside an image frame").toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › recently viewed (task 13)", () => {
  const stamped = (ids: string[]) =>
    JSON.stringify(ids.map((id) => ({ id, viewedAt: Date.now() }))); // lib/recently-viewed.js readRaw shape

  // MT:T13:5 + MT:T13:6 + MT:T13:9 — the band renders from storage as a
  //   horizontal row of image+name+city cards, and a card navigates.
  //   DRIFT, recorded: the row says the section appears ABOVE the main producer
  //   grid and calls it «ביקרת לאחרונה». MEH-912 demoted it to a band just above
  //   the closing CTA (BELOW the grid), and the live heading is
  //   `home.recent.heading`. Both are asserted as they live.
  test("the recently-viewed band renders from storage, below the grid, and its cards navigate", async ({ page }) => {
    await seedStorage(page, "recently_viewed", stamped([P1.id, P2.id]));
    await gotoWithFeed(page);
    const band = scope(page).getByTestId("home-recently-viewed");
    await expect(band).toBeVisible(FIRST_PAINT);
    await expect(band.getByRole("heading", { level: 2, name: RECENT.heading })).toBeVisible();
    const items = band.getByTestId("home-recent-card");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText(P1.name);
    await expect(items.first()).toContainText(String(P1.city));
    // Position: BELOW the producer grid (MEH-912), ABOVE the closing CTA.
    const [g, b, c] = [
      await box(scope(page).getByTestId("home-producers-grid")),
      await box(band),
      await box(scope(page).getByTestId("home-cta")),
    ];
    expect(b.y, "the band sits below the producer grid").toBeGreaterThan(g.y + g.height - 1);
    expect(b.y, "…and above the closing CTA").toBeLessThan(c.y);
    await items.first().click();
    await expect(page).toHaveURL(new RegExp(`/${P1.slug}$|/producer/${P1.id}$`));
  });

  // MT:T13:7 + MT:T13:10 — 160px-wide cards with 100px-tall images, in a row
  //   that scrolls horizontally.
  test("the cards are 160px wide with 100px images and the row scrolls horizontally", async ({ page }, info) => {
    await seedStorage(page, "recently_viewed", stamped(PRODUCERS.slice(0, 5).map((p) => p.id)));
    await gotoWithFeed(page);
    const band = scope(page).getByTestId("home-recently-viewed");
    await expect(band).toBeVisible(FIRST_PAINT);
    const card = band.getByTestId("home-recent-card").first();
    const cardBox = await box(card);
    expect(Math.round(cardBox.width), "w-[160px]").toBe(160);
    const imgBox = await box(card.getByTestId("home-recent-card-image"));
    expect(Math.round(imgBox.height), "h-[100px]").toBe(100);
    const rail = band.getByTestId("home-recent-rail");
    await expect(rail, "the rail is a horizontal scroller on every viewport").toHaveCSS("overflow-x", "auto");
    const [scrollW, clientW] = await rail.evaluate((el) => [el.scrollWidth, (el as HTMLElement).clientWidth]);
    if (isDesktop(info)) {
      // 5 x 160px + gaps fits inside 1440, so there is nothing to overflow — the
      // CSS assertion above is the whole claim here. Asserting an overflow on
      // desktop would be asserting the fixture size, not the component.
      expect(scrollW).toBeGreaterThanOrEqual(clientW - 1);
    } else {
      expect(scrollW, "five 160px cards overflow a phone-width rail, so it scrolls").toBeGreaterThan(clientW);
    }
  });

  // MT:T13:8 — a long name is clipped rather than wrapping the card open.
  test("a long business name truncates inside the card", async ({ page }) => {
    await seedStorage(page, "recently_viewed", stamped([P5.id]));
    await gotoWithFeed(page);
    const name = scope(page)
      .getByTestId("home-recently-viewed")
      .getByTestId("home-recent-card")
      .first()
      .locator("p")
      .first();
    await expect(name).toBeVisible(FIRST_PAINT);
    await expect(name).toHaveCSS("text-overflow", "ellipsis");
    const [scrollW, clientW] = await name.evaluate((el) => [el.scrollWidth, (el as HTMLElement).clientWidth]);
    expect(scrollW, "the long name is genuinely clipped").toBeGreaterThan(clientW);
  });

  // MT:T13:11 + MT:T13:12 — with nothing stored the band renders NOTHING (no
  //   empty state). Both rows describe the same world (empty storage), so they
  //   are one test; row 12 is entailed by row 11 and recorded as such.
  test("with no stored history the band is absent — no empty state", async ({ page }) => {
    await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    await expect(scope(page).getByTestId("home-recently-viewed")).toHaveCount(0);
    await expect(scope(page).getByText(RECENT.heading)).toHaveCount(0);
  });

  // MT:T13:13 — a stored id the backend no longer serves is dropped silently:
  //   the band still renders, one card short. The COUNT is what discriminates —
  //   "the band renders" alone is green whether or not the dead id was dropped.
  test("a stored id that no longer resolves is skipped, and the rest still render", async ({ page }) => {
    const dead = uuid(999);
    await seedStorage(page, "recently_viewed", stamped([P1.id, dead, P2.id]));
    await gotoWithFeed(page);
    const band = scope(page).getByTestId("home-recently-viewed");
    await expect(band).toBeVisible(FIRST_PAINT);
    await expect(band.getByTestId("home-recent-card"), "exactly the two live ids").toHaveCount(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › Friday delivery strip (סרגל שישי)", () => {
  // MT:FRI:1 — inside the Friday window (forced through the documented
  //   `friday_mode_override` localStorage flag, lib/friday-mode.js:6) and with
  //   businesses delivering today, the strip renders REAL copy — not an
  //   untranslated key path — and the cards carry the "today" badge.
  test("in the Friday window the strip renders real Hebrew copy, not a key path", async ({ page }) => {
    await seedStorage(page, "friday_mode_override", "1");
    await gotoWithFeed(page, "/", (u: URL) =>
      u.searchParams.get("availability_state") === "available_today" ? [P1, P2] : PRODUCERS,
    );
    const strip = scope(page).getByTestId("friday-delivery-strip");
    await expect(strip).toBeVisible(FIRST_PAINT);
    const text = await strip.innerText();
    expect(text, "the strip must not render an i18n key path").not.toMatch(I18N_KEY_PATH);
    await expect(strip.getByRole("heading", { level: 2, name: FRIDAY_HE.title_alt })).toBeVisible();
    await expect(strip).toContainText(FRIDAY_HE.today);
  });

  // MT:FRI:2 — the same strip on `/en`, in English.
  test("the same strip renders in English on /en", async ({ page }) => {
    await seedStorage(page, "friday_mode_override", "1");
    await gotoWithFeed(page, "/en", (u: URL) =>
      u.searchParams.get("availability_state") === "available_today" ? [P1, P2] : PRODUCERS,
    );
    const strip = scope(page).getByTestId("friday-delivery-strip");
    await expect(strip).toBeVisible(FIRST_PAINT);
    await expect(strip.getByRole("heading", { level: 2, name: FRIDAY_EN.title_alt })).toBeVisible();
    await expect(strip).toContainText(FRIDAY_EN.today);
    const text = await strip.innerText();
    expect(text).not.toMatch(I18N_KEY_PATH);
    expect(text, "the English strip must not fall back to the Hebrew title").not.toContain(FRIDAY_HE.title_alt);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › smart search dropdown (MEH-99)", () => {
  // MT:MEH-99:1 — clicking the pill with recent searches stored shows them, up
  //   to five, and a click routes to /producers?q=.
  test("recent searches open on focus, capped at five, and route to /producers?q=", async ({ page }) => {
    const stored = ["לחם", "גבינה", "ירקות", "דבש", "יין"];
    await seedStorage(page, "mehamakor_recent_searches", JSON.stringify([...stored, "שישי-שביעי"]));
    await gotoWithFeed(page);
    await heroSearch(page).click();
    const history = scope(page).getByTestId("hero-search-history");
    await expect(history).toBeVisible(FIRST_PAINT);
    await expect(history).toContainText(HERO_SEARCH.recent_heading);
    await expect(history.getByRole("option"), "MAX_RECENT = 5 (HeroSearch.jsx:24)").toHaveCount(5);
    await history.getByRole("option").first().click();
    await expect(page).toHaveURL(new RegExp(`/producers\\?q=${encodeURIComponent(stored[0])}`));
  });

  // MT:MEH-99:2 — with no recent searches the same dropdown shows trending,
  //   fetched from /search/trending.
  test("with no recent searches the dropdown shows trending items", async ({ page }) => {
    const trending = ["מחמצת", "עיזים"];
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { trending });
    await gotoHome(page);
    await heroSearch(page).click();
    const history = scope(page).getByTestId("hero-search-history");
    await expect(history).toBeVisible(FIRST_PAINT);
    await expect(history).toContainText(HERO_SEARCH.trending_heading);
    await expect(history.getByRole("option")).toHaveCount(trending.length);
    await expect(history).toContainText(trending[0]);
  });

  // MT:MEH-99:3 + MT:MEH-99:8 — one character fires NOTHING; two characters fire
  //   exactly ONE request per debounce burst. The two halves are one test
  //   because the zero-request claim only discriminates beside a case that DOES
  //   produce a request (a broken fetch would satisfy "no request" on its own).
  test("one character fires no search; a burst past two characters fires exactly one", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    const seen = await mockApi(page);
    await gotoHome(page);
    await heroSearch(page).fill("ל");
    // Inverted bounded wait (testing.md): await the UNWANTED event and require
    // that it times out. Deterministic in both worlds, dependent on no network
    // condition.
    const fired = await page
      .waitForRequest((r) => /\/api\/search\?/.test(r.url()), { timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(fired, "a single character must not trigger autocomplete (HeroSearch.jsx:91)").toBe(false);
    expect(seen.search.length).toBe(0);
    // Now type a burst faster than DEBOUNCE_MS = 300 and require exactly one.
    // `fill("")` first — the single character above is still in the field, and a
    // burst appended to it queries a different string than the one asserted below.
    await heroSearch(page).fill("");
    await heroSearch(page).pressSequentially("לחם מחמצת", { delay: 20 });
    await expect.poll(() => seen.search.length, { message: "the burst produces a request" }).toBeGreaterThan(0);
    await expect.poll(() => seen.search.length, { timeout: 3_000, message: "…and only one" }).toBe(1);
    expect(seen.search[0].searchParams.get("q")).toBe("לחם מחמצת");
  });

  // MT:MEH-99:4 — 2+ characters produce GROUPED results.
  //   DRIFT: the row names four groups — יצרנים / מוצרים / ערים / קטגוריות. The
  //   hero dropdown renders THREE (`search.hero.section_producers` /
  //   `_categories` / `_cities`); there is no products group, and the businesses
  //   group is labelled «בתי עסק», not «יצרנים» (HeroSearch.jsx:392-449). The
  //   live three are asserted; the drift is recorded in conversion-progress.md.
  test("two or more characters produce the three grouped result sections", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, {
      search: {
        producers: [{ id: P1.id, name: P1.name, city: CITY, slug: P1.slug }],
        categories: [{ id: CAT_A.id, name: CAT_A.name }],
        cities: [CITY],
      },
    });
    await gotoHome(page);
    await heroSearch(page).fill("לחם");
    const dropdown = scope(page).getByTestId("hero-search-dropdown");
    await expect(dropdown).toBeVisible(FIRST_PAINT);
    for (const heading of [HERO_SEARCH.section_producers, HERO_SEARCH.section_categories, HERO_SEARCH.section_cities]) {
      await expect(dropdown).toContainText(heading);
    }
    await expect(dropdown.getByRole("option"), "one row per group in this fixture").toHaveCount(3);
  });

  // MT:MEH-99:5 — ArrowDown/Up walk the FLAT row list and Enter opens the
  //   highlighted row.
  test("arrow keys walk the flat row list and Enter opens the highlighted row", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, {
      search: {
        producers: [{ id: P1.id, name: P1.name, city: CITY, slug: P1.slug }],
        categories: [{ id: CAT_A.id, name: CAT_A.name }],
        cities: [CITY],
      },
    });
    await gotoHome(page);
    await heroSearch(page).fill("לחם");
    const dropdown = scope(page).getByTestId("hero-search-dropdown");
    await expect(dropdown).toBeVisible(FIRST_PAINT);
    // The rows arrive after the 300ms debounce; `aria-activedescendant` is only
    // set once there ARE rows, so reading it before they land returns "" — which
    // is also what a broken highlight returns. Gate on the rows first.
    await expect(dropdown.getByRole("option")).toHaveCount(3, FIRST_PAINT);
    const activeText = async () => {
      const id = await heroSearch(page).getAttribute("aria-activedescendant");
      if (!id) return "";
      return page.evaluate((rowId) => document.getElementById(rowId)?.textContent?.trim() ?? "", id);
    };
    const first = await activeText();
    expect(first, "a row is highlighted from the start").not.toBe("");
    await heroSearch(page).press("ArrowDown");
    await expect.poll(activeText, { message: "ArrowDown moves the highlight" }).not.toBe(first);
    const second = await activeText();
    await heroSearch(page).press("ArrowUp");
    await expect.poll(activeText, { message: "ArrowUp moves it back" }).toBe(first);
    expect(second).not.toBe(first);
    await heroSearch(page).press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${P1.slug}$|/producer/${P1.id}$`));
  });

  // MT:MEH-99:7 — a submitted term is stored, most-recent-first, capped at five.
  test("a submitted term is stored most-recent-first and capped at five", async ({ page }) => {
    await seedStorage(page, "mehamakor_recent_searches", JSON.stringify(["a", "b", "c", "d", "e"]));
    await gotoWithFeed(page);
    await heroSearch(page).fill("מחמצת");
    await scope(page).getByTestId("hero-search-submit").click();
    await expect(page).toHaveURL(/\/producers\?q=/);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mehamakor_recent_searches") || "[]"));
    expect(stored[0], "the newest term leads").toBe("מחמצת");
    expect(stored.length, "MAX_RECENT = 5").toBe(5);
    expect(stored, "the oldest is evicted").not.toContain("e");
  });

  // MT:MEH-99:9 — a rapid type-then-delete abandons the in-flight request, so no
  //   stale result set survives. Asserted through the OUTCOME the row cares
  //   about: the held payload must never land in the dropdown.
  test("deleting back below two characters abandons the in-flight request and clears the results", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    // `!` (definite assignment): the executor runs synchronously, but TS's
    // control-flow analysis cannot see that, so without it `release` narrows to
    // `never` and the call below is untypeable.
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    await mockApi(page);
    await page.route("**/api/search?**", async (route: Route) => {
      await held; // hold the response open — the abort must win
      return route.fulfill({ json: { producers: [{ id: P1.id, name: P1.name }], categories: [], cities: [] } });
    });
    await gotoHome(page);
    await heroSearch(page).fill("לחם");
    await expect(scope(page).getByTestId("hero-search-dropdown")).toBeVisible(FIRST_PAINT);
    await heroSearch(page).fill("ל");
    release();
    // The stale payload must never appear in the dropdown.
    const stale = await page
      .waitForSelector(`[data-testid="hero-search-dropdown"] >> text=${P1.name}`, { timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(stale, "the abandoned request's results must not appear").toBe(false);
  });
});
