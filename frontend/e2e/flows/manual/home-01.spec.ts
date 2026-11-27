// MEH-3540: part 1 of 3 of the former home.spec.ts, split mechanically by
// top-level describe block (no test body changed). Shared fixtures and helpers:
// ./_home-shared.ts.
import { test, expect, type Page } from "../_cloudinary-stub";
import he from "../../../messages/he.json";
import { ListCategoriesCategoriesGetResponse, ListProducersProducersGetResponse, GetStatsStatsGetResponse } from "../../../lib/generated/api.zod.js";
import { ProducersResponseSchema } from "../../../lib/schemas.js";
import { CategoriesResponseSchema, StatsSchema } from "../../../lib/api-responses.js";
import { FILTER_AXES } from "../../../lib/filter-taxonomy.js";
import { CHIPS_CONFIG } from "../../../lib/producer-filters.js";
import { SERVICE_CHIP_KEYS } from "../../../lib/map-chips.js";
import {
  CHAT_LAUNCHER_NAME,
  FIRST_PAINT,
  scope,
  isDesktop,
  mobileOnly,
  HERO,
  SEARCH_PH,
  PROD,
  FILTERS_BTN,
  AXES,
  HOME_CHIPS,
  PROMOTED,
  STALE_VERIFIED_LABEL,
  PLACEHOLDER_DENY,
  CAT_A,
  CATEGORIES,
  CITY,
  CITY_SIBLING,
  DAYS_OUT_OF_ORDER,
  DAYS_IN_ORDER,
  DAY_NOBODY,
  producer,
  P3,
  PRODUCERS,
  PAGE_SIZE,
  CAT_A_MEMBERS,
  feedForCategory,
  STATS_ABOVE,
  stubTiles,
  mockApi,
  consent,
  gotoHome,
  gotoWithFeed,
  cards,
  gotoFixtureFeed,
  activeCategoryFixture,
  settledBackgroundColor,
  promotedChip,
  filtersButton,
  sheetPanel,
  counter,
  heroSearch,
  backToTop,
  box,
  overlaps,
  noHorizontalOverflow,
  pinWeekdayNoon,
} from "./_home-shared";


