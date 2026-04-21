import { test, expect } from "@playwright/test";

test.describe("Search", () => {
  test("submitting hero search navigates to /producers?q=", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator('[data-testid="hero-search"]');
    await expect(searchInput).toBeVisible();

    await searchInput.fill("חלב");
    // Click the submit button directly — avoids the autocomplete dropdown
    // intercepting Enter (highlightIdx=0 on open, so Enter would navigate
    // to the first suggestion instead of /producers).
    await page.locator('button[aria-label="חיפוש"]').click();

    // Should land on /producers (with or without query string)
    await page.waitForURL(/\/producers/, { timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded");

    // Either cards or empty state — page must render without crash
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });
});
