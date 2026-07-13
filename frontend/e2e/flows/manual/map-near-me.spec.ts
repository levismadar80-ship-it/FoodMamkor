import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     manual/map-near-me
 * Purpose:  Converted from docs/MANUAL_TESTING.md § "MEH-970 chunk 2-lite —
 *           /map near-me pill + empty-near-me guard (mobile)" (MEH-1171
 *           conversion stage). The mobile near-me flow was previously
 *           untestable dogma — 07-gps-button.spec.ts skips the mobile project
 *           entirely; this spec closes that hole with mocked geolocation
 *           (no real GPS needed, exactly as the matrix predicted).
 * Touches:  GET /producers reads only. Geolocation is mocked per test.
 * Does NOT: run on desktop — the pill is the MOBILE affordance (the desktop
 *           near-me entry is 07-gps-button's territory).
 * History:  MEH-1171 (creation).
 */

// seeded businesses sit around central/northern Israel; Eilat is >25km from all
const TEL_AVIV = { latitude: 32.0853, longitude: 34.7818 };
const EILAT = { latitude: 29.5577, longitude: 34.9519 };
const EMPTY_TOAST = "אין עדיין עסקים באזורך — הנה הקרובים";

test.describe("/map near-me pill (MEH-970 chunk 2-lite)", () => {
  test.skip(({ isMobile }) => !isMobile, "the near-me pill is the mobile affordance");

  const openMap = async (page: Page) => {
    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");
    // MEH-549 gotcha (REUSES 05-map-navigation.spec.ts:14-27): TWO MapPane
    // instances mount (hidden desktop lg:grid + visible mobile lg:hidden) —
    // visibility-waits on .leaflet-container race/resolve to the hidden one.
    // window.__MAP_CENTER__ is the race-free mounted signal.
    await page.waitForFunction(
      () => (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__ !== undefined,
      { timeout: 45_000 },
    );
    await page.waitForTimeout(2000); // tile + marker loading
  };

  // MANUAL_TESTING § MEH-970 chunk 2-lite item 1 — single pill, no extra crosshair
  test("exactly one קרוב אליי pill floats on the mobile map", async ({ page }) => {
    await openMap(page);
    await expect(page.getByRole("button", { name: "הצגת בתי עסק קרובים למיקום שלי" })).toHaveCount(1);
  });

  // MANUAL_TESTING § MEH-970 chunk 2-lite item 2 — grant near businesses → fly, no toast
  test("granting location near businesses flies the map with no toast", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(TEL_AVIV);
    await openMap(page);
    await page.getByRole("button", { name: "הצגת בתי עסק קרובים למיקום שלי" }).click();
    await page.waitForTimeout(2000); // flyTo duration 1.2s
    await expect(page.getByText(EMPTY_TOAST)).toBeHidden(); // no empty toast
    // map alive — markers may cluster (REUSES 15-map-markers selector set)
    await expect
      .poll(async () =>
        page.locator(".leaflet-marker-icon, .mehamakor-marker-wrap, .marker-cluster").count(),
      )
      .toBeGreaterThan(0);
  });

  // MANUAL_TESTING § MEH-970 chunk 2-lite item 3 — empty 25km radius → toast + default view, never an empty map
  test("no businesses within 25km shows the guard toast and falls back to the full default view", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(EILAT);
    await openMap(page);
    await page.getByRole("button", { name: "הצגת בתי עסק קרובים למיקום שלי" }).click();
    await expect(page.getByText(EMPTY_TOAST)).toBeVisible();
    // zoomed back out to the default view → businesses visible, never an empty map
    await expect
      .poll(
        async () =>
          page.locator(".leaflet-marker-icon, .mehamakor-marker-wrap, .marker-cluster").count(),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });

  // MANUAL_TESTING § MEH-970 chunk 2-lite item 4 — deny → LocationModal, not a dead toast
  test("denying location opens the city-search modal instead of a dead toast", async ({ page }) => {
    // no grantPermissions → getCurrentPosition rejects with PERMISSION_DENIED
    await openMap(page);
    await page.getByRole("button", { name: "הצגת בתי עסק קרובים למיקום שלי" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(EMPTY_TOAST)).toBeHidden();
  });
});
