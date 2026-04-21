import { test, expect } from "@playwright/test";

test.describe("WhatsApp analytics", () => {
  test("clicking WhatsApp CTA fires analytics beacon", async ({ page }) => {
    const clickRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("whatsapp-click")) clickRequests.push(r.url());
    });

    // Navigate to the first available producer detail page
    await page.goto("/producers");
    const firstCard = page.locator('[data-testid="producer-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();
    await page.waitForURL(/\/producer\/|\/p\//);
    await page.waitForLoadState("domcontentloaded");

    // Block WhatsApp navigation so the test page stays active
    await page.route("https://wa.me/**", (route) => route.abort());

    const whatsappCta = page
      .locator(
        '[data-testid="primary-contact-button"][data-method="whatsapp"], [data-testid="whatsapp-cta"]'
      )
      .first();

    if ((await whatsappCta.count()) === 0) {
      test.skip(true, "No WhatsApp CTA on this producer — skip");
      return;
    }

    await whatsappCta.click();
    await page.waitForTimeout(500);

    // sendBeacon fires the analytics request — at least one must have been captured
    expect(
      clickRequests.length,
      "Expected whatsapp-click beacon to fire"
    ).toBeGreaterThanOrEqual(1);
  });
});
