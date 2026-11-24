import { test, expect, type Page } from "../_cloudinary-stub";
import { layoutSettled } from "../_layout-settled";

/**
 * MEH-3810 — every list, on a slow phone: scroll, open a card, come back.
 *
 * CI's network is fast, so the route loader (app/[locale]/loading.js) is on
 * screen for a frame or two and nothing that goes wrong around it is seen.
 * MEH-3800 was that: after scrolling a list, opening a card showed the footer
 * for up to 19 frames, because the loader painted at the old scroll offset.
 * This spec makes the loader stay up (Chromium CDP: slow 4G + CPU x4) and pins:
 *
 *   (a) in no sampled frame, between the click and the detail page, is the
 *       route loader on screen while the footer is in the viewport;
 *   (b) Back returns to the scroll offset the reader left (±100 px).
 *
 * Counted in animation frames, never milliseconds (testing.md, MEH-2972).
 * Control: across all lists the loader must paint in at least one frame —
 * otherwise the throttle did not take effect and (a) would be vacuous.
 *
 * The premise "group buys and experiences lose their place on Back" (sweep of
 * 24/11) was an artifact: the sweep's click scrolled the card into view first.
 * Re-measured on staging 24/11 with the card already in view: both restore.
 */

type List = { name: string; path: string; cards: string };

const LISTS: List[] = [
  { name: "home", path: "/", cards: '[data-testid="producer-card"] a[href]:not([href^="http"])' },
  { name: "all businesses", path: "/producers", cards: '[data-testid="producer-card"] a[href]:not([href^="http"])' },
  { name: "events", path: "/events", cards: 'main a[href^="/events/"]' },
  { name: "experiences", path: "/experiences", cards: 'main a[href^="/experiences/"]' },
  { name: "group buys", path: "/group-buys", cards: 'main a[href^="/group-buys/"]' },
];

const RESTORE_TOLERANCE_PX = 100;
const SAMPLE_CAP_FRAMES = 1800; // a stop for the sampler only; nothing is timed by it

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

/** Per animation frame: is the loader mounted, is the footer in the viewport. */
async function startSampler(page: Page) {
  await page.evaluate((cap) => {
    const w = window as unknown as { __nav: Array<{ loader: boolean; footer: boolean }> };
    w.__nav = [];
    const tick = () => {
      const footer = document.querySelector("footer[data-site-footer]");
      const r = footer?.getBoundingClientRect();
      w.__nav.push({
        loader: !!document.querySelector('[data-testid="route-loading"]'),
        footer: !!r && r.top < innerHeight && r.bottom > 0,
      });
      if (w.__nav.length < cap) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, SAMPLE_CAP_FRAMES);
}

async function readSamples(page: Page) {
  return page.evaluate(() => (window as unknown as { __nav: Array<{ loader: boolean; footer: boolean }> }).__nav);
}

test.describe("navigation on a slow phone (MEH-3810)", () => {
  test("scroll → open a card → back, on every list", async ({ page, browserName }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- gated on the browser engine, which the product cannot move: CDP throttling is Chromium-only
    test.skip(browserName !== "chromium", "CDP network and CPU throttling exist only in Chromium");
    test.setTimeout(240_000);
    await throttle(page);

    let loaderFramesTotal = 0;
    for (const list of LISTS) {
      await test.step(list.name, async () => {
        await page.goto(list.path);
        const cards = page.locator(list.cards);
        await expect(cards.first(), `${list.name}: no card on ${list.path} — the seeded list is empty`).toBeVisible({
          timeout: 60_000,
        });

        // The last card, scrolled to the middle of the screen: the deepest
        // place the reader can open something from on this list.
        const card = cards.last();
        await card.evaluate((el) => {
          const r = el.getBoundingClientRect();
          scrollTo(0, Math.max(0, scrollY + r.top - innerHeight / 2));
        });
        // A card taller than the lower half of the screen sticks out below
        // it, and Playwright's click would scroll it in first, so the place
        // the reader leaves from is not the place `before` read (group buys
        // on a phone: 11 px read, 241 px left from, 24/11). Let Playwright
        // make its move now, before the offset is read.
        await card.scrollIntoViewIfNeeded();
        await layoutSettled(card);
        const before = await page.evaluate(() => scrollY);
        const fromUrl = page.url();

        await startSampler(page);
        await card.click();
        await expect
          .poll(async () => page.url() !== fromUrl && !(await page.locator('[data-testid="route-loading"]').count()), {
            message: `${list.name}: the detail page never finished loading`,
            timeout: 60_000,
          })
          .toBe(true);
        const samples = await readSamples(page);
        const flash = samples.filter((s) => s.loader && s.footer).length;
        loaderFramesTotal += samples.filter((s) => s.loader).length;
        expect(flash, `${list.name}: footer in view under the route loader for ${flash} of ${samples.length} frames`).toBe(0);

        await page.goBack();
        await expect(cards.last()).toBeVisible({ timeout: 60_000 });
        // Unconditional: a list too short to scroll has before ≈ 0 and must
        // come back to ≈ 0, which is still a real check (MEH-3520 ratchet).
        await expect
          .poll(async () => Math.abs((await page.evaluate(() => scrollY)) - before), {
            message: `${list.name}: Back did not return to ${before}px (±${RESTORE_TOLERANCE_PX})`,
            timeout: 30_000,
          })
          .toBeLessThanOrEqual(RESTORE_TOLERANCE_PX);
      });
    }

    expect(loaderFramesTotal, "the route loader never painted on any list — the throttle did not take effect").toBeGreaterThan(0);
  });
});
