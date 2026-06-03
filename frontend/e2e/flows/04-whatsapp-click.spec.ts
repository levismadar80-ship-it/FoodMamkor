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
    await firstCard.click();
    // Detail pages: /producer/:id, /p/:slug, or /{slug} (top-level for slugged producers)
    await page.waitForURL(url => !url.pathname.startsWith('/producers'), { timeout: 20_000 });
    await page.waitForLoadState("domcontentloaded");

    // Block WhatsApp navigation so the test page stays active
    await page.route("https://wa.me/**", (route) => route.abort());

    // WhatsAppButton (data-testid="whatsapp-cta") fires the analytics beacon.
    // PrimaryContactButton (data-testid="primary-contact-button") does NOT.
    const whatsappCta = page.locator('[data-testid="whatsapp-cta"]').first();
    if ((await whatsappCta.count()) === 0) {
      test.skip(true, "No whatsapp-cta on this producer's detail page — skip");
      return;
    }

    await whatsappCta.click();
    await page.waitForTimeout(500);

    expect(beaconFired, "whatsapp-click beacon did not fire").toBe(true);
  });
});
