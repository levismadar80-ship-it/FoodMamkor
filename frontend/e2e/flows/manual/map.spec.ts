import type { BrowserContext, Locator, Route, TestInfo } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import he from "../../../messages/he.json";
import en from "../../../messages/en.json";
// The app libs below are plain JS (the app is JS + JSDoc); tsconfig.e2e has no
// allowJs, so each import is TS7016 — the same shape as
// e2e/flows/manual/producers.spec.ts (chunk 5). Suppressed per line, not globally.
// @ts-expect-error TS7016 — generated zod module, no .d.ts
import { ListCategoriesCategoriesGetResponse, ListProducersProducersGetResponse } from "../../../lib/generated/api.zod.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { ProducersResponseSchema } from "../../../lib/schemas.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { FILTER_AXES } from "../../../lib/filter-taxonomy.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { haversineKm, formatDistance } from "../../../lib/distance.js";
// @ts-expect-error TS7016 — JS data module, no .d.ts
import { ISRAEL_CITIES } from "../../../data/cities.js";

/**
 * Spec:     manual/map
 * Purpose:  docs/MANUAL_TESTING.md — the `/map` page group, converted under
 *           MEH-1249 stage 2 (chunk 6 — one route per PR). Fourteen sections;
 *           rows are tagged `MT:<section id>:<row>` — section ids: MEH-1388 ·
 *           PR3 (chat FAB) · MEH-1230 · PR2 (sort) · PR1 (card) · MEH-1075 ·
 *           MEH-970 · MEH-722 · two-row (m<n> mobile / d1 desktop / geo<n>) ·
 *           city (search width) · z (b<n> bug fixes / r<n> regression / a<n>
 *           attribution / 1019-<n>) · MEH-1010 · G2 (distance) · G3 (heading).
 * Touches:  `/map` and `/en/map` only (plus `/` once, as the control for the
 *           chat-FAB absence). No auth, no writes. Two app endpoints are
 *           INTERCEPTED in the data-dependent tests (see the MEH-1968 block):
 *           the client-side `GET /api/producers` (mount, chip reloads and the
 *           geo re-query) and `GET /api/categories`. Every other test runs
 *           against the REAL page with no data at all.
 * Data:     Phase 0 (04/09): `app/[locale]/map/page.js:51-64` SSR-fetches a
 *           sr-only index and is FAIL-OPEN (`catch → []`), so the shell
 *           renders with no backend. The interactive map is CLIENT-fetched on
 *           mount (`map/state/useProducersFeed.js:74-77`: `/categories` +
 *           `/producers` with `snapshot: true`), validated by
 *           `ProducersResponseSchema` (lib/schemas.js) before it reaches the
 *           markers — a failed load degrades to an empty list + toast. CI runs
 *           this spec against a `next start` whose proxy reaches the REAL
 *           staging backend; the intercept is what keeps marker counts, card
 *           order, legend counts and the sort/diet gates deterministic in both
 *           worlds. Tests that need no data (chip rows, city search, the geo
 *           denial paths, the chat FAB, legend visibility, attribution
 *           geometry) do NOT intercept and see whatever the world serves.
 * Stubs:    Three INCIDENTAL network calls are stubbed (not mocks — removing
 *           them changes nothing about what is asserted): OpenStreetMap tiles
 *           (`tile.openstreetmap.org` → 204, the request URL's `/z/` is still
 *           recorded so a fly-to can be observed by the zoom it fetches at),
 *           Nominatim geocoding (`geocodeCity` after a city pick → `[]`), and
 *           Cloudinary via `_cloudinary-stub`. `/api/cities` is left alone —
 *           CitySearch merges it over a static list and swallows the failure.
 *
 * ── MEH-1968 three-condition mock exception (e2e/CLAUDE.md), stated ────────
 *   1. No backend behaviour is asserted. Every intercepted row is a frontend
 *      state machine: which markers the layer toggle hides, which card the
 *      sort puts first for a FIXED list, which legend row is disabled for a
 *      FIXED category census, what the count line says for N = 0 / 1 / many,
 *      which query params the page sends. "Did the backend filter / geo-sort
 *      correctly" is tests/test_api.py + 24-producer-locations.spec.ts and is
 *      cited, not re-asserted.
 *   2. The contract is generated and pinned: the fixture is `.parse`d in
 *      `beforeAll` against `ListProducersProducersGetResponse` /
 *      `ListCategoriesCategoriesGetResponse` (lib/generated/api.zod.js) AND
 *      against the app-side `ProducersResponseSchema` the feed validates with,
 *      so a response-model change reds THIS spec instead of drifting silently.
 *   3. The unmocked alternative needs a shared catalog state no seed provides:
 *      exactly five rated businesses (the RATING_SORT_THRESHOLD gate), ≥ 5
 *      businesses per diet flag (DIET_CHIP_MIN), a legend category with ZERO
 *      businesses, and six pins spaced > 31 km apart so nothing clusters at
 *      zoom 8. Argued rather than mechanical — flagged in the PR body; these
 *      tests fall under the SAME pending ruling as chunk 5's intercept
 *      (MEH-1968 policy card). Sapir decides.
 *   This is a MOCK (removing it removes the subject), not a stub.
 *
 * Locators: `getByTestId` first (docs/E2E-LOCATORS.md). Existing ids used:
 *           `map-card`, `map-distance-pill`, `map-rating`, `sort-origin-label`,
 *           `pickup-layer-toggle-desktop/-mobile`, `chip-<key>`,
 *           `filter-sheet-apply-footer`. Added under this chunk (attribute-only):
 *           MapClient.jsx `map-list-count` · `map-list-subhead` ·
 *           `map-sort-select` · `map-desktop-shell` · `map-mobile-shell` ·
 *           `map-mobile-bar`; MapPane.jsx `map-search-this-area` ·
 *           `map-gps-button` · `map-legend` · `map-legend-panel` ·
 *           `map-legend-row` · `map-legend-toggle`; FilterChipsBar.jsx
 *           `map-filters-button` · `map-active-filter-tags` ·
 *           `map-active-filter-tag` · `map-clear-all`; NearMePill.jsx
 *           `map-near-me-pill`; MapBottomSheet.jsx `map-bottom-sheet` ·
 *           `map-sheet-content`; MobileSheetSelectedCard.jsx
 *           `map-selected-card` · `map-selected-card-close`. Leaflet nodes
 *           (`.leaflet-marker-icon`, `.mehamakor-marker-secondary`,
 *           `.leaflet-control-zoom-in`, `.leaflet-control-attribution`,
 *           `.leaflet-tooltip`) are library-owned classes, not copy. Markers
 *           are found by `aria-label` = the FIXTURE business name (data, not
 *           copy — MapComponent.jsx sets it from `p.name`). The FilterSheet
 *           panel is `#filter-sheet-panel` (portalled to <body>, so unscoped);
 *           LocationModal / CityPickerModal are `role=dialog` named by their
 *           he.json headings, also unscoped.
 * Copy:     every expected string is read from messages/he.json (en.json for
 *           `/en/map`) or from the lib that owns it (FILTER_AXES labels,
 *           formatDistance). The only literals are fixture data (ids, names,
 *           coordinates, ratings) and the two Leaflet zoom levels the app
 *           hardcodes (MapClient.jsx NEAR_ME_DEFAULT_ZOOM = 8, goToMyLocation
 *           flyTo 13 — MapComponent.jsx).
 * Does NOT: convert MEH-1388 rows 1-4 (COVERED by 24-producer-locations
 *           .spec.ts:264/:159/:319/:344), PR3 row 2 (mobile FAB absence is
 *           entailed by MEH-1410's desktop-only gate — ChatWidgetDesktopOnly
 *           .test.jsx:61 — so a /map assertion there would be green for two
 *           reasons), MEH-1230 row 2 (focus-ring clipping is a paint property
 *           a bounding box cannot see), PR1 rows 2-6 (2/6 STALE — price and
 *           the delivery strip were removed, MapProducerCard.test.jsx:312/:212;
 *           3-5 COVERED there), MEH-1075 rows 2/3/6/7/10 (COVERED,
 *           FilterSheet.test.jsx), two-row m2/m9 (mask-stop geometry —
 *           ChipScrollRow.test.jsx:94-118), m5/m6/m7 (STALE — a category is
 *           never a removable tag since MEH-1368), the four home rows (chunk
 *           7) and city row 7 (`/register/producer`, chunk 9), z b3's «מידע
 *           נוסף» wording (the CTA is gone — the reachable-last-card half is
 *           converted), z a3 (mid-drag frames), z 1019-1 (needs an unverified
 *           login — destructive per the matrix), MEH-1010 row 3 (cluster
 *           child — needs two pins inside one cluster radius AND a spiderfy /
 *           zoom-to-bounds journey; residual), G2 rows 1-2 (COVERED,
 *           MapProducerCard.test.jsx:79/:74).
 * Related:  e2e/flows/05-map-navigation.spec.ts (initial camera + MEH-1414 —
 *           cited, not duplicated), 07-gps-button.spec.ts (the GRANTED desktop
 *           path), 15-map-markers.spec.ts, 24-producer-locations.spec.ts,
 *           __tests__/MapProducerCard.test.jsx, FilterSheet.test.jsx,
 *           PickupLayerControl.test.jsx, MapNearestSortTrigger.test.jsx,
 *           mapSort.test.js, docs/qa/conversion-page-map.md.
 * History:  MEH-1249 chunk 6 (creation, 04/09).
 */

const FIRST_PAINT = { timeout: 15_000 };
const MAP_MOUNT = { timeout: 45_000 };

// MEH-1792 (re-measured 2026-09-04 on chunks 1 and 2): during the app's
// page-transition window a second copy of the page tree exists briefly OUTSIDE
// `#main-content`, so a page-wide `getByTestId` can resolve to TWO elements and
// fail strict mode ("resolved to 2 elements … unexpected value hidden") — seen
// on the mobile project in both a red-control run and a green run. Scoping every
// locator to the `#main-content` landmark (layout.js) names the live tree only.
// Same fix as e2e/flows/27-delivery-day-discoverability.spec.ts:73.
const scope = (page: Page) => page.locator("#main-content");

