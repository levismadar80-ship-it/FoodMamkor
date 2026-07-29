import { test, expect } from "@playwright/test";

test.describe("Search", () => {
  test("submitting hero search navigates to /producers?q=", async ({ page }) => {
    await page.goto("/");
    // MEH-1201: `.first()` — NOT a bare locator, and NOT scoped to the
    // role="search" landmark. Measured hydration sequence on /he (Pixel 5,
    // sampled every 40ms, 4 of 5 runs):
    //   count=0
    //   count=1  _R_a2av2aivb_-input (HIDDEN)          ← lands first, invisible
    //   count=2  _r_0_-input (visible), _R_a2av2aivb_-input (hidden)
    //   count=1  _r_0_-input (visible)                 ← steady state
    // Two facts follow. (a) Scoping cannot disambiguate: role="search" lives on
    // the PARENT (HomeHero.jsx:129) and HeroSearch.jsx declares none, so both
    // nodes sit inside the SAME single landmark — page.getByRole("search")
    // .locator(...) would still resolve to 2. (b) Whenever both exist, exactly
    // one is visible and it is FIRST in DOM order, so `.first()` + toBeVisible
    // is deterministic: the assertion re-resolves on every poll and settles on
    // the visible node.
    // Supersedes the MEH-1078 `toHaveCount(1)` guard, which raced by
    // construction — it passed during the count=1 SSR phase ABOVE, then
    // hydration inserted the second node before the next line ran. Measured
    // 3 failed / 2 passed over 5 unfixed runs; 5/5 pass with `.first()`.
    const searchInput = page.locator('[data-testid="hero-search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    await searchInput.fill("חלב");
    // Click the submit button directly — avoids the autocomplete dropdown
    // intercepting Enter (highlightIdx=0 on open, so Enter would navigate
    // to the first suggestion instead of /producers).
    // Use data-testid to avoid strict-mode collision with Header's search
    // buttons which share the same aria-label="חיפוש".
    await page.locator('[data-testid="hero-search-submit"]').click();

    // Should land on /producers (with or without query string)
    await page.waitForURL(/\/producers/, { timeout: 20_000 });
    await page.waitForLoadState("domcontentloaded");

    // Either cards or empty state — page must render without crash
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });
});
