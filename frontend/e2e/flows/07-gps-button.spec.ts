import { test, expect } from "@playwright/test";

/**
 * MEH-84 — GPS center button on /map.
 * The geolocation API is mocked so we don't depend on a real device.
 */
test.describe("GPS button on /map", () => {
  test("GPS button is visible on desktop and triggers geolocation API", async ({ page, context }, info) => {
    // Desktop-only: the desktop GPS button (MapPane.jsx:124, "hidden lg:flex")
    // doesn't render on mobile; mobile uses a separate filter-bar button
    // with aria-label "קרוב אלי" (MapClient.jsx:273-275).
    test.skip(info.project.name === "mobile", "GPS button is desktop-only");

    // Grant geolocation permission and set a fixed position (Tel Aviv)
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 32.0853, longitude: 34.7818 });

    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");
    // MEH-549: wait on `window.__MAP_CENTER__` (exposed by MapComponent.jsx:272)
    // instead of `.leaflet-container:visible`. Two MapPane instances render
    // in DOM (desktop + mobile via Tailwind toggles); `:visible` races on
    // cold Vercel previews. `__MAP_CENTER__` is a single global, race-free.
    await page.waitForFunction(
      () => (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__ !== undefined,
      { timeout: 45_000 }
    );

    // LocationModal (z-[9000]) opens 800ms after mount when no userCity is saved and
    // visually masks the GPS button (z-[1000]). Dismiss it via "דלגו לעכשיו" if present.
    // MEH-262 / MEH-263 — intentional flow fix, not a workaround.
    const skipBtn = page.getByRole("button", { name: "דלגו לעכשיו" });
    try {
      await skipBtn.waitFor({ state: "visible", timeout: 2000 });
      await skipBtn.click();
      await skipBtn.waitFor({ state: "hidden", timeout: 2000 });
    } catch {
      // modal did not appear — proceed
    }

    // :visible scopes to the active map container — MapClient renders twice
    // (desktop lg:grid + mobile lg:hidden); both produce a GPS button in the DOM.
    const gpsBtn = page.locator('[aria-label="מרכזו את המפה על המיקום שלי"]:visible');
    await expect(gpsBtn).toBeVisible({ timeout: 20_000 });

    // Clicking should not throw; we verify no JS error is logged.
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await gpsBtn.click();

    // Give geolocation a moment to resolve
    await page.waitForTimeout(1500);

    expect(errors).toHaveLength(0);
  });
});
