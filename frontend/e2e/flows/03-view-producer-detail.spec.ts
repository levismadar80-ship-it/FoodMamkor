import { test, expect } from "@playwright/test";

test.describe("Producer detail", () => {
  test("clicking first producer card opens detail page with h1 and CTA", async ({ page }) => {
    await page.goto("/producers");
    const firstCard = page.locator('[data-testid="producer-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    await firstCard.click();
    // Detail pages live at /producer/:id or /p/:slug
    await page.waitForURL(/\/producer\/|\/p\//, { timeout: 10_000 });

    await expect(page.locator("h1").first()).toBeVisible();
    // Either the unified PrimaryContactButton or a standalone WhatsApp button
    await expect(
      page
        .locator('[data-testid="primary-contact-button"], [data-testid="whatsapp-cta"]')
        .first()
    ).toBeVisible();
  });
});
