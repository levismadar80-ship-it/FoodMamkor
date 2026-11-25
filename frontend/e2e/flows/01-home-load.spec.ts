import { test, expect } from "./_cloudinary-stub";

test.describe("Homepage", () => {
  test("renders h1 and hero search input", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
    // MEH-1078: exactly one hero-search a visitor can see — a real double mount
    // still fails here.
    // MEH-3834: count the VISIBLE ones only. The CI log of 25/11 (WebKit) shows
    // two inputs: a hidden server-rendered one (`_R_…` id, "unexpected value
    // hidden") and a client-rendered one (`_r_0_` id). The server HTML holds
    // the page in the streamed `<div hidden id="S:0">`, most likely where the
    // hidden copy sat. A visitor sees one; the old count-then-toBeVisible pair
    // hit strict mode in the gap. Why WebKit renders it again: open, MEH-3834.
    const visibleHeroSearch = page.locator('[data-testid="hero-search"]').filter({ visible: true });
    await expect(visibleHeroSearch).toHaveCount(1, { timeout: 15_000 });
  });
});
