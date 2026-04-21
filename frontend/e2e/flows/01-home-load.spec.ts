import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("renders h1, hero search input, and has no JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator('[data-testid="hero-search"]')).toBeVisible();
    // Allow async components (producer cards, social proof) to settle
    await page.waitForTimeout(2000);
    expect(errors, `JS errors: ${errors.join(", ")}`).toHaveLength(0);
  });
});
