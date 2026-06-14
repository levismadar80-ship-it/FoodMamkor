import { test, expect } from "@playwright/test";

// Public browse journey: the /producers directory must render its <h1> and
// either a grid of producer cards or a graceful empty state — never a crash.
// Complements 02-search (search submit) and 03-detail (card → detail); this
// owns the directory *listing* surface and category-filtered navigation.
test.describe("Producers directory", () => {
  test("renders the directory heading and a card grid or empty state", async ({ page }) => {
    await page.goto("/producers");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main, [role='main']").first()).toBeVisible();

    // The page must resolve to one of the two valid states — cards OR a
    // non-empty main region (empty-state copy). Either way, no crash.
    const cards = page.locator('[data-testid="producer-card"]');
    await page
      .waitForFunction(
        () => document.querySelectorAll('[data-testid="producer-card"]').length > 0,
        { timeout: 10_000 },
      )
      .catch(() => {});
    const cardCount = await cards.count();
    if (cardCount > 0) {
      await expect(cards.first()).toBeVisible();
    } else {
      // Empty DB: the main region still renders meaningful content.
      const mainText = (await page.locator("main").first().innerText()).trim();
      expect(mainText.length).toBeGreaterThan(0);
    }
  });

  test("a category-filtered URL renders without crashing", async ({ page }) => {
    // Deep-link a category filter; the directory must render regardless of
    // whether the category yields results.
    await page.goto("/producers?category=bakery");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });
});
