import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// MEH-1497: fixed producer-detail payload for the network-mocked shot (below).
// Read from disk (not `import ... json`) so it works regardless of the spec
// tsconfig's resolveJsonModule setting.
const PRODUCER_FIXTURE = fs.readFileSync(
  path.join(__dirname, "fixtures", "producer-detail.json"),
  "utf-8"
);
// MEH-1552: the "minimal producer" edge-state fixture — phone the only channel,
// no images, no reviews. Freezes the degenerate ContactCard states MEH-1551
// fixed (single labeled row; desktop reveal-in-place) so a regression there is
// caught in pixels, not only in unit tests. Same UUID scheme as above so
// PRODUCER_DETAIL_RE matches.
const MINIMAL_FIXTURE = fs.readFileSync(
  path.join(__dirname, "fixtures", "producer-detail-minimal.json"),
  "utf-8"
);
// Matches ONLY the detail call GET /api/producers/{uuid} — not the collection
// (`/api/producers?…`, no id segment), the `…/reviews` sub-resource, or the
// non-UUID siblings (`/count`, `/cities`, `/random`, `/by-slug/*`). Producer
// ids are UUIDs (schemas.py ProducerListOut.id: UUID); the `(?:\?|$)` tail
// stops it swallowing `/api/producers/{uuid}/reviews`.
const PRODUCER_DETAIL_RE = /\/api\/producers\/[0-9a-f-]{36}(?:\?|$)/;

