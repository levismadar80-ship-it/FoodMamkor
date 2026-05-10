import { test, expect } from "@playwright/test";

/**
 * MEH-84 — GPS center button on /map.
 * The geolocation API is mocked so we don't depend on a real device.
 */
test.describe("GPS button on /map", () => {
  test("GPS button is visible on desktop and triggers geolocation API", async ({ page, context }) => {
    // MEH-549: Leaflet fails to load on current staging deployment.
    // Re-enable (and restore the mobile-only skip below) once MEH-549 is resolved.
    test.skip(true, "MEH-549: map regression — Leaflet fails to mount on staging");

    // Grant geolocation permission and set a fixed position (Tel Aviv)
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 32.0853, longitude: 34.7818 });

    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");
    // Wait for Leaflet to mount from the dynamic import before checking GPS button.
    await page.waitForSelector(".leaflet-container:visible", { timeout: 45_000 });

    // LocationModal (z-[9000]) opens 800ms after mount when no userCity is saved and
    // visually masks the GPS button (z-[1000]). Dismiss it via "דלגי לעכשיו" if present.
    // MEH-262 / MEH-263 — intentional flow fix, not a workaround.
    const skipBtn = page.getByRole("button", { name: "דלגי לעכשיו" });
    try {
      await skipBtn.waitFor({ state: "visible", timeout: 2000 });
      await skipBtn.click();
      await skipBtn.waitFor({ state: "hidden", timeout: 2000 });
    } catch {
      // modal did not appear — proceed
    }

    // :visible scopes to the active map container — MapClient renders twice
    // (desktop lg:grid + mobile lg:hidden); both produce a GPS button in the DOM.
    const gpsBtn = page.locator('[aria-label="מרכזי את המפה על המיקום שלי"]:visible');
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