// /map renders BOTH shells into the DOM at once (MapClient.jsx: `hidden lg:grid`
// desktop + `lg:hidden` mobile — the card list, the chip bar and a Leaflet map
// exist twice). Every assertion below is therefore scoped to the shell the
// current project can SEE, chosen by the static project identity — never by
// counting what rendered (testing.md: a guard that consults its own subject).
const isDesktop = (info: TestInfo) => info.project.name === "desktop";
const shellOf = (page: Page, info: TestInfo) =>
  scope(page).getByTestId(isDesktop(info) ? "map-desktop-shell" : "map-mobile-shell");
const desktopOnly = (info: TestInfo, why: string) => test.skip(!isDesktop(info), why);
const mobileOnly = (info: TestInfo, why: string) => test.skip(isDesktop(info), why);

// ── copy ────────────────────────────────────────────────────────────────────
const MC = he.map.client;
const MP = he.map.pane;
const MF = he.map.filter;
const NM = he.map.near_me_pill;
const CP = he.map.city_picker;
const CARD_EMPTY = he.map.card_list.empty;
const SHEET = he.filters.sheet;
const FILTERS_BTN = he.filters.button;
const LOC = he.modals.location;
const CHAT_OPEN_HE = he.chat.launcher_open_label;
const CHAT_OPEN_EN = en.chat.launcher_open_label;
const MC_EN = en.map.client;

type Axis = { key: string; label: string };
const AXES = FILTER_AXES as Record<string, Axis>;

/** Minimal ICU plural resolver for the `{count, plural, …}` strings in he/en.json. */
function icu(msg: string, count: number): string {
  const m = /^\{count, plural,([\s\S]*)\}$/.exec(msg);
  if (!m) return msg.replace("{count}", String(count));
  const branches: Record<string, string> = {};
  const re = /(=\d+|one|two|other)\s*\{((?:[^{}]|\{count\})*)\}/g;
  let b: RegExpExecArray | null;
  while ((b = re.exec(m[1])) !== null) branches[b[1]] = b[2];
  const key =
    branches[`=${count}`] !== undefined ? `=${count}` : count === 1 ? "one" : count === 2 ? "two" : "other";
  const chosen = branches[key] ?? branches.other;
  // Deliberately NOT `?? ""`: a plural string with no `other` branch is a
  // corrupt message file, and an empty string would satisfy `toHaveText("")`
  // trivially — a null that is also the reassuring answer (testing.md). Fail by
  // name rather than on an opaque `undefined.replace`.
  if (chosen === undefined) {
    throw new Error(`icu(): no branch matches count=${count} and there is no "other" fallback in ${JSON.stringify(msg)}`);
  }
  return chosen.replace("{count}", String(count)).replace("#", String(count));
}

// ── fixtures ────────────────────────────────────────────────────────────────
// Category names are lib/category-registry.js CATEGORY_STYLES keys — the legend
// (MapPane.jsx CATEGORY_LEGEND) counts `p.categories[0].name` against exactly
// those keys, and lib/map-chips.js resolves the «בשר ודגים» / «חלב וגבינות» /
// «ירקות ופירות» / «לחמים ואפייה» chips by matching these DB names. «דבש» is a
// legend row NO fixture business carries — the MEH-722 empty-category case.
const CAT_MEAT = { id: 1, name: "בשר" };
const CAT_DAIRY = { id: 2, name: "חלב וגבינות" };
const CAT_PRODUCE = { id: 3, name: "ירקות ופירות" };
const CAT_BREAD = { id: 4, name: "לחם ומאפה" };
const CATEGORIES = [CAT_MEAT, CAT_DAIRY, CAT_PRODUCE, CAT_BREAD];
const EMPTY_LEGEND_NAME = "דבש";

// Six businesses, every pair > 31 km apart (60 px at zoom 8 ≈ 31 km at this
// latitude — leaflet.markercluster's wide radius, MapComponent.jsx), so the
// default camera ([32.4, 34.95] z8, MEH-932) shows SEVEN individual pins and no
// cluster: P1's branch (Haifa) + its pickup point (Tiberias, 51 km east) + five
// single-point businesses. Exactly FIVE carry a review (RATING_SORT_THRESHOLD,
// lib/rating-gate.js) so the «הכי מדורגות» option is offered; all six carry the
// vegan + gluten-free product flags (DIET_CHIP_MIN = 5) so those sheet rows
// are offered under the MEH-2170 snapshot gate.
type Loc = { kind: string; lat: number; lng: number; is_primary: boolean; label?: string; city?: string };
type Producer = Record<string, unknown> & { id: string; name: string; locations: Loc[]; avg_rating: number; reviews_count: number };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function producer(n: number, name: string, cat: { id: number; name: string } | null, locations: Loc[], extra: Record<string, unknown> = {}): Producer {
  return {
    id: uuid(n),
    slug: `fixture-${n}`,
    name,
    city: locations[0]?.city ?? "",
    status: "approved",
    categories: cat ? [cat] : [],
    images: [],
    locations,
    lat: locations[0]?.lat ?? null,
    lng: locations[0]?.lng ?? null,
    has_physical_location: true,
    has_vegan_products: true,
    has_gluten_free_products: true,
    avg_rating: 0,
    reviews_count: 0,
    ...extra,
  };
}
const branch = (lat: number, lng: number, city: string): Loc => ({ kind: "branch", lat, lng, is_primary: true, city });
const P_HAIFA = producer(1, "מחלבת הגבעה", CAT_DAIRY, [
  branch(32.79, 34.99, "חיפה"),
  { kind: "pickup", lat: 32.79, lng: 35.53, is_primary: false, label: "הדוכן בטבריה", city: "טבריה" },
], { verification_tier: "verified", avg_rating: 4.8, reviews_count: 12, delivers: true, offers_pickup: true });
const P_TLV = producer(2, "קצביית השכונה", CAT_MEAT, [branch(32.08, 34.78, "תל אביב-יפו")], { avg_rating: 4.5, reviews_count: 20 });
const P_JLM = producer(3, "בשר מההר", CAT_MEAT, [branch(31.77, 35.21, "ירושלים")], { avg_rating: 4.5, reviews_count: 3 });
const P_BSV = producer(4, "גבינות הנגב", CAT_DAIRY, [branch(31.25, 34.79, "באר שבע")], { avg_rating: 3.9, reviews_count: 1 });
const P_KSH = producer(5, "עוף מהגליל", CAT_MEAT, [branch(33.21, 35.57, "קריית שמונה")], { avg_rating: 4.9, reviews_count: 1 });
// The sparse card: no category, no rating, no fulfillment — PR1 row 1's
// "עסק דל נתונים" beside the "full" P_HAIFA card.
const P_ASH = producer(6, "עסק לדוגמה", null, [branch(31.67, 34.57, "אשקלון")]);
const PRODUCERS: Producer[] = [P_HAIFA, P_TLV, P_JLM, P_BSV, P_KSH, P_ASH];
const MEAT = PRODUCERS.filter((p) => (p.categories as Array<{ name: string }>)[0]?.name === CAT_MEAT.name);
const DAIRY = PRODUCERS.filter((p) => (p.categories as Array<{ name: string }>)[0]?.name === CAT_DAIRY.name);
// avg_rating DESC, then reviews_count DESC, unrated last (mapSort.test.js:39 pins
// the comparator; this is the fixture's answer under it, written out so a
// reader can check it against the ratings above without running anything).
const RATING_ORDER = [P_KSH, P_HAIFA, P_TLV, P_JLM, P_BSV, P_ASH].map((p) => p.name);
const FEED_ORDER = PRODUCERS.map((p) => p.name);

// A GPS fix 1 km south of P_HAIFA's branch — nearest by construction, and inside
// the 25 km near-me radius (MapClient.jsx NEAR_ME_RADIUS_KM).
const GPS_NEAR = { latitude: 32.78, longitude: 34.99 };
// Eilat — > 25 km from every fixture point: the empty-near-me branch.
const GPS_FAR = { latitude: 29.55, longitude: 34.95 };
const NEAR_ME_DEFAULT_ZOOM = 8; // MapClient.jsx NEAR_ME_DEFAULT_ZOOM
const GPS_FLY_ZOOM = 13; // MapComponent.jsx goToMyLocation flyTo(…, 13)

/** Nearest-first order for a fix, derived with the same haversine the app uses (lib/distance.js). */
function nearestOrder(fix: { latitude: number; longitude: number }): string[] {
  const dist = (p: Producer) => Math.min(...p.locations.map((l) => haversineKm(fix.latitude, fix.longitude, l.lat, l.lng)));
  return [...PRODUCERS].sort((a, b) => dist(a) - dist(b)).map((p) => p.name);
}
function distanceLabel(p: Producer, fix: { latitude: number; longitude: number }): string {
  return formatDistance(Math.min(...p.locations.map((l) => haversineKm(fix.latitude, fix.longitude, l.lat, l.lng))), { unit: "he" });
}

test.beforeAll(() => {
  // A schema change reds the spec here, loudly, instead of letting the
  // fixture drift away from what the app is actually given — BOTH contracts:
  // the generated one (what the backend emits) and the app-side one the feed
  // validates with before a single marker is created (useProducersFeed.js).
  ListProducersProducersGetResponse.parse(PRODUCERS);
  ListCategoriesCategoriesGetResponse.parse(CATEGORIES);
  ProducersResponseSchema.parse(PRODUCERS);
  // Guards on the fixture's own premises.
  const rated = PRODUCERS.filter((p) => p.reviews_count > 0).length;
  if (rated !== 5) throw new Error(`exactly 5 rated businesses required for the rating gate, got ${rated}`);
  // 3 meat · 2 dairy · 1 uncategorised (the sparse card) — the legend and the
  // category filter both read `categories[0].name`, so P_ASH counts for nobody.
  if (MEAT.length !== 3 || DAIRY.length !== 2) throw new Error(`fixture census drifted (3 meat / 2 dairy expected, got ${MEAT.length}/${DAIRY.length})`);
  if (nearestOrder(GPS_NEAR)[0] !== P_HAIFA.name) throw new Error("GPS_NEAR must resolve to P_HAIFA first");
  const farMin = Math.min(...PRODUCERS.flatMap((p) => p.locations.map((l) => haversineKm(GPS_FAR.latitude, GPS_FAR.longitude, l.lat, l.lng))));
  if (farMin <= 25) throw new Error(`GPS_FAR must be > 25 km from every point, nearest is ${farMin.toFixed(1)}`);
});