// MEH-1591: fixed /map payloads. The map's results rail and category chip row
// are UNMASKED live chrome (only `.leaflet-container` is masked), so the
// baseline moved whenever a business was approved/deactivated — the 26/07 regen
// proved it: a pure 124px vertical shift of the rail, count row 13 → 12, map
// canvas byte-identical. Same fs.readFileSync loading as the MEH-1497 pair above.
const MAP_PRODUCERS_FIXTURE = fs.readFileSync(
  path.join(__dirname, "fixtures", "map-producers.json"),
  "utf-8"
);
// Sapir's call (MEH-1591 §2): mock /categories too, not just /producers. The chip
// row is filtered by what the API returns (`resolveCategoryId`,
// useMapFilters.js:346 — a chip whose category is absent is HIDDEN), it has
// already churned this baseline once (MEH-1440), and the category table is in
// active motion (MEH-1530 seed rekey merged, MEH-1456 chunk 3 pending). Partial
// mocking would reopen this ticket within a week.
const MAP_CATEGORIES_FIXTURE = fs.readFileSync(
  path.join(__dirname, "fixtures", "map-categories.json"),
  "utf-8"
);
// COLLECTION only — deliberately disjoint from PRODUCER_DETAIL_RE above. The
// `(?:\?[^#]*)?$` tail anchors the end, so this matches `/api/producers` and
// `/api/producers?limit=1` but NOT `/api/producers/{uuid}` (detail — owned by
// the regex above), nor the non-UUID siblings `/count`, `/cities`, `/random`,
// `/by-slug/*`, which all carry a further `/segment`.
const PRODUCERS_COLLECTION_RE = /\/api\/producers(?:\?[^#]*)?$/;
const CATEGORIES_RE = /\/api\/categories(?:\?[^#]*)?$/;

/**
 * MEH-991 Chunk 3 — visual parity baselines (VRT).
 * Baselines refreshed 2026-07-12 after MEH-1128 Wave D2 — the consumer
 * /register name + email fields adopted ui/Input (label slot + success
 * state), so register-*.png shifts; this touch retriggers the vrt-update
 * bot to regenerate the baseline on the runner (sandbox fonts differ).
 * Baselines refreshed 2026-07-11 after MEH-1103 (#1592/#1595 header/footer
 * accessibility sizing) landed — the footer grew 20px on every fullPage route.
 * MEH-1135 (2026-07-12): chat FAB migrated to logical `insetInlineEnd`, moving
 * it from bottom-right to bottom-left in RTL — an approved visual change. This
 * touch re-triggers the vrt-update bot to regenerate the affected baselines
 * (map + producer-detail chrome capture the FAB corner). Not a regression.
 *
 * Locks the design-parity sweep (Groups 1-5, gold #896714, header pill,
 * hero CTA, footer, static pages) against silent drift. One screenshot per
 * route per project (desktop 1440x900 + mobile Pixel 5), compared with
 * maxDiffPixelRatio 0.02 (playwright.config.ts expect.toHaveScreenshot).
 *
 * Determinism strategy — three tools, in preference order:
 * - NETWORK MOCK (page.route + a fixed JSON fixture) where the DATA moves but
 *   the layout is the subject: producer detail (MEH-1497) and /map (MEH-1591).
 *   This is a deliberate, NARROW carve-out from the MEH-417 no-mocks rule,
 *   scoped to e2e/visual/** and recorded in frontend/e2e/CLAUDE.md ("No mocks").
 *   Functional specs under e2e/flows/ stay unmocked — that is what MEH-417
 *   actually protects. Prefer this over masking when the region is real chrome
 *   we want under test: a mask hides regressions, a fixture only freezes data.
 *   (The header previously read "no mocks — MEH-417" outright; that has been
 *   stale since MEH-1497 landed on 2026-07-23.)
 * - MASK for regions that are irreducibly non-deterministic and NOT the subject
 *   (Leaflet tiles/markers, the home producers grid, events preview, mini-map).
 * - FROZEN CLOCK (page.clock.setFixedTime, MEH-1531) for wall-clock-dependent
 *   copy — see VRT_FIXED_TIME below.
 * - Calendar-dependent banners (holiday / friday-delivery) are HIDDEN via
 *   parity.css — their *presence* varies, and a mask can't absorb the layout
 *   shift of a section that appears and disappears with the date.
 * - Data-dependent routes shoot the viewport only (below-the-fold sections
 *   self-hide on empty data → fullPage height is unstable). The static trio
 *   (/about /login /register) shoots fullPage.
 *
 * Baseline maintenance: baselines are generated ON THE CI RUNNER via the
 * vrt-update.yml workflow_dispatch (never from a dev machine — font stacks
 * differ). MEH-1103: header sizing recalibration (nav text-base, pill
 * py-1.5/px-6, logo 111×42) intentionally invalidated every header-bearing
 * baseline — this edit rides the vrt-update push trigger to refresh them.
 * MEH-1103 PR-5: refreshed again from post-sweep staging — PR #1595's footer
 * recalibration (utility links 13px + 44px targets) merged without a baseline
 * refresh, so the fullPage trio (/about /login /register) was stale.
 * After an intentional visual change: run vrt-update on the branch,
 * review the committed baseline diff, merge. Staging-data drift that alters
 * a masked region's size (e.g. producer count changes the grid height) is
 * refreshed the same way.
 * MEH-991 (2026-07-13): refresh the fullPage trio (/about /login /register)
 * after MEH-1160 (#1689) added the "ספרו עלינו" → /share footer link — the
 * 8th footer nav entry grows every fullPage route; /login + /register also
 * carry the MEH-1145/MEH-1128 ui/Input adoption (resting-state invisible).
 * Classified intended drift, no regression. This touch re-triggers the
 * vrt-update bot to regenerate the baselines on the runner.
 * MEH-1295 (2026-07-17): the MEH-1177/1278/1281 footer cluster (nav audience
 * split, mobile 2-col grid, 13px semibold group headings) shifted every
 * fullPage route's height (mobile −61px, desktop +82px) since the last regen,
 * red-lining the /about /login /register trio. Verified footer-only (A/B render
 * of 25b990e8 vs staging HEAD — first diff row 62–92% down each page, no shift
 * above). This touch re-fires vrt-update to regenerate the trio on the runner
 * (the earlier delete-trigger run regenerated them but its commit step was
 * skipped when the unrelated /producer/[id] nav flake failed the suite).
 */

const STYLE_PATH = path.join(__dirname, "parity.css");

/** Screenshot options shared by every route. */
const SHOT = { stylePath: STYLE_PATH } as const;

/**
 * MEH-1531: the page's wall clock, frozen. The home hero subtitle switches on
 * real time — `HomeHero.jsx:115` renders `home.hero.friday_subtitle` instead of
 * `home.hero.subtitle` while `isFridayMode()` (`lib/friday-mode.js:4`) is true,
 * i.e. Thu 18:00 → Fri 14:00 Asia/Jerusalem. `parity.css` already hides the
 * friday-delivery-strip (presence varies) but nothing froze the SUBTITLE, so
 * the shot differed by day-of-week: any run whose friday state differed from
 * the baseline's red-lined, and a regen inside the window guaranteed failures
 * outside it (and vice versa).
 *
 * WHY page.clock and not a parity.css mask: hiding the subtitle would collapse
 * its box and shift the whole hero, and it would delete the very region hero
 * copy changes land in (MEH-1308/MEH-1328 both moved it). Freezing the clock
 * keeps the subtitle visible AND deterministic. It is also strictly
 * test-harness-side — zero production files touched, so real users' Friday
 * behaviour (MEH-50) is untouched.
 *
 * WHY this instant: Wednesday, comfortably outside the friday window, so the
 * frozen variant is the non-friday subtitle the current baselines already
 * carry. Any fixed non-window instant would do; this one is arbitrary but
 * pinned, which is the whole point.
 */
const VRT_FIXED_TIME = new Date("2026-07-15T09:00:00Z"); // Wed 12:00 IDT

/**
 * Neutralize pre-page state that changes rendering: cookie-consent banner
 * (localStorage) and the verify-email banner's per-session dismiss flag is
 * left unset — logged-out pages never render it. MEH-1531 adds the frozen
 * clock (above) so wall-clock-dependent copy can't drift between runs.
 */
async function preparePage(page: Page): Promise<void> {
  // setFixedTime (not clock.install): Date.now()/new Date() return the pinned
  // instant while timers keep running normally, so the app's own polling —
  // e.g. use-home-page.js:131's 60s isFridayMode() re-check — still ticks and
  // simply keeps re-deriving the same frozen answer. install() would freeze
  // timers too and risk hanging networkidle/font settle.
  await page.clock.setFixedTime(VRT_FIXED_TIME);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cookieConsent", "essential");
    } catch {
      /* storage unavailable — banner hidden by parity.css anyway */
    }
  });
}

/** Wait for fonts + a settle beat so text renders identically run-to-run. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle").catch(() => {
    /* long-polling/streaming must not fail the shot — fonts are the gate */
  });
  await page.waitForTimeout(500);
}

