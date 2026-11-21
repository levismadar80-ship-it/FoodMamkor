// MEH-3540: part 2 of 2 of the former map.spec.ts, split mechanically by
// top-level describe block (no test body changed). Shared fixtures and helpers:
// ./_map-shared.ts.
import { test, expect } from "../_cloudinary-stub";
import he from "../../../messages/he.json";
import en from "../../../messages/en.json";
import { ListCategoriesCategoriesGetResponse, ListProducersProducersGetResponse } from "../../../lib/generated/api.zod.js";
import { ProducersResponseSchema } from "../../../lib/schemas.js";
import { haversineKm, formatDistance } from "../../../lib/distance.js";
import { ISRAEL_CITIES } from "../../../data/cities.js";
import {
  FIRST_PAINT,
  MAP_MOUNT,
  isDesktop,
  shellOf,
  desktopOnly,
  mobileOnly,
  MC,
  SHEET,
  FILTERS_BTN,
  LOC,
  MC_EN,
  icu,
  CAT_MEAT,
  CATEGORIES,
  Producer,
  P_HAIFA,
  P_TLV,
  P_ASH,
  PRODUCERS,
  MEAT,
  DAIRY,
  GPS_NEAR,
  GPS_FAR,
  NEAR_ME_DEFAULT_ZOOM,
  nearestOrder,
  distanceLabel,
  stubExternal,
  mockCatalog,
  gotoMap,
  gotoWithCatalog,
  cards,
  cardOf,
  markerOf,
  mapCanvas,
  sheetPanel,
  filtersButton,
  serviceChip,
  locationModal,
  citySearchInput,
  citySearchList,
  zoomIn,
  attribution,
  bottomSheet,
  box,
  inside,
  hitTestIsSelf,
  tapMarker,
  tapMarkerShowsCard,
  installGeo,
  geoCalls,
  clickCanvasCorner,
  sheetSettledAt,
  expectAtPeek,
  dragSheetUp,
  settleSheet,
  attributionRide,
  seedGps,
  seedCity,
  SHELL_ONLY,
  shellInventory,
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
  // MT:MEH-1010:6 · MT:z:b4 — MEH-3119: a marker tap on a phone shows the picked
  //   business ONCE: a card floating over the map, above the collapsed sheet.
  //   The X sits on the card's top-end corner (MEH-3417), off the photo, and closes it.
  //   The controls that ride the sheet edge clear the card too.
  test("mobile: a marker tap shows one floating card above the PEEK sheet; controls clear it; the X closes it", async ({ page }, info) => {
    mobileOnly(info, "the floating card is the mobile shell's selection");
    const { shell } = await gotoWithCatalog(page, info);
    await tapMarkerShowsCard(page, shell, P_TLV);
    const card = shell.getByTestId("map-selected-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(P_TLV.name);
    await expect(shell.getByTestId("map-legend-toggle")).toBeHidden();
    // Outside the sheet, and sitting on its top edge.
    await expect(bottomSheet(shell).getByTestId("map-selected-card")).toHaveCount(0);
    const cardBox = await box(card);
    const sheet = await box(bottomSheet(shell));
    expect(cardBox.y + cardBox.height, "the card ends above the sheet's top edge").toBeLessThanOrEqual(sheet.y);
    expect(sheet.y - (cardBox.y + cardBox.height), "…and close to it, not adrift up the map").toBeLessThanOrEqual(16);

    // MEH-3417: the X sits on the business card's top-end corner (no row of
    // its own above it), inside the card, and never over the photo.
    const close = shell.getByTestId("map-selected-card-close");
    const closeBox = await box(close);
    const inner = await box(card.getByTestId("map-card"));
    const thumb = await box(card.getByTestId("map-thumb"));
    expect(closeBox.width, "44px tap target").toBeGreaterThanOrEqual(44);
    expect(closeBox.height, "44px tap target").toBeGreaterThanOrEqual(44);
    expect(await hitTestIsSelf(close), "the X takes its own tap").toBe(true);
    expect(Math.abs(closeBox.y - inner.y), "the X starts at the card's top edge").toBeLessThanOrEqual(1);
    expect(closeBox.x, "the X is on the card's left (END) edge in RTL").toBeLessThanOrEqual(inner.x + 1);
    expect(closeBox.x + closeBox.width, "…and clear of the photo on the right").toBeLessThanOrEqual(thumb.x);
    expect(Math.abs((await box(card)).y - inner.y), "no row above the business card").toBeLessThanOrEqual(1);

    // Controls that ride the sheet edge now ride the card's top instead. Polled:
    // the pill's `bottom` animates for 300ms after the card reports its height.
    // (No hit test here: the pill is z-1000 over a z-598 card, so it would win
    // one even while sitting on the card.)
    const pill = shell.getByTestId("map-near-me-pill");
    await expect
      .poll(async () => {
        const pillBox = await box(pill);
        return pillBox.y + pillBox.height <= (await box(card)).y;
      }, { message: "near-me sits above the card" })
      .toBe(true);
    // The attribution lifts with the same edge. Measured against the map
    // container's spill below the fold (see attributionRide): it may sit that
    // many px lower than the card's real top, never more.
    await expect
      .poll(async () => {
        const attr = await box(attribution(shell));
        const container = await box(mapCanvas(shell));
        const vh = await page.evaluate(() => window.innerHeight);
        const spill = Math.max(0, container.y + container.height - vh);
        return attr.y + attr.height - spill <= (await box(card)).y;
      }, { message: "the attribution rides above the card" })
      .toBe(true);

    await close.click();
    await expect(card).toHaveCount(0);
    await expectAtPeek(page, shell);
  });

  // MT:z:b1 · MT:z:r4 — mobile, sheet open: the zoom +/- control is still
  //   clickable above it, and zooming works (tiles at z+1 are fetched).
  // MT:z:r2 — «קרוב אליי» is clickable with the sheet open.
  // MT:z:b3 — the sheet content scrolls to its end (the last card is fully
  //   reachable above the nav band). DRIFT: the «מידע נוסף» CTA is gone.
  // MT:z:a2 — sheet at HALF: the attribution rides ABOVE the sheet edge.
  // MEH-3119 — with the sheet open the floating card is gone: the picked
  //   business is its own row in the list, marked active, once.
  test("mobile with the sheet open: zoom + near-me still take clicks, the picked business is one list row, the list scrolls to its end", async ({ page }, info) => {
    mobileOnly(info, "the bottom sheet is the mobile shell's list");
    await installGeo(page, 1);
    const { shell, tiles } = await gotoWithCatalog(page, info);
    // The LAST business in the list, so its row is below the fold when the
    // sheet opens and only the scroll-into-view can put it on screen.
    const picked = PRODUCERS[PRODUCERS.length - 1];
    await tapMarkerShowsCard(page, shell, picked);
    // Since MEH-3119 a marker tap no longer opens the sheet; the handle does
    // (a click toggles it — the drag is covered by the MEH-2510 test below).
    await shell.getByTestId("map-sheet-handle").click();
    await sheetSettledAt(page, shell, 0.45); // HALF (MapBottomSheet.jsx)
    await expect(shell.getByTestId("map-selected-card"), "no second copy of the picked business with the list open").toHaveCount(0);
    await expect(cardOf(shell, picked), "the picked business is exactly one list row").toHaveCount(1);
    // Fully in view, to the pixel: `toBeInViewport({ ratio: 1 })` demanded an
    // exact 1.0 and at 390×664 the row's box is fractional — measured 0.998
    // (0.2px) after the scroll, which no eye sees (MEH-3486).
    const vh = page.viewportSize()!.height;
    await expect.poll(async () => {
      const r = await box(cardOf(shell, picked));
      return r.y >= -1 && r.y + r.height <= vh + 1;
    }, "its row is brought fully into view").toBe(true);
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
    // MEH-1430: mobile sheet has no X — close via «לא עכשיו».
    await locationModal(page).getByRole("button", { name: LOC.skip, exact: true }).click();

    const content = shell.getByTestId("map-sheet-content");
    await content.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "auto" }));
    await expect.poll(async () => {
      const last = await box(cards(shell).last());
      const c = await box(content);
      return last.y + last.height <= c.y + c.height + 1;
    }, "the last card must be fully reachable").toBe(true);
  });

  // MT:z:b2 — desktop: hovering a marker yields exactly ONE tooltip source — the
  //   native `title` (MapComponent.jsx `title: markerLabel`); no Leaflet tooltip
  //   is bound (MEH-30 #8), so no duplicate.
  //   MEH-3066: each primary pin now carries a permanent name label, which is a
  //   Leaflet tooltip (`.mehamakor-pin-label`) shown only from zoom 13. It is
  //   not a hover tooltip, so the hover check excludes it, and at this
  //   default zoom every label must still be hidden — no second name on hover.
  test("desktop: a hovered marker has one tooltip source (native title), no Leaflet tooltip, and highlights its card", async ({ page }, info) => {
    desktopOnly(info, "hover is a pointer affordance; the mobile path is tap → sheet");
    const { shell } = await gotoWithCatalog(page, info);
    const marker = markerOf(shell, P_TLV);
    await expect(marker).toHaveAttribute("title", P_TLV.name);
    await marker.hover();
    await expect(shell.locator(".leaflet-tooltip:not(.mehamakor-pin-label)")).toHaveCount(0);
    const labels = shell.locator(".leaflet-tooltip.mehamakor-pin-label");
    const shownLabels = await labels.evaluateAll((els) =>
      els.filter((e) => getComputedStyle(e).visibility !== "hidden").length);
    expect(shownLabels, "below zoom 13 no pin label may show on hover").toBe(0);
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
    // PEEK (MapBottomSheet.jsx). Not `sheetSettledAt(…, 0.14)` any more: since
    // MEH-2510 PEEK is max(14vh, nav clearance + 3.5rem), which on this
    // project's 393×727 viewport is the floor (~128px), not 14vh (~102px).
    await settleSheet(shell);
    // ≤ 20vh: the floor is 128px = 17.6vh here; 0.3 (the first version) only
    // proved "not HALF" and would pass a sheet stuck at 25vh (CI review, MEH-2510).
    await expectAtPeek(page, shell);
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

    await tapMarker(page, shell, target);
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

// MEH-2514 — the service row (משלוח · איסוף עצמי · סינון) is three shrink-0
// buttons in one non-scrolling line. Measured on staging at 320: 320px of
// buttons + gaps in a 296px row, «סינון» at x −12..71 (12px off-screen); with a
// « · N» count it overflowed at 360 too. Every width × both count states.
test.describe("manual › /map service row fits narrow phones (MEH-2514)", () => {
  for (const width of [320, 340, 360, 374]) {
    for (const withCount of [false, true]) {
      test(`${width}px${withCount ? " with «סינון · 2»" : ""}: «סינון» on screen, each service chip reachable on the rail, no page side-scroll`, async ({ page }, info) => {
        mobileOnly(info, "the service row's narrow-phone geometry");
        await page.setViewportSize({ width, height: 700 });
        const { shell } = await gotoWithCatalog(page, info);
        if (withCount) {
          await filtersButton(shell).click();
          const panel = sheetPanel(page);
          await panel.getByTestId("chip-vegan").click();
          await panel.getByTestId("chip-gluten_free").click();
          await panel.getByTestId("filter-sheet-apply-footer").getByRole("button", { name: icu(SHEET.apply, PRODUCERS.length) }).click();
          await expect(sheetPanel(page)).toHaveCount(0);
          await expect(filtersButton(shell)).toContainText("2");
        }
        // The word may be visually hidden under 360, never from AT — and the
        // breakpoint itself is pinned: the geometry above would stay green if
        // `max-[359px]` drifted to 360 or 400 (CI review, #3762).
        await expect(filtersButton(shell)).toHaveAccessibleName(new RegExp(`^${FILTERS_BTN}`));
        const wordWidth = (await box(filtersButton(shell).getByText(FILTERS_BTN, { exact: true }))).width;
        if (width < 360) expect(wordWidth, `«${FILTERS_BTN}» is sr-only under 360`).toBeLessThanOrEqual(1);
        else expect(wordWidth, `«${FILTERS_BTN}» shows its word at ${width}`).toBeGreaterThan(10);
        const row = await box(shell.getByTestId("map-service-row"));
        // Same height as the chips beside it — an icon-only button collapsed to
        // 38px next to 42px chips before the min-h.
        const chipH = (await box(serviceChip(shell, "has_delivery"))).height;
        expect(Math.abs((await box(filtersButton(shell))).height - chipH), "«סינון» height vs the service chips").toBeLessThanOrEqual(0.5);
        // MEH-3062: the phone row is ONE sideways rail now — «סינון», the
        // categories, then the service chips. «סינון» sits outside the
        // scroller, so it is fully on screen as loaded; each service chip is
        // reachable by scrolling the rail and then sits fully on screen; and
        // the PAGE never scrolls sideways (the rail's overflow stays inside it).
        const fb = await box(filtersButton(shell));
        expect(fb.x, `«סינון» left edge ${fb.x}`).toBeGreaterThanOrEqual(Math.max(0, row.x) - 0.5);
        expect(fb.x + fb.width, "«סינון» right edge").toBeLessThanOrEqual(Math.min(width, row.x + row.width) + 0.5);
        for (const btn of [serviceChip(shell, "has_delivery"), serviceChip(shell, "pickup_points")]) {
          await btn.scrollIntoViewIfNeeded();
          // Inside the row's box (and so the screen), and clear of «סינון» —
          // a chip sliding under it (the round-1 sticky overlap) goes red here.
          await expect.poll(async () => {
            const b = await box(btn);
            const f = await box(filtersButton(shell));
            const inRow = b.x >= Math.max(0, row.x) - 0.5 && b.x + b.width <= Math.min(width, row.x + row.width) + 0.5;
            const clearOfFilters = b.x + b.width <= f.x + 0.5 || b.x >= f.x + f.width - 0.5;
            return inRow && clearOfFilters;
          }, `${await btn.textContent()} fully inside the row and clear of «סינון» once the rail is scrolled to it`).toBe(true);
        }
        const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(pageOverflow, "the page itself never scrolls sideways").toBeLessThanOrEqual(0);
      });
    }
  }
  // MEH-2532: the upper edge of `max-[374px]`. The geometry above stays green
  // if the breakpoint drifts (375 has room for px-4), so the padding itself is
  // pinned on both sides of it.
  // MEH-2598 (Sapir 29/10, «אחיד»): the service chips are now the shared
  // PromotedServiceChips — one geometry on home, /producers and /map, `px-4`
  // at every width — and the row became a sideways rail, so they no longer
  // squeeze. The `max-[374px]` step survives on «סינון» alone
  // (FilterChipsBar.jsx:167), which is what this pair now pins; the chips are
  // pinned to the shared 16px on both sides so a per-surface fork shows here.
  for (const [width, filtersPad] of [[374, 12], [375, 16]] as const) {
    test(`${width}px: «סינון» uses ${filtersPad}px inline padding, the shared service chips 16px`, async ({ page }, info) => {
      mobileOnly(info, "the service row's phone geometry");
      await page.setViewportSize({ width, height: 700 });
      const { shell } = await gotoWithCatalog(page, info);
      const SHARED_CHIP_PAD = 16;
      for (const [name, btn, pad] of [
        ["has_delivery", serviceChip(shell, "has_delivery"), SHARED_CHIP_PAD],
        ["pickup_points", serviceChip(shell, "pickup_points"), SHARED_CHIP_PAD],
        ["filters", filtersButton(shell), filtersPad],
      ] as const) {
        const padding = await btn.evaluate((el) => [getComputedStyle(el).paddingInlineStart, getComputedStyle(el).paddingInlineEnd]);
        expect(padding, `${name} inline padding at ${width}px`).toEqual([`${pad}px`, `${pad}px`]);
      }
    });
  }

  test("375px: unchanged — «סינון» shows its word", async ({ page }, info) => {
    mobileOnly(info, "the service row's phone geometry");
    await page.setViewportSize({ width: 375, height: 700 });
    const { shell } = await gotoWithCatalog(page, info);
    await expect(filtersButton(shell).getByText(FILTERS_BTN, { exact: true })).toBeVisible();
  });
});

// MEH-2510 — at PEEK the sheet shows one line, «N בתי עסק מקומיים באזור», and
// on a short phone that line sat under the floating nav pill: PEEK was a flat
// 14vh while the pill is a fixed-px band. Measured on staging before the fix:
// count-row top 595.6 vs nav top 595 at 375×667 (all 20px hidden), 675.6 vs
// 688 at 375×760 (8px hidden). The viewports are set explicitly because the
// project's own 393×727 is neither of the two phones the card names.
test.describe("manual › /map PEEK sheet count clears the nav pill on short phones (MEH-2510)", () => {
  for (const vp of [
    { width: 375, height: 667 },
    { width: 375, height: 760 },
    { width: 390, height: 844 },
  ]) {
    test(`${vp.width}×${vp.height}: the PEEK count row sits fully above the nav pill, with ≥4px air`, async ({ page }, info) => {
      mobileOnly(info, "the bottom sheet and the nav pill are the mobile shell's");
      await page.setViewportSize(vp);
      const { shell } = await gotoWithCatalog(page, info);
      await settleSheet(shell);
      // At PEEK first, so a wrong snap fails with its own message — pinned to
      // the computed floor, not a loose ≤ 20vh (MEH-2532).
      await expectAtPeek(page, shell);
      const count = shell.getByTestId("sheet-count");
      await expect(count).toHaveText(icu(he.map.bottom_sheet.count, PRODUCERS.length));
      const row = await box(count);
      const nav = await box(page.getByTestId("bottom-nav"));
      expect(row.y + row.height + 4, `count row bottom ${row.y + row.height} vs nav top ${nav.y}`).toBeLessThanOrEqual(nav.y);
    });
  }

  // MEH-2532: the floor makes PEEK taller than 14vh, so the first ~5vh of an
  // upward drag moves nothing (MapBottomSheet.jsx, accepted). Guard that a real
  // drag still opens the sheet from a floored PEEK. It starts on the count row
  // (claim 1, the sheet chrome): at 375×667 the list shows a 4px strip between
  // that row and the nav pill, too thin to aim a finger at, so claim 2 (`snap ===
  // PEEK`, a drag from the list) stays with its unit test in MapSheetGesture.
  test("375×667: an upward drag from the count row at a floored PEEK opens the sheet to HALF", async ({ page, browserName }, info) => {
    mobileOnly(info, "the bottom sheet's touch drag is the mobile shell's");
    test.skip(browserName !== "chromium", "the drag is dispatched over CDP, which only Chromium speaks (webkit-iphone13 shadow)");
    await page.setViewportSize({ width: 375, height: 667 });
    const { shell } = await gotoWithCatalog(page, info);
    await settleSheet(shell);
    await expectAtPeek(page, shell);
    const row = await box(shell.getByTestId("sheet-count"));
    const at = { x: row.x + row.width / 2, y: row.y + row.height / 2 };
    const onRow = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("[data-testid='sheet-count']")), at);
    expect(onRow, `a finger at (${at.x}, ${at.y}) must land on the count row`).toBe(true);
    // 200px ≈ 30vh: 14 + 30 = 44vh, nearer HALF (45) than PEEK, so the lift
    // snaps open — unless the drag never reached the sheet.
    await dragSheetUp(page, at, 200);
    await sheetSettledAt(page, shell, 0.45);
  });
});

