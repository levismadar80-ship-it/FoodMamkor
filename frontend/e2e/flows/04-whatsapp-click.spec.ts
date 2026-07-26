import { test, expect } from "@playwright/test";

test.describe("WhatsApp analytics", () => {
  test("clicking WhatsApp CTA fires analytics beacon", async ({ page }) => {
    // Use page.route() — more reliable than page.on('request') for sendBeacon
    let beaconFired = false;
    await page.route("**/whatsapp-click", (route) => {
      beaconFired = true;
      route.continue();
    });

    // Navigate to first available producer detail page
    await page.goto("/producers");
    const firstCard = page.locator('[data-testid="producer-card"]').first();
    await page.waitForLoadState("domcontentloaded");
    if ((await firstCard.count()) === 0) {
      test.skip(true, "No producers in staging DB — skip");
      return;
    }
    // MEH-1369: click the card's inner nav anchor (real <a href>), not the
    // <article> wrapper whose click races hydration. See parity.spec.ts header.
    await firstCard.locator('a[href^="/"]').first().click();
    // Detail pages: /producer/:id, /p/:slug, or /{slug} (top-level for slugged producers)
    await page.waitForURL(url => !url.pathname.startsWith('/producers'), { timeout: 20_000 });
    await page.waitForLoadState("domcontentloaded");
    // MEH-1550: the predicate above is permissive (a 404/redirect satisfies it),
    // and Next's error document has its own <h1> — so without this the CTA
    // assertion below would fail as "CTA missing" on what is really a failed
    // navigation. Name the actual cause instead.
    await expect(
      page.locator("#__next_error__"),
      "navigation failed — landed on Next's error page instead of a producer detail",
    ).toHaveCount(0);

    // Block WhatsApp navigation so the test page stays active
    await page.route("https://wa.me/**", (route) => route.abort());

    // MEH-1467: the standalone WhatsAppButton (data-testid="whatsapp-cta") was
    // removed as orphaned; the producer-detail primary CTA is now
    // PrimaryContactButton (data-testid="primary-contact-button"). Its
    // ContactCard/StickyContactBar onClick fires pingWhatsAppBeacon +
    // markWhatsAppClickedLocal (the MEH-1426 attribution + review-unlock chain)
    // — but ONLY for a WhatsApp-method producer, so guard on data-method.
    const primaryCta = page.locator('[data-testid="primary-contact-button"]').first();
    if ((await primaryCta.count()) === 0) {
      test.skip(true, "No primary contact CTA on this producer's detail page — skip");
      return;
    }
    const method = await primaryCta.getAttribute("data-method");
    if (method !== "whatsapp") {
      test.skip(true, `Primary contact is "${method}", not whatsapp — beacon only fires for whatsapp — skip`);
      return;
    }

    await primaryCta.click();
    await page.waitForTimeout(500);

    expect(beaconFired, "whatsapp-click beacon did not fire").toBe(true);
  });
});
