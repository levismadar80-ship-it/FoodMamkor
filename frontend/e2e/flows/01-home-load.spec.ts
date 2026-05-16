import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("renders h1 and hero search input", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="hero-search"]')).toBeVisible({ timeout: 15_000 });
  });
});
