import { test, expect } from "./_cloudinary-stub";

/**
 * MEH-3718 — a streamed page hydrates the HTML the server sent; nothing makes
 * React throw it away and render the page again in the browser.
 *
 * Every page under app/[locale] streams inside the loading.js boundary. A page
 * bigger than React's progressive chunk arrives as a hidden segment, and React
 * reveals it no sooner than 300 ms after the first paint (its inline `$RV`).
 * Until then the boundary is queued (`$~`). A context update that reaches it in
 * that window (on 26/11: the AuthProvider's guest `loading: false`) is not
 * deferred: React renders the page from scratch in the browser, and the hidden
 * server copy stays beside it until the reveal. Two `login-register-link`s, two
 * `hero-search` boxes (strict-mode flakes MEH-3718, MEH-3834), and a page that
 * was client-rendered after all.
 *
 * The race depends on how fast the runner is. This spec makes it certain: it
 * holds React's reveal for HOLD_FRAMES frames (frames, not ms: MEH-2972), so
 * every mount-time update lands while the page is queued. At the reveal, the
 * boundary's server marker (`B:<n>`) must still be in the document: React
 * removes it when it throws the server HTML away.
 *
 * NO MOCKS: real backend, real build. The pages are ones that stream outlined
 * today; a page that stops doing so fails the poll below and says so.
 */

const HOLD_FRAMES = 60;
/** Each page, and the element that showed up twice while it was queued
 *  (MEH-3718 login-register-link · MEH-3834 hero-search), or null. */
const PAGES: Array<[string, string | null]> = [
  ["/", "hero-search"],
  ["/login", "login-register-link"],
  ["/producers", null],
  ["/events", null],
  ["/about", null],
  ["/recommend", null],
];

type Revealed = { id: string; kept: boolean; copies: number };

test.describe("MEH-3718 a streamed page hydrates the server HTML it was sent", () => {
  // The held reveal shows the route loader for a second on purpose: the CLS it
  // causes is the construction, not the product. Console errors still fail.
  test.use({ loadGuard: "errors" });

  for (const [path, once] of PAGES) {
    test(`${path}: the streamed content is hydrated, not rendered again`, async ({ page }) => {
      await page.addInitScript(({ hold, once }) => {
        const w = window as unknown as { __meh3718: Revealed[] };
        w.__meh3718 = [];
        let reveal: ((batch: Element[]) => void) | undefined;
        Object.defineProperty(window, "$RV", {
          configurable: true,
          set(fn) {
            reveal = fn;
          },
          get() {
            return (
              reveal &&
              function held(queue: Element[]) {
                const batch = queue.slice();
                queue.length = 0;
                let frames = 0;
                const tick = () => {
                  frames += 1;
                  if (frames < hold) {
                    requestAnimationFrame(tick);
                    return;
                  }
                  for (let i = 0; i < batch.length; i += 2) {
                    // Counted the frame before the reveal: the window in which
                    // the two copies were seen.
                    const copies = once ? document.querySelectorAll(`[data-testid="${once}"]`).length : 1;
                    w.__meh3718.push({ id: batch[i].id, kept: batch[i].isConnected, copies });
                  }
                  reveal?.(batch);
                };
                requestAnimationFrame(tick);
              }
            );
          },
        });
      }, { hold: HOLD_FRAMES, once });

      const res = await page.goto(path);
      expect(res?.ok(), `${path} must load 2xx`).toBeTruthy();
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __meh3718: Revealed[] }).__meh3718.length), {
          message: `${path} revealed no streamed boundary: it no longer streams outlined, so this case measures nothing`,
          timeout: 15_000,
        })
        .toBeGreaterThan(0);
      const revealed = await page.evaluate(() => (window as unknown as { __meh3718: Revealed[] }).__meh3718);
      expect(revealed.every((b) => b.id.startsWith("B:")), "the reveal batch pairs a B: marker with its S: segment").toBe(true);
      expect(revealed.filter((b) => !b.kept), "boundaries React rendered again in the browser").toEqual([]);
      if (once) {
        expect(revealed.map((b) => b.copies), `[data-testid="${once}"] before the reveal`).toEqual(revealed.map(() => 1));
      }
    });
  }
});
