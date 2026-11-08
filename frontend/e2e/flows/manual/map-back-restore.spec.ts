import { test, expect, type Page } from "../_cloudinary-stub";

/**
 * Spec:     manual/map-back-restore (MEH-2049 PR 1)
 * Purpose:  Back from a producer page, /map shows the same camera and the
 *           same selected business (card open). Phase 0 (staging, 08/11,
 *           Chromium + WebKit) measured the bug: picking a business from the
 *           list or a pin selects through a programmatic flyTo, which was
 *           never saved, so back landed on the default view with no card.
 * Locators: data-testid only (docs/E2E-LOCATORS.md). The selected card is the
 *           phone shell's (MobileSheetSelectedCard), so this runs on the
 *           mobile project only.
 * Reads:    sessionStorage["map_view_state"] (lib/map-view-state.js) right
 *           before leaving = the camera the visitor saw; window.__MAP_CENTER__
 *           after back = the camera the map opened on.
 */

const FIRST_PAINT = { timeout: 45_000 };

async function waitForMap(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __MAP_CENTER__?: unknown }).__MAP_CENTER__ !== undefined, null, FIRST_PAINT);
}

async function savedCamera(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("map_view_state") || "null"));
}

async function selectedName(page: Page) {
  return page.getByTestId("map-selected-card").locator("h3").first().textContent();
}

async function leaveAndComeBack(page: Page) {
  const before = await savedCamera(page);
  const name = await selectedName(page);
  await page.getByTestId("map-selected-card").locator('a[href*="from=map"]').first().click();
  await page.waitForURL((u) => !u.pathname.endsWith("/map"), FIRST_PAINT);
  await page.goBack();
  await waitForMap(page);
  const center = await page.evaluate(() => (window as unknown as { __MAP_CENTER__: [number, number] }).__MAP_CENTER__);
  return { before, name, center };
}

test.describe("manual › /map back-navigation restores camera + selection (MEH-2049)", () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "the selected card is the phone shell's");
    test.setTimeout(120_000);
    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
  });

  test("a business picked from the list: same camera, same card after back", async ({ page }) => {
    await page.goto("/map");
    await waitForMap(page);
    await page.getByTestId("map-sheet-content").getByTestId("map-card").first().click();
    await expect(page.getByTestId("map-selected-card")).toBeVisible();
    // The selection is saved with the camera on screen (Phase 0: nothing was
    // saved before leaving, so back showed no card).
    await expect.poll(async () => (await savedCamera(page))?.selectedId ?? null).not.toBeNull();
    const { before, name, center } = await leaveAndComeBack(page);
    expect(center[0]).toBeCloseTo(before.lat, 2);
    expect(center[1]).toBeCloseTo(before.lng, 2);
    await expect(page.getByTestId("map-selected-card")).toBeVisible(FIRST_PAINT);
    expect(await selectedName(page)).toBe(name);
  });

  test("closing the card before leaving: back restores the camera with no card", async ({ page }) => {
    await page.goto("/map");
    await waitForMap(page);
    await page.getByTestId("map-sheet-content").getByTestId("map-card").first().click();
    await expect(page.getByTestId("map-selected-card")).toBeVisible();
    await page.getByTestId("map-selected-card-close").click();
    await expect(page.getByTestId("map-selected-card")).toHaveCount(0);
    await expect.poll(async () => (await savedCamera(page))?.selectedId ?? null).toBeNull();
    const before = await savedCamera(page);
    await page.goto("/about");
    await page.goBack();
    await waitForMap(page);
    const center = await page.evaluate(() => (window as unknown as { __MAP_CENTER__: [number, number] }).__MAP_CENTER__);
    expect(center[0]).toBeCloseTo(before.lat, 2);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("map-selected-card")).toHaveCount(0);
  });

  test("a fresh visit is the default view with no card", async ({ page }) => {
    await page.goto("/map");
    await waitForMap(page);
    const center = await page.evaluate(() => (window as unknown as { __MAP_CENTER__: [number, number] }).__MAP_CENTER__);
    expect(center).toEqual([32.4, 34.95]);
    await expect(page.getByTestId("map-selected-card")).toHaveCount(0);
  });
});