test.describe("manual › /map desktop ↔ phone: one control, one place (MEH-2776)", () => {
  test("every control sits in the same container in both shells", async ({ page }, info) => {
    desktopOnly(info, "one run measures both shells by resizing; the mobile project would repeat it");
    await seedGps(page, GPS_NEAR); // origin tag on
    await gotoWithCatalog(page, info, "/map?kosher=true"); // an active filter tag on
    await expect(page.getByTestId("map-desktop-shell").getByTestId("sort-origin-label")).toBeVisible(FIRST_PAINT);
    const desktop = await shellInventory(page, "map-desktop-shell");

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId("map-mobile-shell").getByTestId("sort-origin-label")).toBeVisible(FIRST_PAINT);
    const mobile = await shellInventory(page, "map-mobile-shell");

    // Control: the inventory must have seen the controls this test is about, in
    // BOTH shells. An empty or broken probe would otherwise pass (testing.md).
    for (const id of ["sort-origin", "map-active-filter-tag", "map-filters-button", "map-card"]) {
      expect(desktop.has(id), `desktop inventory saw ${id}`).toBe(true);
      expect(mobile.has(id), `phone inventory saw ${id}`).toBe(true);
    }

    const moved = [...desktop]
      .filter(([id, parent]) => mobile.has(id) && mobile.get(id) !== parent)
      .map(([id, parent]) => `${id}: desktop in ${parent}, phone in ${mobile.get(id)}`);
    expect(moved, "same control, different container").toEqual([]);

    const oneShell = [
      ...[...desktop.keys()].filter((id) => !mobile.has(id)).map((id) => ({ id, shell: "desktop", label: `desktop only: ${id}` })),
      ...[...mobile.keys()].filter((id) => !desktop.has(id)).map((id) => ({ id, shell: "phone", label: `phone only: ${id}` })),
    ];
    // An exemption names its shell: a desktop-only control showing up in the
    // phone shell alone is still a finding.
    expect(
      oneShell.filter(({ id, shell }) => SHELL_ONLY[id]?.shell !== shell).map(({ label }) => label),
      "control in one shell only — put it in both, or list it in SHELL_ONLY with why",
    ).toEqual([]);
    // The exemptions go stale too: an entry that gained a twin, or no longer
    // renders, would silently hide the drift it was written for.
    const seenOnce = new Set(oneShell.map(({ id }) => id));
    expect(Object.keys(SHELL_ONLY).filter((id) => !seenOnce.has(id)), "stale SHELL_ONLY entry").toEqual([]);
  });
});

