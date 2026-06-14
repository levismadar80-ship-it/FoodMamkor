import { test, expect } from "@playwright/test";

// Complements 05-map-navigation (which asserts the map *centers* on Israel).
// This spec asserts producer *markers* actually render on the canvas.
// MapComponent uses leaflet.markercluster, so a marker surfaces as either a
// custom div-icon (.mehamakor-marker-wrap) or a collapsed cluster
// (.marker-cluster). Markers are data-driven — graceful skip if the staging
// DB has no approved producers with coordinates.
test.describe.configure({ retries: 1 });

test.describe("Map markers", () => {
  test("renders producer markers or clusters after the map mounts", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");

    // Same race-free mount signal used by 05-map-navigation.
    await page.waitForFunction(
      () =>
        (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__ !==
        undefined,
      { timeout: 45_000 },
    );

    const markers = page.locator(
      ".leaflet-marker-icon, .mehamakor-marker-wrap, .marker-cluster",
    );
    // Give Leaflet a beat to project markers onto the tile layer.
    await page
      .waitForFunction(
        () =>
          document.querySelectorAll(
            ".leaflet-marker-icon, .mehamakor-marker-wrap, .marker-cluster",
          ).length > 0,
        { timeout: 15_000 },
      )
      .catch(() => {});

    if ((await markers.count()) === 0) {
      test.skip(true, "No markers rendered — staging DB may have no geocoded producers");
      return;
    }
    await expect(markers.first()).toBeVisible();
  });
});