// ── helpers ─────────────────────────────────────────────────────────────────
type Catalog = { seen: URL[] };
type TileLog = Array<{ z: number; t: number }>;

/** Stub the two incidental external hosts; record which zoom each tile request asked for. */
async function stubExternal(page: Page): Promise<TileLog> {
  const tiles: TileLog = [];
  // A RegExp, not a glob: the tile host carries a subdomain (`a.tile.…`), which
  // a `**/tile.openstreetmap.org/**` glob does not match (measured — it recorded
  // nothing, and a null log is also the reassuring answer, testing.md).
  await page.route(/tile\.openstreetmap\.org\//, (route: Route) => {
    const m = /\/(\d+)\/\d+\/\d+\.png/.exec(route.request().url());
    if (m) tiles.push({ z: Number(m[1]), t: Date.now() });
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/nominatim.openstreetmap.org/**", (route: Route) => route.fulfill({ json: [] }));
  return tiles;
}

/**
 * Intercept the two client endpoints. `list` may be a function of the request
 * URL (the geo re-query carries `radius_km`).
 *
 * MEH-1968 PENDING RULING — every test that calls this is exercising the
 * frontend state machine against a fixed response, and is NOT evidence of
 * backend-contract correctness. Condition 3 of the three-condition exception is
 * argued, not mechanical (see the file header). Do not inherit these as
 * integration coverage.
 */
async function mockCatalog(page: Page, list: Producer[] | ((u: URL) => Producer[]) = PRODUCERS): Promise<Catalog> {
  const seen: URL[] = [];
  await page.route("**/api/categories**", (route: Route) => route.fulfill({ json: CATEGORIES }));
  await page.route("**/api/producers**", (route: Route) => {
    const url = new URL(route.request().url());
    seen.push(url);
    const body = typeof list === "function" ? list(url) : list;
    return route.fulfill({ json: body, headers: { "x-total-count": String(body.length) } });
  });
  return { seen };
}

async function gotoMap(page: Page, path = "/map"): Promise<void> {
  // A manual tester has consented already. Without this the CookieBanner is up
  // and MEH-945 reserves its footprint on the mobile map container (measured:
  // the shorter container left only 3 of 6 fixture pins in markercluster's
  // bounds, and every sheet-edge measurement below moved by the banner).
  await seedStorage(page, "cookieConsent", "essential"); // CookieBanner.jsx:30
  await page.goto(path);
  // Count gates first (retries; the strict checks below would throw instead of
  // waiting if a stray copy ever landed INSIDE the landmark).
  await expect(scope(page).getByTestId("map-desktop-shell")).toHaveCount(1, FIRST_PAINT);
  await expect(scope(page).getByTestId("map-mobile-shell")).toHaveCount(1, FIRST_PAINT);
  // `window.__MAP_CENTER__` is set by MapComponent right after `L.map().setView()`
  // — the race-free mount signal 05-map-navigation.spec.ts uses.
  await page.waitForFunction(
    () => (window as unknown as { __MAP_CENTER__?: unknown }).__MAP_CENTER__ !== undefined,
    null,
    MAP_MOUNT,
  );
}

/**
 * Mock, navigate, and wait for the fixture list to land in the VISIBLE shell.
 *
 * CONTRACT for the function form of `list`: it must return the INITIAL-load
 * list for a URL carrying no `radius_km`. The settle below derives its expected
 * count by evaluating `list` against exactly such a URL rather than assuming
 * `PRODUCERS.length` — a function that returns fewer on first load would
 * otherwise race past the `__MAP_CENTER__` signal with no card-count
 * settlement, and the count would be stated rather than measured.
 */
async function gotoWithCatalog(page: Page, info: TestInfo, path = "/map", list?: Producer[] | ((u: URL) => Producer[])): Promise<{ catalog: Catalog; tiles: TileLog; shell: Locator }> {
  const tiles = await stubExternal(page);
  const catalog = await mockCatalog(page, list);
  await gotoMap(page, path);
  const shell = shellOf(page, info);
  const initial = typeof list === "function" ? list(new URL("http://localhost/api/producers")) : (list ?? PRODUCERS);
  const expected = initial.length;
  if (expected > 0) await expect(shell.getByTestId("map-card")).toHaveCount(expected, FIRST_PAINT);
  return { catalog, tiles, shell };
}

const cards = (shell: Locator) => shell.getByTestId("map-card");
const cardNames = (shell: Locator) => cards(shell).getByRole("heading", { level: 3 }).allTextContents();
const cardOf = (shell: Locator, p: Producer) => cards(shell).filter({ has: shell.page().getByRole("heading", { level: 3, name: p.name, exact: true }) });
// The aria-label is quoted via JSON.stringify, not interpolated raw: a name
// containing `"` would otherwise close the attribute string early and yield a
// malformed selector that matches NOTHING — a null that is also the reassuring
// answer (testing.md). Fixture names are quote-free today; this holds if one
// stops being.
const markerOf = (shell: Locator, p: Producer) => shell.locator(`.leaflet-marker-icon[aria-label=${JSON.stringify(p.name)}]`);
const primaryMarkers = (shell: Locator) => shell.locator(".leaflet-marker-icon:not(.mehamakor-marker-secondary):not(.mehamakor-cluster)");
const secondaryMarkers = (shell: Locator) => shell.locator(".leaflet-marker-icon.mehamakor-marker-secondary");
const mapCanvas = (shell: Locator) => shell.locator(".leaflet-container");
const legendRow = (shell: Locator, name: string) => shell.getByTestId("map-legend-row").filter({ hasText: new RegExp(`^${name}$`) });
const sheetPanel = (page: Page) => page.locator("#filter-sheet-panel"); // portalled — unscoped
const filtersButton = (shell: Locator) => shell.getByTestId("map-filters-button");
const serviceChip = (shell: Locator, key: "pickup_points" | "has_delivery") => shell.getByRole("button", { name: AXES[key].label, exact: true });
const locationModal = (page: Page) => page.getByRole("dialog", { name: LOC.title });
const cityPicker = (page: Page) => page.getByRole("dialog", { name: CP.heading });
const citySearchInput = (page: Page, info: TestInfo) => page.locator(isDesktop(info) ? "#map-city-search-desktop" : "#map-city-search-mobile");
const citySearchList = (page: Page, info: TestInfo) => page.locator(isDesktop(info) ? "#map-city-search-desktop-listbox" : "#map-city-search-mobile-listbox");
const zoomIn = (shell: Locator) => shell.locator(".leaflet-control-zoom-in");
const attribution = (shell: Locator) => shell.locator(".leaflet-control-attribution");
const bottomSheet = (shell: Locator) => shell.getByTestId("map-bottom-sheet");

type Box = { x: number; y: number; width: number; height: number };
async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}
const inside = (a: Box, b: Box, tol = 1) =>
  a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.width <= b.x + b.width + tol && a.y + a.height <= b.y + b.height + tol;

/** Is the point at the centre of `l` painted by `l` (or a descendant)? — a hit-test, not a z-index read. */
function hitTestIsSelf(l: Locator): Promise<boolean> {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
}

/** Drag the map canvas so Leaflet fires `moveend` and the page enters its "map moved" state. Proves the move. */
async function panMap(page: Page, shell: Locator): Promise<void> {
  const c = await box(mapCanvas(shell));
  const x = c.x + c.width / 2;
  const y = c.y + c.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 70, { steps: 10 });
  await page.mouse.up();
  await expect(shell.getByTestId("map-search-this-area"), "control: the drag must register as a user move").toBeVisible();
}

/** Tap a marker on the mobile shell — the sheet opens to HALF (45vh, MapBottomSheet.jsx) with the selected card pinned. */
async function tapMarkerOpensSheet(page: Page, shell: Locator, p: Producer): Promise<void> {
  await markerOf(shell, p).click();
  await expect(shell.getByTestId("map-selected-card")).toBeVisible();
  await sheetSettledAt(page, shell, 0.45); // HALF (MapBottomSheet.jsx)
}

/**
 * Instrument `navigator.geolocation.getCurrentPosition` from inside the page:
 * every call is COUNTED (`window.__geoCalls` — the "no re-prompt" and "still
 * clickable with the sheet open" rows need a number, not a hope), and with
 * `error` set the call fails synchronously with that GeolocationPositionError
 * code (1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT) instead of
 * reaching the browser. The denial is FORCED rather than left to a missing
 * permission grant: measured 2026-09-04, an ungranted context in this Chromium
 * did not deliver code 1 within the app's 8 s timeout, so the modal the denial
 * rows expect never opened — a "denied" that is really a "pending" is not the
 * state the rows describe. Without `error` the original is called (the granted
 * path, `context.setGeolocation`).
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

/** Click the map canvas at its top-right corner — clear of Leaflet's zoom control (top-left), the legend (bottom-left), the GPS / layer circles (bottom-right) and the top-centre slot. */
async function clickCanvasCorner(shell: Locator): Promise<void> {
  const c = await box(mapCanvas(shell));
  await mapCanvas(shell).click({ position: { x: c.width - 40, y: 40 } });
}

/** Wait for the bottom sheet to settle at a snap (the 300 ms height transition, MapBottomSheet.jsx), then return the fraction of the viewport it covers. */
async function sheetSettledAt(page: Page, shell: Locator, fraction: number): Promise<void> {
  await expect
    .poll(async () => (await box(bottomSheet(shell))).height / (await page.evaluate(() => window.innerHeight)), { message: `sheet at ${fraction * 100}vh` })
    .toBeCloseTo(fraction, 2);
}

/**
 * MEH-1365: the attribution's `bottom` is `var(--map-sheet-h) + 6px`, measured
 * from the MAP CONTAINER's bottom (globals.css, scoped < 1024px). Returns the
 * gap between the attribution's bottom edge and where the rule puts it, plus
 * the container's spill below the fold — on this project's 393×727 viewport the
 * container's `min-h-[500px]` (MapComponent.jsx) overshoots the shell by ~22px,
 * and the attribution rides the CONTAINER edge, so it sits that many px lower
 * than the sheet's real top. Reported as a finding; asserted as the mechanism.
 */
