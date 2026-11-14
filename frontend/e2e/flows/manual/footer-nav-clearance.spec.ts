/**
 * Module:   footer-nav-clearance.spec
 * Purpose:  MEH-2824 PR 3 (Sapir 08/11, option ב): on a phone, the bottom
 *           reserve for the floating BottomNav lives INSIDE the site footer,
 *           so the dark green runs to the screen edge — no cream strip under
 *           the footer behind the nav — and the footer's last line still
 *           clears the nav.
 * Does NOT: test the nav itself (BottomNav specs) or the reserve's value —
 *           `--bottom-inset` (globals.css) owns that sum; this spec only checks
 *           WHERE it is applied.
 * Related:  app/globals.css (MEH-2824 rule next to MEH-2487's) ·
 *           app/[locale]/layout.js body `pb-[var(--bottom-inset)]` ·
 *           components/FooterSlot.jsx (/map renders no footer).
 * History:  MEH-2824 (creation).
 */
import { test, expect, type Page } from "../_cloudinary-stub";

const PHONE = { width: 390, height: 844 };
const PAGES = ["/he/join", "/he", "/he/about"];

const rootVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

async function settle(page: Page, path: string, { phone = false } = {}) {
  // Consent seeded so the cookie banner is not up: its height is a separate,
  // live term of --bottom-inset and would change the numbers below.
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
  await page.goto(path);
  await expect(page.locator("footer[data-site-footer]")).toHaveCount(1, { timeout: 15_000 });
  // On a phone, wait until BottomNav has published its height (ResizeObserver
  // + 150ms debounce) rather than sleeping a fixed time.
  if (phone) await expect.poll(() => rootVar(page, "--bottom-nav-clearance"), { timeout: 10_000 }).not.toBe("");
  // Reaching the end changes the page's height: the mobile chat launcher
  // steps aside once a [data-chat-hide] element (the footer's form) is in
  // view, and its 64px reserve (--chat-fab-clearance, MEH-2835) leaves the
  // footer's padding. So one scrollTo can measure a page that is still moving
  // (seen as a 64px gap on /he/join and /he/about). Re-scroll until the
  // height has held for two reads in a row AND the viewport sits at the end.
  let last = -1;
  await expect
    .poll(
      async () => {
        const { h, gap } = await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          return {
            h: document.documentElement.scrollHeight,
            gap: Math.round(innerHeight + scrollY - document.documentElement.scrollHeight),
          };
        });
        const stable = h === last && gap >= -1;
        last = h;
        return stable;
      },
      { intervals: [300] },
    )
    .toBe(true);
}

/**
 * RGB of one viewport pixel, read from a real screenshot. Decoded in the page
 * (canvas getImageData) so the spec needs no PNG library — Knip's
 * unlisted-dependency ratchet, and MEH-2824's "no new deps".
 */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  const shot = await page.screenshot({ clip: { x, y, width: 1, height: 1 }, scale: "css" });
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, `data:image/png;base64,${shot.toString("base64")}`);
}

const rgb = (css: string) => (css.match(/\d+/g) || []).slice(0, 3).map(Number);

