// MEH-3540: fixtures and helpers shared by the map*.spec.ts parts, moved
// here verbatim from the former map.spec.ts (only `export` was added).
import type { BrowserContext, Locator, Route, TestInfo } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import { layoutSettled } from "../_layout-settled";
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
 *           `chip-<key>`,
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
 *           .spec.ts:264/:159/:319/:344), PR3 row 2 (mobile FAB absence on
 *           /map — the viewport gate that once made it vacuous is gone since
 *           MEH-2499, so it is convertible; the /map route gate itself is
 *           pinned by ChatWidgetLazy.test.jsx), MEH-1230 row 2 (focus-ring
 *           clipping is a paint property
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

export const FIRST_PAINT = { timeout: 15_000 };
export const MAP_MOUNT = { timeout: 45_000 };

// MEH-1792 (re-measured 2026-09-04 on chunks 1 and 2): during the app's
// page-transition window a second copy of the page tree exists briefly OUTSIDE
// `#main-content`, so a page-wide `getByTestId` can resolve to TWO elements and
// fail strict mode ("resolved to 2 elements … unexpected value hidden") — seen
// on the mobile project in both a red-control run and a green run. Scoping every
// locator to the `#main-content` landmark (layout.js) names the live tree only.
// Same fix as e2e/flows/27-delivery-day-discoverability.spec.ts:73.
export const scope = (page: Page) => page.locator("#main-content");

// /map renders BOTH shells into the DOM at once (MapClient.jsx: `hidden lg:grid`
// desktop + `lg:hidden` mobile — the card list, the chip bar and a Leaflet map
// exist twice). Every assertion below is therefore scoped to the shell the
// current project can SEE, chosen by the static project identity — never by
// counting what rendered (testing.md: a guard that consults its own subject).
export const isDesktop = (info: TestInfo) => info.project.name === "desktop";
export const shellOf = (page: Page, info: TestInfo) =>
  scope(page).getByTestId(isDesktop(info) ? "map-desktop-shell" : "map-mobile-shell");
export const desktopOnly = (info: TestInfo, why: string) => test.skip(!isDesktop(info), why);
export const mobileOnly = (info: TestInfo, why: string) => test.skip(isDesktop(info), why);

// ── copy ────────────────────────────────────────────────────────────────────
export const MC = he.map.client;
export const MP = he.map.pane;
export const MF = he.map.filter;
// `NM.empty` is not rendered anywhere since #3959: the empty near-me result is
// the bottom sheet's `he.map.bottom_sheet.near_me_empty` line. Only `NM.aria`
// is read here — a check against `NM.empty` would pass on any page.
export const NM = he.map.near_me_pill;
export const CP = he.map.city_picker;
export const CARD_EMPTY = he.map.card_list.empty;
export const SHEET = he.filters.sheet;
export const FILTERS_BTN = he.filters.button;
export const LOC = he.modals.location;
// MEH-2308: the launcher's name is its visible pill text on a first desktop
// visit and the aria-label once it is icon-only, so match either. A string for
// one state would make the absence checks below pass against the other one.
export const reEsc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const eitherName = (a: string, b: string) => new RegExp(`^(${reEsc(a)}|${reEsc(b)})$`);
export const CHAT_OPEN_HE = eitherName(he.chat.launcher_open_label, he.chat.launcher_pill);
export const CHAT_OPEN_EN = eitherName(en.chat.launcher_open_label, en.chat.launcher_pill);
export const MC_EN = en.map.client;

export type Axis = { key: string; label: string };
/**
 * MEH-2748 moved every axis's consumer label (and subtext) out of
 * filter-taxonomy.js into messages/he.json `filter_axes.<key>`. Reading
 * `FILTER_AXES[k].label` now yields undefined, and `getByRole("button",
 * { name: undefined })` matches EVERY button — the 08/11 strict-mode reds. So
 * the label is joined in from he.json here, and a missing one throws at load
 * instead of silently widening a locator.
 */
export const HE_AXES = (he as unknown as { filter_axes: Record<string, { label?: string; subtext?: string | null }> }).filter_axes;
export const AXES = Object.fromEntries(
  Object.entries(FILTER_AXES as Record<string, object>).map(([k, a]) => {
    const copy = HE_AXES[k];
    if (!copy?.label) throw new Error(`he.json filter_axes.${k}.label is missing — the spec cannot name the chip`);
    return [k, { ...a, label: copy.label, subtext: copy.subtext ?? null }];
  }),
) as Record<string, Axis>;

/** Minimal ICU plural resolver for the `{count, plural, …}` strings in he/en.json. */
export function icu(msg: string, count: number): string {
  const m = /^\{count, plural,([\s\S]*)\}$/.exec(msg);
  if (!m) return msg.replace("{count}", String(count));
  const branches: Record<string, string> = {};
  const re = /(=\d+|one|two|other)\s*\{((?:[^{}]|\{count\})*)\}/g;
  let b: RegExpExecArray | null;
  while ((b = re.exec(m[1])) !== null) branches[b[1]] = b[2];
  // KNOWN GAP, stated so the next reader does not have to work it out: Hebrew's
  // CLDR plural set plus this file's own `two` includes a `many` category, and
  // this selector has no branch for it — a `many {...}` form in `he.json` would
  // fall through to `other`. Harmless at every count this spec asserts (0, 1, 6)
  // and at every plural string it reads today; it becomes wrong the moment a
  // message gains that form, which is why it is named here rather than left to
  // be rediscovered from a confusing mismatch.
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
export const CAT_MEAT = { id: 1, name: "בשר", requires_license: false };
export const CAT_DAIRY = { id: 2, name: "חלב וגבינות", requires_license: false };
export const CAT_PRODUCE = { id: 3, name: "ירקות ופירות", requires_license: false };
export const CAT_BREAD = { id: 4, name: "לחם ומאפה", requires_license: false };
export const CATEGORIES = [CAT_MEAT, CAT_DAIRY, CAT_PRODUCE, CAT_BREAD];
export const EMPTY_LEGEND_NAME = "דבש";

// Six businesses, every pair > 31 km apart (60 px at zoom 8 ≈ 31 km at this
// latitude — leaflet.markercluster's wide radius, MapComponent.jsx), so the
// default camera ([32.4, 34.95] z8, MEH-932) shows SEVEN individual pins and no
// cluster: P1's branch (Haifa) + its pickup point (Tiberias, 51 km east) + five
// single-point businesses. Exactly FIVE carry a review (RATING_SORT_THRESHOLD,
// lib/rating-gate.js) so the «הכי מדורגות» option is offered; all six carry the
// vegan + gluten-free product flags (DIET_CHIP_MIN = 5) so those sheet rows
// are offered under the MEH-2170 snapshot gate.
export type Loc = { kind: string; lat: number; lng: number; is_primary: boolean; label?: string; city?: string };
export type Producer = Record<string, unknown> & { id: string; name: string; locations: Loc[]; avg_rating: number; reviews_count: number };
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function producer(n: number, name: string, cat: { id: number; name: string } | null, locations: Loc[], extra: Record<string, unknown> = {}): Producer {
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
export const branch = (lat: number, lng: number, city: string): Loc => ({ kind: "branch", lat, lng, is_primary: true, city });
export const P_HAIFA = producer(1, "מחלבת הגבעה", CAT_DAIRY, [
  branch(32.79, 34.99, "חיפה"),
  { kind: "pickup", lat: 32.79, lng: 35.53, is_primary: false, label: "הדוכן בטבריה", city: "טבריה" },
], { verification_tier: "verified", avg_rating: 4.8, reviews_count: 12, delivers: true, offers_pickup: true });
export const P_TLV = producer(2, "קצביית השכונה", CAT_MEAT, [branch(32.08, 34.78, "תל אביב-יפו")], { avg_rating: 4.5, reviews_count: 20 });
export const P_JLM = producer(3, "בשר מההר", CAT_MEAT, [branch(31.77, 35.21, "ירושלים")], { avg_rating: 4.5, reviews_count: 3 });
export const P_BSV = producer(4, "גבינות הנגב", CAT_DAIRY, [branch(31.25, 34.79, "באר שבע")], { avg_rating: 3.9, reviews_count: 1 });
export const P_KSH = producer(5, "עוף מהגליל", CAT_MEAT, [branch(33.21, 35.57, "קריית שמונה")], { avg_rating: 4.9, reviews_count: 1 });
// The sparse card: no category, no rating, no fulfillment — PR1 row 1's
// "עסק דל נתונים" beside the "full" P_HAIFA card.
export const P_ASH = producer(6, "עסק לדוגמה", null, [branch(31.67, 34.57, "אשקלון")]);
export const PRODUCERS: Producer[] = [P_HAIFA, P_TLV, P_JLM, P_BSV, P_KSH, P_ASH];
export const MEAT = PRODUCERS.filter((p) => (p.categories as Array<{ name: string }>)[0]?.name === CAT_MEAT.name);
export const DAIRY = PRODUCERS.filter((p) => (p.categories as Array<{ name: string }>)[0]?.name === CAT_DAIRY.name);
// MEH-2617: weighted rating DESC — (avg·n + 4.0·5) / (n + 5), so one 4.9 review
// no longer outranks twelve 4.8s — then reviews_count DESC, unrated last
// (mapSort.test.js pins the comparator). Written out so a reader can check it:
// HAIFA 4.56 · TLV 4.40 · JLM 4.19 · KSH 4.15 · BSV 3.98 · ASH unrated.
export const RATING_ORDER = [P_HAIFA, P_TLV, P_JLM, P_KSH, P_BSV, P_ASH].map((p) => p.name);
export const FEED_ORDER = PRODUCERS.map((p) => p.name);

// A GPS fix 1 km south of P_HAIFA's branch — nearest by construction, and inside
// the 25 km near-me radius (MapClient.jsx NEAR_ME_RADIUS_KM).
export const GPS_NEAR = { latitude: 32.78, longitude: 34.99 };
// Eilat — > 25 km from every fixture point: the empty-near-me branch.
export const GPS_FAR = { latitude: 29.55, longitude: 34.95 };
export const NEAR_ME_DEFAULT_ZOOM = 8; // MapClient.jsx NEAR_ME_DEFAULT_ZOOM
export const GPS_FLY_ZOOM = 13; // MapComponent.jsx goToMyLocation flyTo(…, 13)

/** Nearest-first order for a fix, derived with the same haversine the app uses (lib/distance.js). */
export function nearestOrder(fix: { latitude: number; longitude: number }): string[] {
  const dist = (p: Producer) => Math.min(...p.locations.map((l) => haversineKm(fix.latitude, fix.longitude, l.lat, l.lng)));
  return [...PRODUCERS].sort((a, b) => dist(a) - dist(b)).map((p) => p.name);
}
export function distanceLabel(p: Producer, fix: { latitude: number; longitude: number }): string {
  return formatDistance(Math.min(...p.locations.map((l) => haversineKm(fix.latitude, fix.longitude, l.lat, l.lng))), { unit: "he" });
}

// ── helpers ─────────────────────────────────────────────────────────────────
export type Catalog = { seen: URL[] };
export type TileLog = Array<{ z: number; t: number }>;

/** Stub the two incidental external hosts; record which zoom each tile request asked for. */
export async function stubExternal(page: Page): Promise<TileLog> {
  const tiles: TileLog = [];
  // A RegExp, not a glob: the tile host used to carry a subdomain (`a.tile.…`,
  // single host since MEH-3077), which
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
export async function mockCatalog(page: Page, list: Producer[] | ((u: URL) => Producer[]) = PRODUCERS): Promise<Catalog> {
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

export async function gotoMap(page: Page, path = "/map"): Promise<void> {
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
 * MEH-2524: the fixture spans Kiryat Shmona to Beer Sheva, about 220 km. At the
 * default zoom 8 that needs a canvas of about 490px for every pin to be inside
 * Leaflet's bounds and rendered. The Pixel 5 canvas used to be 500px only
 * because `min-h-[500px]` ran it 22px past the viewport, under the sheet and the
 * nav pill. Now the canvas ends at the viewport, so it is 478px and one pin
 * falls outside. Tests that count every pin give the phone room for the spread.
 * They are about the layer toggle and the near-me fallback, not about the
 * canvas height.
 */
export async function fitFixtureSpread(page: Page, info: TestInfo): Promise<void> {
  if (!isDesktop(info)) await page.setViewportSize({ width: 393, height: 820 });
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
export async function gotoWithCatalog(page: Page, info: TestInfo, path = "/map", list?: Producer[] | ((u: URL) => Producer[])): Promise<{ catalog: Catalog; tiles: TileLog; shell: Locator }> {
  const tiles = await stubExternal(page);
  const catalog = await mockCatalog(page, list);
  await gotoMap(page, path);
  const shell = shellOf(page, info);
  const initial = typeof list === "function" ? list(new URL("http://localhost/api/producers")) : (list ?? PRODUCERS);
  const expected = initial.length;
  if (expected > 0) await expect(shell.getByTestId("map-card")).toHaveCount(expected, FIRST_PAINT);
  return { catalog, tiles, shell };
}

export const cards = (shell: Locator) => shell.getByTestId("map-card");
export const cardNames = (shell: Locator) => cards(shell).getByRole("heading", { level: 3 }).allTextContents();
export const cardOf = (shell: Locator, p: Producer) => cards(shell).filter({ has: shell.page().getByRole("heading", { level: 3, name: p.name, exact: true }) });
// The aria-label is quoted via JSON.stringify, not interpolated raw: a name
// containing `"` would otherwise close the attribute string early and yield a
// malformed selector that matches NOTHING — a null that is also the reassuring
// answer (testing.md). Fixture names are quote-free today; this holds if one
// stops being.
export const markerOf = (shell: Locator, p: Producer) => shell.locator(`.leaflet-marker-icon[aria-label=${JSON.stringify(p.name)}]`);
export const primaryMarkers = (shell: Locator) => shell.locator(".leaflet-marker-icon:not(.mehamakor-marker-secondary):not(.mehamakor-cluster)");
export const secondaryMarkers = (shell: Locator) => shell.locator(".leaflet-marker-icon.mehamakor-marker-secondary");
export const mapCanvas = (shell: Locator) => shell.locator(".leaflet-container");
export const legendRow = (shell: Locator, name: string) => shell.getByTestId("map-legend-row").filter({ hasText: new RegExp(`^${name}$`) });
export const sheetPanel = (page: Page) => page.locator("#filter-sheet-panel"); // portalled — unscoped
export const filtersButton = (shell: Locator) => shell.getByTestId("map-filters-button");
export const serviceChip = (shell: Locator, key: "pickup_points" | "has_delivery") => shell.getByRole("button", { name: AXES[key].label, exact: true });
export const locationModal = (page: Page) => page.getByRole("dialog", { name: LOC.title });
export const cityPicker = (page: Page) => page.getByRole("dialog", { name: CP.heading });
export const citySearchInput = (page: Page, info: TestInfo) => page.locator(isDesktop(info) ? "#map-city-search-desktop" : "#map-city-search-mobile");
export const citySearchList = (page: Page, info: TestInfo) => page.locator(isDesktop(info) ? "#map-city-search-desktop-listbox" : "#map-city-search-mobile-listbox");
export const zoomIn = (shell: Locator) => shell.locator(".leaflet-control-zoom-in");
export const attribution = (shell: Locator) => shell.locator(".leaflet-control-attribution");
export const bottomSheet = (shell: Locator) => shell.getByTestId("map-bottom-sheet");

export type Box = { x: number; y: number; width: number; height: number };
export async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}
export const inside = (a: Box, b: Box, tol = 1) =>
  a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.width <= b.x + b.width + tol && a.y + a.height <= b.y + b.height + tol;

/** Is the point at the centre of `l` painted by `l` (or a descendant)? — a hit-test, not a z-index read. */
export function hitTestIsSelf(l: Locator): Promise<boolean> {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
}

/** Drag the map canvas so Leaflet fires `moveend` and the page enters its "map moved" state. Proves the move. */
export async function panMap(page: Page, shell: Locator): Promise<void> {
  const c = await box(mapCanvas(shell));
  const x = c.x + c.width / 2;
  const y = c.y + c.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 70, { steps: 10 });
  await page.mouse.up();
  await expect(shell.getByTestId("map-search-this-area"), "control: the drag must register as a user move").toBeVisible();
}

/**
 * MEH-3486: on a short phone the PEEK sheet covers the bottom band of the map,
 * and a marker inside that band cannot be tapped — by a person or by a test.
 * iPhone 13 (390×664) puts the southern pins of this fixture there, Pixel 5
 * (393×727) does not, so a bare `.click()` passed on Chromium and timed out on
 * WebKit every night ("map-sheet-content … intercepts pointer events"). Do what
 * a person does: drag the map up until the pin clears the sheet. Then hit-test
 * it and fail BY NAME if it is still covered, instead of a 20 s click timeout.
 */
export async function revealMarkerAboveSheet(page: Page, shell: Locator, marker: Locator): Promise<void> {
  await expect(marker, "the marker must be on the map").toHaveCount(1);
  for (let i = 0; i < 3 && !(await hitTestIsSelf(marker)); i++) {
    if (!(await bottomSheet(shell).isVisible())) break; // desktop: nothing to drag clear of
    const m = await box(marker);
    const sheetTop = (await box(bottomSheet(shell))).y;
    const c = await box(mapCanvas(shell));
    const x = c.x + c.width / 2;
    const y0 = sheetTop - 12; // on the canvas, just above the sheet's edge
    // Lift the pin's bottom 48px clear of the sheet, never past the canvas top.
    // Always upward: a pin covered by something ABOVE the sheet (a top pill) is
    // not this helper's case, and the named expect below reports it.
    const lift = m.y + m.height - sheetTop + 48;
    if (lift <= 0) break;
    const y1 = Math.max(c.y + 12, y0 - lift);
    await page.mouse.move(x, y0);
    await page.mouse.down();
    await page.mouse.move(x, y1, { steps: 10 });
    // Hold still before lifting, as a person placing the map does. Leaflet's
    // inertia (Map.Drag `_onDragEnd`) prunes drag samples older than 50 ms at
    // mouseup and glides by what is left; after a 120 ms hold only the final
    // sample remains, the computed offset is not a number, and Leaflet fires
    // `moveend` with no glide — the map stops where the drag put it. Without the hold the glide carried the pin on: into the
    // «search this area» pill on Chromium (measured), and on WebKit off the top
    // of the map for the deepest pin (Ashkelon, 20/11 run 44797982552), where
    // markercluster's `removeOutsideVisibleBounds` takes the marker out of the
    // DOM and every later read times out on a locator that no longer exists.
    await page.waitForTimeout(120);
    await page.mouse.up();
    await expect(marker, "the marker must still be on the map after the drag — it left the visible map, and markercluster removed it").toHaveCount(1);
    await expect.poll(async () => (await box(marker)).y, "control: the drag must move the map").not.toBe(m.y);
    // The «search this area» pill lands on `moveend`: hit-test only once it is
    // up and the pin is still, or the check passes on a layout that is still
    // changing. On a second pass the pill is already up, so `layoutSettled`
    // alone covers that.
    await expect(shell.getByTestId("map-search-this-area"), "control: the drag must register as a user move").toBeVisible();
    await layoutSettled(marker);
  }
  expect(await hitTestIsSelf(marker), "the marker must be tappable — it is still under the sheet or a control").toBe(true);
}

/**
 * The ONE way this spec clicks a marker (MEH-3486): hit-test it first, drag it
 * clear of the sheet if it is covered, then click. `__tests__/E2EClickPreconditionGuard.test.js`
 * fails on a bare `markerOf(…).click()` anywhere else in this file.
 */
export async function tapMarker(page: Page, shell: Locator, p: Producer): Promise<void> {
  await revealMarkerAboveSheet(page, shell, markerOf(shell, p));
  await markerOf(shell, p).click();
}

/**
 * Tap a marker on the mobile shell. MEH-3119: the sheet STAYS at PEEK and the
 * picked business shows once, as a card floating over the map. (Until then the
 * tap opened the sheet to HALF with the card pinned above a list that also
 * held the same business.)
 */
export async function tapMarkerShowsCard(page: Page, shell: Locator, p: Producer): Promise<void> {
  await tapMarker(page, shell, p);
  await expect(shell.getByTestId("map-selected-card")).toBeVisible();
  await settleSheet(shell);
  await expectAtPeek(page, shell);
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

/** Click the map canvas at its top-right corner — clear of Leaflet's zoom control (top-left), the legend (bottom-left), the GPS / layer circles (bottom-right) and the top-centre slot. */
export async function clickCanvasCorner(shell: Locator): Promise<void> {
  const c = await box(mapCanvas(shell));
  await mapCanvas(shell).click({ position: { x: c.width - 40, y: 40 } });
}

/**
 * Wait until the bottom sheet REACHES a snap fraction of the viewport — it does
 * NOT wait for the 300ms height transition to stop, and it returns nothing.
 *
 * The tolerance is `toBeCloseTo(fraction, 2)`, i.e. ±0.005 of the viewport =
 * ±3.6px at 393×727, so this resolves while the sheet is still moving. That is
 * the right instrument for "the sheet opened to HALF / PEEK" and the WRONG one
 * before any geometry is measured against the sheet: use `settleSheet` for
 * that (two consecutive equal heights), as `attributionRide` does. Reading a
 * rect after this function alone is what made the attribution row flaky on CI.
 *
 * (The name and the previous one-line docstring both implied stability, and
 * the docstring additionally claimed a return value the signature does not
 * have. Both corrected here rather than left to mislead the next reader.)
 */
export async function sheetSettledAt(page: Page, shell: Locator, fraction: number): Promise<void> {
  await expect
    .poll(async () => (await box(bottomSheet(shell))).height / (await page.evaluate(() => window.innerHeight)), { message: `sheet at ${fraction * 100}vh` })
    .toBeCloseTo(fraction, 2);
}

/**
 * MEH-2532: PEEK's height as MapBottomSheet defines it, from inputs the sheet
 * does not control: max(14vh, nav clearance + 3.5rem). The clearance is read
 * from the live `--bottom-nav-clearance` the nav publishes. A sheet stuck
 * anywhere else — 20vh, HALF, or a floor that lost its 3.5rem — misses by more
 * than 1px. (`≤ 0.2vh` passed any of those under 20vh.)
 * The formula is the MEH-2510 spec written out on purpose, an oracle
 * independent of PEEK/PEEK_FLOOR in MapBottomSheet.jsx: if the sheet's
 * constants change, this goes red and someone decides whether the spec moved.
 * Only the nav clearance is read live.
 */
export async function expectedPeekPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;height:calc(var(--bottom-nav-clearance, calc(4.5rem + env(safe-area-inset-bottom, 0px))) + 3.5rem)";
    document.body.appendChild(probe);
    const floor = probe.getBoundingClientRect().height;
    probe.remove();
    return Math.max(0.14 * window.innerHeight, floor);
  });
}

export async function expectAtPeek(page: Page, shell: Locator): Promise<void> {
  const expected = await expectedPeekPx(page);
  const height = (await box(bottomSheet(shell))).height;
  expect(Math.abs(height - expected), `the sheet must be at PEEK: ${height}px vs max(14vh, nav clearance + 3.5rem) = ${expected}px`).toBeLessThanOrEqual(1);
}

/**
 * MEH-2532: a real touch drag over CDP — the qa-meh2046 precedent. The sheet
 * binds touchstart/move/end only, and Playwright's touchscreen API exposes tap
 * alone. Moves in steps so the MEH-2148 slop and arbitration run as on a phone.
 */
export async function dragSheetUp(page: Page, from: { x: number; y: number }, distance: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x, y: from.y - (distance * step) / 10 }] });
    // One frame per move, as a finger delivers them. Back-to-back moves land
    // before React re-binds touchend with the new transient height, so the
    // lift would snap from a stale value — a harness artifact, not the sheet.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

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
export async function settleSheet(shell: Locator): Promise<void> {
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

/**
 * MEH-1365: the attribution's `bottom` is `var(--map-sheet-h) + 6px`, measured
 * from the MAP CONTAINER's bottom (globals.css, scoped < 1024px). Returns the
 * gap between the attribution's bottom edge and where the rule puts it, plus
 * the container's spill below the fold — on this project's 393×727 viewport the
 * container's `min-h-[500px]` (MapComponent.jsx) overshoots the shell by ~22px,
 * and the attribution rides the CONTAINER edge, so it sits that many px lower
 * than the sheet's real top. Reported as a finding; asserted as the mechanism.
 */
export async function attributionRide(page: Page, shell: Locator): Promise<{ ruleGap: number; spill: number; overCards: boolean }> {
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
export const seedGps = (page: Page, fix: { latitude: number; longitude: number }) =>
  seedStorage(page, "user_location", JSON.stringify({ lat: fix.latitude, lng: fix.longitude })); // lib/user-location.js STORAGE_KEY
export const seedCity = (page: Page, city: string) => seedStorage(page, "user_city", city); // lib/use-user-city.js STORAGE_KEY

export async function grantGps(context: BrowserContext, fix: { latitude: number; longitude: number }): Promise<void> {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(fix);
}

// ── MEH-2776: one control, one place, at 375 AND 1440 ────────────────────────
// /map mounts two shells (desktop `hidden lg:grid`, mobile `lg:hidden`) and
// most controls exist once in each. A fix made to one copy leaves the other as
// it was: MEH-2506 moved «מרחק מ…» into the filter tag row on the phone and
// left the desktop chip above the card list, which Sapir found on 6/11
// (MEH-2769). This test inventories every VISIBLE data-testid in each shell,
// with the nearest data-testid ancestor it sits in, and fails when
//   (a) a control is in both shells but inside a different container, or
//   (b) a control is in one shell only and not on the list below.
// Industry practice is one responsive element per control; where the repo has
// two, the inventory is what keeps them from drifting. A NEW one-shell control
// is not a failure to silence: put it in both shells, or add it here with why.
export const SHELL_ONLY: Record<string, { shell: "desktop" | "phone"; why: string }> = {
  // desktop
  "map-gps-button": { shell: "desktop", why: "desktop GPS circle; the phone uses map-near-me-pill (MEH-970)" },
  "map-key-toggle-desktop": { shell: "desktop", why: "per-shell twin of map-key-toggle-mobile (MapPane.jsx)" },
  "map-legend": { shell: "desktop", why: "desktop legend panel (MapPane.jsx hidden lg:block, MEH-979)" },
  "map-legend-toggle": { shell: "desktop", why: "lives inside map-legend" },
  "map-list-count": { shell: "desktop", why: "desktop list count; the phone shows sheet-count in the bottom sheet" },
  "map-sort-select": { shell: "desktop", why: "the phone has no sort control and never did (MEH-1864)" },
  // mobile
  "map-key-toggle-mobile": { shell: "phone", why: "per-shell twin of map-key-toggle-desktop" },
  "map-near-me-pill": { shell: "phone", why: "phone GPS control; desktop uses map-gps-button" },
  "map-mobile-bar": { shell: "phone", why: "the phone's top bar container" },
  "map-bottom-sheet": { shell: "phone", why: "the phone's card list container" },
  "map-sheet-content": { shell: "phone", why: "inside map-bottom-sheet" },
  "map-sheet-handle": { shell: "phone", why: "the bottom sheet's handle (click toggles it, MEH-3119); desktop has no sheet" },
  "sheet-count": { shell: "phone", why: "phone count; desktop shows map-list-count" },
};
// Shown by state, not by shell: «חפשו באזור זה» (MapPane.jsx, both shells)
// appears once the map has moved, and the resize below moves it.
export const TRANSIENT = new Set(["map-search-this-area"]);
// Layout wrappers that hold a whole region in one shell and have no twin: a
// control directly inside one of them counts as directly in the shell.
export const SHELL_WRAPPERS = new Set(["map-mobile-bar", "map-bottom-sheet", "map-sheet-content"]);

export async function shellInventory(page: Page, shellId: string): Promise<Map<string, string>> {
  // id → sorted, de-duplicated set of containers, so a control that sits in two
  // containers inside ONE shell is visible to the comparison too.
  const rows = await page.evaluate(
    ([id, wrappers, transient]) => {
      const root = document.querySelector(`[data-testid="${id}"]`);
      if (!root) throw new Error(`no ${id}`);
      const out: [string, string][] = [];
      for (const el of root.querySelectorAll<HTMLElement>("[data-testid]")) {
        const r = el.getBoundingClientRect();
        if (transient.includes(el.dataset.testid!)) continue;
        if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
        let p = el.parentElement;
        while (p && p !== root && (!p.dataset.testid || wrappers.includes(p.dataset.testid))) p = p.parentElement;
        out.push([el.dataset.testid!, p && p !== root ? p.dataset.testid! : "(shell)"]);
      }
      return out;
    },
    [shellId, [...SHELL_WRAPPERS], [...TRANSIENT]] as const,
  );
  const byId = new Map<string, Set<string>>();
  for (const [id, parent] of rows) byId.set(id, (byId.get(id) ?? new Set()).add(parent));
  return new Map([...byId].map(([id, parents]) => [id, [...parents].sort().join(" + ")]));
}
