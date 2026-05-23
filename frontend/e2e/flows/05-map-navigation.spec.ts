import { test, expect } from "@playwright/test";

// Cold Vercel preview: Leaflet is ssr:false so the dynamic chunk fetch + React
// mount can take 30-45s. These overrides apply only to this spec file.
test.describe.configure({ retries: 1 });

test.describe("Map", () => {
  test.use({ actionTimeout: 15_000 });

  test("map page loads and centers on Israel", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");
    // MEH-549: wait on `window.__MAP_CENTER__` (exposed by MapComponent.jsx:272
    // immediately after `L.map().setView()` returns) instead of
    // `.leaflet-container:visible`. Two MapPane instances mount (desktop
    // hidden lg:grid + mobile lg:hidden); `:visible` races on the cold
    // Vercel preview against which container resolves first. `__MAP_CENTER__`
    // is a single global flag set by whichever instance initialises first,
    // so it's race-free. Timeout kept at 45s for cold dynamic-chunk fetch
    // (~35s observed). Production /map verified working 2026-05-14
    // (HANDOFF.md:1019).
    await page.waitForFunction(
      () => (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__ !== undefined,
      { timeout: 45_000 }
    );
    // Allow tile + marker loading
    await page.waitForTimeout(2000);

    const center = await page.evaluate(
      () => (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__
    );

    if (center) {
      // Israel: lat roughly 29 (Eilat) – 33.4 (Metula), lon 34–36
      expect(center[0], "Map lat should be within Israel").toBeGreaterThan(29);
      expect(center[0], "Map lat should be within Israel").toBeLessThan(34);
    } else {
      // __MAP_CENTER__ not yet set — fall back to confirming map rendered.
      // :visible avoids ambiguous multi-element match (two containers in DOM).
      await expect(page.locator(".leaflet-container:visible")).toBeVisible();
    }
  });
});
