import { test, expect } from "./_cloudinary-stub";

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
      // MEH-932: default center is the Israel producer band [32.4, 34.95] zoom 8
      // (was Jerusalem [31.7683, 35.2137]). Pin lat to the producer band so a
      // regression back to the southern Jerusalem center (lat ~31.77) fails here,
      // and assert lon stays within Israel (34–36).
      expect(center[0], "Map lat should be on the producer band (~32.4)").toBeGreaterThan(32);
      expect(center[0], "Map lat should be on the producer band (~32.4)").toBeLessThan(33);
      expect(center[1], "Map lon should be within Israel (34–36)").toBeGreaterThan(34);
      expect(center[1], "Map lon should be within Israel (34–36)").toBeLessThan(36);
    } else {
      // __MAP_CENTER__ not yet set — fall back to confirming map rendered.
      // :visible avoids ambiguous multi-element match (two containers in DOM).
      await expect(page.locator(".leaflet-container:visible")).toBeVisible();
    }
  });

  // ---------------------------------------------------------------------------
  // MEH-1414 — camera persistence (anti-pogo-sticking, NN/g). The camera the
  // visitor leaves the map at is saved to sessionStorage["map_view_state"] on
  // her own moveend (30-min TTL) and restored as the FIRST setView on the next
  // /map mount, so browser-back from a producer page lands on the same spot.
  // `window.__MAP_CENTER__` is the initial camera — default on a fresh visit,
  // the restored one when something was saved — which is what these read.
  // ---------------------------------------------------------------------------
  const MAP_VIEW_KEY = "map_view_state";
  const waitForMapCenter = async (page: import("@playwright/test").Page) => {
    await page.waitForFunction(
      () => (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__ !== undefined,
      { timeout: 45_000 },
    );
    return page.evaluate(
      () => (window as unknown as { __MAP_CENTER__: [number, number] }).__MAP_CENTER__,
    );
  };

  test("MEH-1414: a fresh saved camera is restored on the next /map visit", async ({ page }) => {
    test.setTimeout(90_000);
    // Seeded BEFORE navigation, in every document of this context — the same
    // shape MapComponent writes. Far from the MEH-932 default so a default
    // render cannot pass this by accident.
    await page.addInitScript(
      ([key, value]) => window.sessionStorage.setItem(key, value),
      [MAP_VIEW_KEY, JSON.stringify({ lat: 31.25, lng: 34.79, zoom: 12, ts: Date.now() })] as const,
    );
    await page.goto("/map");
    const center = await waitForMapCenter(page);
    expect(center[0]).toBeCloseTo(31.25, 2);
    expect(center[1]).toBeCloseTo(34.79, 2);
  });

  test("MEH-1414: a saved camera older than 30 minutes is ignored — default camera unchanged", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript(
      ([key, value]) => window.sessionStorage.setItem(key, value),
      [
        MAP_VIEW_KEY,
        JSON.stringify({ lat: 31.25, lng: 34.79, zoom: 12, ts: Date.now() - 31 * 60 * 1000 }),
      ] as const,
    );
    await page.goto("/map");
    const center = await waitForMapCenter(page);
    // MEH-932 default band, same bounds the first test pins.
    expect(center[0]).toBeGreaterThan(32);
    expect(center[0]).toBeLessThan(33);
    expect(center[1]).toBeGreaterThan(34);
    expect(center[1]).toBeLessThan(36);
  });

  test("MEH-1414: a user pan writes the camera to sessionStorage; a fresh visit had written nothing", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/map");
    await waitForMapCenter(page);
    // Control — the programmatic initial setView must NOT count as a user move.
    expect(await page.evaluate((k) => window.sessionStorage.getItem(k), MAP_VIEW_KEY)).toBeNull();

    // LocationModal (z-[9000]) can open ~800ms after mount over the map —
    // dismiss it the way 07-gps-button.spec.ts does, so the drag lands on the map.
    const skipBtn = page.getByRole("button", { name: "דלגו לעכשיו" });
    try {
      await skipBtn.waitFor({ state: "visible", timeout: 2000 });
      await skipBtn.click();
      await skipBtn.waitFor({ state: "hidden", timeout: 2000 });
    } catch {
      // modal did not appear — proceed
    }

    const box = await page.locator(".leaflet-container:visible").boundingBox();
    if (!box) throw new Error("visible map container has no bounding box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 60, cy - 40, { steps: 8 });
    await page.mouse.move(cx - 120, cy - 80, { steps: 8 });
    await page.mouse.up();

    // Leaflet fires moveend after its inertia animation; poll rather than sleep.
    await expect
      .poll(async () => page.evaluate((k) => window.sessionStorage.getItem(k), MAP_VIEW_KEY), {
        timeout: 10_000,
      })
      .not.toBeNull();
    const saved = JSON.parse(
      (await page.evaluate((k) => window.sessionStorage.getItem(k), MAP_VIEW_KEY)) as string,
    );
    expect(typeof saved.lat).toBe("number");
    expect(typeof saved.lng).toBe("number");
    expect(typeof saved.zoom).toBe("number");
    // The drag moved the camera off the default; both coordinates must differ.
    expect(Math.abs(saved.lat - 32.4) + Math.abs(saved.lng - 34.95)).toBeGreaterThan(0.01);
  });

  test("MEH-1414: producer page shows «חזרה למפה» only when reached with ?from=map", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // ruach-hasadeh is the flagship demo business (seed_demo_business.py).
    await page.goto("/ruach-hasadeh?from=map");
    const back = page.getByTestId("back-to-map");
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", /\/map$/);
    await expect(back).toHaveText(/חזרה למפה|Back to map/);

    // Control — the same page without the referrer renders NO back link (0-state).
    await page.goto("/ruach-hasadeh");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByTestId("back-to-map")).toHaveCount(0);
  });
});
