import type { Locator } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";

/**
 * Spec:  manual/map-banner-controls (MEH-2517)
 *
 * The mobile map's control column (marker key, pickup layer) rides the bottom
 * sheet's top edge. While the cookie banner shows, MapClient lifts the pane's
 * bottom off the viewport's by the banner's footprint (MEH-945). Before this
 * card the ride was measured from the pane's bottom anyway, so the strip was
 * counted twice. On a short phone the column climbed over the Leaflet zoom
 * buttons and up onto the «סינון» row. Measured at 375x667: the key circle was
 * at y=240, and axe target-size failed on both zoom buttons.
 *
 * A first-visit user is exactly the case with the banner up, so both states
 * are pinned:
 *   banner up   - zoom buttons are hit-testable and the column clears them,
 *                 stays inside the map canvas, and stays above the banner.
 *   banner gone - the ride is unchanged: the layer toggle sits 68px above the
 *                 sheet's edge and the key 12px above the layer toggle.
 */

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 393, height: 727 },
  { width: 375, height: 812 },
];

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error("no bounding box: element is not rendered");
  return b;
}

async function openMap(page: Page, consented: boolean) {
  if (consented) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("cookieConsent", "essential"); // CookieBanner.jsx:30
      } catch {
        /* private mode */
      }
    });
  }
  await page.route(/tile\.openstreetmap\.org\//, (r) => r.fulfill({ status: 204, body: "" }));
  await page.goto("/map");
  const shell = page.getByTestId("map-mobile-shell");
  const zoomIn = shell.locator(".leaflet-control-zoom-in");
  const zoomOut = shell.locator(".leaflet-control-zoom-out");
  const key = shell.getByTestId("map-key-toggle-mobile");
  const layer = shell.getByTestId("pickup-layer-toggle-mobile");
  const canvas = shell.locator(".leaflet-container");
  for (const l of [zoomIn, zoomOut, key, layer]) await expect(l).toBeVisible({ timeout: 45_000 });
  if (consented) await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
  else await expect(page.getByTestId("cookie-banner")).toBeVisible();
  // The column animates `bottom` (--map-sheet-anim, 300ms): settle on a stable
  // position instead of a fixed wait.
  let last = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify([await box(key), await box(layer)]);
      const same = now === last;
      last = now;
      return same;
    }, { intervals: [150, 150, 250, 400] })
    .toBe(true);
  return { zoomIn, zoomOut, key, layer, canvas };
}

/**
 * True when a tap at the element's centre, and at the quarter points of its
 * diagonal, lands on it. Quarter points rather than corners: the column's
 * controls are circles, and a box corner is outside the circle.
 */
async function hitTestable(l: Locator): Promise<boolean> {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + r.width / 4, r.top + r.height / 4],
      [r.right - r.width / 4, r.bottom - r.height / 4],
    ];
    return pts.every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
  });
}

test.describe("manual › /map control column with the cookie banner up (MEH-2517)", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name === "desktop", "the sheet-edge column is the mobile shell's");
  });

  for (const vp of VIEWPORTS) {
    test(`${vp.width}x${vp.height} banner up: the column clears the zoom buttons and stays on the canvas`, async ({ page }) => {
      await page.setViewportSize(vp);
      const { zoomIn, zoomOut, key, layer, canvas } = await openMap(page, false);
      expect(await hitTestable(zoomIn), "zoom-in is covered").toBe(true);
      expect(await hitTestable(zoomOut), "zoom-out is covered").toBe(true);
      const zoomBar = await box(zoomIn.locator(".."));
      const c = await box(canvas);
      const banner = await box(page.getByTestId("cookie-banner"));
      for (const [name, l] of [["key", key], ["layer", layer]] as const) {
        const b = await box(l);
        expect(overlaps(b, zoomBar), `${name} toggle overlaps the zoom bar`).toBe(false);
        expect(b.y, `${name} toggle climbed above the map canvas`).toBeGreaterThanOrEqual(c.y);
        expect(b.y + b.height, `${name} toggle sits under the cookie banner`).toBeLessThanOrEqual(banner.y);
        expect(await hitTestable(l), `${name} toggle is covered`).toBe(true);
      }
    });

    test(`${vp.width}x${vp.height} banner gone: the column still rides the sheet edge`, async ({ page }) => {
      await page.setViewportSize(vp);
      const { key, layer } = await openMap(page, true);
      const sheet = await box(page.getByTestId("map-bottom-sheet"));
      const l = await box(layer);
      const k = await box(key);
      expect(Math.abs(sheet.y - (l.y + l.height) - 68), "layer toggle is not 68px above the sheet edge").toBeLessThanOrEqual(1);
      expect(Math.abs(l.y - (k.y + k.height) - 12), "key is not 12px above the layer toggle").toBeLessThanOrEqual(1);
    });
  }
});

// MEH-2524: the canvas's own `min-h-[500px]` used to come back once the banner
// was dismissed, so on a phone shorter than ~750px the canvas ran past the
// viewport (82px at 375x667). The OSM attribution rides the sheet edge measured
// from the canvas bottom, so it ended up under the sheet and the nav pill. It is
// an ODbL licence requirement, not decoration.
test.describe("manual › /map canvas fits the viewport and the OSM attribution shows (MEH-2524)", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name === "desktop", "the sheet and the 500px floor are the mobile shell's");
  });

  for (const vp of VIEWPORTS) {
    for (const consented of [true, false]) {
      test(`${vp.width}x${vp.height} banner ${consented ? "gone" : "up"}: canvas inside the viewport, attribution above the sheet`, async ({ page }) => {
        await page.setViewportSize(vp);
        const { canvas } = await openMap(page, consented);
        const attribution = page.getByTestId("map-mobile-shell").locator(".leaflet-control-attribution");
        await expect(attribution).toBeVisible();
        const c = await box(canvas);
        expect(c.y + c.height, "the map canvas runs past the bottom of the viewport").toBeLessThanOrEqual(vp.height + 0.5);
        const sheet = await box(page.getByTestId("map-bottom-sheet"));
        const a = await box(attribution);
        expect(a.y + a.height, "the attribution sits under the sheet's top edge").toBeLessThanOrEqual(sheet.y);
        expect(await hitTestable(attribution), "the attribution is covered").toBe(true);
      });
    }
  }
});
