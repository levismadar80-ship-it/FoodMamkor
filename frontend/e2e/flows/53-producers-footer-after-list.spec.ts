import { test, expect } from "./_cloudinary-stub";

/**
 * MEH-3874 — /producers: the next page of results never pushes the site footer
 * down while the footer is on screen.
 *
 * Infinite scroll appends the next page above the footer. When the footer was
 * in view at that moment, it jumped down by the height of the new rows: CLS
 * 0.147 on a slow phone (nav-throttled, MEH-3810). A scroll is not input, so
 * Chrome counts it for a real user too. While more pages are coming, the space
 * under the list is now padded by one screen (`producers-list`), so
 * the footer is off screen until the last page has arrived.
 *
 * The race depends on how slow the network is, so the spec makes it certain:
 * it holds the next-page request until the footer has been checked, then lets
 * it through. The request still goes to the real backend and its real answer
 * is used; only its timing is held (a stub, not a mock: e2e/CLAUDE.md). The
 * scroll leaves the last card's bottom 300 px above the screen's bottom edge,
 * where the old footer, under the 96 px spinner, was still in view.
 */

const LIMIT = 0.1;
/** Frames with no new shift before the append counts as settled (MEH-2972). */
const STILL_FRAMES = 60;
const MAX_FRAMES = 600;
const CARD_BOTTOM_ABOVE_EDGE = 300;
/** PAGE_SIZE in components/ProducersClient.jsx (= PER_PAGE in the page). The
 * fresh seed has 32 businesses, so there the held request is also the LAST
 * page (8 cards): the same append drops the reserved room, the step that could
 * pull the footer up into view, and the CLS sum covers it. */
const PAGE_SIZE = 24;

test.describe("MEH-3874 /producers: the next page lands with the footer off screen", () => {
  // eslint-disable-next-line playwright/no-skipped-test -- gated on the engine, which the product cannot move: WebKit reports no layout-shift entries, so the sum would read 0
  test.skip(({ browserName }) => browserName !== "chromium", "layout-shift entries are Chromium-only");

  // A test that fails before the release must not leave the request hanging.
  let release: () => void = () => {};
  test.afterEach(() => release());

  test("scroll to the last card: footer off screen, the append moves nothing in view", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __meh3874: { sum: number; n: number } };
      w.__meh3874 = { sum: 0, n: 0 };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          if (e.hadRecentInput) continue;
          w.__meh3874.sum += e.value;
          w.__meh3874.n += 1;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let asked = false;
    await page.route(
      (url) => url.pathname.endsWith("/producers") && url.searchParams.get("offset") === String(PAGE_SIZE),
      async (route) => {
        asked = true;
        await held;
        await route.continue();
      },
    );

    await page.goto("/producers");
    const cards = page.locator('[data-testid="producers-grid"] > *');
    await expect(cards, "the first page holds 24 businesses (the seed has more)").toHaveCount(PAGE_SIZE);
    const before = await page.evaluate(() => (window as unknown as { __meh3874: { sum: number } }).__meh3874.sum);

    // The scroll is repeated until the next page is asked for: a scroll that
    // lands before the list's scroll observer is attached asks for nothing.
    const scrollToLastCard = () =>
      page.evaluate((gap) => {
        const last = document.querySelector('[data-testid="producers-grid"]')!.lastElementChild!;
        const r = last.getBoundingClientRect();
        scrollTo(0, Math.max(0, scrollY + r.bottom - innerHeight + gap));
      }, CARD_BOTTOM_ABOVE_EDGE);
    await expect
      .poll(async () => {
        await scrollToLastCard();
        return asked;
      }, { message: "scrolling to the last card asks for the next page", timeout: 15_000 })
      .toBe(true);
    await scrollToLastCard();

    const footerTop = await page.evaluate(() => {
      const r = document.querySelector("footer[data-site-footer]")!.getBoundingClientRect();
      return { top: r.top, edge: innerHeight };
    });
    expect(footerTop.top, "the footer must be below the screen while the next page loads").toBeGreaterThanOrEqual(footerTop.edge);

    release();
    await expect.poll(() => cards.count(), { timeout: 15_000 }).toBeGreaterThan(PAGE_SIZE);
    const after = await page.evaluate(
      ({ still, max }) =>
        new Promise<number>((resolve) => {
          const w = window as unknown as { __meh3874: { sum: number; n: number } };
          let last = w.__meh3874.n;
          let quiet = 0;
          let frames = 0;
          const tick = () => {
            frames += 1;
            quiet = w.__meh3874.n === last ? quiet + 1 : 0;
            last = w.__meh3874.n;
            if (quiet >= still || frames >= max) resolve(w.__meh3874.sum);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      { still: STILL_FRAMES, max: MAX_FRAMES },
    );
    expect(after - before, "layout shift from the scroll to the settled append").toBeLessThanOrEqual(LIMIT);
  });
});
