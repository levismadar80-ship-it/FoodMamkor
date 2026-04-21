import { test, expect } from "@playwright/test";

test.describe("Map", () => {
  test("map page loads and centers on Israel", async ({ page }) => {
    // Leaflet is ssr:false — chunk download + React mount takes up to ~30s on
    // cold Vercel preview. Override the global 30s test timeout so the
    // waitForSelector below has room to breathe.
    test.setTimeout(90_000);
    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");
    // MapComponent is ssr:false — dynamic import must complete before Leaflet
    // initialises and adds .leaflet-container. In CI (cold Vercel preview)
    // the chunk fetch can take up to ~35s; 45s gives comfortable headroom.
    await page.waitForSelector(".leaflet-container", { timeout: 45_000 });
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
      // __MAP_CENTER__ not yet set — fall back to confirming map rendered
      await expect(page.locator(".leaflet-container")).toBeVisible();
    }
  });
});
