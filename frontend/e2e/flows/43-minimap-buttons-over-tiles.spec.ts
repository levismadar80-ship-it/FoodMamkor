import { test, expect, type Page } from "@playwright/test";
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
 * button. With no tile there the button paints on top before AND after the
 * fix — the two-causes-for-one-green shape `.claude/rules/testing.md` names.
 * So every OSM tile is fulfilled with a solid magenta PNG, and the test waits
 * for a loaded tile whose box contains the button's centre before it reads the
 * button's pixels.
 */

// Fully saturated magenta: nothing in the button (white fill, brand-green
// icon, grey border) comes near it, so a magenta pixel inside the button's box
// can only be a tile painted over it.
const TILE_RGB = [255, 0, 255] as const;
// 1×1 PNG of TILE_RGB; Leaflet sizes every tile <img> to 256px, so it fills the
// tile box. Inlined so the spec needs no image library.
const TILE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z/AfAAQAAf93FxdGAAAAAElFTkSuQmCC", "base64");

const HAS_LOCATION = {
  label: "has lat and lng (the location section mounts the MiniMap only then)",
  matches: (p: FeedProducer) => p.lat != null && p.lng != null,
};

/**
 * Zoom levels of the LOADED tiles under the centre of the button named `name`,
 * read off the tile URL (`/{z}/{x}/{y}.png`). Empty = nothing under it yet.
 */
async function tileZoomsUnderButton(page: Page, name: string): Promise<number[]> {
  return page.evaluate((label) => {
    const btn = document.querySelector(`button[aria-label="${label}"]`);
    if (!btn) return [];
    const b = btn.getBoundingClientRect();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    return Array.from(btn.parentElement?.querySelectorAll<HTMLImageElement>("img.leaflet-tile-loaded") ?? [])
      .filter((t) => {
        const r = t.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      })
      .map((t) => Number(/\/(\d+)\/\d+\/\d+\.png/.exec(t.src)?.[1]))
      .filter((z) => Number.isFinite(z));
  }, name);
}

/**
 * Share of the button's pixels that are tile-magenta. Measured on PIXELS, not
 * `elementFromPoint`: Leaflet's tile container is `pointer-events: none`
 * (leaflet.css), so hit-testing falls through a tile to the button even while
 * the tile hides it — the buggy build passed an `elementFromPoint` version of
 * this check. The covered button was still tappable, just invisible.
 *
 * The screenshot is decoded by the browser itself (canvas), so the spec needs
 * no image library.
 */
async function tileShareOver(page: Page, name: string) {
  const shot = await page.getByRole("button", { name }).screenshot();
  return page.evaluate(
    async ([b64, rgb]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      // The button is a circle in a square box: the box corners are map,
      // legitimately (~21% of the box). Read only the central square — inside
      // the circle.
      const side = Math.floor(Math.min(img.width, img.height) * 0.6);
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, -Math.floor((img.width - side) / 2), -Math.floor((img.height - side) / 2));
      const { data } = ctx.getImageData(0, 0, side, side);
      let tilePx = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - rgb[0]) < 25 && Math.abs(data[i + 1] - rgb[1]) < 40 && Math.abs(data[i + 2] - rgb[2]) < 25) tilePx += 1;
      }
      return tilePx / (data.length / 4);
    },
    [shot.toString("base64"), [...TILE_RGB]] as const,
  );
}

/**
 * Waits for a loaded tile under the button — at `zoom` when given, so a check
 * after a zoom cannot pass on a stale tile from the previous level — then reads
 * the button's pixels. Returns the zoom level it saw.
 */
async function expectButtonOverTiles(page: Page, name: string, zoom?: number): Promise<number> {
  let seen: number[] = [];
  await expect
    .poll(
      async () => {
        seen = await tileZoomsUnderButton(page, name);
        return zoom === undefined ? seen.length > 0 : seen.includes(zoom);
      },
      {
        message: `no loaded tile${zoom === undefined ? "" : ` at z=${zoom}`} under "${name}" — the pixel check would not discriminate`,
        timeout: 15_000,
      },
    )
    .toBe(true);
  // Leaflet removes the previous level's tiles once the new ones are in; until
  // then a stale tile could sit on top. Wait for the zoom animation to finish.
  await expect(page.locator(".leaflet-zoom-anim")).toHaveCount(0);
  // A visible button reads 0 here; a covered one reads ~1.
  expect(await tileShareOver(page, name), `"${name}" is painted over by map tiles`).toBeLessThan(0.05);
  return zoom ?? Math.max(...seen);
}

test.describe("MiniMap — expand and close buttons paint above the tiles", () => {
  test("expand button, then the overlay X before and after a zoom", async ({ page, request }) => {
    const producer = await pickProducer(request, HAS_LOCATION);
    const pageErrors = watchPageErrors(page);
    await page.route(/tile\.openstreetmap\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: TILE_PNG }),
    );
    await openDetail(page, producer, pageErrors);

    const expand = page.getByRole("button", { name: "הגדלת המפה למסך מלא" });
    await expand.scrollIntoViewIfNeeded();
    await expectButtonOverTiles(page, "הגדלת המפה למסך מלא");

    await expand.click();
    const close = page.getByRole("button", { name: "סגירת המפה במסך מלא" });
    await expect(close).toBeVisible();
    const z0 = await expectButtonOverTiles(page, "סגירת המפה במסך מלא");

    // The reported path: a zoom re-tiles the whole viewport, including the
    // corner the X lives in.
    await page.locator('[role="dialog"] .leaflet-control-zoom-in').click();
    await expectButtonOverTiles(page, "סגירת המפה במסך מלא", z0 + 1);

    await close.click();
    await expect(page.locator('[role="dialog"] .leaflet-container')).toHaveCount(0);
  });
});
