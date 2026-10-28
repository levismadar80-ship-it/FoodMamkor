import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { openDetail, pickProducer, watchPageErrors, type FeedProducer } from "./_producer-fixture";

/**
 * The business-page mini map's expand button and its fullscreen overlay's close
 * (X) button must paint ABOVE the map tiles.
 *
 * The bug (reported from an iPhone on staging, 28/10): the overlay opened with
 * its X visible, and after one pan or zoom the X was gone — the overlay's only
 * exit. Both buttons are `z-10` siblings of the MapContainer; Leaflet's map pane
 * is `position:absolute; z-index:400` (leaflet.css `.leaflet-pane`), so with no
 * stacking context on the container the pane outranked the button. The X only
 * survived while the area under it was the grey, not-yet-tiled background.
 * Fix: `isolate` on the MapContainer (MiniMap.jsx), which keeps Leaflet's z
 * scale inside the map.
 *
 * ── Why the tiles are stubbed ─────────────────────────────────────────────────
 * The assertion is only discriminating when a tile actually sits under the
 * button. With no tile there the button paints on top before AND after the fix — the two-causes-for-one-green shape `.claude/rules/testing.md` names.
 * So every OSM tile is fulfilled with a solid magenta PNG, and the test waits
 * for a loaded tile whose box contains the button's centre before it reads the
 * button's pixels.
 */

// Fully saturated magenta: nothing in the button (white fill, brand-green
// icon, grey border) comes near it, so a magenta pixel inside the button's box
// can only be a tile painted over it.
const TILE_RGB = [255, 0, 255] as const;
let tilePng: Buffer | null = null;
async function tile(): Promise<Buffer> {
  tilePng ??= await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: TILE_RGB[0], g: TILE_RGB[1], b: TILE_RGB[2] } },
  })
    .png()
    .toBuffer();
  return tilePng;
}

const HAS_LOCATION = {
  label: "has lat and lng (the location section mounts the MiniMap only then)",
  matches: (p: FeedProducer) => p.lat != null && p.lng != null,
};

/** Is a LOADED tile under the centre of the button named `name`? */
async function tileUnderButton(page: Page, name: string) {
  return page.evaluate((label) => {
    const btn = document.querySelector(`button[aria-label="${label}"]`);
    if (!btn) return false;
    const b = btn.getBoundingClientRect();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    return Array.from(btn.parentElement?.querySelectorAll("img.leaflet-tile-loaded") ?? []).some((t) => {
      const r = t.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }, name);
}

/**
 * Share of the button's pixels that are tile-magenta. Measured on PIXELS, not
 * `elementFromPoint`: Leaflet's tile container is `pointer-events: none`
 * (leaflet.css), so hit-testing falls through a tile to the button even while
 * the tile hides it — the buggy build passed an `elementFromPoint` version of
 * this check. The covered button was still tappable, just invisible.
 */
async function tileShareOver(page: Page, name: string) {
  const shot = await page.getByRole("button", { name }).screenshot();
  // The button is a circle in a square box: the box corners are map, legitimately
  // (~21% of the box). Read only the inscribed central square — inside the circle.
  const meta = await sharp(shot).metadata();
  const side = Math.floor(Math.min(meta.width!, meta.height!) * 0.6);
  const { data, info } = await sharp(shot)
    .extract({
      left: Math.floor((meta.width! - side) / 2),
      top: Math.floor((meta.height! - side) / 2),
      width: side,
      height: side,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let tilePx = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 230 && data[i + 1] < 40 && data[i + 2] > 230) tilePx += 1;
  }
  return tilePx / (data.length / info.channels);
}

async function expectButtonOverTiles(page: Page, name: string) {
  await expect
    .poll(() => tileUnderButton(page, name), {
      message: `no loaded tile under "${name}" — the pixel check would not discriminate`,
      timeout: 15_000,
    })
    .toBe(true);
  // A visible button reads 0 here; a covered one reads ~1.
  expect(await tileShareOver(page, name), `"${name}" is painted over by map tiles`).toBeLessThan(0.05);
}

test.describe("MiniMap — expand and close buttons paint above the tiles", () => {
  test("expand button, then the overlay X before and after a zoom", async ({ page, request }) => {
    const producer = await pickProducer(request, HAS_LOCATION);
    const pageErrors = watchPageErrors(page);
    await page.route(/tile\.openstreetmap\.org/, async (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: await tile() }),
    );
    await openDetail(page, producer, pageErrors);

    const expand = page.getByRole("button", { name: "הגדלת המפה למסך מלא" });
    await expand.scrollIntoViewIfNeeded();
    await expectButtonOverTiles(page, "הגדלת המפה למסך מלא");

    await expand.click();
    const close = page.getByRole("button", { name: "סגירת המפה במסך מלא" });
    await expect(close).toBeVisible();
    await expectButtonOverTiles(page, "סגירת המפה במסך מלא");

    // The reported path: a zoom re-tiles the whole viewport, including the
    // corner the X lives in.
    await page.locator('[role="dialog"] .leaflet-control-zoom-in').click();
    await page.waitForTimeout(400); // zoom animation (leaflet default 250ms)
    await expectButtonOverTiles(page, "סגירת המפה במסך מלא");

    await close.click();
    await expect(page.locator('[role="dialog"] .leaflet-container')).toHaveCount(0);
  });
});
