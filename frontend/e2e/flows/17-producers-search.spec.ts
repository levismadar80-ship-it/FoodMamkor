import { test, expect } from "@playwright/test";

// MEH-822: the /producers in-page free-text search (added in MEH-820). Smokes
// the three states of the search box: submit writes ?q= + shows the active
// search chip, clearing drops ?q= + the chip, and ?focus=1 autofocuses the
// input on load. Complements 02-search (hero → /producers) and
// 16-producers-browse (the directory listing); this file owns the in-page
// search box on /producers.
//
// No mocks (MEH-417): runs against the live preview. Assertions avoid
// requiring DB results — the search chip and ?q= are driven by search state,
// not by whether the term matches a producer.
//
// MEH-990: the chip's leading 🔍 glyph became a Phosphor MagnifyingGlass icon
// (aria-hidden, Emoji LOCK), so the old `getByRole("button", { name: /🔍.../ })`
// locator no longer matches. Locate the chip by its stable
// `data-testid="active-search-chip"` instead (e2e dir convention: prefer
// data-testid over Hebrew/glyph text).
test.describe("Producers search", () => {
  const TERM = "לחם";

  test("typing a term + Enter sets ?q= and shows the search chip", async ({ page }) => {
    await page.goto("/producers");
    const input = page.locator("#producers-search-input:visible").first();
    // MEH-967: #producers-search-input renders in both the desktop + mobile
    // responsive containers (ProducersClient — one hidden per viewport), so the
    // bare id matched 2 elements and flaked (MEH-924, dup accepted by design).
    // Scope to the visible variant + .first() — repo idiom for "two responsive
    // variants, one hidden" (cf. 05-map-navigation, 14-language-toggle).
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill(TERM);
    await input.press("Enter");

    await page.waitForURL(/[?&]q=/, { timeout: 20_000 });
    expect(new URL(page.url()).searchParams.get("q")).toBe(TERM);

    // Active-filter strip renders a removable search chip (MagnifyingGlass icon
    // + the term; × span + icon are aria-hidden). Locate by data-testid and
    // assert it carries the term text.
    const chip = page.getByTestId("active-search-chip");
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText(TERM);
  });

  test("clearing the term + submit drops ?q= and the search chip", async ({ page }) => {
    await page.goto(`/producers?q=${encodeURIComponent(TERM)}`);
    const input = page.locator("#producers-search-input:visible").first();
    // MEH-967: scope to the visible #producers-search-input variant + .first()
    // (desktop/mobile dup, one hidden per viewport — MEH-924). Same as sibling tests.
    await expect(input).toBeVisible({ timeout: 15_000 });
    // Input seeds from ?q= on load (ProducersClient: searchInput ← searchQ).
    await expect(input).toHaveValue(TERM);

    await input.fill("");
    await input.press("Enter");

    await expect(input).toHaveValue("");
    await page.waitForURL((url) => !new URL(url).searchParams.has("q"), {
      timeout: 20_000,
    });
    await expect(page.getByTestId("active-search-chip")).toHaveCount(0);
    // Page resolves to the grid or a graceful empty state — never a crash.
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });

  test("/producers?focus=1 autofocuses the search input on load", async ({ page }) => {
    await page.goto("/producers?focus=1");
    const input = page.locator("#producers-search-input:visible").first();
    // MEH-967: #producers-search-input renders in both the desktop + mobile
    // responsive containers (ProducersClient — one hidden per viewport), so the
    // bare id matched 2 elements and flaked (MEH-924, dup accepted by design).
    // Scope to the visible variant + .first() — repo idiom for "two responsive
    // variants, one hidden" (cf. 05-map-navigation, 14-language-toggle).
    await expect(input).toBeVisible({ timeout: 15_000 });
    await expect(input).toBeFocused({ timeout: 10_000 });
  });
});
