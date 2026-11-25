import { test, expect } from "./_cloudinary-stub";

test.describe("Homepage", () => {
  test("renders h1 and hero search input", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
    // MEH-1078: exactly one hero-search a visitor can see — a real double mount
    // still fails here.
    // MEH-3834: count the VISIBLE ones only. In WebKit the streamed page can
    // leave React's server copy behind in its hidden `<div hidden id="S:0">`
    // while the client renders its own: the CI log of 25/11 shows two inputs,
    // the hidden server one (`_R_…` id, "unexpected value hidden") and a
    // client-rendered one (`_r_0_` id). A visitor sees one; the old
    // count-then-toBeVisible pair hit strict mode in the gap between them.
    const visibleHeroSearch = page.locator('[data-testid="hero-search"]').filter({ visible: true });
    await expect(visibleHeroSearch).toHaveCount(1, { timeout: 15_000 });
  });
});
