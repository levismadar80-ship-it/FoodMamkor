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
    // Filter out transient network errors from Railway cold-start (axios
    // "Network Error" / "AxiosError").  These are infra noise; the assertion
    // targets real JS bugs (undefined vars, React crashes, etc.).
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Network Error") &&
        !e.includes("AxiosError") &&
        !e.includes("Failed to fetch") &&
        !e.includes("Load failed")
    );
    expect(criticalErrors, `JS errors: ${criticalErrors.join(", ")}`).toHaveLength(0);
  });
});