test.describe("manual › /map categories + city live in the URL (MEH-2049 PR 2)", () => {
  // The list answers by the category id it is asked for, so the request that
  // wins is visible in the cards: meat → the meat producers only.
  const byCategory = (u: URL) => (u.searchParams.getAll("category").includes(String(CAT_MEAT.id)) ? MEAT : PRODUCERS);

  test("a copied /map?category_group=meat&city=… link restores both, and so does a reload", async ({ page }, info) => {
    await stubExternal(page);
    const catalog = await mockCatalog(page, byCategory);
    const cityInput = page.locator(isDesktop(info) ? "#map-city-search-desktop" : "#map-city-search-mobile");
    const cityName = "חיפה";

    for (const step of ["first visit", "reload"]) {
      if (step === "first visit") await gotoMap(page, `/map?category_group=meat&city=${encodeURIComponent(cityName)}`);
      else {
        catalog.seen.length = 0;
        await page.reload();
        await page.waitForFunction(() => (window as unknown as { __MAP_CENTER__?: unknown }).__MAP_CENTER__ !== undefined, null, MAP_MOUNT);
      }
      // The category load is the second /producers call (it needs /categories
      // for the id); it must carry the city too, and it must be what is shown.
      await expect
        .poll(() => catalog.seen.some((u) => u.searchParams.getAll("category").includes(String(CAT_MEAT.id)) && u.searchParams.get("near_city") === cityName), { timeout: 15_000 })
        .toBe(true);
      await expect(shellOf(page, info).getByTestId("map-card"), `${step}: only the meat producers`).toHaveCount(MEAT.length, FIRST_PAINT);
      // MEH-2951: /map streams. Until React's reveal script runs, the server
      // copy of the page (field still empty) sits in a hidden `S:n` div next
      // to the client-rendered one, so a strict id locator can see two. Read
      // the visible field, then wait for the DOM to settle on exactly one: a
      // second field that stays still fails.
      await expect(cityInput.filter({ visible: true }), `${step}: the city is back in the field`).toHaveValue(cityName);
      await expect(cityInput, `${step}: one city field once the page settles`).toHaveCount(1);
      const url = new URL(page.url());
      expect(url.searchParams.getAll("category_group"), `${step}: URL keeps the category`).toEqual(["meat"]);
      expect(url.searchParams.get("city"), `${step}: URL keeps the city`).toBe(cityName);
    }
  });

  test("invalid values are dropped silently: unknown category, a city that is not a name", async ({ page }, info) => {
    await stubExternal(page);
    const catalog = await mockCatalog(page, byCategory);
    await gotoMap(page, "/map?category_group=nope&city=%3Cscript%3E");
    // Settle first, on two signals the page cannot reach early: the URL has
    // been rewritten without the bad values (useMapFilters' run after
    // hydration), and the full list is drawn (the mount load answered). Only
    // then is "exactly one request" a claim about the page and not about how
    // soon the test looked — a broken build that sent a second, filtered load
    // a moment later would otherwise pass.
    await expect.poll(() => new URL(page.url()).search, { timeout: 10_000 }).toBe("");
    await expect(shellOf(page, info).getByTestId("map-card"), "the unfiltered list is drawn").toHaveCount(PRODUCERS.length, FIRST_PAINT);
    expect(catalog.seen, "one /producers request: the unfiltered mount load").toHaveLength(1);
    expect(catalog.seen[0].searchParams.getAll("category")).toEqual([]);
    expect(catalog.seen[0].searchParams.get("near_city")).toBeNull();
    expect(catalog.seen[0].searchParams.get("delivery_city")).toBeNull();
  });
});
