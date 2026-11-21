// MEH-3540: part 2 of 3 of the former home.spec.ts, split mechanically by
// top-level describe block (no test body changed). Shared fixtures and helpers:
// ./_home-shared.ts.
import type { Locator } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import he from "../../../messages/he.json";
import { ListCategoriesCategoriesGetResponse, ListProducersProducersGetResponse, GetStatsStatsGetResponse } from "../../../lib/generated/api.zod.js";
import { ProducersResponseSchema } from "../../../lib/schemas.js";
import { CategoriesResponseSchema, StatsSchema } from "../../../lib/api-responses.js";
import { CHIPS_CONFIG } from "../../../lib/producer-filters.js";
import {
  FIRST_PAINT,
  scope,
  isDesktop,
  desktopOnly,
  mobileOnly,
  HERO,
  PROD,
  CTA,
  LOC_MODAL,
  HOME_CHIPS,
  PROMOTED,
  CARDS,
  CAT_A,
  CAT_EMPTY,
  CATEGORIES,
  REGION,
  CITY,
  DAYS_OUT_OF_ORDER,
  DAYS_IN_ORDER,
  DAY_NOBODY,
  Producer,
  producer,
  P1,
  P2,
  P3,
  P5,
  PRODUCERS,
  PAGE_SIZE,
  CAT_A_MEMBERS,
  REGION_FALLBACK,
  STATS_ABOVE,
  stubTiles,
  mockApi,
  seedStorage,
  consent,
  gotoHome,
  gotoWithFeed,
  cards,
  gotoFixtureFeed,
  nearMe,
  box,
  scaleX,
  columnCount,
  installGeo,
  geoCalls,
  GPS,
  grantGps,
} from "./_home-shared";


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

  // MT:1224:1 — the name sits BELOW the photo, and no text is painted over
  //   the image. Asserted geometrically (caption box entirely below the image
  //   box). MEH-3061 removed the card frame and its surface-card fill, so the
  //   old "the strip is opaque" read is gone: with no frame it could only find
  //   the page background, which is green whatever the card does.
  test("the caption sits below the photo, never over it", async ({ page }) => {
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
    await expect(caption, "the caption is its own block, not an overlay on the photo").not.toHaveCSS("position", "absolute");
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
// MEH-2412 — on a phone the ten category cards are ONE swipeable row, not a
// 2-hero + 2×4 stack (~1,400px of scroll before the first business).
// MEH-3061 — desktop is ONE row too: ten equal cells, no heroes, no sideways
// scroll (the old 4-column grid put the first business ~2,100px down at 1440).
// The pair discriminates: the phone test is red on the old stack; the desktop
// test is red on the old 4-column grid (rows, columns and widths all differ).
test.describe("manual › category cards — one row on phone and desktop (MEH-2412 · MEH-3061)", () => {
  const grid = (page: Page) => scope(page).getByTestId("home-category-grid");
  const rail = (page: Page) => scope(page).getByTestId("home-category-rail");

  test("on a phone the cards are one horizontal row with the next card peeking", async ({ page }, info) => {
    mobileOnly(info, "the row is the phone layout; desktop is covered by the grid test below");
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await expect(grid(page).getByTestId("home-category-card")).toHaveCount(CARDS.length, FIRST_PAINT);
    await grid(page).scrollIntoViewIfNeeded();
    const m = await rail(page).evaluate((el) => {
      const cards = [...el.querySelectorAll('[data-testid="home-category-card"]')].map((c) =>
        c.getBoundingClientRect(),
      );
      // Rows from offsetTop, NOT the rect: each card enters on a `whileInView`
      // y-slide, so off-screen cards still carry translateY(40px) and their rects
      // read as a second "row" that the layout never had (measured under load).
      const tops = new Set(
        [...el.children].map((w) => (w as HTMLElement).offsetTop),
      );
      const box = el.getBoundingClientRect();
      const visible = cards.filter((r) => r.right > box.left + 1 && r.left < box.right - 1).length;
      return { rows: tops.size, scrollW: el.scrollWidth, clientW: el.clientWidth, height: box.height, visible };
    });
    expect(m.rows, "all ten cards share one row").toBe(1);
    expect(m.scrollW, "the row overflows sideways — there is more to swipe to").toBeGreaterThan(m.clientW);
    expect(m.height, "the row is one card tall, not a 1,400px stack").toBeLessThanOrEqual(320);
    expect(m.visible, "two whole cards plus a peeking third are on screen").toBeGreaterThanOrEqual(3);
    // Swiping reaches the tenth card: scroll the rail to its far end (RTL, so
    // the end is the most negative scrollLeft) and require the last card fully
    // inside the rail's box.
    const lastInView = await rail(page).evaluate(async (el) => {
      el.scrollTo({ left: -el.scrollWidth, behavior: "instant" as ScrollBehavior });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cards = el.querySelectorAll('[data-testid="home-category-card"]');
      const last = cards[cards.length - 1].getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return last.left >= box.left - 1 && last.right <= box.right + 1;
    });
    expect(lastInView, "the tenth card is reachable by swiping to the end").toBe(true);
  });

  test("on desktop the ten cards are one row of equal cells with no sideways scroll", async ({ page }, info) => {
    desktopOnly(info, "the ten-column row is the desktop layout");
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    await expect(grid(page).getByTestId("home-category-card")).toHaveCount(CARDS.length, FIRST_PAINT);
    await grid(page).scrollIntoViewIfNeeded();
    const m = await rail(page).evaluate((el) => {
      const cards = [...el.querySelectorAll('[data-testid="home-category-card"]')].map((c) =>
        c.getBoundingClientRect(),
      );
      const widths = cards.map((r) => r.width);
      // Rows from offsetTop — the cards enter on a whileInView y-slide (see above).
      const tops = new Set([...el.children].map((w) => (w as HTMLElement).offsetTop));
      return {
        display: getComputedStyle(el).display,
        cols: getComputedStyle(el).gridTemplateColumns.split(" ").length,
        rows: tops.size,
        widest: Math.max(...widths),
        narrowest: Math.min(...widths),
        overflows: el.scrollWidth > el.clientWidth + 1,
      };
    });
    expect(m.display).toBe("grid");
    expect(m.cols, "ten columns").toBe(10);
    expect(m.rows, "all ten cards share one row").toBe(1);
    expect(m.widest - m.narrowest, "every card is the same width — no hero").toBeLessThanOrEqual(1);
    expect(m.overflows, "no sideways scroll on desktop").toBe(false);
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
  //   city line truncates rather than wrapping.
  test("card photos are object-cover and the city line truncates", async ({ page }) => {
    // P5 — the deliberately over-long name and the one card carrying a photo —
    // exists only in the fixture, so this row needs the fixture to be what
    // rendered. `gotoFixtureFeed` both forces the client fetch and proves the
    // feed is ours; the count below then measures the fixture's page, not a
    // backend catalog that also happens to hold ≥ 8 businesses.
    await gotoFixtureFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    const long = cards(page).filter({ has: page.getByRole("heading", { level: 3, name: P5.name, exact: true }) });
    await expect(long).toHaveCount(1);
    await long.scrollIntoViewIfNeeded();
    await expect(long.locator("img").first()).toHaveCSS("object-fit", "cover");
    // The clipping element is the INNER `truncate` span, not the flex `<p>`
    // around it — the row overflows inside, so measuring the wrapper reports
    // scrollWidth === clientWidth and proves nothing. MEH-2440: the city now
    // leads in the place line above the name (`card-place`), so that is the
    // line the over-long city has to truncate in.
    const line = long.getByTestId("card-place");
    await expect(line).toHaveCSS("text-overflow", "ellipsis");
    const inner = line.locator("span.truncate");
    await expect(inner).toHaveCSS("text-overflow", "ellipsis");
    const [scrollW, clientW] = await inner.evaluate((el) => [el.scrollWidth, (el as HTMLElement).clientWidth]);
    expect(scrollW, "the long city line is genuinely being clipped").toBeGreaterThan(clientW);
  });

  // MEH-2487 — the description under the card is at most two lines on desktop.
  //   `sm:block` used to replace line-clamp's display:-webkit-box, so the clamp
  //   never applied and the text wrapped without limit. Mobile hides the row.
  test("the card description is clamped to two lines on desktop and hidden on mobile", async ({ page }, testInfo) => {
    await gotoFixtureFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    const long = cards(page).filter({ has: page.getByRole("heading", { level: 3, name: P5.name, exact: true }) });
    await expect(long).toHaveCount(1);
    const desc = long.getByTestId("card-description");
    await expect(desc).toHaveCount(1);
    if (!isDesktop(testInfo)) {
      await expect(desc).toBeHidden();
      return;
    }
    await desc.scrollIntoViewIfNeeded();
    const m = await desc.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        display: cs.display,
        clamp: cs.getPropertyValue("-webkit-line-clamp"),
        height: el.getBoundingClientRect().height,
        lineHeight: parseFloat(cs.lineHeight),
      };
    });
    // An active clamp reads "-webkit-box", or "flow-root" in newer Chromium
    // (measured on 153); the bug read "block", where the clamp does nothing.
    expect(["-webkit-box", "flow-root"], "line-clamp needs display:-webkit-box").toContain(m.display);
    expect(m.clamp).toBe("2");
    expect(m.height, `at most two lines (${m.lineHeight}px each)`).toBeLessThanOrEqual(m.lineHeight * 2 + 1);
  });
});
