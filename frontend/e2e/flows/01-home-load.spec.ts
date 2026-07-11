import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("renders h1 and hero search input", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
    // MEH-1078: assert exactly one hero-search (retries until hydration settles)
    // so a transient double-mount can't trip a strict-mode "resolved to 2" flake.
    const heroSearch = page.locator('[data-testid="hero-search"]');
    await expect(heroSearch).toHaveCount(1, { timeout: 15_000 });
    await expect(heroSearch).toBeVisible({ timeout: 15_000 });
  });
});
