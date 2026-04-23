import { test, expect } from "@playwright/test";

/**
 * MEH-84 — GPS center button on /map.
 * The geolocation API is mocked so we don't depend on a real device.
 */
test.describe("GPS button on /map", () => {
  test("GPS button is visible on desktop and triggers geolocation API", async ({ page, context }) => {
    // Grant geolocation permission and set a fixed position (Tel Aviv)
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 32.0853, longitude: 34.7818 });

    await page.goto("/map");
    await page.waitForLoadState("networkidle");

    // Button is desktop-only (hidden lg:flex). Resize to desktop viewport.
    await page.setViewportSize({ width: 1280, height: 800 });

    const gpsBtn = page.locator('[aria-label="מרכזי את המפה על המיקום שלי"]');
    await expect(gpsBtn).toBeVisible({ timeout: 10_000 });

    // Clicking should not throw; we verify no JS error is logged.
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await gpsBtn.click();

    // Give geolocation a moment to resolve
    await page.waitForTimeout(1500);

    expect(errors).toHaveLength(0);
  });
});
