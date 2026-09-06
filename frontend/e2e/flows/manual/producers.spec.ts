import type { Locator, Route } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import { detailPath } from "../_producer-fixture";
import he from "../../../messages/he.json";
import en from "../../../messages/en.json";
// The three app libs below are plain JS (the app is JS + JSDoc); tsconfig.e2e
// has no allowJs, so each import is TS7016 — the same shape as
// e2e/flows/33-admin-producers-tab.spec.ts:56. Suppressed per line, not globally.
// @ts-expect-error TS7016 — generated zod module, no .d.ts
import { ListCategoriesCategoriesGetResponse, ListProducersProducersGetResponse } from "../../../lib/generated/api.zod.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { allBadges } from "../../../lib/badges.js";
// @ts-expect-error TS7016 — JS lib, no .d.ts
import { FILTER_AXES } from "../../../lib/filter-taxonomy.js";

/**
 * Spec:     manual/producers
 * Purpose:  docs/MANUAL_TESTING.md — the `/producers` listing-page group,
 *           converted under MEH-1249 stage 2 (chunk 5 — one route per PR).
 *           Nine sections: MEH-1547 (+N disclosure) · MEH-1592 (+N panel vs
 *           neighbours) · MEH-1465 (multi-category OR) · MEH-1452 (category
 *           glyph tint) · MEH-1438 (vegetarian axis) · MEH-1186 (visual
 *           hierarchy) · MEH-51 (trust ladder — reported, nothing converted
 *           here) · MEH-1871 (overlay closes on scroll) · MEH-1880 (order-
 *           window line on the card). Rows are tagged `MT:<ticket>:<n>`.
 * Touches:  `/producers` and `/en/producers` only. No auth, no writes. Two
 *           endpoints are INTERCEPTED (see the MEH-1968 block below): the
 *           client-side `GET /api/producers` and `GET /api/categories`. The
 *           clock is FIXED per test via `page.clock.setFixedTime` — the
 *           order-window rows are time-derived (lib/orderWindow.js), and a
 *           spec that reads the wall clock is green for two reasons.
 * Data:     Phase 0 (04/09): `app/[locale]/producers/page.jsx` SSR-fetches the
 *           first page but is FAIL-OPEN — `fetchPage` catches and returns
 *           `{ items: [], total: 0 }` (page.jsx:33-48) and
 *           `fetchRatingSortEnabled` returns false (:70-76) — so the shell
 *           renders with no backend at all (the sandbox case). Every
 *           data-dependent row here deep-links a FILTER (`?category=1`…), which
 *           makes ProducersClient issue a CLIENT fetch on mount
 *           (ProducersClient.jsx:318-327) that `page.route` serves from the
 *           fixture below; `/api/categories` is client-fetched on every mount
 *           (:381-389). CI runs this same spec against a `next start` whose SSR
 *           page carries REAL catalog rows — the intercept is what keeps the
 *           filtered grid, the chip row's fixture categories, and the counter
 *           deterministic in both worlds. Nothing here asserts on the SSR
 *           grid, on categories the fixture did not declare, or on the sort
 *           control (absent below RATING_SORT_THRESHOLD, present in CI).
 *
 * ── MEH-1968 three-condition mock exception (e2e/CLAUDE.md), stated ────────
 *   1. No backend behaviour is asserted. Every row is a frontend state
 *      machine: which card row renders for a fixed `order_window`, how many
 *      pills fold into +N, where the panel is placed, what the URL carries,
 *      which chip is pressed. "Did the backend filter correctly" is
 *      tests/test_dietary_filter.py + tests/test_meh1508_dietary_scope_filter.py
 *      and is cited, not re-asserted.
 *   2. The contract is generated and pinned: the fixture is `.parse`d in
 *      `beforeAll` against `ListProducersProducersGetResponse` /
 *      `ListCategoriesCategoriesGetResponse` (lib/generated/api.zod.js), so a
 *      response-model change reds THIS spec instead of drifting silently.
 *   3. The unmocked alternative needs a shared, time-dependent catalog state
 *      no seed provides: a business whose declared window is open AT THE
 *      MINUTE the runner fires, one on vacation with an open window, one
 *      earning ≥ 5 badges. That is not a rate limiter (the condition's worked
 *      example) — it is a shared resource in the "cannot be arranged from a
 *      spec" sense. Flagged in the PR body as the one condition that is
 *      argued rather than mechanical; Sapir decides.
 *   This is a MOCK (removing it removes the subject), not a stub.
 *
 * Locators: `getByTestId` first (docs/E2E-LOCATORS.md). Existing ids used:
 *           `producer-card`, `badge-overflow`, `badge-overflow-popover` (+
 *           `-backdrop`), `badge-tooltip-<key>`, `card-order-window`,
 *           `card-rating`, `location-line`, `producers-filters-button`,
 *           `chip-<key>`, `active-search-chip`. Added under this chunk
 *           (attribute-only, ProducersClient.jsx): `producers-search-form`,
 *           `producers-category-row`, `producers-category-label`,
 *           `producers-control-line`, `producers-results-counter`,
 *           `producers-clear-all`, `producers-grid`, `producers-filter-empty`,
 *           `producers-empty-clear`, `producers-catalog-empty`. Category
 *           chips are located by role + the FIXTURE category name inside the
 *           row testid — the name is the registry key (lib/category-registry)
 *           the tint rows are about, not copy. The +N panel and the pill
 *           tooltips are PORTALLED to <body> in overlay mode (Popover.jsx
 *           MEH-1592), so those two locators are deliberately unscoped.
 * Copy:     every expected string is read from messages/he.json (en.json for
 *           `/en/producers`) or from the lib that owns it (FILTER_AXES labels,
 *           BADGE_CONFIG labels/tooltips via allBadges). The only literals are
 *           fixture data (ids, names, window times) and CSS colours that ARE
 *           the registry values under test (lib/category-registry.js
 *           `CATEGORY_STYLES`).
 * Does NOT: convert MEH-1465 rows 5-6 (sort) — the control is gated off
 *           without rating data (page.jsx:70-76 fail-closed) and the axis is
 *           COVERED at unit level, __tests__/ProducersClientSort.test.jsx
 *           :135/:147/:158; rows 7-9 are `/map` (chunk 6). MEH-1452 rows 1/3/6
 *           are COVERED by __tests__/ChipScrollRow.test.jsx:217/:252/:236 and
 *           row 5 (row height before/after) is a visual residual. MEH-1438
 *           rows 1/6 are dashboard / producer-page routes (chunks 11 / 8),
 *           rows 3-4 are backend (tests/test_dietary_filter.py:129/:143).
 *           MEH-1186 row 6 is home (chunk 7). MEH-1871 row 3 (device
 *           rotation) is DEVICE-ONLY; the resize/orientationchange listeners
 *           are pinned by __tests__/Popover.test.jsx:243. MEH-51: rows 1-3
 *           COVERED per the matrix (ProducerCard/TrustBadge/badges tests),
 *           rows 4-7 live on `/producer/[id]` (chunk 8; 5-6 destructive),
 *           8-12 STALE, 13/15 are `/admin/kashrut` (chunk 12, destructive),
 *           14/16/17 COVERED by tests/test_trust_ladder.py, 18 CONVERT-PYTEST.
 * Related:  e2e/flows/16-producers-browse.spec.ts (heading + grid-or-empty on
 *           the plain route — cited, not duplicated), e2e/flows/17-producers-
 *           search.spec.ts (the `?q=` chip — cited), __tests__/ProducersClient
 *           CategoryAxis.test.jsx:259/:274/:287/:299 (the category union at
 *           unit level — this spec asserts the same contract end-to-end with a
 *           real URL bar), __tests__/ProducerCardOrderWindow.test.jsx:99-121
 *           (the four card states this spec re-asserts in a browser with a
 *           fixed clock), __tests__/LabelScopeContract.test.js:324 (+N is a
 *           button with aria-haspopup — this spec opens it), docs/qa/
 *           conversion-page-map.md.
 * History:  MEH-1249 chunk 5 (creation, 04/09).
 */

