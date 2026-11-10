import { test, expect, type Page } from "./_cloudinary-stub";

/**
 * Spec:  44-text-scale (MEH-2522)
 *
 * Readers who enlarge text, rather than zooming the whole page, get a bigger
 * root font size and the same viewport: Firefox "zoom text only", Safari text
 * size, Android font scale. Every `rem` in the layout grows and every `px`
 * stays put. WCAG 1.4.4 asks for 200% text without loss of content.
 *
 * The 28/10 sweep found that class on five surfaces, and each was a control
 * pushed out of the viewport:
 *   - the home filter row: «סינון» at x -186;
 *   - the /producers search button, at x -230;
 *   - the /group-buys city filter and status pills;
 *   - the /about/process CTA;
 *   - at 768px with 150% text, the header's «הרשמה» at x -90.
 *
 * Pass:  mobile project, 375px with 200% text; desktop project, 768px with 150%
 *        text and 1024px with 200% text. On each:
 *          - no horizontal page scroll;
 *          - no control outside the viewport's width (a control inside a
 *            horizontal scroller is skipped, since scrolling reaches it).
 * Control: the root font size really is the target, and the page measured
 *        more than 3 controls. A page that did not scale, or did not render,
 *        cannot pass by being empty.
 * Limit: the root size is set after load, so this sees CSS reflow only. A
 *        layout that measures the font size once in JS at mount would not see
 *        it. Every fix in MEH-2522 is CSS, and no such measurement exists today.
 * Settle: since MEH-2856 (#4233) one layout here IS measured in JS — the
 *        ProducerCard badge line (`useBadgesThatFit`) drops pills into «+N»
 *        from a layout effect, and re-fits on a root-font change through a
 *        ResizeObserver → React render. That converges, but not inside the two
 *        frames the probe used to wait: on /producers the cards are
 *        server-rendered, so a probe taken before hydration (or before the
 *        observer's render lands) sees the server's un-fitted cap of 2 pills.
 *        Staging run 42845330925 (mobile, /producers) reported that state on
 *        three cards — pills at negative x beside «הצגת עוד 1 תגיות», i.e. 2
 *        shown + 1 hidden, the un-fitted cap (a fit at 200% would have hidden
 *        more) — and passed on retry on the same build. Which of the two
 *        windows it hit is inferred, not reproduced: the sandbox cannot serve
 *        /producers with server-rendered cards (no backend). So the
 *        two control checks read the first sample, and the two layout checks
 *        poll until the layout has settled, bounded by SETTLE_MS: a control
 *        that stays outside the viewport still fails, with its name, and a
 *        layout that only reaches the viewport after the bound fails too.
 */

/** How long a JS-fitted layout may take to reach its final state. */
const SETTLE_MS = 5_000;

const ROUTES = ["/", "/producers", "/group-buys", "/events", "/about/process", "/join"];

type Probe = { rootPx: number; controls: number; offscreen: string[]; overflowX: number };

async function scale(page: Page, size: string): Promise<void> {
  await page.evaluate((s) => {
    document.documentElement.style.fontSize = s;
  }, size);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = {
      rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
      controls: 0,
      offscreen: [] as string[],
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
    const inScroller = (el: Element) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if ((ox === "auto" || ox === "scroll") && a.scrollWidth > a.clientWidth) return true;
      }
      return false;
    };
    const sel = "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab]";
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width <= 1 || r.height <= 1 || cs.visibility === "hidden") continue;
      if (el.closest("[aria-hidden=true], [inert]")) continue;
      out.controls++;
      if ((r.left < -0.5 || r.right > W + 0.5) && !inScroller(el)) {
        const name = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30);
        const where = el.closest("[data-testid]")?.getAttribute("data-testid") || "";
        out.offscreen.push(`${el.tagName.toLowerCase()} "${name}" @${where} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
      }
    }
    return out;
  });
}

test.describe("text scale: 200% text without lost controls (MEH-2522)", () => {
  for (const path of ROUTES) {
    test(path, async ({ page }, info) => {
      const passes = info.project.use.isMobile
        ? [{ width: 375, height: 812, scale: "200%" }]
        : [
            { width: 768, height: 1024, scale: "150%" },
            { width: 1024, height: 768, scale: "200%" },
          ];
      await page.setViewportSize({ width: passes[0].width, height: passes[0].height });
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
      for (const p of passes) {
        const tag = `${p.width}px, ${p.scale} text`;
        await page.setViewportSize({ width: p.width, height: p.height });
        await scale(page, p.scale);
        const r = await probe(page);
        expect(r.rootPx, `control (${tag}): the root font size scaled`).toBe(16 * (parseFloat(p.scale) / 100));
        expect(r.controls, `control (${tag}): the probe measured controls`).toBeGreaterThan(3);
        // Polled, not sampled once — see "Settle" in the header. The last
        // sample's list is what a failure prints.
        await expect
          .soft
          .poll(async () => (await probe(page)).offscreen, {
            message: `control outside the viewport width (${tag})`,
            timeout: SETTLE_MS,
          })
          .toEqual([]);
        await expect
          .soft
          .poll(async () => (await probe(page)).overflowX, {
            message: `horizontal page scroll (${tag}, px)`,
            timeout: SETTLE_MS,
          })
          .toBeLessThanOrEqual(0);
      }
    });
  }
});
