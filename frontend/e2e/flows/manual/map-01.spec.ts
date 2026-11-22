// MEH-3540: part 1 of 2 of the former map.spec.ts, split mechanically by
// top-level describe block (no test body changed). Shared fixtures and helpers:
// ./_map-shared.ts.
import { test, expect } from "../_cloudinary-stub";
import he from "../../../messages/he.json";
import en from "../../../messages/en.json";
import { ListCategoriesCategoriesGetResponse, ListProducersProducersGetResponse } from "../../../lib/generated/api.zod.js";
import { ProducersResponseSchema } from "../../../lib/schemas.js";
import { haversineKm } from "../../../lib/distance.js";
import {
  FIRST_PAINT,
  isDesktop,
  shellOf,
  desktopOnly,
  mobileOnly,
  MC,
  MP,
  MF,
  NM,
  CP,
  CARD_EMPTY,
  SHEET,
  FILTERS_BTN,
  LOC,
  CHAT_OPEN_HE,
  CHAT_OPEN_EN,
  AXES,
  icu,
  CATEGORIES,
  EMPTY_LEGEND_GROUP,
  MEAT_LEGEND_GROUP,
  producer,
  branch,
  P_HAIFA,
  P_ASH,
  PRODUCERS,
  MEAT,
  DAIRY,
  RATING_ORDER,
  FEED_ORDER,
  GPS_NEAR,
  GPS_FAR,
  NEAR_ME_DEFAULT_ZOOM,
  GPS_FLY_ZOOM,
  nearestOrder,
  distanceLabel,
  stubExternal,
  gotoMap,
  fitFixtureSpread,
  gotoWithCatalog,
  cards,
  cardNames,
  cardOf,
  primaryMarkers,
  secondaryMarkers,
  mapCanvas,
  legendRow,
  sheetPanel,
  filtersButton,
  serviceChip,
  locationModal,
  cityPicker,
  citySearchInput,
  box,
  inside,
  hitTestIsSelf,
  panMap,
  tapMarker,
  installGeo,
  geoCalls,
  clickCanvasCorner,
  seedStorage,
  seedGps,
  grantGps,
} from "./_map-shared";


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

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /map multi-location epic (MEH-1388)", () => {
  // MT:MEH-1388:5, revised by MEH-3054 (option ה׳, Sapir 13/11) — one pin per
  //   business: the SECONDARY pins (pickup / market_stand) are not drawn until
  //   their business is selected, or the «איסוף עצמי» chip is on. There is no
  //   layer toggle (MEH-3045). Rows 1-4 are COVERED by
  //   24-producer-locations.spec.ts (:264 same card from every pin, :159
  //   unique-business cluster badge, :319 nearest location, :344 delivery-only
  //   + pickup visible) and are not repeated here.
  test("one pin per business; selecting it adds its pickup point, and no toggle exists", async ({ page }, info) => {
    await fitFixtureSpread(page, info);
    const { shell } = await gotoWithCatalog(page, info);
    await expect(primaryMarkers(shell)).toHaveCount(PRODUCERS.length, FIRST_PAINT);
    await expect(secondaryMarkers(shell)).toHaveCount(0);
    await expect(page.locator('[data-testid^="pickup-layer-"]')).toHaveCount(0);

    await tapMarker(page, shell, P_HAIFA);
    await expect(secondaryMarkers(shell)).toHaveCount(1);
    await expect(primaryMarkers(shell)).toHaveCount(PRODUCERS.length);
  });

  test("the «איסוף עצמי» chip draws every pickup point", async ({ page }, info) => {
    await fitFixtureSpread(page, info);
    const { shell } = await gotoWithCatalog(page, info, "/map?pickup_points=1");
    await expect(serviceChip(shell, "pickup_points")).toHaveAttribute("aria-pressed", "true");
    await expect(secondaryMarkers(shell)).toHaveCount(1, FIRST_PAINT);
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
    desktopOnly(info, "desktop row only (MT:PR3:1) — the mobile row is not converted here");
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
    desktopOnly(info, "desktop row only (MT:PR3:3)");
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
  // MEH-2425: a lit service chip is NOT repeated as a "× איסוף עצמי" tag under
  //   it (Sapir 27/10 — the same filter in two places). The chip is its own
  //   off switch; «× נקו הכל» is covered with sheet-only filters in the next test.
  test("category row + service row + «סינון» with no count; a service chip lights itself and adds no count or tag", async ({ page }, info) => {
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
    // MEH-2500: a lit service chip is on the bar already, so «סינון» adds no
    // count for it — «סינון · 1» read as a filter hidden in the sheet.
    await expect(filtersButton(shell)).toHaveText(FILTERS_BTN);
    await expect(shell.getByTestId("map-active-filter-tags")).toHaveCount(0);

    await serviceChip(shell, "pickup_points").click();
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

    // MT:two-row:m8 — «× נקו הכל» resets every filter and the tag strip goes away.
    await page.keyboard.press("Escape");
    await expect(sheetPanel(page)).toHaveCount(0);
    const strip = shell.getByTestId("map-active-filter-tags");
    await expect(strip.getByTestId("map-clear-all")).toHaveText(MF.clear_all);
    await strip.getByTestId("map-clear-all").click();
    await expect(shell.getByTestId("map-active-filter-tags")).toHaveCount(0);
    await expect(filtersButton(shell)).toHaveText(FILTERS_BTN);
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
    await expect(page.getByText(he.map.bottom_sheet.near_me_empty, { exact: true })).toHaveCount(0);
    await expect(cards(shell)).toHaveCount(PRODUCERS.length);
  });

  // MEH-2506 — the mobile origin is a compact tag UNDER the filter chips (it was
  //   a full row above them): named after near me, cleared by its ✕.
  test("mobile: after near me the origin tag sits under the filter chips and clears", async ({ page, context }, info) => {
    mobileOnly(info, "the origin tag is the mobile bar's; desktop keeps it by the sort select");
    await grantGps(context, GPS_NEAR);
    const { shell } = await gotoWithCatalog(page, info);
    const bar = shell.getByTestId("map-mobile-bar");
    await expect(bar.getByTestId("sort-origin-label")).toHaveCount(0);
    await shell.getByTestId("map-near-me-pill").click();
    const label = bar.getByTestId("sort-origin-label");
    await expect(label).toHaveText(MC.sort.origin_gps);
    const filters = await bar.getByTestId("map-filters-button").boundingBox();
    const tag = await label.boundingBox();
    expect(tag!.y).toBeGreaterThan(filters!.y + filters!.height);
    // …and the ✕'s 44px hit area (negative margin) stays off the filter buttons.
    const clearBox = await bar.getByTestId("clear-user-location").boundingBox();
    expect(clearBox!.y, "the ✕ 44px hit area (-my-3) must start below «סינון» — the origin row's mt-3 keeps it clear").toBeGreaterThanOrEqual(filters!.y + filters!.height);
    await bar.getByTestId("clear-user-location").click();
    await expect(bar.getByTestId("sort-origin-label")).toHaveCount(0);
  });

  // MEH-2506 — an over-long origin label truncates inside the tag; the ✕ must
  //   stay on screen (in the flex-wrap row it was pushed past the inline-end).
  //   Real city names fit at 320 (measured: «מודיעין-מכבים-רעות» 136px), so the
  //   label is the name ×3 (×2 still fits, 234px) — the guard is for the row.
  test("mobile: at 320px an over-long origin label keeps its ✕ on screen", async ({ page }, info) => {
    mobileOnly(info, "the origin tag is the mobile bar's");
    await page.setViewportSize({ width: 320, height: 700 });
    await seedStorage(page, "user_location", JSON.stringify({ lat: 31.9, lng: 35.0, source: "city", city: "מודיעין-מכבים-רעות ".repeat(3).trim() }));
    const { shell } = await gotoWithCatalog(page, info);
    const clear = shell.getByTestId("map-mobile-bar").getByTestId("clear-user-location");
    await expect(clear).toBeVisible();
    const box = (await clear.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  });

  // MT:MEH-970:3 — nothing within 25 km: the toast, the camera back on the
  //   default view (zoom 8), and ALL businesses still listed — never a blank map.
  test("mobile: near me with nothing within 25 km says so in the sheet, returns to the default view and keeps every business", async ({ page, context }, info) => {
    mobileOnly(info, "the pill is mounted inside the mobile shell only");
    await grantGps(context, GPS_FAR);
    await fitFixtureSpread(page, info);
    const { shell, tiles } = await gotoWithCatalog(page, info);
    // CONTROL FIRST (testing.md — "Run the control first. If the probe cannot
    // see the thing it is aimed at, nothing it reports afterwards is worth
    // reading"). Stated from the measurement rather than from the obvious guess,
    // because the guess was wrong: with the tile route never registered the zoom
    // census below still PASSES — it reads the DOM, not this log — so the
    // trailing form produced a green census beside a red control, which reads
    // like a flaky control rather than a void run. Ordering the control first
    // means no census result is ever produced from an uninstrumented run.
    // Bounded, because tiles arrive asynchronously after the cards
    // `gotoWithCatalog` already waited for.
    await expect
      .poll(() => tiles.length, {
        message: "control: the tile route must be recording — every zoom census in this test is void if this stays 0",
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
    await shell.getByTestId("map-near-me-pill").click();
    // #3959: the empty near-me result is said IN the bottom sheet
    // (MapBottomSheet.jsx `near_me_empty`), no longer as a toast — the old
    // `near_me_pill.empty` string is rendered nowhere since.
    await expect(page.getByText(he.map.bottom_sheet.near_me_empty, { exact: true })).toBeVisible();
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
    const empty = legendRow(shell, EMPTY_LEGEND_GROUP);
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
    const meat = legendRow(shell, MEAT_LEGEND_GROUP);
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
    const meat = legendRow(shell, MEAT_LEGEND_GROUP);
    const rows = shell.getByTestId("map-legend-row");
    const groups = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-group") ?? ""));
    for (const group of groups.filter((g) => g !== MEAT_LEGEND_GROUP)) await legendRow(shell, group).click();
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
    await expect(legendRow(shell, EMPTY_LEGEND_GROUP)).toBeDisabled();
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
    // MEH-3062: on the phone the rail ends with the service chips, so the
    // last button is «איסוף עצמי» — the chip the end spacer must now clear.
    const last = row.getByRole("button").last();
    await expect(last).toHaveAttribute("data-testid", "map-service-chip-pickup_points");
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
    const last = row.locator("button[data-roving-chip]").last();
    expect(inside(await box(last), await box(row)), "control: the edge chip starts partly out of view").toBe(false);
    await last.dispatchEvent("click");
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => inside(await box(last), await box(row))).toBe(true);
  });

  // MT:two-row:geo2 — a city picked in the modal closes it and filters the list
  //   by that city (the page re-queries with `near_city` — MEH-2602: located in
  //   the city or delivering to it; no geocode-driven
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
    await expect.poll(() => catalog.seen.slice(before).some((u) => u.searchParams.get("near_city") === "חיפה")).toBe(true);
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
    // MEH-1430: the X is desktop-only; the mobile sheet closes via «לא עכשיו».
    await locationModal(page)
      .getByRole("button", { name: isDesktop(info) ? LOC.close_aria : LOC.skip, exact: true })
      .click();
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