const FIRST_PAINT = { timeout: 15_000 };

// MEH-1792 (re-measured 2026-09-04 on chunks 1 and 2): during the app's
// page-transition window a second copy of the page tree exists briefly OUTSIDE
// `#main-content`, so a page-wide `getByTestId` can resolve to TWO elements and
// fail strict mode ("resolved to 2 elements … unexpected value hidden") — seen
// on the mobile project in both a red-control run and a green run. Scoping every
// locator to the `#main-content` landmark (layout.js) names the live tree only.
// Same fix as e2e/flows/27-delivery-day-discoverability.spec.ts:73.
const scope = (page: Page) => page.locator("#main-content");

// ── clock ───────────────────────────────────────────────────────────────────
// Wednesday 2026-09-02, 03:00 Asia/Jerusalem (IDT = UTC+3, so 00:00Z). Every
// order-window fixture below is written against THIS instant — a window is
// "open now" or "closed now" by construction, never by the runner's wall clock.
const FIXED_NOW = new Date("2026-09-02T00:00:00.000Z");
const FIXED_DAY_KEY = "wednesday"; // lib/orderWindow.js ORDER_DAY_KEYS[3]

// ── copy ────────────────────────────────────────────────────────────────────
const P_HE = he.producers;
const P_EN = en.producers;
const ORDERS_OPEN_HE = he.producer.detail.header.status.orders_open;
const OVERFLOW_HE = he.producer.card.badges;
const OVERFLOW_EN = en.producer.card.badges;
const BADGE_ROW_ARIA = he.producer.badge_row.aria;
const SHEET_HE = he.filters.sheet;
const MOBILE_NAV_LABEL = he.nav.mobile_label;
const RECENT_HEADING = he.home.recent.heading;

type Axis = { key: string; label: string; group: string; surfaces: string[] };
const AXES = FILTER_AXES as Record<string, Axis>;
/** The diet axes offered on /producers, in declaration order (filter-taxonomy.js). */
const DIET_KEYS_ON_PRODUCERS = Object.keys(AXES).filter(
  (k) => AXES[k].group === "diet" && AXES[k].surfaces.includes("producers"),
);
/** The four ungated diet chips, in LISTING_CHIP_ORDER — the MEH-1438 row-2 order. */
const UNGATED_DIET_ORDER = ["vegan", "vegetarian", "gluten_free", "lactose_free"] as const;

/** Minimal ICU plural resolver for the `{count, plural, …}` strings in he.json. */
function icu(msg: string, count: number): string {
  const m = /^\{count, plural,([\s\S]*)\}$/.exec(msg);
  if (!m) return msg.replace("{count}", String(count));
  const branches: Record<string, string> = {};
  // A branch body may itself carry `{count}` — one level of nesting, nothing deeper.
  const re = /(=\d+|one|two|other)\s*\{((?:[^{}]|\{count\})*)\}/g;
  let b: RegExpExecArray | null;
  while ((b = re.exec(m[1])) !== null) branches[b[1]] = b[2];
  const key =
    branches[`=${count}`] !== undefined ? `=${count}` : count === 1 ? "one" : count === 2 ? "two" : "other";
  return (branches[key] ?? branches.other).replace("{count}", String(count));
}

// ── fixtures ────────────────────────────────────────────────────────────────
// Registry names (lib/category-registry.js): «בשר» carries CATEGORY_STYLES
// color #c04040 + a glyph; «חלב וגבינות» textColor #3b72ad; «ביצים» has a glyph
// in CATEGORY_ICONS but NO CATEGORY_STYLES row — the MEH-1452 row-3 case.
const CAT_MEAT = { id: 1, name: "בשר" };
const CAT_DAIRY = { id: 2, name: "חלב וגבינות" };
const CAT_EGGS = { id: 3, name: "ביצים" };
const CATEGORIES = [CAT_MEAT, CAT_DAIRY, CAT_EGGS];
const MEAT_TINT = "rgb(192, 64, 64)"; // #c04040
const DEFAULT_CAT_RING = "rgb(46, 104, 83)"; // #2e6853, ChipScrollRow DEFAULT_CAT_RING

