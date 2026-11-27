import { test, expect, type Page, type Route } from "./_cloudinary-stub";

/**
 * MEH-3944 — on a phone, the business page's «→ חזרה» row is on screen from
 * the first paint when a page of the site is behind this one, and the gallery
 * does not move when React takes over.
 *
 * Before, the row was added by hydration (HistoryBackLink read the history on
 * mount), above the gallery: 44px + 8px margin = the gallery went from y106 to
 * y158, CLS 0.154 on /kaveret-or-habosmat at 375px (load guard, flows/35:361,
 * run 46007776973). It only showed when hydration came after the first paint,
 * so the load guard caught it as a flake. This spec makes it deterministic: it
 * holds every JS chunk, so the page stays as the server sent it, reads the
 * row and the gallery, then lets React in and reads them again.
 *
 * Shown failing (PR body): with components/HistoryBackLink.jsx at its staging
 * version the «page behind» case is red at the first `toBeVisible`.
 */

const SLUG = "/kaveret-or-habosmat";
// JS only: the CSS chunks are render-blocking, and the pre-paint rule lives
// in them.
const CHUNKS = /\/_next\/static\/chunks\/.+\.js(?:\?|$)/;

/** Holds every JS chunk until `release()` — the page stays pre-hydration. */
async function holdChunks(page: Page) {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const handler = async (route: Route) => {
    await gate;
    await route.continue();
  };
  await page.route(CHUNKS, handler);
  return async () => {
    open();
    await page.unroute(CHUNKS, handler);
  };
}

const galleryY = (page: Page) =>
  page.locator("#section-images").evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));

/** React has read the history: the server mark is gone, or the button is. */
const hydrated = (page: Page) =>
  expect
    .poll(() => page.locator("[data-history-back-only]").count(), {
      message: "after hydration HistoryBackLink drops its pre-paint mark",
      timeout: 20_000,
    })
    .toBe(0);

test.describe("MEH-3944 «→ חזרה» is in the first paint, not added by hydration", () => {
  test.beforeEach(({}, testInfo) => {
    // eslint-disable-next-line playwright/no-skipped-test -- desktop: the row is lg:hidden there and the breadcrumb is the way back (MEH-3019), so this geometry cannot fail
    test.skip(testInfo.project.name !== "mobile", "phone only: the row is lg:hidden on desktop");
  });

  test("a page of the site behind: the row paints with the page and the gallery stays put", async ({ page }) => {
    await page.goto("/producers", { waitUntil: "domcontentloaded" });
    const release = await holdChunks(page);
    // A full load with a page of ours behind it (a reload, a plain link) —
    // the case a client-side navigation never shows.
    // "commit": a held script may also hold DOMContentLoaded.
    await page.goto(SLUG, { waitUntil: "commit" });

    const back = page.getByTestId("history-back");
    await expect(back, "pre-hydration: the server HTML carries the row").toHaveCount(1);
    await expect(back, "pre-hydration: the inline flag shows it before React").toBeVisible();
    await expect(page.locator("#section-images")).toBeVisible();
    const before = await galleryY(page);

    await release();
    await hydrated(page);
    await expect(back, "after hydration the row is still there").toBeVisible();
    expect(await galleryY(page), "the gallery must not move when React takes over").toBe(before);
  });

  test("control — landed from outside: no row before or after React, gallery stays put", async ({ page }) => {
    const release = await holdChunks(page);
    // "commit": a held script may also hold DOMContentLoaded.
    await page.goto(SLUG, { waitUntil: "commit" });

    const back = page.getByTestId("history-back");
    // In the server HTML, and hidden by the pre-paint rule: this is the cell
    // that proves the CSS hides it, not just that nothing rendered.
    await expect(back).toHaveCount(1);
    await expect(back).toBeHidden();
    await expect(page.locator("#section-images")).toBeVisible();
    const before = await galleryY(page);

    await release();
    await hydrated(page);
    await expect(back).toHaveCount(0);
    expect(await galleryY(page)).toBe(before);
  });
});
