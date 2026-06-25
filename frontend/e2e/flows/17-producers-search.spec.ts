import { test, expect } from "@playwright/test";

// MEH-822: the /producers in-page free-text search (added in MEH-820). Smokes
// the three states of the search box: submit writes ?q= + shows the 🔍 chip,
// clearing drops ?q= + the chip, and ?focus=1 autofocuses the input on load.
// Complements 02-search (hero → /producers) and 16-producers-browse (the
// directory listing); this file owns the in-page search box on /producers.
//
// No mocks (MEH-417): runs against the live preview. Assertions avoid
// requiring DB results — the 🔍 chip and ?q= are driven by search state, not
// by whether the term matches a producer.
test.describe("Producers search", () => {
  const TERM = "לחם";

  test("typing a term + Enter sets ?q= and shows the 🔍 chip", async ({ page }) => {
    await page.goto("/producers");
    const input = page.locator("#producers-search-input");
    // MEH-924: React 18 concurrent hydration transiently double-mounts the search
    // form for one frame on mobile (PR #1316 strict-mode flake). Gate on count
    // settling to 1 before the strict asserts — still fails on a permanent dup.
    await expect(input).toHaveCount(1, { timeout: 15_000 });
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill(TERM);
    await input.press("Enter");

    await page.waitForURL(/[?&]q=/, { timeout: 20_000 });
    expect(new URL(page.url()).searchParams.get("q")).toBe(TERM);

    // Active-filter strip renders a removable 🔍 chip (× span is aria-hidden,
    // so the button's accessible name is "🔍 <term>").
    await expect(
      page.getByRole("button", { name: new RegExp(`🔍\\s*${TERM}`) }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clearing the term + submit drops ?q= and the 🔍 chip", async ({ page }) => {
    await page.goto(`/producers?q=${encodeURIComponent(TERM)}`);
    const input = page.locator("#producers-search-input");
    // MEH-924: same transient hydration double-mount guard as the sibling tests —
    // settle to a single element before the strict asserts (PR #1316 flake).
    await expect(input).toHaveCount(1, { timeout: 15_000 });
    await expect(input).toBeVisible({ timeout: 15_000 });
    // Input seeds from ?q= on load (ProducersClient: searchInput ← searchQ).
    await expect(input).toHaveValue(TERM);

    await input.fill("");
    await input.press("Enter");

    await expect(input).toHaveValue("");
    await page.waitForURL((url) => !new URL(url).searchParams.has("q"), {
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /🔍/ })).toHaveCount(0);
    // Page resolves to the grid or a graceful empty state — never a crash.
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });

  test("/producers?focus=1 autofocuses the search input on load", async ({ page }) => {
    await page.goto("/producers?focus=1");
    const input = page.locator("#producers-search-input");
    // MEH-924: React 18 concurrent hydration transiently double-mounts the search
    // form for one frame on mobile (PR #1316 strict-mode flake). Gate on count
    // settling to 1 before the strict asserts — still fails on a permanent dup.
    await expect(input).toHaveCount(1, { timeout: 15_000 });
    await expect(input).toBeVisible({ timeout: 15_000 });
    await expect(input).toBeFocused({ timeout: 10_000 });
  });
});