type Producer = Record<string, unknown> & { id: string; name: string };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function producer(n: number, name: string, extra: Record<string, unknown> = {}): Producer {
  return {
    id: uuid(n),
    slug: `fixture-${n}`,
    name,
    city: "תל אביב",
    status: "approved",
    categories: [CAT_MEAT],
    images: [],
    ...extra,
  };
}

// P_BADGES earns FIVE badges (lib/badges.js BADGE_PRIORITY order: verified,
// recommended, grass_fed, gluten_free, vegetarian) → 2 visible + «+3». Its
// window has TWO ranges on the fixed day; at 03:00 the CURRENT range closes at
// 05:31, so the card must say 5:31 — not 13:00 (MT:MEH-1880:1 "the REAL close
// time of the current range") and not "05:31" (lib/time-format.js humanTime
// strips the leading zero; MT row 7 quotes the zero-padded form — drift noted).
const P_BADGES = producer(1, "מחלבת הגבעה", {
  verification_tier: "verified",
  verified_at: "2026-08-01",
  verification_doc_type: "license",
  is_recommended: true,
  grass_fed: true,
  has_gluten_free_products: true,
  has_vegetarian_products: true,
  trust_tier: 4,
  reviews_count: 5,
  avg_rating: 4.5,
  order_window: {
    [FIXED_DAY_KEY]: [
      { open: "00:00", close: "05:31" },
      { open: "06:00", close: "13:00" },
    ],
  },
});
// Closed at 03:00 — BETWEEN two ranges of the same day (MT:MEH-1880:5), which
// is also the plain "closed now" case (row 2).
const P_CLOSED_BETWEEN = producer(2, "לחם של אמא", {
  order_window: { [FIXED_DAY_KEY]: [{ open: "01:00", close: "02:00" }, { open: "04:00", close: "08:00" }] },
});
// No window declared at all (row 3).
const P_NO_WINDOW = producer(3, "דבש מהגליל");
// On vacation WITH a window that is open right now (row 4) — vacation wins.
// Four diet badges → «+2», so the last desktop column has a +N too (MEH-1592:3).
const P_VACATION = producer(4, "שמן זית של סבתא", {
  availability_state: "on_vacation",
  has_gluten_free_products: true,
  has_vegetarian_products: true,
  has_vegan_products: true,
  has_lactose_free_products: true,
  order_window: { [FIXED_DAY_KEY]: [{ open: "00:00", close: "23:59" }] },
});
const FILLERS = [5, 6, 7, 8].map((n) => producer(n, `עסק לדוגמה ${n}`));
/** Eight rows: two full desktop rows (xl:grid-cols-4) and four mobile rows. */
const PRODUCERS: Producer[] = [P_BADGES, P_CLOSED_BETWEEN, P_NO_WINDOW, P_VACATION, ...FILLERS];

/** Derived from the same lib the card calls (badges.js allBadges) — never typed in. */
const HIDDEN_BADGES = allBadges(P_BADGES).slice(2) as Array<{ key: string; label: string; tooltip?: string }>;
const VISIBLE_BADGE_COUNT = 2; // MEH-991 CARD-09 v4 LOCK (ProducerCard limit={2})
const EXPECTED_OPEN_LINE = ORDERS_OPEN_HE.replace("{time}", "5:31");

test.beforeAll(() => {
  // A schema change reds the spec here, loudly, instead of letting the
  // fixture drift away from what the app is actually given.
  ListProducersProducersGetResponse.parse(PRODUCERS);
  ListCategoriesCategoriesGetResponse.parse(CATEGORIES);
  // Guards on the fixture's own premises, so a later edit cannot silently
  // move the +N count or the diet order the rows below assert.
  if (HIDDEN_BADGES.length !== 3) throw new Error(`P_BADGES must fold 3 badges, got ${HIDDEN_BADGES.length}`);
  if (DIET_KEYS_ON_PRODUCERS.slice(0, 4).join() !== UNGATED_DIET_ORDER.join()) {
    throw new Error(`diet order drifted: ${DIET_KEYS_ON_PRODUCERS.join(",")}`);
  }
});

// ── helpers ─────────────────────────────────────────────────────────────────
type Catalog = { seen: URL[] };

/** Intercept the two client endpoints. `list` may be a function to vary per call. */
async function mockCatalog(page: Page, list: Producer[] | ((u: URL) => Producer[]) = PRODUCERS): Promise<Catalog> {
  const seen: URL[] = [];
  await page.route("**/api/categories**", (route: Route) => route.fulfill({ json: CATEGORIES }));
  await page.route("**/api/producers**", (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/producers/count")) {
      // Deliberately NOT tied to `list`: the app reads this endpoint only in
      // the MEH-159 `visibilitychange` refresh (ProducersClient.jsx:396), and
      // there it feeds the SITE-WIDE total, not the filtered results counter
      // — that one comes from `x-total-count` on the list response below. No
      // test here fires visibilitychange, so this value is never rendered; a
      // fixed count keeps the zero-result fixture (`() => []`) honest about
      // which header the results line actually reads.
      return route.fulfill({ json: { count: PRODUCERS.length } });
    }
    seen.push(url);
    const body = typeof list === "function" ? list(url) : list;
    return route.fulfill({ json: body, headers: { "x-total-count": String(body.length) } });
  });
  return { seen };
}

async function gotoProducers(page: Page, path: string): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(path);
  // Count gate first (retries; the strict checks below would throw instead of
  // waiting if a stray copy ever landed INSIDE the landmark).
  await expect(scope(page).getByTestId("producers-search-form")).toHaveCount(1, FIRST_PAINT);
  await expect(scope(page).getByTestId("producers-search-form")).toBeVisible(FIRST_PAINT);
}

/** Deep-link a filter so the client fetch runs, then wait for the fixture grid. */
async function gotoFiltered(page: Page, path = "/producers?category=1"): Promise<Catalog> {
  const catalog = await mockCatalog(page);
  await gotoProducers(page, path);
  await expect(scope(page).getByTestId("producers-grid")).toBeVisible(FIRST_PAINT);
  await expect(scope(page).getByTestId("producer-card")).toHaveCount(PRODUCERS.length);
  return catalog;
}

const cardOf = (page: Page, p: Producer) =>
  scope(page)
    .getByTestId("producer-card")
    .filter({ has: page.getByRole("heading", { level: 3, name: p.name, exact: true }) });
