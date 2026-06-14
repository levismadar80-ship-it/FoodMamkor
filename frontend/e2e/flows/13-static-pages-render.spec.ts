import { test, expect } from "@playwright/test";

// Public, unauthenticated content pages must render their hero <h1> and a
// <main> landmark without crashing. No data dependency — these are static
// editorial pages (AboutClient / EventsClient). One concern per route.
test.describe("Static public pages", () => {
  test("/about renders a heading and main landmark", async ({ page }) => {
    await page.goto("/about");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });

  test("/events renders a heading and main landmark", async ({ page }) => {
    await page.goto("/events");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });
});
