import { test, expect } from "@playwright/test";

/**
 * MEH-84 — GPS center button on /map.
 * The geolocation API is mocked so we don't depend on a real device.
 */
test.describe("GPS button on /map", () => {
  test("GPS button is visible on desktop and triggers geolocation API", async ({ page, context }, info) => {
    // Desktop-only: the desktop GPS button (MapPane.jsx:160, "hidden lg:flex"
    // — citation re-derived 2026-08-10, it read :124 and had drifted) doesn't
    // render below Tailwind's `lg` (1024px); mobile uses a separate filter-bar
    // button with aria-label "קרוב אלי" (MapClient.jsx:273-275).
    // MEH-1590: assert what this test REQUIRES (`!== "desktop"`), never list
    // what to exclude. The previous form was `=== "mobile"`, which stopped
    // guarding the moment a third project appeared: `webkit-iphone13` (390px,
    // playwright.config.ts:161) is a phone whose name is not "mobile", so the
    // skip did not fire, the `hidden lg:flex` button was legitimately absent,
    // and the spec reported "element(s) not found" as a failure. Every other
    // project guard in this suite already uses the `!==` form (12 of the 13 —
    // 14-language-toggle.spec.ts:36 explains why); this was the lone outlier.
    test.skip(info.project.name !== "desktop", "GPS button is desktop-only");

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