const categoryChip = (page: Page, name: string) =>
  scope(page).getByTestId("producers-category-row").getByRole("button", { name, exact: true });
const allChip = (page: Page) => categoryChip(page, P_HE.filters.category_all);
const overflowPanel = (page: Page) => page.getByTestId("badge-overflow-popover"); // portalled — unscoped
const query = (page: Page) => new URL(page.url()).searchParams;

type Box = { x: number; y: number; width: number; height: number };
async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Scroll the window and PROVE it moved — a dismiss-on-scroll assertion on a page that did not scroll is void. */
async function scrollAndProve(page: Page, dy: number): Promise<void> {
  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate((d) => window.scrollBy(0, d), dy);
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { message: "control: the page must actually scroll" })
    .not.toBe(before);
}

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /producers hierarchy (MEH-1186)", () => {
  // MT:MEH-1186:1 — micro-labels above the chip rows: «קטגוריה» above the
  //   category row; «סינון» above the filter row (en: Category / Filters).
  //   DRIFT: the «סינון» micro-label was RETIRED by MEH-1862 (ProducersClient.jsx
  //   comment "The MEH-1186 micro-label is retired here") — the attribute row
  //   moved into a FilterSheet behind a button whose label IS «סינון». Asserted
  //   as the page renders today: the category label + the filters button.
  // MT:MEH-1186:5 — the search box spans the full width of the chip rows.
  test("category micro-label + the «סינון» button (he and en), and the search box is as wide as the chip row", async ({
    page,
  }) => {
    await gotoFiltered(page);
    await expect(scope(page).getByTestId("producers-category-label")).toHaveText(P_HE.filters.category_label);
    await expect(scope(page).getByTestId("producers-filters-button")).toContainText(P_HE.filters.filter_label);
    // Width parity: the form and the category row share the container's inline
    // extent — a narrower search box is exactly what MEH-1186 row 5 forbids.
    const form = await box(scope(page).getByTestId("producers-search-form"));
    const row = await box(scope(page).getByTestId("producers-category-row"));
    expect(Math.abs(form.width - row.width), "search form width vs category row width").toBeLessThanOrEqual(2);

    await gotoProducers(page, "/en/producers?category=1");
    await expect(scope(page).getByTestId("producers-category-label")).toHaveText(P_EN.filters.category_label);
    await expect(scope(page).getByTestId("producers-filters-button")).toContainText(P_EN.filters.filter_label);
  });

  // MT:MEH-1186:2 — no «צפית לאחרונה» strip on /producers (MEH-450): the
  //   history strip stays on the home page only. The seed is what the home strip
  //   reads (lib/recently-viewed.js STORAGE_KEY, `[{id, viewedAt}]`), so the
  //   absence here is asserted against a state in which home WOULD render it.
  test("no recently-viewed strip on /producers even with a seeded history", async ({ page }) => {
    await page.addInitScript(
      ([key, id, at]) => {
        try {
          localStorage.setItem(key, JSON.stringify([{ id, viewedAt: at }]));
        } catch {
          /* private mode — the page must still render */
        }
      },
      ["recently_viewed", P_BADGES.id, FIXED_NOW.getTime()] as const,
    );
    await gotoFiltered(page);
    // CONTROL: the seed is readable by the page, or the absence below is void.
    const raw = await page.evaluate(() => localStorage.getItem("recently_viewed"));
    expect(raw, "control: the recently-viewed seed must be present").toContain(P_BADGES.id);
    await expect(scope(page).getByText(RECENT_HEADING, { exact: true })).toHaveCount(0);
  });

  // MT:MEH-1186:3 — ONE control line, no full-bleed green strip: counter +
  //   removable chips (filter ×, search ×) + «נקו הכל» in the same row.
  //   A category is NOT a removable tag (MEH-1465 rule) — asserted in the
  //   MEH-1465 block below.
  test("one control line: counter · removable filter × · search × · «נקו הכל» share a row, and «נקו הכל» resets everything", async ({
    page,
  }) => {
    const q = P_BADGES.name;
    await gotoFiltered(page, `/producers?category=1&vegetarian=1&q=${encodeURIComponent(q)}`);
    const line = scope(page).getByTestId("producers-control-line");
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId("producers-results-counter")).toHaveText(
      icu(P_HE.discovery.found_count, PRODUCERS.length),
    );
    // The removable chips are descendants of the SAME line as the counter.
    const vegChip = line.getByRole("button", { name: AXES.vegetarian.label });
    await expect(vegChip).toHaveCount(1);
    await expect(line.getByTestId("active-search-chip")).toContainText(q);
    await expect(line.getByTestId("producers-clear-all")).toHaveText(P_HE.filters.clear_all);
    // Exactly the stated controls — counter, one filter ×, one search ×, clear.
    await expect(line.getByRole("button")).toHaveCount(3);

    await line.getByTestId("producers-clear-all").click();
    await expect.poll(() => query(page).toString()).toBe("");
    // «נקו הכל» empties the CONTROLS, not necessarily the line: with a live
    // backend the unfiltered counter («כל N בתי עסק») stays on the row, and
    // with the sandbox's fail-open SSR (total 0) the whole line unmounts. The
    // first version asserted `toHaveCount(0)` on the line — green only in the
    // second world, red on CI (run 33998581419, both projects). Assert what the
    // row specifies and what discriminates a broken clear in BOTH worlds: no
    // removable chip, no search chip, no clear button survive the click.
    await expect(scope(page).getByTestId("producers-clear-all")).toHaveCount(0);
    await expect(scope(page).getByTestId("active-search-chip")).toHaveCount(0);
    await expect(scope(page).getByTestId("producers-control-line").getByRole("button")).toHaveCount(0);
    await expect(allChip(page)).toHaveAttribute("aria-pressed", "true");
  });

  // MT:MEH-1186:4 — zero results still offers a way out: the removable chips +
  //   «נקו הכל» stay, alongside the empty state's own «נקו הכל והציגו הכל».
  test("zero-result state keeps the removable chip + «נקו הכל», and the empty-state button clears the filters", async ({
    page,
  }) => {
    await mockCatalog(page, () => []);
    await gotoProducers(page, "/producers?category=1&vegetarian=1");
    const empty = scope(page).getByTestId("producers-filter-empty");
    await expect(empty).toBeVisible(FIRST_PAINT);
    await expect(empty.getByRole("heading", { level: 2 })).toHaveText(P_HE.empty.no_match_filters);
    await expect(empty).toContainText(P_HE.empty.filters_hint);
    await expect(scope(page).getByTestId("producers-grid")).toHaveCount(0);
    const line = scope(page).getByTestId("producers-control-line");
    await expect(line.getByRole("button", { name: AXES.vegetarian.label })).toHaveCount(1);
    await expect(line.getByTestId("producers-clear-all")).toHaveCount(1);

    await empty.getByTestId("producers-empty-clear").click();
    await expect.poll(() => query(page).toString()).toBe("");
    await expect(scope(page).getByTestId("producers-filter-empty")).toHaveCount(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › multi-category OR (MEH-1465)", () => {
  // MT:MEH-1465:1 — two selected categories = a union: both chips selected,
  //   `?category=<id1>&category=<id2>`, «הכל» drops to a ghost. The tap-to-add
  //   journey needs an INACTIVE second chip, which the sandbox cannot show (the
  //   row hides categories with 0 loaded producers once the catalog is fully
  //   loaded, ProducersClient.jsx `visibleCategories`) — the union STATE is
  //   asserted via the deep link and the add-tap is unit-covered
  //   (__tests__/ProducersClientCategoryAxis.test.jsx:259).
  // MT:MEH-1465:4 — a deep link hydrates the category selected and the list
  //   filtered (the mount fetch carries the id).
  test("deep link ?category=1&category=2 hydrates BOTH chips selected, fetches the union, and ghosts «הכל»", async ({
    page,
  }) => {
    const { seen } = await gotoFiltered(page, "/producers?category=1&category=2");
    await expect(categoryChip(page, CAT_MEAT.name)).toHaveAttribute("aria-pressed", "true");
    await expect(categoryChip(page, CAT_DAIRY.name)).toHaveAttribute("aria-pressed", "true");
    await expect(allChip(page)).toHaveAttribute("aria-pressed", "false");
    await expect(allChip(page)).toHaveClass(/bg-white/);
    const union = seen.filter((u) => u.searchParams.getAll("category").join() === "1,2");
    expect(union.length, "the mount fetch must carry both ids as repeated ?category=").toBeGreaterThanOrEqual(1);
    expect(query(page).getAll("category")).toEqual(["1", "2"]);
  });

  // MT:MEH-1465:2 — re-tapping a selected category removes ONLY it (the URL
  //   loses only that id); «הכל» clears the whole set.
  test("re-tapping a selected category drops only its id; «הכל» clears the set", async ({ page }) => {
    const { seen } = await gotoFiltered(page, "/producers?category=1&category=2");
    await categoryChip(page, CAT_DAIRY.name).click();
    await expect.poll(() => query(page).getAll("category")).toEqual(["1"]);
    await expect(categoryChip(page, CAT_MEAT.name)).toHaveAttribute("aria-pressed", "true");
    await expect(allChip(page)).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(() => seen.some((u) => u.searchParams.getAll("category").join() === "1"), {
        message: "a refetch with only the remaining id",
      })
      .toBe(true);

    await allChip(page).click();
    await expect.poll(() => query(page).has("category")).toBe(false);
    await expect(allChip(page)).toHaveAttribute("aria-pressed", "true");
  });

  // MT:MEH-1465:3 — a category is never a removable × tag on the control line;
  //   the exit is «הכל» or a re-tap. «נקו הכל» resets categories AND attributes.
  test("a selected category is not a × tag; «נקו הכל» resets category and attribute together", async ({ page }) => {
    await gotoFiltered(page, "/producers?category=1&vegetarian=1");
    const line = scope(page).getByTestId("producers-control-line");
    await expect(line.getByRole("button", { name: AXES.vegetarian.label })).toHaveCount(1);
    await expect(line.getByRole("button", { name: CAT_MEAT.name })).toHaveCount(0);
    await expect(line.getByRole("button")).toHaveCount(2); // the × chip + «נקו הכל»
    await line.getByTestId("producers-clear-all").click();
    await expect.poll(() => query(page).toString()).toBe("");
    // Env-neutral: once inactive, «בשר» is hidden in the sandbox (0 loaded
    // producers, catalog "fully loaded") and visible-unpressed in CI. What holds
    // in both worlds: «הכל» is the ONLY pressed chip in the row.
    const pressed = scope(page).getByTestId("producers-category-row").getByRole("button", { pressed: true });
    await expect(pressed).toHaveCount(1);
    await expect(pressed).toHaveText(P_HE.filters.category_all);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › category glyph tint (MEH-1452)", () => {
  // MT:MEH-1452:2 — DRIFT: the row says a selected chip turns green with a WHITE
  //   glyph. Since MEH-1465 / MEH-1181-A "Direction A" a SELECTED category chip
  //   carries the category colour as a ring + wash and the glyph KEEPS the tint
  //   (ChipScrollRow.jsx `isCategorySelected`; __tests__/ChipScrollRow.test.jsx
  //   :225). Asserted as the page renders today, against the registry colour.
  // MT:MEH-1452:3 — a category with no CATEGORY_STYLES row keeps currentColor
  //   (ring falls back to the default category green).
  // MT:MEH-1452:4 — «הכל» has no glyph.
  test("selected «בשר» carries #c04040 as ring + glyph; «ביצים» (no style row) stays currentColor; «הכל» has no glyph", async ({
    page,
  }) => {
    await gotoFiltered(page, "/producers?category=1&category=3");
    const meat = categoryChip(page, CAT_MEAT.name);
    await expect(meat).toHaveCSS("border-top-color", MEAT_TINT);
    const meatGlyph = meat.locator("span[aria-hidden]");
    await expect(meatGlyph).toHaveCount(1);
    await expect(meatGlyph).toHaveCSS("color", MEAT_TINT);
    // The label stays neutral — the tint is on the glyph, not the text.
    await expect(meat).not.toHaveCSS("color", MEAT_TINT);

    const eggs = categoryChip(page, CAT_EGGS.name);
    await expect(eggs).toHaveCSS("border-top-color", DEFAULT_CAT_RING);
    const eggsGlyph = eggs.locator("span[aria-hidden]");
    await expect(eggsGlyph).toHaveCount(1);
    const [glyphColor, buttonColor] = await Promise.all([
      eggsGlyph.evaluate((el) => getComputedStyle(el).color),
      eggs.evaluate((el) => getComputedStyle(el).color),
    ]);
    expect(glyphColor, "an unstyled category's glyph inherits the button colour").toBe(buttonColor);
    expect(glyphColor).not.toBe(MEAT_TINT);

    await expect(allChip(page).locator("span")).toHaveCount(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › vegetarian axis (MEH-1438)", () => {
  // MT:MEH-1438:2 — the «צמחוני» chip exists on /producers (FilterSheet, diet
  //   group) and the diet order is טבעוני · צמחוני · ללא גלוטן · ללא לקטוז. The
  //   gated fifth diet chip (no_added_sugar, MEH-1934) may or may not render —
  //   it is declared AFTER these four, so only the leading four are pinned.
  test("the filter sheet's diet group offers «צמחוני» second, in the locked order", async ({ page }) => {
    await gotoFiltered(page);
    await scope(page).getByTestId("producers-filters-button").click();
    const panel = page.locator("#filter-sheet-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 3, name: SHEET_HE.group_diet })).toHaveCount(1);
    const switches = panel.getByRole("switch");
    const ids = (await switches.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? "")))
      .map((id) => id.replace(/^chip-/, ""))
      .filter((k) => DIET_KEYS_ON_PRODUCERS.includes(k));
    expect(ids.slice(0, 4)).toEqual([...UNGATED_DIET_ORDER]);
    await expect(panel.getByTestId("chip-vegetarian")).toHaveText(AXES.vegetarian.label);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  // MT:MEH-1438:5 — toggling «צמחוני» writes `?vegetarian=1`; a reload keeps
  //   the chip active and refetches the filtered list.
  test("«צמחוני» writes ?vegetarian=1, the fetch carries vegetarian=true, and a reload keeps it active", async ({
    page,
  }) => {
    const { seen } = await gotoFiltered(page);
    await scope(page).getByTestId("producers-filters-button").click();
    const panel = page.locator("#filter-sheet-panel");
    await panel.getByTestId("chip-vegetarian").click();
    await expect(panel.getByTestId("chip-vegetarian")).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => query(page).get("vegetarian")).toBe("1");
    await expect
      .poll(() => seen.some((u) => u.searchParams.get("vegetarian") === "true"), {
        message: "the filtered fetch must carry vegetarian=true",
      })
      .toBe(true);

    seen.length = 0;
    await page.reload();
    await expect(scope(page).getByTestId("producers-grid")).toBeVisible(FIRST_PAINT);
    expect(query(page).get("vegetarian")).toBe("1");
    await expect(scope(page).getByTestId("producers-filters-button")).toContainText("1");
    await expect
      .poll(() => seen.some((u) => u.searchParams.get("vegetarian") === "true"), {
        message: "the mount fetch after reload must carry vegetarian=true",
      })
      .toBe(true);
    await scope(page).getByTestId("producers-filters-button").click();
    await expect(page.locator("#filter-sheet-panel").getByTestId("chip-vegetarian")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › +N badge disclosure (MEH-1547)", () => {
  // MT:MEH-1547:6 — the v4 LOCK: max 2 visible badges, the third and up fold
  //   into «+N».
  // MT:MEH-1547:7 — the counter is a button announced as «הצגת עוד N תגיות».
  test("max 2 visible badges; the third and up fold into a labelled «+N» button", async ({ page }) => {
    await gotoFiltered(page);
    const card = cardOf(page, P_BADGES);
    await expect(card.getByRole("list", { name: BADGE_ROW_ARIA }).getByRole("listitem")).toHaveCount(
      VISIBLE_BADGE_COUNT,
    );
    const more = card.getByTestId("badge-overflow");
    await expect(more).toHaveText(`+${HIDDEN_BADGES.length}`);
    await expect(more).toHaveAttribute(
      "aria-label",
      OVERFLOW_HE.overflow_aria.replace("{count}", String(HIDDEN_BADGES.length)),
    );
    await expect(more).toHaveAttribute("aria-haspopup", "true");
    await expect(more).toHaveAttribute("aria-expanded", "false");
  });

  // MT:MEH-1547:7 (en) — «Show N more badges».
  test("/en: the «+N» button is announced in English", async ({ page }) => {
    await gotoFiltered(page, "/en/producers?category=1");
    await expect(cardOf(page, P_BADGES).getByTestId("badge-overflow")).toHaveAttribute(
      "aria-label",
      OVERFLOW_EN.overflow_aria.replace("{count}", String(HIDDEN_BADGES.length)),
    );
  });

  // MT:MEH-1547:1 — mobile: tapping «+N» opens a BOTTOM SHEET listing only the
  //   hidden badges (count = N), above the BottomNav.
  // MT:MEH-1547:2 — no navigation on the tap (URL unchanged).
  // MT:MEH-1547:3 — tapping the backdrop closes it, same page.
  // MT:MEH-1592:6 · MT:MEH-1871:4 — mobile stays a bottom sheet (unchanged by
  //   the desktop overlay work), and it does NOT close on scroll.
  test("mobile: «+N» opens a bottom sheet with the N hidden badges above the BottomNav; no navigation; backdrop closes; scroll keeps it open", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "bottom-sheet presentation is the <lg branch");
    await gotoFiltered(page);
    const url = page.url();
    const card = cardOf(page, P_BADGES);
    await card.getByTestId("badge-overflow").click();
    const panel = overflowPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("role", "dialog");
    await expect(panel).toHaveAttribute("aria-modal", "true");
    await expect(panel).toContainText(OVERFLOW_HE.overflow_heading);
    const items = panel.getByRole("listitem");
    await expect(items).toHaveCount(HIDDEN_BADGES.length);
    for (let i = 0; i < HIDDEN_BADGES.length; i += 1) {
      await expect(items.nth(i)).toContainText(HIDDEN_BADGES[i].label);
      if (HIDDEN_BADGES[i].tooltip) await expect(items.nth(i)).toContainText(HIDDEN_BADGES[i].tooltip as string);
    }
    expect(page.url(), "the tap must not navigate").toBe(url);

    // Above the BottomNav: the sheet's own centre point must hit-test to the
    // sheet, not to the nav pill under it (z ledger: sheet 1210 > nav 1000).
    await expect(page.getByRole("navigation", { name: MOBILE_NAV_LABEL })).toHaveCount(1);
    const b = await box(panel);
    const hitsSheet = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const sheet = document.querySelector('[data-testid="badge-overflow-popover"]');
        return Boolean(sheet && el && sheet.contains(el));
      },
      [b.x + b.width / 2, b.y + b.height - 12] as const,
    );
    expect(hitsSheet, "the sheet must be the topmost surface at its own bottom edge").toBe(true);

    // MEH-1871 row 4: the sheet is NOT the overlay mode — scrolling leaves it open.
    await scrollAndProve(page, 240);
    await expect(panel).toHaveCount(1);

    // A TAP, not a mouse click: measured 04/09 under the Pixel-5 emulation a
    // `locator.click()` (mouse) on the backdrop is reported as intercepted by
    // the page container and leaves the sheet open, while `touchscreen.tap` —
    // the gesture the row describes — closes it. `document.elementFromPoint`
    // names the backdrop at the same point in both cases; the disagreement is
    // recorded in the chunk report as unexplained, not attributed.
    const backdrop = page.getByTestId("badge-overflow-popover-backdrop");
    await expect(backdrop).toHaveCount(1);
    const bd = await box(backdrop);
    await page.touchscreen.tap(bd.x + bd.width / 2, bd.y + 80); // above the sheet, on the grey
    await expect(panel).toHaveCount(0);
    expect(page.url(), "the backdrop tap must not navigate").toBe(url);
  });

  // MT:MEH-1547:4 — desktop: the panel opens ABOVE the badge strip (MEH-1592),
  //   adjacent to its counter, whole and unclipped; Esc closes.
  // MT:MEH-1592:1 — no overlap with a neighbouring badge, the name or the rating.
  // MT:MEH-1592:2 — the panel sits beside ITS OWN «+N», inside the same card.
  // MT:MEH-1592:3 — edge columns: the panel stays whole inside the viewport.
  // MT:MEH-1871:5 — Esc, outside click and a second tap on the trigger all close.
  test("desktop: the panel opens above the strip, clear of name/rating/strip, inside the viewport on both edge columns; Esc / outside / re-tap close it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "overlay presentation is the lg+ branch");
    await gotoFiltered(page);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");

    const first = cardOf(page, P_BADGES);
    const more = first.getByTestId("badge-overflow");
    await more.click();
    const panel = overflowPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("role", "tooltip");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const [p, strip, name, rating, trigger, card] = await Promise.all([
      box(panel),
      box(more.locator("xpath=ancestor::div[1]")),
      box(first.getByRole("heading", { level: 3 })),
      box(first.getByTestId("card-rating")),
      box(more),
      box(first),
    ]);
    expect(p.y + p.height, "panel bottom must sit above the strip").toBeLessThanOrEqual(strip.y + 1);
    expect(strip.y - (p.y + p.height), "panel must stay adjacent to its counter").toBeLessThanOrEqual(40);
    expect(overlaps(p, strip), "panel must not cover the badge strip").toBe(false);
    expect(overlaps(p, name), "panel must not cover the business name").toBe(false);
    expect(overlaps(p, rating), "panel must not cover the rating").toBe(false);
    expect(p.x < card.x + card.width && card.x < p.x + p.width, "panel must sit over its own card").toBe(true);
    expect(Math.abs(p.x + p.width / 2 - (trigger.x + trigger.width / 2)) < card.width, "beside its own +N").toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(viewport.width);
    expect(p.y).toBeGreaterThanOrEqual(0);

    // Esc closes and returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(more).toBeFocused();
    // Outside click closes.
    await more.click();
    await expect(panel).toBeVisible();
    await scope(page).getByRole("heading", { level: 1 }).click();
    await expect(panel).toHaveCount(0);
    // Re-tapping the trigger closes.
    await more.click();
    await expect(panel).toBeVisible();
    await more.click();
    await expect(panel).toHaveCount(0);

    // The other edge column (xl:grid-cols-4 → the 4th card sits at the far
    // inline-end): the panel must stay whole inside the viewport there too.
    const last = cardOf(page, P_VACATION);
    await last.getByTestId("badge-overflow").click();
    await expect(panel).toBeVisible();
    const q = await box(panel);
    expect(q.x).toBeGreaterThanOrEqual(0);
    expect(q.x + q.width).toBeLessThanOrEqual(viewport.width);
    const lastBox = await box(last);
    expect(q.x < lastBox.x + lastBox.width && lastBox.x < q.x + q.width, "panel over the edge card").toBe(true);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  // MT:MEH-1547:5 — the card itself still navigates: the name link leads to
  //   the business page (the detail route is chunk 8's; only the URL is asserted).
  test("the card's name link still navigates to the business page", async ({ page }) => {
    await gotoFiltered(page);
    const target = detailPath({ id: P_BADGES.id, slug: P_BADGES.slug as string });
    await cardOf(page, P_BADGES).getByRole("heading", { level: 3 }).click();
    await page.waitForURL((u) => new URL(u).pathname === target, FIRST_PAINT);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › +N panel vs neighbours (MEH-1592)", () => {
  // MT:MEH-1592:4 — only one panel at a time: a regular badge bubble open, then
  //   «+N» → the first closes; and the other way round.
  test("desktop: opening «+N» closes an open badge bubble, and vice versa", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the reverse direction needs the anchored (non-sheet) +N");
    await gotoFiltered(page);
    const card = cardOf(page, P_BADGES);
    const pill = card.locator('[data-badge="recommended"]');
    const bubble = page.getByTestId("badge-tooltip-recommended"); // portalled — unscoped
    await pill.click();
    await expect(bubble).toBeVisible();
    await card.getByTestId("badge-overflow").click();
    await expect(bubble).toHaveCount(0);
    await expect(overflowPanel(page)).toBeVisible();
    await pill.click();
    await expect(overflowPanel(page)).toHaveCount(0);
    await expect(bubble).toBeVisible();
    await expect(page.locator('[role="tooltip"]')).toHaveCount(1);
  });
  // MT:MEH-1592:5 — «the panel stays attached while scrolling»: SUPERSEDED by
  //   MEH-1871 (the panel now CLOSES on scroll) — see the MEH-1871 block.
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › overlay closes on scroll (MEH-1871)", () => {
  // MT:MEH-1871:1 — a badge bubble on a card closes the moment the page scrolls.
  // MT:MEH-1871:2 — desktop: the «+N» panel closes on scroll.
  test("desktop: a badge bubble and the «+N» panel both close when the page scrolls", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "overlay presentation is the lg+ branch");
    await gotoFiltered(page);
    const card = cardOf(page, P_BADGES);
    await card.locator('[data-badge="recommended"]').click();
    const bubble = page.getByTestId("badge-tooltip-recommended");
    await expect(bubble).toBeVisible();
    await scrollAndProve(page, 120);
    await expect(bubble).toHaveCount(0);

    await card.getByTestId("badge-overflow").click();
    await expect(overflowPanel(page)).toBeVisible();
    await scrollAndProve(page, 120);
    await expect(overflowPanel(page)).toHaveCount(0);
  });
  // MT:MEH-1871:3 — device rotation: DEVICE-ONLY (the orientationchange listener
  //   is pinned by __tests__/Popover.test.jsx:243).
  // MT:MEH-1871:4 — mobile sheet unaffected by scroll: in the MEH-1547 mobile test.
  // MT:MEH-1871:5 — Esc / outside / re-tap still close: in the MEH-1547 desktop test.
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › «פתוח להזמנות» card line (MEH-1880)", () => {
  // MT:MEH-1880:1 — open now → «פתוח להזמנות · עד HH:MM» with the CURRENT
  //   range's real close time (5:31, not the day's last 13:00).
  // MT:MEH-1880:2 — closed now → no line, no reserved space, no «סגור».
  // MT:MEH-1880:3 — no window → no line.
  // MT:MEH-1880:4 — vacation with an open window → no line (vacation wins).
  // MT:MEH-1880:5 — between two ranges of the same day → no line.
  // MT:MEH-1880:7 — the time is HH:MM, not reversed. DRIFT: the row quotes
  //   «05:31»; lib/time-format.js humanTime strips the leading zero → «5:31».
  test("fixed clock 03:00 IL: the open card says «עד 5:31»; closed / windowless / vacation / between-ranges cards say nothing", async ({
    page,
  }) => {
    await gotoFiltered(page);
    const line = cardOf(page, P_BADGES).getByTestId("card-order-window");
    await expect(line).toHaveCount(1);
    await expect(line).toHaveText(EXPECTED_OPEN_LINE);
    expect(EXPECTED_OPEN_LINE).toMatch(/\d{1,2}:\d{2}/);
    for (const p of [P_CLOSED_BETWEEN, P_NO_WINDOW, P_VACATION]) {
      const card = cardOf(page, p);
      await expect(card.getByTestId("card-order-window"), `${p.name} must render no line`).toHaveCount(0);
      // The rest of the card is intact — the location line still renders.
      await expect(card.getByTestId("location-line")).toHaveCount(1);
    }
  });

  // MT:MEH-1880:6 — mobile: the line may wrap, but the time stays fully
  //   visible — never truncated to «עד …».
  test("mobile: the open line wraps rather than truncating, and the time is fully inside the card", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the 375px wrap case");
    await gotoFiltered(page);
    const card = cardOf(page, P_BADGES);
    const line = card.getByTestId("card-order-window");
    await expect(line).toHaveText(EXPECTED_OPEN_LINE);
    await expect(line).not.toHaveCSS("white-space", "nowrap");
    await expect(line).not.toHaveCSS("text-overflow", "ellipsis");
    const [l, c] = await Promise.all([box(line), box(card)]);
    expect(l.x).toBeGreaterThanOrEqual(c.x - 1);
    expect(l.x + l.width).toBeLessThanOrEqual(c.x + c.width + 1);
    const clipped = await line.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, "the line must not overflow its box").toBe(false);
  });
});

// MT:MEH-1465:5 / :6 — sort by rating + sort deep-link: NOT converted. The select is gated OFF
//   until the catalog crosses RATING_SORT_THRESHOLD (page.jsx:70-76, fail-closed with no backend);
//   COVERED at unit level by __tests__/ProducersClientSort.test.jsx:135 / :147 / :158.
// MT:MEH-1465:7-9 — /map rows: chunk 6's route.
// MT:MEH-1452:1 — inactive chip tint: COVERED __tests__/ChipScrollRow.test.jsx:217 (an inactive
//   category is only visible with SSR data, which the sandbox cannot supply deterministically).
// MT:MEH-1452:5 — row height unchanged before/after: visual residual (no before-state to compare).
// MT:MEH-1452:6 — toggle chips untinted: COVERED __tests__/ChipScrollRow.test.jsx:236 + the
//   FilterSheet pills carry no iconColor (FilterSheet.jsx chipIcon).
// MT:MEH-1438:1 — dashboard product chip: chunk 11's route. MT:MEH-1438:3 / :4 — backend filter
//   semantics: COVERED tests/test_dietary_filter.py:129 (vegetarian product) and :143 (vegan implies
//   vegetarian at PRODUCT level; the business-level asymmetry is pinned as a decision at
//   tests/test_meh1508_dietary_scope_filter.py:142). MT:MEH-1438:6 — /producer/[id]: chunk 8.
// MT:MEH-1186:6 — home strip unchanged: chunk 7's route.
// MT:MEH-51:1-18 — nothing on this route is CONVERT-PW + non-destructive: rows 1-3 COVERED
//   (matrix rows 582-584), 4-7 → /producer/[id] (chunk 8), 8-12 STALE, 13/15 → /admin/kashrut
//   (chunk 12), 14/16/17 COVERED tests/test_trust_ladder.py, 18 CONVERT-PYTEST.