// MEH-3905: not Friday mode unless a test forces it (_home-shared.ts).
test.beforeEach(({ page }) => pinWeekdayNoon(page));

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
  const grassFed = PRODUCERS.filter((p) => p.grass_fed).length;
  if (grassFed < 5)
    throw new Error(`DIET_CHIP_MIN = 5 grass-fed businesses are needed to un-gate grass_fed, got ${grassFed}`);
  const onSite = PRODUCERS.filter((p) => p.sells_on_site).length;
  if (onSite < 5)
    throw new Error(`DIET_CHIP_MIN = 5 businesses selling on site are needed to un-gate on_site, got ${onSite}`);
  if (PROMOTED.includes("verified"))
    throw new Error("«מאומת» is promoted again — MT:1418:2 below asserts it lives in the sheet only (MEH-2598)");
  const windowed = PRODUCERS.filter((p) => p.order_window).length;
  if (windowed < 5)
    throw new Error(`OPEN_NOW_CHIP_MIN = 5 declared windows are needed to un-gate open_for_orders_now, got ${windowed}`);
});

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
    // MEH-3838: the first try read backgroundImage "" — what a DETACHED node
    // reports (an unset image reads "none"; probe-measured). Probable cause,
    // not proven on CI: one read landed on the node React was replacing (the
    // hidden server copy of MEH-3834). So the read is one atomic snapshot,
    // retried until the layer in the page reports its photo; every assert
    // below reads that same snapshot. A layer that never gets the photo fails.
    let style = { image: "", animation: "", size: "" };
    await expect
      .poll(
        async () => {
          style = await layer.evaluate((el) => {
            const cs = getComputedStyle(el as HTMLElement);
            return { image: cs.backgroundImage, animation: cs.animationName, size: cs.backgroundSize };
          });
          return style.image;
        },
        { message: "the hero photo is served from Cloudinary", timeout: 10_000 },
      )
      .toContain("res.cloudinary.com");
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
    // MEH-2979: the subtitle swaps to home.hero.friday_subtitle Thu 18:00 →
    // Fri 14:00 Israel (lib/friday-mode.js), so an unfrozen clock reds this
    // every week in that window. Pin a weekday noon, as parity.spec.ts does
    // (MEH-1531). Real users' Friday behaviour is untouched.
    await page.clock.setFixedTime(new Date("2026-07-15T09:00:00Z")); // Wed 12:00 IDT
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
      const cs = getComputedStyle(el);
      // The last pixel row of the box that is on screen. Whatever paints there
      // must be the dropdown itself: an ancestor with overflow hidden (the hero
      // band) would leave the hero's own pixels there instead. Page chrome that
      // is position:fixed (BottomNav, cookie banner, chat launcher) floats over
      // everything at the viewport bottom by design, so it is skipped: the
      // first IN-FLOW element under the point is the one that counts.
      const probeY = Math.min(d.bottom, window.innerHeight) - 2;
      const inFixedLayer = (n: Element | null): boolean => {
        for (let a = n; a && a !== el; a = a.parentElement) {
          if (getComputedStyle(a).position === "fixed") return true;
        }
        return false;
      };
      const atProbe = document
        .elementsFromPoint(d.left + d.width / 2, probeY)
        .find((n) => el.contains(n) || !inFixedLayer(n));
      return {
        dropBottom: d.top + d.height,
        heroBottom: h.top + h.height,
        clipped: el.scrollHeight - el.clientHeight,
        // MEH-3164 / MEH-3431: the box is capped at max-h-[70vh] and scrolls
        // inside past that, by design. On a 664 px viewport (iPhone 13) the 7
        // rows are taller than 70vh, so the content scrolls — that is the cap,
        // not a clip.
        atCap: Math.abs(el.offsetHeight - parseFloat(cs.maxHeight)) <= 2,
        scrolls: cs.overflowY === "auto" || cs.overflowY === "scroll",
        bottomIsOwn: Boolean(atProbe && el.contains(atProbe)),
      };
    });
    expect(geometry.dropBottom, "the dropdown extends below the hero band").toBeGreaterThan(geometry.heroBottom);
    expect(geometry.bottomIsOwn, "nothing paints over the dropdown's bottom edge (no ancestor clips it)").toBe(true);
    // Not clipped: its painted height matches its own scroll height — or it is
    // at its 70vh cap and scrolls inside.
    if (geometry.clipped > 1) {
      expect(geometry.atCap, "a dropdown shorter than its content is at its max-height cap").toBe(true);
      expect(geometry.scrolls, "a capped dropdown scrolls inside").toBe(true);
    }
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
test.describe("manual › chat launcher on mobile (MEH-2499)", () => {
  // The launcher sits above the BottomNav pill and stays put through scrolling
  // (it hid on scroll-down until 4/11 — on a phone that read as broken).
  test("mobile: visible at the top, after scrolling down, and after scrolling up", async ({ page }, info) => {
    mobileOnly(info, "the launcher position above the BottomNav is mobile-only");
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    const launcher = page.getByTestId("chat-launcher");
    await expect(launcher).toBeVisible(FIRST_PAINT);
    for (const y of [900, 600]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await expect(launcher).toBeVisible();
      await expect(launcher).toHaveCSS("opacity", "1");
      await expect(launcher).toHaveCSS("pointer-events", "auto");
    }
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
      // Desktop only: on mobile the chat FAB steps aside on scroll-down
      // (MEH-2499, ChatWidgetMobile.test.jsx), so at this scroll depth it is
      // hidden and there is nothing to overlap.
      const fab = page.getByRole("button", { name: CHAT_LAUNCHER_NAME });
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
      ? page.getByRole("button", { name: CHAT_LAUNCHER_NAME })
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
  test("the home filter row is exactly the promoted service chips plus the sheet trigger and the day chip, each promoted chip with an aria-hidden glyph", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    // MEH-2323 (02/11): `on_site` is data-gated (MEH-2598), so the promoted row
    // is three chips only when the LOADED feed clears DIET_CHIP_MIN. A bare
    // gotoHome renders the server's catalog on a live-backend runner (header
    // ⚠️ block) — staging has < 5 on-site businesses, so CI saw 2 chips. The
    // fixture feed is what beforeAll censuses, so it must be what loaded.
    await gotoFixtureFeed(page, "/", PRODUCERS);
    const row = scope(page).getByTestId("home-filter-row");
    // Counted by testid, not by role: MEH-2537 moved the delivery-day chip into
    // this row, and its ✕ appears whenever days are set, so a role count would
    // depend on fixture state rather than on what this test is about.
    const promoted = row.locator('[data-testid^="home-promoted-chip-"]');
    await expect(promoted).toHaveCount(PROMOTED.length);
    // …and in SERVICE_CHIP_KEYS order, the one order all three surfaces share.
    expect(
      await promoted.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid"))),
    ).toEqual(PROMOTED.map((k) => `home-promoted-chip-${k}`));
    await expect(row.getByTestId("home-filters-button")).toHaveCount(1);
    await expect(row.getByTestId("delivery-day-chip")).toHaveCount(1);
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
  //   MEH-2598 (Sapir 29/10, «אחיד, מאומת בסינון») took «מאומת» off the surface
  //   row: it now lives in the sheet only, so that is where its label is read,
  //   and the row is asserted NOT to carry it.
  test("the verification chip carries the taxonomy label and «מאומתים» appears nowhere on the page", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await expect(promotedChip(page, PROMOTED[0])).toBeVisible(FIRST_PAINT);
    await expect(promotedChip(page, "verified"), "«מאומת» lives in the sheet, not on the row").toHaveCount(0);
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
  //       MEH-1508 chunk 3ב-2 added two business-scope pills after the line;
  //       MEH-2677 removed them again (card badge only).
  //   All live shapes are asserted, derived from `FILTER_AXES[...].group/scope`.
  test("the FilterSheet gives every toggle a label, keeps every explanation reachable, and Esc closes it", async ({ page }) => {
    // The sheet's diet group is RUNTIME-GATED on the loaded catalog
    // (`visibleGatedDietKeys`, DIET_CHIP_MIN = 5 — `producer-filters.js:169-176`),
    // so which toggles exist is a function of the FEED, not of CHIPS_CONFIG
    // alone. `beforeAll` already guarantees the fixture clears that bar; the
    // fixture therefore has to be the thing that loaded, which on a live-backend
    // runner needs `gotoFixtureFeed` rather than a bare `gotoHome`. Without it
    // the backend's catalog gates `no_added_sugar` off and the loop below asks
    // for a toggle that was never rendered — the CI failure, verbatim.
    // `open_for_orders_now` is clock-gated (see the fixture's order_window): freeze
    // the clock inside the window, or the suite reds for one minute a day.
    await page.clock.setFixedTime(new Date("2026-07-15T09:00:00Z")); // Wed 12:00 IDT
    await gotoFixtureFeed(page, "/", PRODUCERS);
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
    // The diet group carries its one shared scope line for the any-product pills
    // instead of per-row ones.
    const dietAnyProduct = diet.filter((c) => AXES[c.key]?.scope === "any-product");
    const dietDeclared = diet.filter((c) => AXES[c.key]?.scope !== "any-product");
    expect(dietAnyProduct.length, "the any-product diet pills must be non-empty or the no-ⓘ branch asserts nothing").toBeGreaterThan(0);
    // MEH-2677: no business-scope diet pill — one chip per diet.
    expect(dietDeclared.map((c) => c.key), "no business-scope diet pill (MEH-2677)").toEqual([]);
    for (const key of ["vegan_all", "vegetarian_all"]) {
      await expect(panel.getByTestId(`chip-${key}`), `${key} left the sheet (MEH-2677)`).toHaveCount(0);
    }
    await expect(panel).toContainText(he.filters.sheet.diet_scope);
    for (const chip of dietAnyProduct) {
      await expect(panel.getByTestId(`chip-info-${chip.key}`), "an any-product diet pill carries no ⓘ of its own").toHaveCount(0);
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
    // Gate on the mount effect having run before touching a chip: the fixture
    // feed cannot be on screen until `loadProducers` has been called, and that
    // is the same effect that writes `setChips` from the URL. Clicking before
    // it lands leaves the click open to being overwritten. The fill reads go
    // through `settledBackgroundColor`, which waits out the CSS transition
    // (MEH-3468).
    await gotoFixtureFeed(page, "/", PRODUCERS);
    const chip = promotedChip(page, "has_delivery");
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    const inactiveFill = await settledBackgroundColor(chip);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const activeFill = await settledBackgroundColor(chip);
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
  //   here is the live promoted pair — «משלוח» + «איסוף עצמי» since MEH-2598. The claim under test — composition — is
  //   unchanged; the axes it is asserted on are not.
  test("two active chips compose into one request carrying both params", async ({ page }) => {
    const seen = await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    // Gate on the FIRST chip's own state before pressing the second. Clicking both
    // back-to-back is a race: the second handler can run against the pre-first
    // render, and the two axes then leave as two single-param requests instead of
    // one composed one — observed once in 5 runs on the mobile project, which is
    // exactly the intermittence a spec must not ship with.
    await promotedChip(page, "pickup_points").click();
    await expect(promotedChip(page, "pickup_points")).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => seen.producers[seen.producers.length - 1]?.searchParams.has("pickup_points"), {
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
            (u) => u.searchParams.has("pickup_points") && u.searchParams.has("has_delivery"),
          ),
        { message: "one request carries BOTH params" },
      )
      .toBe(true);
    // Both chips read as pressed at the same time — the multi-select claim.
    await expect(promotedChip(page, "pickup_points")).toHaveAttribute("aria-pressed", "true");
    await expect(promotedChip(page, "has_delivery")).toHaveAttribute("aria-pressed", "true");
  });

  // MT:T12:13 — clearing the CATEGORY leaves the attribute chips standing.
  test("clearing the category keeps the attribute chips active", async ({ page }) => {
    const cat = await activeCategoryFixture(page);
    await gotoFixtureFeed(page, `/?category=${cat.id}`, feedForCategory(cat.id));
    await expect(cards(page)).toHaveCount(CAT_A_MEMBERS.length, FIRST_PAINT);
    await promotedChip(page, "has_delivery").click();
    await expect(promotedChip(page, "has_delivery")).toHaveAttribute("aria-pressed", "true");
    // MEH-3427: name the precondition, so a category the page does not hold
    // reds here with its cause instead of as a missing clear button.
    await expect(
      scope(page).getByRole("heading", { level: 2, name: PROD.heading_category.replace("{name}", cat.name) }),
      `the page resolved category ${cat.id} («${cat.name}») from its own list`,
    ).toBeVisible();
    await scope(page)
      .getByRole("button", { name: `${PROD.clear_filter} ${cat.name}` })
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
    const cat = await activeCategoryFixture(page);
    await gotoFixtureFeed(page, `/?category=${cat.id}`, feedForCategory(cat.id));
    const named = PROD.heading_category.replace("{name}", cat.name);
    await expect(scope(page).getByRole("heading", { level: 2, name: named })).toBeVisible(FIRST_PAINT);
    await expect(cards(page)).toHaveCount(CAT_A_MEMBERS.length);
    const tag = scope(page).getByRole("button", { name: `${PROD.clear_filter} ${cat.name}` });
    await expect(tag).toBeVisible();
    await tag.click();
    await expect(scope(page).getByRole("heading", { level: 2, name: PROD.heading })).toBeVisible();
    await expect(tag).toHaveCount(0);
    // The ✕ drops `category` from the URL. Asserted as the PARAM's absence, not
    // as a whole-URL shape: the old `/\/(he\/?)?(\?|$)/` also matched any URL
    // that still carried a query string, so it could not have distinguished a
    // cleared category from a surviving one.
    await expect
      .poll(() => new URL(page.url()).searchParams.has("category"), {
        message: "the ✕ must remove the category param from the URL",
      })
      .toBe(false);
  });

  // MT:1174:5 — a chip AND a category are both listed in the applied row, and
  //   the counter keeps counting.
  test("an active chip and an active category both appear in the applied-filters row", async ({ page }) => {
    const cat = await activeCategoryFixture(page);
    await gotoFixtureFeed(page, `/?category=${cat.id}`, feedForCategory(cat.id));
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
    await expect(scope(page).getByRole("button", { name: `${PROD.clear_filter} ${cat.name}` })).toBeVisible();
    await expect(counter(page)).toBeVisible();
  });

  // MT:1174:6 — the applied row reads in the RTL direction and nothing overflows.
  test("the applied-filters row is RTL and does not overflow", async ({ page }) => {
    const cat = await activeCategoryFixture(page);
    await gotoFixtureFeed(page, `/?category=${cat.id}`, feedForCategory(cat.id));
    const heading = scope(page).getByRole("heading", {
      level: 2,
      name: PROD.heading_category.replace("{name}", cat.name),
    });
    await expect(heading).toBeVisible(FIRST_PAINT);
    await expect(heading).toHaveCSS("direction", "rtl");
    await noHorizontalOverflow(page);
  });

});
