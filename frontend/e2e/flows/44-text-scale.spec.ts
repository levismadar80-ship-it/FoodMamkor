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
 */

const ROUTES = ["/", "/producers", "/group-buys", "/events", "/about/process", "/join"];

type Probe = { rootPx: number; controls: number; offscreen: string[]; overflowX: number };

async function scaleAndProbe(page: Page, scale: string): Promise<Probe> {
  await page.evaluate((s) => {
    document.documentElement.style.fontSize = s;
  }, scale);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
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
        const r = await scaleAndProbe(page, p.scale);
        expect(r.rootPx, `control (${tag}): the root font size scaled`).toBe(16 * (parseFloat(p.scale) / 100));
        expect(r.controls, `control (${tag}): the probe measured controls`).toBeGreaterThan(3);
        expect.soft(r.offscreen, `control outside the viewport width (${tag})`).toEqual([]);
        expect.soft(r.overflowX, `horizontal page scroll (${tag}, px)`).toBeLessThanOrEqual(0);
      }
    });
  }
});