test.describe("Visual parity — MEH-991", () => {
  // MEH-1328 (2026-07-18): the home hero/trust copy changed in MEH-1308 (#1904,
  // "עסקים" → "בתי עסק" across home.hero.subtitle / cta_primary / home.trust.lead),
  // red-lining the viewport-only home baseline against the now-stale copy. This
  // touch re-triggers vrt-update.yml so home-{mobile,desktop}-linux.png are
  // regenerated on-runner. Delta is confined to the hero region — the home shot
  // is viewport-only (no fullPage), so the footer/BackToTop/chip changes that
  // also merged 2026-07-18 sit below the fold and out of frame.
  // MEH-999 (2026-07-26): home-mobile red-lines at 17,589 px (ratio 0.07) and
  // the cause is UNIDENTIFIED. Do NOT regenerate this baseline until it is —
  // a regen would silently bless whatever changed. What was ruled out:
  //   1. Copy. A key-by-key diff of he.json between the baseline commit
  //      (1eb89491) and the failing base (397f4466) gives 44 changed keys and
  //      ZERO under home.hero / home.trust / home.stats / nav.*. The only
  //      home.* change is home.producers.filter_prefix, which renders on
  //      /producers, not here.
  //   2. Above-the-fold components. Nothing in Header / HeroSearch / BottomNav /
  //      page.js changed in that range.
  //   3. The live /stats strip (page.js:112-140) — the leading hypothesis, and
  //      WRONG. Measured on a real 375x812 render: the strip's bounding box is
  //      y=1061, h=58, i.e. ~250px BELOW the 812px fold. This shot is
  //      viewport-only (no fullPage), so the strip is out of frame and cannot
  //      contribute a single pixel. (With live producers the grid above is
  //      taller, pushing it further down still.) Masking it was implemented,
  //      measured, and reverted.
  // Next step is the diff image, not another guess: open home-diff.png in the
  // playwright-report artifact of a failing run (run 30199607886 has one). The
  // CC sandbox cannot download Actions artifacts — proxy-blocked, same limit
  // recorded in the MEH-1440 note below.
  test("home", async ({ page }) => {
    await preparePage(page);
    await page.goto("/");
    // Scoped to the hero's role="search" card — the header mounts a second
    // (hidden) HeroSearch instance, so the bare testid is ambiguous under
    // strict mode.
    await expect(
      page.getByRole("search").locator('[data-testid="hero-search"]')
    ).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await expect(page).toHaveScreenshot("home.png", {
      ...SHOT,
      // Live data: featured grid + events preview + homepage mini-map.
      mask: [
        page.locator("#producers-grid"),
        page.locator(".leaflet-container"),
        page.locator('[data-testid="producer-card"]'),
      ],
    });
  });

  // MEH-1440 (2026-07-22): the /map chrome changed when the toggle-chip
  // Phosphor icons + "רישוי מאומת" label (MEH-1418, #2021) merged with the
  // baseline regen deliberately deferred ("Baseline regen for / + /map is a
  // follow-up if the parity suite is run" — its HANDOFF note). The desktop
  // map shot red-lines at ratio 0.03 — the chip row sits in the unmasked
  // chrome above the masked .leaflet-container; mobile is unaffected (the
  // chips live in the FilterSheet there). The MEH-1432 line regenerated no
  // VRT baseline (its PRs #2030/#2033 touched only the 24-producer-locations
  // spec), so the deferred regen lands here. This touch re-fires
  // vrt-update.yml to regenerate map-desktop-linux.png on-runner.
  // MEH-1440 second touch: the delta is DETERMINISTIC in full-suite e2e runs
  // (byte-identical 33,522 px on runs 29897314926 + 29899891331) yet the
  // vrt-update run 29898987845 rendered within the 0.02 threshold and did not
  // rewrite the baseline (it only rewrites failing shots). The two workflows
  // differ only in suite composition (visual-only vs full parallel suite) —
  // if this second bot pass also declines to rewrite while e2e keeps failing
  // at the same pixel count, the divergence needs eyes on the runner's
  // map-diff.png artifact (CC sandbox cannot download Actions artifacts —
  // proxy-blocked); follow-up-ticket material, not silently absorbable here.
  // MEH-1440 third touch: PR #2046 (category chips gain a 16px CATEGORY_ICONS
  // leading glyph) merged into staging mid-PR, changing the /map chip-row
  // chrome AGAIN and staling the baseline the second bot pass (bf8516b3) had
  // just regenerated. This touch re-fires vrt-update from the post-#2046
  // build. (Root cause of the churn: the desktop rail + chip row are unmasked
  // live chrome — see the follow-up flag in PR #2041.)
  // MEH-999 (2026-07-26): map-desktop red-lines again, and this one IS a real
  // (expected) UI change — no mask needed. Diff→cause: fd20ed41 (MEH-1507,
  // Label Scope Contract) is the ONLY commit between the baseline (1eb89491)
  // and the failing base (397f4466) touching the map's unmasked chrome —
  // lib/map-chips.js, lib/attribute-labels.js, lib/producer-filters.js and
  // components/FilterSheet.jsx. Its FilterSheet change reverted the MEH-1478
  // diet pill grid to full-width role="switch" rows so every diet row carries a
  // scope subtext — and on desktop the FilterSheet IS the unmasked left rail.
  // That also explains the asymmetry this comment block has recorded twice
  // before: desktop fails, mobile passes, because on mobile the FilterSheet is
  // a closed bottom sheet. Correct action is a scoped regen, route = "map";
  // there is nothing to fix in the product.
  test("map", async ({ page }) => {
    test.setTimeout(90_000);
    await preparePage(page);

    // ── MEH-1591: data mock (MEH-417 no-mocks EXCEPTION, e2e/visual/** only) ──
    // Same carve-out the producer-detail shot uses (frontend/e2e/CLAUDE.md
    // "No mocks" → MEH-1497 §2.4): the subject here is layout/pixels, the
    // producer + category data is noise. DO NOT copy into e2e/flows/.
    // Registered BEFORE goto so the mount fetches are intercepted:
    // useProducersFeed.js:65 fires loadProducers() (no params → bare
    // /api/producers) and :64 fires /api/categories.
    // NOTE: the rail and chip row stay UNMASKED on purpose — masking them would
    // hide real layout regressions, which is exactly what this baseline is for.
    // Mocking the data keeps the pixels stable without blinding the shot.
    await page.route(PRODUCERS_COLLECTION_RE, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: MAP_PRODUCERS_FIXTURE,
      });
    });
    await page.route(CATEGORIES_RE, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: MAP_CATEGORIES_FIXTURE,
      });
    });

    await page.goto("/map");
    // MEH-549 pattern (flow 05): __MAP_CENTER__ is race-free across the two
    // MapPane instances; .leaflet-container:visible is not.
    await page.waitForFunction(
      () =>
        (window as unknown as { __MAP_CENTER__?: [number, number] })
          .__MAP_CENTER__ !== undefined,
      { timeout: 45_000 }
    );
    await settle(page);

    // MEH-1591 guard — the fixture must actually REACH the rail. The feed parses
    // the response through ProducersResponseSchema (lib/schemas.js:104) and a
    // malformed payload degrades to an empty list + toast (useProducersFeed.js:36-40)
    // rather than throwing. That failure mode is invisible to VRT: an empty rail
    // is perfectly *stable*, so the baseline would lock in a blank column and the
    // suite would stay green while testing nothing.
    //
    // Two assertions, because count alone is not enough:
    //   1. at least one card per fixture row — kills the empty/short-rail case;
    //   2. a fixture-specific NAME is rendered — proves the pixels came from the
    //      fixture and not from a live backend response that happened to be
    //      non-empty (a count-only check would pass on live data too).
    // NOT an exact-equality count: `cardList` is ONE element rendered in BOTH
    // shells — the desktop grid (MapClient.jsx:457 `hidden lg:grid`) and the
    // mobile sheet (:534 `lg:hidden`) — so every producer yields 2 DOM nodes on
    // both projects, with CSS (not the DOM) hiding the irrelevant shell. Asserting
    // `=== fixture.length` fails with "Received: 12" for 6 rows; asserting `>=`
    // keeps the empty-rail guarantee without hard-coding that ×2 detail.
    const fixtureRows = JSON.parse(MAP_PRODUCERS_FIXTURE) as { name: string }[];
    const cardCount = await page.getByTestId("map-card").count();
    expect(cardCount).toBeGreaterThanOrEqual(fixtureRows.length);
    await expect(page.getByText(fixtureRows[0].name).first()).toHaveCount(1);

    await expect(page).toHaveScreenshot("map.png", {
      ...SHOT,
      // Tiles + markers are live; chrome (header, filters, controls) is not.
      // MEH-1591: the rail + chip row are no longer live — they render from the
      // fixtures mocked above — so they stay unmasked and under test.
      mask: [page.locator(".leaflet-container")],
    });
  });

  // MEH-1146: the producer detail page IA was rebuilt across PRs #1670/#1673/#1676
  // (editorial contact card, two-tier header, section reorder, discovery loop).
  // This touch re-triggers vrt-update.yml so the producer-detail-*-linux.png
  // baselines are regenerated on-runner against the final design.
  // MEH-1197 follow-up (2026-07-13): the /producers visual language changed again
  // after the 13:37 baseline — MEH-1186 (#1732, one visual language per behavior)
  // and MEH-1173 (#1727) — red-lining producer-detail-mobile against a now-stale
  // snapshot. This touch re-triggers vrt-update.yml to refresh the baselines.
  // MEH-991 regen (2026-07-20): Quiet Direction v3 (MEH-1334, #1936) redesigned
  // the page — both producer-detail baselines are stale by design. Re-trigger.
  // MEH-1336 follow-up (2026-07-20, same day): SHOW_VERIFICATION flipped on in
  // #1982 and exposed the new /about verification section — about-{desktop,mobile}
  // baselines stale (rule 2b miss: should have shipped in #1982). Re-trigger.
  // MEH-1369 (2026-07-21): the producer-detail regen kept red-lining on the nav
  // step, not on a stale pixel diff. Root cause is a stale TEST, not a product
  // regression — #1936 (Quiet Direction v3) redesigned /producer/[id] but left
  // ProducerCard.jsx / ProducersClient.jsx / the /producers route untouched, and
  // the card still exposes real <a href> image + name links. The step clicked the
  // <article> WRAPPER, whose navigation routes through a React onClick
  // (handleRootClick → router.push) that needs hydration; `h-full` grid stretch
  // can also place the wrapper's geometric center in non-anchor padding — the
  // "/producer nav flake" noted above (MEH-1295). Fixed by clicking the inner
  // anchor. This touch also re-fires vrt-update to refresh the stale baselines.
  // MEH-1411 (2026-07-21): producer-detail header polish — the orphan "שמירה"
  // actions row lost its full-width hairline and tightened its top margin
  // (ProducerHeader.jsx), the "חדש" fallback became a small neutral pill, and the
  // mobile StickyContactBar CTA gained the WhatsApp icon. The producer-detail
  // (mobile especially) baseline shifts by design; this touch re-fires
  // vrt-update.yml so producer-detail-{desktop,mobile}-linux regenerate on-runner.
  // Review follow-up: the pill was recolored green→neutral (one-green-per-page);
  // it only renders for reviews_count=0 so it does not change this baseline (the
  // baseline producer has reviews), but this re-touch re-fires vrt-update on the
  // neutral-pill commit so the fresh baseline comes from the final code.
  // MEH-1440 (2026-07-22): both producer-detail baselines red-line on clean
  // staging (desktop ratio 0.21, mobile 0.17, run 29897314926). Desktop was
  // last regenerated by the MEH-1369 flow (#2000) — the MEH-1411 (#2015)
  // header polish committed only the fresh MOBILE png; and the 2026-07-21
  // staging producer_locations re-seed changed which producer the shot lands
  // on (the spec clicks the first /producers card), shifting the unmasked
  // live regions (description, trust strip, products) on BOTH viewports.
  // Classified deferred-regen + staging-data drift per the header note
  // ("staging-data drift ... is refreshed the same way"), pending the
  // old-vs-new baseline diff review on the bot commit. This touch re-fires
  // vrt-update.yml to regenerate producer-detail-{desktop,mobile}-linux.
  // MEH-1497 (2026-07-23): APPROACH CHANGE — the shot no longer renders from
  // whichever business was approved most recently on live staging (the
  // /producers sort is created_at DESC, so the first card, and thus this
  // baseline, drifted on every new approval — ticket §2.1). The producer-detail
  // API call is intercepted with page.route() and fulfilled from a fixed
  // fixture, so a newly approved business can no longer move this baseline.
  // PIN-to-seed and masking were both investigated and rejected (§2.2/§2.3).
  // Mechanism note (resolved from the app, see the in-test file:line trail):
  // the shot must land on the /producer/[id] route (client-fetches → mockable),
  // reached with a REAL borrowed id because middleware.js existence-checks the
  // id against the backend; the /[slug] route SSR-seeds the producer and can't
  // be mocked. The borrowed id only unlocks the page — the pixels are the
  // fixture's.
  test("producer detail", async ({ page }) => {
    await preparePage(page);

    // ── MEH-417 no-mocks EXCEPTION — scoped to VRT specs only (ticket §2.4) ──
    // frontend/e2e/CLAUDE.md:25 forbids mocks ("mocks hid real backend bugs for
    // 8 CI cycles"). This spec is a DELIBERATE, NARROW exception: the subject
    // under test here is layout/pixels, and the producer data is noise. The
    // exception is bounded to e2e/visual/** — the functional specs under
    // e2e/flows/ stay unmocked and keep catching real backend contract breaks.
    // DO NOT copy this pattern into e2e/flows/ — that reintroduces MEH-417.
    // If e2e/CLAUDE.md's no-mocks policy is ever updated, record this exception
    // there too (ticket §2.4).
    //
    // Fulfil the producer-detail API call from the fixed fixture so the shot no
    // longer renders whichever business was approved most recently on live
    // staging (ticket §2.1). Registered BEFORE any navigation so the first
    // request is intercepted (acceptance criterion).
    await page.route(PRODUCER_DETAIL_RE, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: PRODUCER_FIXTURE,
      });
    });

    // Borrow ANY real producer id from the live listing. This is NOT a demo /
    // seed dependency (ticket §2.3): any producer works, and the id is used
    // ONLY to satisfy two backend gates on the way to the page — the rendered
    // content is always the fixture, so a newly approved business can't move
    // this baseline. `page.request` bypasses page.route (separate context), so
    // this call hits live staging, not the mock. Same graceful skip-on-empty as
    // the pre-1497 spec (an empty staging DB is a data problem, not a
    // regression).
    const listRes = await page.request.get("/api/producers", {
      params: { limit: 1 },
    });
    const list = listRes.ok() ? await listRes.json().catch(() => []) : [];
    const borrowedId = Array.isArray(list) && list[0]?.id;
    if (!borrowedId) {
      test.skip(true, "No producer on staging to borrow an id from");
      return;
    }

    // Navigate to the /producer/[id] route with the borrowed real id — NOT via
    // a /producers card and NOT to /[slug]. Two reasons this exact path is
    // required (both resolved from the app, not guessed):
    //   1. middleware.js:67-71 rewrites /producer/{id} to a real 404 unless the
    //      backend confirms the id exists (fails OPEN only on a thrown error,
    //      not on a 404 response) — so a synthetic id can't reach the page.
    //      The borrowed real id passes this edge check.
    //   2. The /[slug] route SSR-seeds initialProducer
    //      (app/[locale]/[slug]/page.js:96), which short-circuits the client
    //      fetch (useProducerData.js:33 `if (initialProducer) return`) — the
    //      mock could never intercept it. The /producer/[id] route renders
    //      <ProducerDetail/> with no initialProducer (producer/[id]/page.js:73),
    //      so it CLIENT-fetches /api/producers/{id} (useProducerData.js:32-40),
    //      which the mock above fulfils with the fixture.
    await page.goto(`/producer/${borrowedId}`);
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await expect(page).toHaveScreenshot("producer-detail.png", {
      ...SHOT,
      // With the fixture, the name, one-liner, meta line and gallery grid
      // geometry are all deterministic, so the former h1 / #reviews masks are
      // dropped (the shot now verifies that header layout — the actual drift
      // per §2.2). Only genuinely external assets stay masked: the Cloudinary
      // photos (pixel bytes vary; the gallery *grid* geometry is locked by the
      // fixed 3-image count, ImageGallery.jsx:179) and any Leaflet tiles.
      mask: [page.locator("main img"), page.locator(".leaflet-container")],
    });
  });

  // MEH-1552: edge-state coverage for producer-detail — the states the
  // 4-channel "producer detail" baseline above can't see (MEH-1551's bug was
  // invisible to VRT because the fixture is the ideal case). Same MEH-1497
  // mechanics exactly: borrow a real id ONLY to clear middleware.js:67-71,
  // fulfil the detail call from a fixture (so the pixels are the fixture's),
  // viewport-only, same masks. DO NOT generate these baselines locally (font
  // drift) — vrt-update.yml regenerates them on the runner; they will fail
  // until it does, which is expected.

  // Minimal producer (phone-only, no images, no reviews) on BOTH projects —
  // the degenerate ContactCard layout: a single labeled channel row, not the
  // 3-6 circle row.
  test("producer-detail-minimal", async ({ page }) => {
    await preparePage(page);
    await page.route(PRODUCER_DETAIL_RE, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: MINIMAL_FIXTURE });
    });
    const listRes = await page.request.get("/api/producers", { params: { limit: 1 } });
    const list = listRes.ok() ? await listRes.json().catch(() => []) : [];
    const borrowedId = Array.isArray(list) && list[0]?.id;
    if (!borrowedId) {
      test.skip(true, "No producer on staging to borrow an id from");
      return;
    }
    await page.goto(`/producer/${borrowedId}`);
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await expect(page).toHaveScreenshot("producer-detail-minimal.png", {
      ...SHOT,
      mask: [page.locator("main img"), page.locator(".leaflet-container")],
    });
  });

  // Desktop-only: the phone reveal is a >=1024px behavior. On the minimal
  // producer the phone is the sole channel, so it renders as the labeled single
  // row (MEH-1551) — clicking it swaps the number pill in place.
  test("producer-detail-phone-revealed", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "phone reveal is desktop-only (>=1024px)");
    await preparePage(page);
    await page.route(PRODUCER_DETAIL_RE, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: MINIMAL_FIXTURE });
    });
    const listRes = await page.request.get("/api/producers", { params: { limit: 1 } });
    const list = listRes.ok() ? await listRes.json().catch(() => []) : [];
    const borrowedId = Array.isArray(list) && list[0]?.id;
    if (!borrowedId) {
      test.skip(true, "No producer on staging to borrow an id from");
      return;
    }
    await page.goto(`/producer/${borrowedId}`);
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 20_000 });
    // Click the visible ContactCard (the desktop sidebar instance — the inline
    // card is hidden at this width), then wait for the revealed number pill.
    await page.locator('[data-testid="contact-single-row"]:visible').first().click();
    await page.locator('[data-testid="revealed-phone"]:visible').first().waitFor({ timeout: 5_000 });
    await settle(page);
    await expect(page).toHaveScreenshot("producer-detail-phone-revealed.png", {
      ...SHOT,
      mask: [page.locator("main img"), page.locator(".leaflet-container")],
    });
  });

  // Mobile-only: the full fixture, with the first ready-made-question
  // disclosure (WhatsAppQuestionChips) expanded — an interaction state that
  // never had a baseline.
  test("producer-detail-disclosure-open", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "disclosure shot is mobile-only");
    await preparePage(page);
    await page.route(PRODUCER_DETAIL_RE, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: PRODUCER_FIXTURE });
    });
    const listRes = await page.request.get("/api/producers", { params: { limit: 1 } });
    const list = listRes.ok() ? await listRes.json().catch(() => []) : [];
    const borrowedId = Array.isArray(list) && list[0]?.id;
    if (!borrowedId) {
      test.skip(true, "No producer on staging to borrow an id from");
      return;
    }
    await page.goto(`/producer/${borrowedId}`);
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-testid="quick-answer-toggle"]').first().click();
    await page.locator('[data-testid="quick-answer-content"]').first().waitFor({ timeout: 5_000 });
    await settle(page);
    await expect(page).toHaveScreenshot("producer-detail-disclosure-open.png", {
      ...SHOT,
      mask: [page.locator("main img"), page.locator(".leaflet-container")],
    });
  });

  // MEH-1112: /about polish (pull-quote column narrowed, testimonials section
  // render-gated off, close-band CTA hierarchy, contact email fallback line)
  // is an intentional visual change — this touch re-rides vrt-update.yml so the
  // about-{desktop,mobile}-linux baselines regenerate on the runner (MEH-991 flow).
  // MEH-1113: the contact form gains a "נושא הפנייה" topic select above the
  // message field — another intentional /about visual change, so the baselines
  // regenerate again on this branch via the same vrt-update re-ride.
  test("about", async ({ page }) => {
    await preparePage(page);
    await page.goto("/about");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await expect(page).toHaveScreenshot("about.png", {
      ...SHOT,
      fullPage: true,
      // Cloudinary portrait — external asset, not layout.
      mask: [page.locator("main img")],
    });
  });

  test("login", async ({ page }) => {
    await preparePage(page);
    await page.goto("/login");
    await expect(page.locator("form").first()).toBeVisible({
      timeout: 20_000,
    });
    await settle(page);
    await expect(page).toHaveScreenshot("login.png", {
      ...SHOT,
      fullPage: true,
    });
  });

  test("register", async ({ page }) => {
    await preparePage(page);
    await page.goto("/register");
    await expect(page.locator("form").first()).toBeVisible({
      timeout: 20_000,
    });
    await settle(page);
    await expect(page).toHaveScreenshot("register.png", {
      ...SHOT,
      fullPage: true,
    });
  });
});