/**
 * The sheet's height must STOP MOVING before the attribution is measured
 * against it, and that is the fix for a measured flake rather than a
 * precaution.
 *
 * The attribution's `margin-bottom` tracks `--map-sheet-h` (the MEH-1365 rule
 * in globals.css), so the two are only in agreement once the open animation
 * has settled. On CI (run 33933955198, mobile) the four rects below were read
 * across four separate round-trips while the sheet was still moving, and the
 * attribution came out one frame behind the sheet it is compared to:
 * `ruleGap` 16.3px on the first attempt, inside tolerance on the retry.
 *
 * Two consecutive equal heights, bounded. This does NOT weaken the assertion:
 * it gates on the SHEET, never on the attribution the assertion is about, so a
 * geometry that is permanently wrong still fails — with the same numbers and
 * the same 2px tolerance.
 */
async function settleSheet(shell: Locator): Promise<void> {
  let previous = -1;
  await expect
    .poll(
      async () => {
        const height = (await bottomSheet(shell).boundingBox())?.height ?? -1;
        const stable = height > 0 && height === previous;
        previous = height;
        return stable;
      },
      {
        message: "the bottom sheet's height must stop moving before the attribution is measured against it",
        timeout: 5_000,
      },
    )
    .toBe(true);
}

async function attributionRide(page: Page, shell: Locator): Promise<{ ruleGap: number; spill: number; overCards: boolean }> {
  await settleSheet(shell);
  const attr = await box(attribution(shell));
  const container = await box(mapCanvas(shell));
  const sheet = await box(bottomSheet(shell));
  const content = await box(shell.getByTestId("map-sheet-content"));
  const vh = await page.evaluate(() => window.innerHeight);
  const expectedBottom = container.y + container.height - sheet.height - 6;
  return {
    ruleGap: Math.abs(attr.y + attr.height - expectedBottom),
    spill: Math.max(0, container.y + container.height - vh),
    overCards: attr.y + attr.height > content.y,
  };
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
const seedGps = (page: Page, fix: { latitude: number; longitude: number }) =>
  seedStorage(page, "user_location", JSON.stringify({ lat: fix.latitude, lng: fix.longitude })); // lib/user-location.js STORAGE_KEY
const seedCity = (page: Page, city: string) => seedStorage(page, "user_city", city); // lib/use-user-city.js STORAGE_KEY

async function grantGps(context: BrowserContext, fix: { latitude: number; longitude: number }): Promise<void> {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(fix);
}

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /map multi-location epic (MEH-1388)", () => {
  // MT:MEH-1388:5 — the pickup-points layer toggle hides / shows the SECONDARY
  //   pins (pickup / market_stand); the primary pins stay. Rows 1-4 are COVERED
  //   by 24-producer-locations.spec.ts (:264 same card from every pin, :159
  //   unique-business cluster badge, :319 nearest location, :344 delivery-only
  //   + pickup visible) and are not repeated here.
  test("the layer toggle hides only the secondary pins, and shows them again", async ({ page }, info) => {
    const { shell } = await gotoWithCatalog(page, info);
    await expect(primaryMarkers(shell)).toHaveCount(PRODUCERS.length, FIRST_PAINT);
    await expect(secondaryMarkers(shell)).toHaveCount(1);
    const toggle = shell.getByTestId(isDesktop(info) ? "pickup-layer-toggle-desktop" : "pickup-layer-toggle-mobile");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(secondaryMarkers(shell)).toHaveCount(0);
    await expect(primaryMarkers(shell)).toHaveCount(PRODUCERS.length);
    await toggle.click();
    await expect(secondaryMarkers(shell)).toHaveCount(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › chat FAB hidden on /map (map-quality PR 3)", () => {
  // MT:PR3:1 — desktop: no «שאלו אותנו» launcher on /map; the legend toggle is
  //   visible and opens the category list.
  // MT:PR3:4 — the FAB stays on the rest of the site: `/` renders it (the CONTROL
  //   that makes the absence above evidence). The producer-page half is chunk 8;
  //   the dashboard subtree is ChatWidgetLazy.test.jsx:46/:52.
  test("desktop: no chat launcher on /map while the legend toggle works — and the launcher IS on the home page", async ({ page }, info) => {
    desktopOnly(info, "the FAB is desktop-only by MEH-1410 — on mobile its absence has two causes");
    await stubExternal(page);
    await gotoMap(page);
    const shell = shellOf(page, info);
    await expect(page.getByRole("button", { name: CHAT_OPEN_HE })).toHaveCount(0);
    const toggle = shell.getByTestId("map-legend-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(shell.getByTestId("map-legend-panel")).toBeVisible();
    // CONTROL — the same launcher, one route over.
    await page.goto("/");
    await expect(page.getByRole("button", { name: CHAT_OPEN_HE })).toHaveCount(1, FIRST_PAINT);
  });

  // MT:PR3:3 — `/en/map`: no launcher in English either.
  test("desktop: no chat launcher on /en/map", async ({ page }, info) => {
    desktopOnly(info, "the FAB is desktop-only by MEH-1410");
    await stubExternal(page);
    await gotoMap(page, "/en/map");
    await expect(page.getByRole("button", { name: CHAT_OPEN_EN })).toHaveCount(0);
    await expect(page.getByRole("button", { name: CHAT_OPEN_HE })).toHaveCount(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › GPS fix persists → «מרחק» + distance labels (MEH-1230)", () => {
  // MT:MEH-1230:1 — press the desktop GPS circle, grant → WITHOUT a reload the
  //   sort snaps to «מרחק», the list is nearest-first and every card shows a
  //   km label. DRIFT: the row says «מרחק» "opens (not grey)"; since MEH-2014
  //   the option is never disabled — asserted as the sort VALUE flipping.
  test("desktop: a granted GPS fix flips the sort to «מרחק», orders nearest-first and labels every card — no reload", async ({ page, context }, info) => {
    desktopOnly(info, "the GPS circle is the desktop control (MapPane.jsx hidden lg:flex); the mobile pill is MEH-970");
    await grantGps(context, GPS_NEAR);
    const { shell, tiles } = await gotoWithCatalog(page, info);
    const select = shell.getByTestId("map-sort-select");
    await expect(select).toHaveValue("newest");
    await expect(shell.getByTestId("map-distance-pill")).toHaveCount(0);
    await page.evaluate(() => ((window as unknown as { __noReload: number }).__noReload = 1));

    await shell.getByTestId("map-gps-button").click();
    await expect(select).toHaveValue("nearest");
    await expect(shell.getByTestId("sort-origin-label")).toHaveText(MC.sort.origin_gps);
    await expect(shell.getByTestId("map-distance-pill")).toHaveCount(PRODUCERS.length);
    await expect.poll(() => cardNames(shell)).toEqual(nearestOrder(GPS_NEAR));
    await expect(cardOf(shell, P_HAIFA).getByTestId("map-distance-pill")).toHaveText(distanceLabel(P_HAIFA, GPS_NEAR));
    // No reload: a window-scoped flag set before the click survives it.
    expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)).toBe(1);
    // …and the camera flew to the fix (a z13 tile fetch is the observable).
    await expect.poll(() => tiles.some((t) => t.z === GPS_FLY_ZOOM)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › real sort on the /map list, desktop (map-quality PR 2)", () => {
  // MT:PR2:1 — no GPS: «מיון:» + the newest option selected; the list in server
  //   order. DRIFT ×2: the row expects «מרחק» disabled — MEH-2014 made it a
  //   trigger that is never disabled (asserted as rendered); the newest option
  //   reads «הצטרפו לאחרונה» (he.json map.client.sort.newest), not «חדש בשוק».
  // MT:PR2:6 — the sort option is «מרחק»; every rendered «קרוב אליי» carries two
  //   yods (the single-yod form appears nowhere in the shell's text).
  test("default without GPS: «מיון:» + newest selected, «מרחק» offered (never disabled), server order kept", async ({ page }, info) => {
    desktopOnly(info, "the sort <select> lives in the desktop sidebar only");
    const { shell } = await gotoWithCatalog(page, info);
    await expect(shell.getByText(MC.sort.label, { exact: true })).toBeVisible();
    const select = shell.getByTestId("map-sort-select");
    await expect(select).toHaveValue("newest");
    await expect(select.getByRole("option", { name: MC.sort.nearest, exact: true })).toBeEnabled();
    await expect(select.getByRole("option", { name: MC.sort.newest, exact: true })).toHaveCount(1);
    await expect.poll(() => cardNames(shell)).toEqual(FEED_ORDER);
    expect(await shell.textContent()).not.toMatch(/קרוב אלי(?!י)/);
  });

  // MT:PR2:2 — a persisted fix (lib/user-location.js, localStorage since
  //   MEH-2014) makes «מרחק» the default on the next visit; the first card is
  //   the nearest, matching the km labels.
  test("default with a stored GPS fix: «מרחק» is selected and the nearest business is first", async ({ page }, info) => {
    desktopOnly(info, "the sort <select> lives in the desktop sidebar only");
    await seedGps(page, GPS_NEAR);
    const { shell } = await gotoWithCatalog(page, info);
    await expect(shell.getByTestId("map-sort-select")).toHaveValue("nearest");
    await expect.poll(() => cardNames(shell)).toEqual(nearestOrder(GPS_NEAR));
    await expect(cards(shell).first().getByTestId("map-distance-pill")).toHaveText(distanceLabel(P_HAIFA, GPS_NEAR));
  });

  // MT:PR2:3 — «הכי מדורגות»: rating DESC, reviews DESC on a tie, unrated last.
  // MT:PR2:4 — back to newest → server order again.
  test("«הכי מדורגות» orders by rating then reviews with the unrated last; newest restores the server order", async ({ page }, info) => {
    desktopOnly(info, "the sort <select> lives in the desktop sidebar only");
    const { shell } = await gotoWithCatalog(page, info);
    const select = shell.getByTestId("map-sort-select");
    await expect(select.getByRole("option", { name: MC.sort.top_rated, exact: true })).toHaveCount(1);
    await select.selectOption("rating");
    await expect.poll(() => cardNames(shell)).toEqual(RATING_ORDER);
    await select.selectOption("newest");
    await expect.poll(() => cardNames(shell)).toEqual(FEED_ORDER);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › uniform business card on /map (map-quality PR 1)", () => {
  // MT:PR1:1 — a data-rich card (category + rating + fulfillment) and a sparse
  //   one (nothing) are exactly the same height, on both shells. Rows 2-6:
  //   see the header (2 + 6 STALE, 3-5 COVERED by MapProducerCard.test.jsx).
  test("every card in the list is the same height — rich and sparse alike", async ({ page }, info) => {
    const { shell } = await gotoWithCatalog(page, info);
    // CONTROL: the two extremes really differ in content.
    await expect(cardOf(shell, P_HAIFA).getByTestId("map-rating")).toHaveCount(1);
    await expect(cardOf(shell, P_ASH).getByTestId("map-rating")).toHaveCount(0);
    const heights = await cards(shell).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(heights).toHaveLength(PRODUCERS.length);
    expect(Math.max(...heights) - Math.min(...heights), `card heights ${heights.join(",")}`).toBeLessThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /map filter IA: chips + FilterSheet (MEH-1075 · two-row layout)", () => {
  // MT:MEH-1075:1 · MT:two-row:m1 · MT:two-row:d1 — the chip rows as rendered
  //   TODAY: row 1 = the category toolbar; row 2 = the two promoted service chips
  //   («משלוח» · «איסוף עצמי», MEH-2046) + the «סינון» button with no « · N»
  //   while nothing is active. DRIFT: MEH-1368 removed the inline
  //   [מאומתים][משלוח אליי] quick-chip row the rows describe; those axes live in
  //   the sheet. Desktop: the same two rows + the tag strip once a filter is on.
  // MT:two-row:m8 — «× נקו הכל» resets every filter and the tag strip goes away
  //   (copy drift: the row says «נקי», he.json says «נקו»).
  test("category row + service row + «סינון» with no count; a service chip makes a tag strip that «× נקו הכל» clears", async ({ page }, info) => {
    await stubExternal(page);
    await gotoMap(page);
    const shell = shellOf(page, info);
    await expect(shell.getByRole("toolbar", { name: he.map.chip_scroll.category_aria })).toBeVisible();
    await expect(serviceChip(shell, "has_delivery")).toBeVisible();
    await expect(serviceChip(shell, "pickup_points")).toBeVisible();
    await expect(filtersButton(shell)).toHaveText(FILTERS_BTN);
    await expect(shell.getByTestId("map-active-filter-tags")).toHaveCount(0);

    // «איסוף עצמי» never asks for a city (ServiceChipRow.test.jsx:234) — the
    // delivery chip would open the CityPickerModal here (MEH-1075 row 8 below).
    await serviceChip(shell, "pickup_points").click();
    await expect(serviceChip(shell, "pickup_points")).toHaveAttribute("aria-pressed", "true");
    await expect(filtersButton(shell)).toContainText("1");
    const strip = shell.getByTestId("map-active-filter-tags");
    await expect(strip).toBeVisible();
    await expect(strip.getByTestId("map-active-filter-tag")).toHaveCount(1);
    await expect(strip.getByTestId("map-active-filter-tag")).toContainText(AXES.pickup_points.label);
    await expect(strip.getByTestId("map-clear-all")).toHaveText(MF.clear_all);

    await strip.getByTestId("map-clear-all").click();
    await expect(shell.getByTestId("map-active-filter-tags")).toHaveCount(0);
    await expect(serviceChip(shell, "pickup_points")).toHaveAttribute("aria-pressed", "false");
    await expect(filtersButton(shell)).toHaveText(FILTERS_BTN);
  });

  // MT:MEH-1075:4 — apply: the sheet closes; the button reads « · 2»; the tag
  //   strip shows ×טבעוני ×ללא גלוטן; focus returns to the button.
  // MT:MEH-1075:5 — removing a tag × drops the count to 1, and reopening the
  //   sheet shows that switch off.
  test("apply closes the sheet with « · 2», two removable tags and focus back on the button; a tag × syncs the sheet", async ({ page }, info) => {
    const { shell } = await gotoWithCatalog(page, info);
    await filtersButton(shell).click();
    const panel = sheetPanel(page);
    await expect(panel).toBeVisible();
    await panel.getByTestId("chip-vegan").click();
    await panel.getByTestId("chip-gluten_free").click();
    await expect(panel.getByTestId("chip-vegan")).toHaveAttribute("aria-checked", "true");
    await expect(panel.getByTestId("filter-sheet-apply-footer")).toContainText(icu(SHEET.apply, PRODUCERS.length));
    await panel.getByTestId("filter-sheet-apply-footer").getByRole("button", { name: icu(SHEET.apply, PRODUCERS.length) }).click();
    await expect(sheetPanel(page)).toHaveCount(0);
    await expect(filtersButton(shell)).toContainText("2");
    await expect(filtersButton(shell)).toBeFocused();
    const tags = shell.getByTestId("map-active-filter-tags").getByTestId("map-active-filter-tag");
    await expect(tags).toHaveCount(2);
    await expect(tags.nth(0)).toContainText(AXES.vegan.label);
    await expect(tags.nth(1)).toContainText(AXES.gluten_free.label);

    await tags.filter({ hasText: AXES.vegan.label }).click();
    await expect(filtersButton(shell)).toContainText("1");
    await expect(tags).toHaveCount(1);
    await filtersButton(shell).click();
    await expect(sheetPanel(page).getByTestId("chip-vegan")).toHaveAttribute("aria-checked", "false");
    await expect(sheetPanel(page).getByTestId("chip-gluten_free")).toHaveAttribute("aria-checked", "true");
  });

  // MT:MEH-1075:8 — «משלוח» from the sheet with no saved city → CityPickerModal
  //   opens ABOVE the sheet; picking a city applies the delivery filter (the
  //   page re-queries with `delivery_city`, the city search carries the city).
  test("«משלוח» from the sheet with no saved city opens the city picker above it; a city pick applies the filter", async ({ page }, info) => {
    const { shell, catalog } = await gotoWithCatalog(page, info);
    await filtersButton(shell).click();
    await sheetPanel(page).getByTestId("chip-has_delivery").click();
    const picker = cityPicker(page);
    await expect(picker).toBeVisible();
    expect(await hitTestIsSelf(picker.getByRole("heading", { name: CP.heading })), "the picker must be painted above the sheet").toBe(true);
    const before = catalog.seen.length;
    await picker.getByRole("button", { name: LOC.popular_cities.jerusalem, exact: true }).click();
    await expect(cityPicker(page)).toHaveCount(0);
    await expect.poll(() => catalog.seen.slice(before).some((u) => u.searchParams.get("delivery_city") === "ירושלים")).toBe(true);
    await expect(citySearchInput(page, info)).toHaveValue("ירושלים");
    await expect(serviceChip(shell, "has_delivery")).toHaveAttribute("aria-pressed", "true");
  });

  // MT:MEH-1075:9 — desktop: the sheet is a panel anchored UNDER the button, not
  //   a bottom sheet; a click outside closes it.
  test("desktop: «סינון» opens a panel anchored under the button, and a click outside closes it", async ({ page }, info) => {
    desktopOnly(info, "the anchored panel is the lg+ variant (FilterSheet.jsx)");
    await stubExternal(page);
    await gotoMap(page);
    const shell = shellOf(page, info);
    await filtersButton(shell).click();
    const panel = sheetPanel(page);
    await expect(panel).toBeVisible();
    const b = await box(filtersButton(shell));
    const p = await box(panel);
    const vw = await page.evaluate(() => window.innerWidth);
    const vh = await page.evaluate(() => window.innerHeight);
    expect(p.y, "panel top must sit below the button").toBeGreaterThanOrEqual(b.y + b.height - 1);
    expect(p.width, "a bottom sheet would span the viewport").toBeLessThan(vw * 0.6);
    expect(p.y + p.height, "a bottom sheet would be glued to the viewport bottom").toBeLessThan(vh - 8);
    // Outside: the map canvas centre — the click-away backdrop takes it.
    const c = await box(mapCanvas(shell));
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
    await expect(sheetPanel(page)).toHaveCount(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › near-me pill + empty-near-me guard, mobile (MEH-970)", () => {
  // MT:MEH-970:1 — ONE floating near-me control on the map, none in the city
  //   search row; the city search spans the bar. DRIFT: the pill is a circular
  //   icon button in the bottom-END corner since MEH-1194, not a text pill.
  // MT:city:5 — mobile: the city search is still full-width (w-full).
  test("mobile: one near-me control, no crosshair in the search row, city search as wide as the bar", async ({ page }, info) => {
    mobileOnly(info, "the pill is mounted inside the mobile shell only");
    await stubExternal(page);
    await gotoMap(page);
    const shell = shellOf(page, info);
    const pill = shell.getByTestId("map-near-me-pill");
    await expect(pill).toHaveCount(1);
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("aria-label", NM.aria);
    const bar = shell.getByTestId("map-mobile-bar");
    await expect(bar.getByRole("button", { name: MP.aria.center_on_me })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: NM.aria })).toHaveCount(0);
    const barBox = await box(bar);
    const barPad = await bar.evaluate((el) => {
      const s = getComputedStyle(el);
      return parseFloat(s.paddingLeft) + parseFloat(s.paddingRight);
    });
    const search = await box(citySearchInput(page, info).locator("xpath=ancestor::div[contains(@class,'relative')][1]"));
    expect(Math.abs(barBox.width - barPad - search.width), "city search width vs bar inner width").toBeLessThanOrEqual(2);
  });

  // MT:MEH-970:2 — businesses nearby: the map flies to the fix (zoom 13) with a
  //   location marker; NO toast.
  test("mobile: near me with businesses nearby flies to zoom 13, draws the location marker, no toast", async ({ page, context }, info) => {
    mobileOnly(info, "the pill is mounted inside the mobile shell only");
    await grantGps(context, GPS_NEAR);
    const { shell, tiles } = await gotoWithCatalog(page, info);
    await shell.getByTestId("map-near-me-pill").click();
    await expect.poll(() => tiles.some((t) => t.z === GPS_FLY_ZOOM), "the camera must fetch tiles at the fly-to zoom").toBe(true);
    await expect(shell.locator("path.leaflet-interactive")).toHaveCount(1);
    await expect(page.getByText(NM.empty, { exact: true })).toHaveCount(0);
    await expect(cards(shell)).toHaveCount(PRODUCERS.length);
  });

  // MT:MEH-970:3 — nothing within 25 km: the toast, the camera back on the
  //   default view (zoom 8), and ALL businesses still listed — never a blank map.
  test("mobile: near me with nothing within 25 km toasts, returns to the default view and keeps every business", async ({ page, context }, info) => {
    mobileOnly(info, "the pill is mounted inside the mobile shell only");
    await grantGps(context, GPS_FAR);
    const { shell, tiles } = await gotoWithCatalog(page, info);
    await shell.getByTestId("map-near-me-pill").click();
    await expect(page.getByText(NM.empty, { exact: true })).toBeVisible();
    await expect(shell.locator("path.leaflet-interactive")).toHaveCount(1);
    // The fallback flyTo cancels the zoom-13 flight mid-air, so the camera
    // settles back on the default zoom: every tile the visible map holds is a
    // z8 tile and none is z13. The toast above is what proves this branch ran
    // — the tile census alone would also describe a page that did nothing.
    await expect
      .poll(async () => {
        const zs = await mapCanvas(shell).locator("img.leaflet-tile").evaluateAll((els) => els.map((e) => /\/(\d+)\/\d+\/\d+\.png/.exec((e as HTMLImageElement).src)?.[1]));
        return zs.length > 0 && zs.every((z) => z === String(NEAR_ME_DEFAULT_ZOOM));
      }, { message: "the camera must settle on the default zoom" })
      .toBe(true);
    expect(tiles.length, "control: the tile route must be recording").toBeGreaterThan(0);
    await expect(cards(shell)).toHaveCount(PRODUCERS.length);
    await expect(primaryMarkers(shell)).toHaveCount(PRODUCERS.length);
  });

  // MT:MEH-970:4 · MT:two-row:geo1 · MT:two-row:geo5 — denial opens the
  //   LocationModal (city search + popular cities), not a dead toast — through
  //   the mobile pill AND the desktop GPS circle (both paths, one modal).
  test("a denied location request opens the city modal (both near-me paths), never a toast", async ({ page }, info) => {
    await installGeo(page, 1);
    await stubExternal(page);
    await gotoMap(page);
    const shell = shellOf(page, info);
    await shell.getByTestId(isDesktop(info) ? "map-gps-button" : "map-near-me-pill").click();
    const modal = locationModal(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: LOC.popular_cities.tel_aviv, exact: true })).toBeVisible();
    await expect(modal.locator("#location-modal-city")).toBeVisible();
    for (const msg of Object.values(MC.errors)) await expect(page.getByText(msg, { exact: true })).toHaveCount(0);
    // MT:PR2:6 — the modal's geolocate button is spelled «קרוב אליי».
    await expect(modal.getByRole("button", { name: LOC.geo_button, exact: true })).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › legend: empty-viewport categories disabled, desktop (MEH-722 · MEH-1010 row 5)", () => {
  // MT:MEH-722:1 — a category with 0 businesses in view is greyed and NOT
  //   clickable. DRIFT: "in view" is `allProducers ∩ committedBounds`
  //   (useMapFilters.js viewportCategoryCounts) — before any «חפשו באזור זה» it
  //   is the whole feed, so the empty row here is one no fixture business carries.
  // MT:MEH-722:2 — a non-empty row stays clickable and filters the list.
  // MT:MEH-1010:5 — a legend row click applies the filter AND keeps the panel
  //   open; a map-canvas click closes it.
  //   SEMANTICS (useMapFilters.js toggleCategory): `activeCategoryNames === null`
  //   means EVERY row is active; a row click toggles that row OFF (and the
  //   «הציגו הכל» link appears). So an empty row is `disabled` only once it is
  //   inactive — while still active-and-empty it is muted (opacity-60) but
  //   clickable, which is exactly MEH-722 row 4's no-trap rule.
  test("an empty category row is muted while active and disabled once off; a live row filters the list with the panel open; the canvas closes it", async ({ page }, info) => {
    desktopOnly(info, "the legend is desktop-only (MapPane.jsx hidden lg:block)");
    const { shell } = await gotoWithCatalog(page, info);
    await shell.getByTestId("map-legend-toggle").click();
    const panel = shell.getByTestId("map-legend-panel");
    await expect(panel).toBeVisible();
    const empty = legendRow(shell, EMPTY_LEGEND_NAME);
    await expect(empty).toHaveCount(1);
    // All-on default: the empty row is active → muted, still clickable.
    await expect(empty).toHaveAttribute("aria-pressed", "true");
    await expect(empty).toBeEnabled();
    await expect(empty).toHaveClass(/opacity-60/);
    await empty.click();
    // Off + empty → the dead-end row: disabled, not-allowed cursor.
    await expect(empty).toHaveAttribute("aria-pressed", "false");
    await expect(empty).toBeDisabled();
    await expect(empty).toHaveAttribute("aria-disabled", "true");
    // FINDING (04/09): the row's "cursor not-allowed" is unobservable on
    // desktop — globals.css:614 `cursor: none !important` (the custom cursor)
    // overrides every cursor keyword, measured as computed `none` here. The
    // class the component sets is asserted; the affordance it names is not
    // what a desktop visitor sees.
    await expect(empty).toHaveClass(/cursor-not-allowed/);
    await expect(panel.getByRole("button", { name: MP.show_all, exact: true })).toBeVisible();
    // A live row: toggling meat OFF leaves the dairy businesses (the
    // uncategorised P_ASH drops out too — the filter reads categories[0]).
    const meat = legendRow(shell, CAT_MEAT.name);
    await expect(meat).toBeEnabled();
    await expect(meat).not.toHaveClass(/opacity-60/);
    await meat.click();
    await expect(meat).toHaveAttribute("aria-pressed", "false");
    await expect(panel, "the panel must stay open after a row click").toBeVisible();
    await expect.poll(() => cardNames(shell)).toEqual(DAIRY.map((p) => p.name));
    await expect(primaryMarkers(shell)).toHaveCount(DAIRY.length);
    await clickCanvasCorner(shell);
    await expect(shell.getByTestId("map-legend-panel")).toHaveCount(0);
  });

  // MT:MEH-722:3 — the counts recompute when the committed area changes.
  // MT:MEH-722:4 — an ACTIVE category that drops to 0 stays clickable, so the
  //   user can toggle out of the empty filter (no trap, no crash).
  // MT:z:r1 — «חפשו באזור זה» works: the geo re-query goes out with
  //   lat/lng/radius_km and the button clears (copy drift: «חפשי» → «חפשו»).
  test("after «חפשו באזור זה» the active category that dropped to 0 is muted but still toggles off; the re-query carries the geo params", async ({ page }, info) => {
    desktopOnly(info, "the legend is desktop-only (MapPane.jsx hidden lg:block)");
    // The geo re-query (it carries radius_km) answers dairy-only; everything else the full list.
    const { shell, catalog } = await gotoWithCatalog(page, info, "/map", (u) => (u.searchParams.has("radius_km") ? DAIRY : PRODUCERS));
    await shell.getByTestId("map-legend-toggle").click();
    // Leave ONLY meat active: toggle every other row off (rows toggle OFF from
    // the all-on default — see the test above).
    const meat = legendRow(shell, CAT_MEAT.name);
    const rows = shell.getByTestId("map-legend-row");
    const names = await rows.allTextContents();
    for (const name of names.filter((n) => n !== CAT_MEAT.name)) await legendRow(shell, name).click();
    await expect(meat).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => cardNames(shell)).toEqual(MEAT.map((p) => p.name));
    await clickCanvasCorner(shell);

    await panMap(page, shell);
    const before = catalog.seen.length;
    await shell.getByTestId("map-search-this-area").click();
    await expect.poll(() => catalog.seen.slice(before).some((u) => ["lat", "lng", "radius_km", "require_physical"].every((k) => u.searchParams.has(k)))).toBe(true);
    await expect(shell.getByTestId("map-search-this-area")).toHaveCount(0);
    // Meat is still the active filter, and the area now has no meat.
    await expect(shell.getByText(CARD_EMPTY.heading, { exact: true })).toBeVisible();
    await shell.getByTestId("map-legend-toggle").click();
    await expect(meat).toHaveAttribute("aria-pressed", "true");
    await expect(meat, "an active row at 0 must stay clickable").toBeEnabled();
    await expect(meat).toHaveClass(/opacity-60/);
    await expect(legendRow(shell, EMPTY_LEGEND_NAME)).toBeDisabled();
    // Toggling the last active row off resets to "all" (toggleCategory returns
    // null for an empty set) — the way out of the empty filter.
    await meat.click();
    await expect(meat).toHaveAttribute("aria-pressed", "true");
    await expect(shell.getByTestId("map-legend-panel").getByRole("button", { name: MP.show_all, exact: true })).toHaveCount(0);
    await expect.poll(() => cardNames(shell)).toEqual(DAIRY.map((p) => p.name));
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › filter chips two-row layout — scroll + geo fallback", () => {
  // MT:two-row:m3 — scrolled to the far end, the last chip is not cut off
  //   (the w-12 scroll-end spacer, ChipScrollRow.jsx).
  test("mobile: at max scroll the last category chip sits fully inside the row", async ({ page }, info) => {
    mobileOnly(info, "the category row overflows at 393px; on desktop it fits");
    const { shell } = await gotoWithCatalog(page, info);
    const row = shell.getByRole("toolbar", { name: he.map.chip_scroll.category_aria });
    const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, "control: the row must overflow for the spacer to matter").toBeGreaterThan(8);
    const last = row.getByRole("button").last();
    await row.evaluate((el) => el.scrollTo({ left: -el.scrollWidth, behavior: "auto" }));
    await expect.poll(async () => inside(await box(last), await box(row))).toBe(true);
  });

  // MT:two-row:m4 — clicking the chip at the cut edge selects it AND scrolls it
  //   into view. DRIFT: selected = Direction A ring + wash (bg-green-50), not
  //   bg-primary (MEH-1181-A). Dispatched without Playwright's own scroll-into-
  //   view, so the scroll observed is the component's.
  test("mobile: an edge chip clicked while half-hidden becomes pressed and scrolls itself into view", async ({ page }, info) => {
    mobileOnly(info, "the category row overflows at 393px; on desktop it fits");
    const { shell } = await gotoWithCatalog(page, info);
    const row = shell.getByRole("toolbar", { name: he.map.chip_scroll.category_aria });
    const last = row.getByRole("button").last();
    expect(inside(await box(last), await box(row)), "control: the edge chip starts partly out of view").toBe(false);
    await last.dispatchEvent("click");
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => inside(await box(last), await box(row))).toBe(true);
  });

  // MT:two-row:geo2 — a city picked in the modal closes it and filters the list
  //   by that city (the page re-queries with `delivery_city`; no geocode-driven
  //   zoom — Nominatim is stubbed to `[]` and the filter must still apply).
  test("picking a city in the denial modal closes it and filters by that city", async ({ page }, info) => {
    await installGeo(page, 1);
    const { shell, catalog } = await gotoWithCatalog(page, info);
    await shell.getByTestId(isDesktop(info) ? "map-gps-button" : "map-near-me-pill").click();
    const modal = locationModal(page);
    await expect(modal).toBeVisible();
    const before = catalog.seen.length;
    await modal.getByRole("button", { name: LOC.popular_cities.haifa, exact: true }).click();
    await expect(locationModal(page)).toHaveCount(0);
    await expect.poll(() => catalog.seen.slice(before).some((u) => u.searchParams.get("delivery_city") === "חיפה")).toBe(true);
    await expect(citySearchInput(page, info)).toHaveValue("חיפה");
  });

  // MT:two-row:geo3 — deny, close the modal → the browser is NOT asked again.
  test("after a denial and a closed modal there is no automatic re-prompt", async ({ page }, info) => {
    await installGeo(page, 1);
    await stubExternal(page);
    await gotoMap(page);
    const shell = shellOf(page, info);
    await shell.getByTestId(isDesktop(info) ? "map-gps-button" : "map-near-me-pill").click();
    await expect(locationModal(page)).toBeVisible();
    expect(await geoCalls(page), "control: the click must have prompted once").toBe(1);
    await locationModal(page).getByRole("button", { name: LOC.close_aria, exact: true }).click();
    await expect(locationModal(page)).toHaveCount(0);
    // Inverted bounded wait: a re-prompt would move the counter within the bound.
    const rePrompted = await page
      .waitForFunction(() => (window as unknown as { __geoCalls: number }).__geoCalls > 1, null, { timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    expect(rePrompted, "no second geolocation prompt may fire on its own").toBe(false);
  });

  // MT:two-row:geo4 — a TECHNICAL failure (unavailable / timeout) is a toast
  //   only — no modal.
  for (const [code, key] of [[2, "position_unavailable"], [3, "timeout"]] as const) {
    test(`a technical geolocation failure (code ${code}) toasts «${MC.errors[key]}» and opens no modal`, async ({ page }, info) => {
      await installGeo(page, code);
      await stubExternal(page);
      await gotoMap(page);
      const shell = shellOf(page, info);
      await shell.getByTestId(isDesktop(info) ? "map-gps-button" : "map-near-me-pill").click();
      // Desktop routes through MapClient.handleGpsClick (map.client.errors.*);
      // the mobile pill through MapComponent.goToMyLocation, whose technical
      // failure string is map.component.geo_failure — same class, two owners.
      const expected = isDesktop(info) ? MC.errors[key] : he.map.component.geo_failure;
      await expect(page.getByText(expected, { exact: true })).toBeVisible();
      await expect(locationModal(page)).toHaveCount(0);
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › map city search width + dropdown z-index", () => {
  // MT:city:1 · MT:city:4 — a long city name is fully visible in the field.
  // MT:city:2 — «ראש» lists «ראשון לציון» and «ראש העין» on full lines, no
  //   truncation and no horizontal scroll.
  // MT:city:3 — picking «ראשון לציון» fills the field with the full value.
  test("desktop: long city names are not truncated; the «ראש» dropdown shows full lines; a pick fills the field", async ({ page }, info) => {
    desktopOnly(info, "the width bug was desktop-only (mobile was already w-full — row 5, in the MEH-970 block)");
    await stubExternal(page);
    await gotoMap(page);
    const input = citySearchInput(page, info);
    for (const city of ["ראשון לציון", "מעלה אדומים"]) {
      await input.fill(city);
      await expect(input).toHaveValue(city);
      expect(await input.evaluate((el) => el.scrollWidth <= el.clientWidth), `«${city}» must fit the field`).toBe(true);
    }
    await input.fill("ראש");
    const list = citySearchList(page, info);
    await expect(list).toBeVisible();
    // Derived from the same static list CitySearch filters (data/cities.js) —
    // CI may merge backend cities on top, so presence is asserted, not the count.
    const expected = (ISRAEL_CITIES as string[]).filter((c) => c.includes("ראש"));
    expect(expected).toEqual(expect.arrayContaining(["ראשון לציון", "ראש העין"]));
    for (const name of ["ראשון לציון", "ראש העין"]) await expect(list.getByRole("option", { name, exact: true })).toBeVisible();
    expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth), "no horizontal scroll in the list").toBe(true);
    const clipped = await list.getByRole("option").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).length);
    expect(clipped, "no option may be truncated").toBe(0);
    await list.getByRole("option", { name: "ראשון לציון", exact: true }).click();
    await expect(input).toHaveValue("ראשון לציון");
  });

  // MT:city:6 · MT:z:r3 — mobile: the dropdown is painted ABOVE the map with an
  //   opaque white background (hit-test at the option's centre resolves to the
  //   list, not to a Leaflet pane).
  test("mobile: the city dropdown paints above the map tiles, opaque white", async ({ page }, info) => {
    mobileOnly(info, "on desktop the search sits in the sidebar, beside the map — the overlap is the mobile bar's");
    await stubExternal(page);
    await gotoMap(page);
    const input = citySearchInput(page, info);
    const shell = shellOf(page, info);
    await input.fill("זכ");
    const list = citySearchList(page, info);
    const option = list.getByRole("option", { name: "זכרון יעקב", exact: true });
    await expect(option).toBeVisible();
    expect(await hitTestIsSelf(option)).toBe(true);
    await expect(list).toHaveCSS("background-color", "rgb(255, 255, 255)");
    // The row's «זכ» yields one line, which ends inside the sticky bar above
    // the canvas — so the OVER-THE-MAP half needs a list long enough to reach
    // the tiles. Derived from the same static list CitySearch filters
    // (data/cities.js): the first two-letter query with ≥ 6 matches.
    const longQuery = ["ית", "ון", "בי", "ים"].find((q) => (ISRAEL_CITIES as string[]).filter((c) => c.includes(q)).length >= 6);
    expect(longQuery, "control: a query with ≥ 6 static matches must exist").toBeTruthy();
    await input.fill(longQuery as string);
    const lastOption = list.getByRole("option").last();
    await expect(lastOption).toBeVisible();
    const o = await box(lastOption);
    const c = await box(mapCanvas(shell));
    expect(o.y + o.height > c.y && o.y < c.y + c.height, "control: the last option must lie over the map").toBe(true);
    expect(await hitTestIsSelf(lastOption), "the option over the tiles is painted on top of them").toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › map z-index token system + UI bugfixes", () => {
  // MT:z:b1 · MT:z:r4 — mobile, sheet open: the zoom +/- control is still
  //   clickable above it, and zooming works (tiles at z+1 are fetched).
  // MT:z:r2 — «קרוב אליי» is clickable with the sheet open.
  // MT:z:b4 — the selected card's X is reachable and closes it.
  // MT:z:b3 — the sheet content scrolls to its end (the last card is fully
  //   reachable above the nav band). DRIFT: the «מידע נוסף» CTA is gone.
  // MT:z:a2 — sheet at HALF: the attribution rides ABOVE the sheet edge.
  // MT:MEH-1010:6 — mobile: a marker tap opens the sheet with the pinned card;
  //   no legend.
  test("mobile with the sheet open: zoom + near-me still take clicks, the X closes the pinned card, the list scrolls to its end", async ({ page }, info) => {
    mobileOnly(info, "the bottom sheet is the mobile shell's list");
    await installGeo(page, 1);
    const { shell, tiles } = await gotoWithCatalog(page, info);
    await tapMarkerOpensSheet(page, shell, P_TLV);
    await expect(shell.getByTestId("map-selected-card")).toContainText(P_TLV.name);
    await expect(shell.getByTestId("map-legend-toggle")).toBeHidden();
    // MT:z:a2 — the attribution rides the HALF edge: its bottom sits at
    // `container bottom − sheet height − 6px` (the MEH-1365 rule), and it
    // never overlaps the sheet's cards.
    const ride = await attributionRide(page, shell);
    expect(ride.ruleGap, `attribution rides the sheet edge (spill below the fold: ${ride.spill}px)`).toBeLessThanOrEqual(2);
    expect(ride.overCards, "attribution must not overlap the sheet content").toBe(false);

    expect(await hitTestIsSelf(zoomIn(shell)), "zoom-in is painted above the sheet").toBe(true);
    const t0 = Date.now();
    await zoomIn(shell).click();
    await expect.poll(() => tiles.some((t) => t.t >= t0 && t.z > NEAR_ME_DEFAULT_ZOOM), "zoom-in must fetch tiles one level deeper").toBe(true);

    const pill = shell.getByTestId("map-near-me-pill");
    expect(await hitTestIsSelf(pill), "near-me is painted above the sheet").toBe(true);
    await pill.click();
    await expect.poll(() => geoCalls(page)).toBe(1);
    await locationModal(page).getByRole("button", { name: LOC.close_aria, exact: true }).click();

    const content = shell.getByTestId("map-sheet-content");
    await content.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "auto" }));
    await expect.poll(async () => {
      const last = await box(cards(shell).last());
      const c = await box(content);
      return last.y + last.height <= c.y + c.height + 1;
    }, "the last card must be fully reachable").toBe(true);

    await content.evaluate((el) => el.scrollTo({ top: 0, behavior: "auto" }));
    const close = shell.getByTestId("map-selected-card-close");
    await expect(close).toBeVisible();
    await close.click();
    await expect(shell.getByTestId("map-selected-card")).toHaveCount(0);
  });

  // MT:z:b2 — desktop: hovering a marker yields exactly ONE tooltip source — the
  //   native `title` (MapComponent.jsx `title: markerLabel`); no Leaflet tooltip
  //   is bound (MEH-30 #8), so no duplicate.
  test("desktop: a hovered marker has one tooltip source (native title), no Leaflet tooltip, and highlights its card", async ({ page }, info) => {
    desktopOnly(info, "hover is a pointer affordance; the mobile path is tap → sheet");
    const { shell } = await gotoWithCatalog(page, info);
    const marker = markerOf(shell, P_TLV);
    await expect(marker).toHaveAttribute("title", P_TLV.name);
    await marker.hover();
    await expect(shell.locator(".leaflet-tooltip")).toHaveCount(0);
    await expect(cardOf(shell, P_TLV).locator("xpath=..")).toHaveClass(/ring-2/);
  });

  // MT:z:b5 — mobile: the category legend is NOT visible.
  // MT:z:a1 — mobile, sheet at PEEK: the attribution sits above the sheet edge,
  //   with a small gap.
  // MT:z:1019-2 — mobile WITHOUT a top banner (logged out): the shell ends at
  //   the fold — no spill, nothing scrollable past the map.
  test("mobile: no legend; attribution rides above the PEEK sheet; the shell ends exactly at the fold", async ({ page }, info) => {
    mobileOnly(info, "all three rows are mobile-shell geometry");
    await stubExternal(page);
    await gotoMap(page);
    const shell = shellOf(page, info);
    await expect(shell.getByTestId("map-legend-toggle")).toBeHidden();
    await expect(shell.getByTestId("map-legend-panel")).toHaveCount(0);
    await expect(attribution(shell)).toBeVisible();
    await sheetSettledAt(page, shell, 0.14); // PEEK (MapBottomSheet.jsx)
    // MT:z:a1 — rides the PEEK edge by the MEH-1365 rule (6px above the sheet
    // height, measured from the container's bottom) and clears the cards.
    // FINDING (04/09): on this project's 393×727 viewport the container's
    // `min-h-[500px]` spills ~22px below the fold, so the attribution lands
    // that far below the sheet's real top edge — the row's "~6px gap" holds
    // only where the container fits (e.g. a 393×851 device). Asserted as the
    // mechanism, with the spill named in the message.
    const ride = await attributionRide(page, shell);
    expect(ride.ruleGap, `attribution rides the sheet edge (spill below the fold: ${ride.spill}px)`).toBeLessThanOrEqual(2);
    expect(ride.overCards, "attribution must not overlap the sheet content").toBe(false);
    const vh = await page.evaluate(() => window.innerHeight);
    const s = await box(shell);
    expect(s.y + s.height, "the mobile shell must not spill below the fold").toBeLessThanOrEqual(vh + 1);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
  });

  // MT:z:b6 — desktop: the legend toggle at the map's bottom-LEFT, z-800, fully
  //   inside the viewport (the top-banner half needs an unverified login — see
  //   the header). The legend is a physically-anchored map overlay (rtl-ok,
  //   MapPane.jsx) — the assertion below measures that physical corner.
  // MT:z:a4 — desktop: the attribution in the map's bottom corner.
  test("desktop: legend toggle at the map's bottom-left on z-800, attribution in the bottom corner, both inside the viewport", async ({ page }, info) => {
    desktopOnly(info, "the legend and the desktop attribution rule are lg+ only");
    await stubExternal(page);
    await gotoMap(page);
    const shell = shellOf(page, info);
    const pane = await box(mapCanvas(shell));
    const toggle = await box(shell.getByTestId("map-legend-toggle"));
    const vw = await page.evaluate(() => window.innerWidth);
    const vh = await page.evaluate(() => window.innerHeight);
    expect(toggle.x - pane.x, "legend is anchored to the map's physical start-left corner (rtl-ok)").toBeLessThanOrEqual(24);
    expect(pane.y + pane.height - (toggle.y + toggle.height), "legend is anchored to the map's bottom edge").toBeLessThanOrEqual(24);
    expect(toggle.y + toggle.height).toBeLessThanOrEqual(vh);
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(vw);
    await expect(shell.getByTestId("map-legend")).toHaveCSS("z-index", "800");
    const attr = await box(attribution(shell));
    expect(pane.y + pane.height - (attr.y + attr.height), "attribution hugs the map bottom").toBeLessThanOrEqual(8);
    expect(attr.x >= pane.x - 1 && attr.x + attr.width <= pane.x + pane.width + 1, "attribution inside the map pane").toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /map desktop — marker click = card-sync (MEH-1010)", () => {
  // MT:MEH-1010:1 — a marker click scrolls the matching sidebar card into view
  //   and highlights it (Pin-Echo: 2px category border, MEH-1243); no popup.
  // MT:MEH-1010:2 — the highlight survives a zoom; a map-canvas click clears it.
  // MT:MEH-1010:4 — Enter on a focused marker does the same (MEH-765).
  test("marker click scrolls + highlights the card; zoom keeps it; canvas clears it; Enter on a focused marker repeats it", async ({ page, context }, info) => {
    desktopOnly(info, "card-sync into the sidebar is the desktop path; mobile is the sheet (MEH-1010 row 6, z block)");
    await context.clearPermissions();
    const { shell } = await gotoWithCatalog(page, info);
    const target = P_ASH; // last in feed order → below the sidebar fold
    const card = cardOf(shell, target);
    const scroller = card.locator("xpath=ancestor::div[contains(@class,'overflow-y-auto')][1]");
    expect(inside(await box(card), await box(scroller)), "control: the target card starts out of the sidebar's view").toBe(false);
    await expect(card).toHaveCSS("border-top-width", "1px");

    await markerOf(shell, target).click();
    await expect(card).toHaveCSS("border-top-width", "2px");
    await expect.poll(async () => inside(await box(card), await box(scroller))).toBe(true);
    await expect(shell.locator(".leaflet-popup")).toHaveCount(0);

    await zoomIn(shell).click();
    await expect(card).toHaveCSS("border-top-width", "2px");
    await clickCanvasCorner(shell);
    await expect(card).toHaveCSS("border-top-width", "1px");

    const marker = markerOf(shell, P_TLV);
    await marker.focus();
    await expect(marker).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(cardOf(shell, P_TLV)).toHaveCSS("border-top-width", "2px");
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /map card distance under /en (MEH-826 Gap 2)", () => {
  // MT:G2:3 — `/en/map`: the distance is still the shared Hebrew formatter's
  //   output (formatDistance unit "he"), consistent with ProducerCard. Rows 1-2
  //   are COVERED by MapProducerCard.test.jsx:79/:74. DRIFT: the "ממך" suffix
  //   was dropped by MEH-1307 and the fix lives in localStorage (MEH-2014).
  test("/en/map: the card distance uses the shared Hebrew format", async ({ page }, info) => {
    desktopOnly(info, "one shell is enough — the card component is the same on both");
    await seedGps(page, GPS_NEAR);
    const { shell } = await gotoWithCatalog(page, info, "/en/map");
    await expect(cardOf(shell, P_HAIFA).getByTestId("map-distance-pill")).toHaveText(distanceLabel(P_HAIFA, GPS_NEAR));
    await expect(shell.getByTestId("map-distance-pill")).toHaveCount(PRODUCERS.length);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /map list heading + subhead (MEH-826 Gap 3)", () => {
  // MT:G3:1 — the count line carries the locked copy with the right plural:
  //   0 → «אין בתי עסק מקומיים באזור», 1 → «בית עסק מקומי אחד באזור», N → «N בתי עסק…».
  // MT:G3:2 · MT:PR2:5 — the subhead under the count is the region alone,
  //   shown only when a city is known; absent otherwise (no dangling «·»).
  //   DRIFT: the row's «קרוב אליך · {city}» prefix is gone — he.json
  //   map.client.subhead is «{region}» (PR 2 row 5 is the row that locked it).
  // MT:G3:3 — the h1 «מפת בתי עסק» stays at the top of the pane; no second
  //   visible heading stacked on it.
  test("desktop: count line for 0 / 1 / many, subhead only with a city (bare region), h1 kept", async ({ page }, info) => {
    desktopOnly(info, "the count line + subhead are the desktop sidebar's (the sheet has its own count)");
    const shell = shellOf(page, info);
    for (const list of [[] as Producer[], [P_HAIFA], PRODUCERS]) {
      await stubExternal(page);
      await mockCatalog(page, list);
      await gotoMap(page);
      await expect(shell.getByTestId("map-list-count")).toHaveText(icu(MC.business_count, list.length));
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
    await expect(shell.getByTestId("map-list-subhead")).toHaveCount(0);
    await expect(shell.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(shell.getByRole("heading", { level: 1 })).toHaveText(MC.title);

    await seedCity(page, "ירושלים");
    await gotoWithCatalog(page, info);
    await expect(shell.getByTestId("map-list-subhead")).toHaveText("ירושלים");
  });

  // MT:G3:4 — `/en/map`: the English count line + the region subhead.
  test("/en/map: English count line + region subhead", async ({ page }, info) => {
    desktopOnly(info, "the count line + subhead are the desktop sidebar's");
    await seedCity(page, "Haifa");
    const { shell } = await gotoWithCatalog(page, info, "/en/map");
    await expect(shell.getByTestId("map-list-count")).toHaveText(icu(MC_EN.business_count, PRODUCERS.length));
    await expect(shell.getByTestId("map-list-subhead")).toHaveText("Haifa");
    await expect(shell.getByRole("heading", { level: 1 })).toHaveText(MC_EN.title);
  });
});
