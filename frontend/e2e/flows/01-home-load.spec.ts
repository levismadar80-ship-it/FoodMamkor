import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("renders h1 and hero search input", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
    // MEH-1122: a transient SSR→hydration duplicate of the hero-search input
    // (root cause tracked in MEH-1123) makes the bare, unscoped testid resolve
    // to 2 elements around the `load` event → Playwright strict-mode flake
    // (reproduced 14/25 against a prod build). Scope to the hero's role="search"
    // card + .first() so the assertion is single-target regardless of the
    // transient. Mirrors the scoping already used in e2e/visual/parity.spec.ts.
    await expect(
      page.getByRole("search").locator('[data-testid="hero-search"]').first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
