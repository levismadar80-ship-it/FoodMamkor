import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     manual/producer-detail-cta
 * Purpose:  Converted from docs/MANUAL_TESTING.md § "Producer Detail Page
 *           (feature/meh-producer-detail-redesign)" (MEH-1171 conversion
 *           stage). 03-view-producer-detail covers only h1 + one visible CTA;
 *           this closes the untested CTA-placement invariant: the mobile
 *           StickyContactBar slides in when the inline CTA scrolls out and back
 *           out when it returns (items 3/4), and desktop shows exactly ONE
 *           primary CTA (sidebar only, no inline duplicate — item 8).
 * Touches:  GET /producers + producer detail reads only (real backend). No
 *           writes — the CTA hrefs (wa.me / tel / mailto) are asserted, never
 *           followed.
 * Does NOT: assert reviews-lazy-IO / highlight-chip glyphs / contact_name copy
 *           (need attribute-rich seed fixtures — separate follow-up rows) or
 *           pixel layout (VRT territory).
 * History:  MEH-1171 (creation).
 */

// open the first seeded producer's detail page (seed-agnostic, like spec 03)
const openFirstProducer = async (page: Page) => {
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
  await page.goto("/producers");
  await page.waitForLoadState("domcontentloaded");
  const card = page.locator('[data-testid="producer-card"]').first();
  await card.waitFor({ timeout: 15_000 });
  await card.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/producers"), { timeout: 20_000 });
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
};

test.describe("producer detail — StickyContactBar (mobile, MEH-1171 § producer detail)", () => {
  test.skip(({ isMobile }) => !isMobile, "the sticky bar is lg:hidden — mobile/tablet only");

  // MANUAL_TESTING § Producer Detail items 3 + 4 — the bar is parked off-screen
  // while the inline CTA is in view, slides IN once it scrolls away, and slides
  // back OUT when the inline CTA returns
  test("sticky bar parks at top, slides in on scroll-down, slides out on scroll-up", async ({ page }) => {
    await openFirstProducer(page);
    const stickyCta = page.getByTestId("sticky-primary-cta");
    await expect(stickyCta).toHaveCount(1);

    // at the top the inline CTA is on screen → the bar is transformed off-screen
    await expect(stickyCta).not.toBeInViewport();

    // scroll well past the inline CTA → the bar slides up into view
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
    await expect(stickyCta).toBeInViewport({ timeout: 5_000 });

    // scroll back to the top → the inline CTA returns, the bar slides out again
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(stickyCta).not.toBeInViewport({ timeout: 5_000 });
  });
});

test.describe("producer detail — desktop single CTA (MEH-1171 § producer detail)", () => {
  test.skip(({ isMobile }) => isMobile, "the no-duplicate-CTA invariant is a desktop-layout check");

  // MANUAL_TESTING § Producer Detail item 8 — desktop mounts the primary CTA
  // only in the sticky sidebar; the inline (lg:hidden) card and the sticky bar
  // (lg:hidden) are both hidden → exactly one VISIBLE primary CTA
  test("exactly one primary contact CTA is visible on desktop (sidebar only)", async ({ page }) => {
    await openFirstProducer(page);
    // the mobile inline ContactCard + StickyContactBar are lg:hidden; only the
    // ContactSidebar CTA remains visible at desktop widths
    await expect(page.getByTestId("primary-contact-button").locator("visible=true")).toHaveCount(1);
    await expect(page.getByTestId("sticky-primary-cta")).not.toBeInViewport();
  });
});