test.describe("MEH-2824 · footer reaches the screen edge under the floating nav (phone)", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  for (const path of PAGES) {
    test(`${path}: no cream strip under the footer, last line above the nav`, async ({ page }) => {
      await settle(page, path, { phone: true });
      const m = await page.evaluate(() => {
        const footer = document.querySelector("footer[data-site-footer]")!;
        // The visible pill (BottomNav.jsx `data-testid="bottom-nav"`), not its
        // full-width pointer-events-none shell.
        const nav = document.querySelector('[data-testid="bottom-nav"]');
        const leaves = [...footer.querySelectorAll("p, a, span, li, button")].filter(
          (e) => e.children.length === 0 && e.textContent!.trim() && e.getClientRects().length,
        );
        const lastTextBottom = Math.max(...leaves.map((e) => e.getBoundingClientRect().bottom));
        return {
          footerBottom: footer.getBoundingClientRect().bottom,
          innerHeight,
          navTop: nav ? nav.getBoundingClientRect().top : null,
          lastTextBottom,
          bodyBg: getComputedStyle(document.body).backgroundColor,
          bodyPad: parseFloat(getComputedStyle(document.body).paddingBottom),
          footerPad: parseFloat(getComputedStyle(footer).paddingBottom),
        };
      });
      expect(m.navTop, "control: the floating nav is on screen at this width").not.toBeNull();
      // Control (falsifiable): the cookie banner is down, so its live height —
      // a separate term of --bottom-inset — is not in the numbers below.
      expect(await rootVar(page, "--cookie-banner-h"), "control: no cookie banner up").toBe("");

      // The footer, not <body>, carries the reserve…
      expect.soft(m.footerPad, "the footer carries the bottom reserve").toBeGreaterThan(0);
      expect.soft(m.bodyPad, "body no longer pads under the footer").toBe(0);
      // …so the footer ends at the screen edge…
      expect.soft(Math.abs(m.footerBottom - m.innerHeight), "footer bottom = screen bottom").toBeLessThanOrEqual(1);
      // …and the bottom-edge pixel beside the nav pill is footer green, not cream.
      const edge = await pixel(page, 2, PHONE.height - 2);
      // Distance, not equality: the nav's shadow tints the cream by ~1 unit
      // (measured 244,239,231 vs 245,240,232), so `not.toEqual` would pass on
      // the very strip this test exists to catch. Footer green is >150 away.
      const bg = rgb(m.bodyBg);
      const distance = Math.max(...edge.map((c, i) => Math.abs(c - bg[i])));
      expect.soft(distance, `bottom-edge pixel ${edge} vs background ${bg}`).toBeGreaterThan(40);
      // The last line of footer text is still readable above the nav.
      expect.soft(m.lastTextBottom, "last footer line clears the nav").toBeLessThanOrEqual(m.navTop!);
    });
  }

  // MEH-3198: /map renders no site footer, and its shell already fills the
  // viewport (calc(100dvh - header)), so the body reserve only added a scroll —
  // measured 80px on a phone. The map shell drops it (globals.css). This test
  // used to assert the reserve stayed on <body> here; that was the bug.
  test("/map: no site footer, no body reserve, the page does not scroll", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    await page.goto("/he/map");
    await expect(page.locator("[data-map-shell=mobile]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("footer[data-site-footer]")).toHaveCount(0);
    // Control: the reserve is live on this page (BottomNav published its height),
    // so a zero below is the rule, not an unset variable.
    await expect.poll(() => rootVar(page, "--bottom-nav-clearance"), { timeout: 10_000 }).not.toBe("");
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom)), "body carries no bottom reserve on /map").toBe(0);
    // Polled: the shell's height is calc(100dvh - header) with the header
    // measured after mount, so the first frames can overflow by a few px
    // (seen: 18px once on CI) before the measurement lands.
    await expect
      .poll(() => page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight), {
        message: "nothing to scroll below the map",
        timeout: 5_000,
      })
      .toBeLessThanOrEqual(1);
  });

  // MEH-3198 follow-up: with the cookie banner up on a phone, the reserve is
  // the banner alone (not nav + banner), and the near-me pill at the bottom of
  // the map can still be scrolled clear of the banner and tapped.
  test("/map with the cookie banner up: reserve = banner, near-me pill reachable", async ({ page }) => {
    await page.goto("/he/map");
    await expect(page.locator("[data-map-shell=mobile]")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => rootVar(page, "--cookie-banner-h"), { timeout: 10_000 }).not.toMatch(/^(|0px)$/);
    const m = await page.evaluate(() => ({
      pad: parseFloat(getComputedStyle(document.body).paddingBottom),
      banner: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cookie-banner-h")),
    }));
    expect.soft(Math.abs(m.pad - m.banner), `body reserve ${m.pad} vs banner ${m.banner}`).toBeLessThanOrEqual(1);
    // trial: actionability only (no click side effects) — fails if the banner covers the pill.
    await page.getByTestId("map-near-me-pill").click({ trial: true, timeout: 5_000 });
  });
});

test.describe("MEH-2824 · desktop unchanged", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("/he/join: no reserve on desktop, on either element", async ({ page }) => {
    await settle(page, "/he/join");
    const m = await page.evaluate(() => ({
      body: getComputedStyle(document.body).paddingBottom,
      footer: getComputedStyle(document.querySelector("footer[data-site-footer]")!).paddingBottom,
    }));
    expect(m).toEqual({ body: "0px", footer: "0px" });
  });

  // MEH-3198: with the cookie banner up the body reserve on /map is the
  // banner's height and nothing more — the banner floats over the bottom of
  // the map, so that much scroll is what lets its last row be reached. The
  // banner is left showing (no consent stored), so the reserve is live.
  test("/map with the cookie banner up: the reserve is the banner only", async ({ page }) => {
    await page.goto("/he/map");
    await expect(page.locator("[data-map-shell=desktop]")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => rootVar(page, "--cookie-banner-h"), { timeout: 10_000 }).not.toMatch(/^(|0px)$/);
    const m = await page.evaluate(() => ({
      pad: parseFloat(getComputedStyle(document.body).paddingBottom),
      banner: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cookie-banner-h")),
    }));
    expect.soft(Math.abs(m.pad - m.banner), `body reserve ${m.pad} vs banner ${m.banner}`).toBeLessThanOrEqual(1);
  });
});
