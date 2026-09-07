import { test, expect } from "./_cloudinary-stub";

/**
 * MEH-1892 — the computed-direction half of the guard.
 *
 * The vitest sibling (`__tests__/EnLocaleDirection.test.js`) asserts the
 * cascade SHAPE — that no `direction` rule sits on a bare `html` selector.
 * It cannot assert the OUTCOME: jsdom gives the `dir` attribute precedence
 * over the author stylesheet, the opposite of a real engine, so it reports
 * `ltr` on /en even against the broken stylesheet. Measured, not assumed.
 *
 * This is where a real browser resolves it. Both cases are required: the /en
 * one is the fix, and the / one is the control that a fix which simply deleted
 * the rule would fail.
 */
test.describe("MEH-1892 — base direction follows the locale", () => {
  test("/en renders LTR end to end", async ({ page }) => {
    await page.goto("/en");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("dir", "ltr");
    const computed = await page.evaluate(
      () => getComputedStyle(document.documentElement).direction,
    );
    expect(computed, "the stylesheet must not override the dir attribute").toBe(
      "ltr",
    );
  });

  test("/ still renders RTL", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const computed = await page.evaluate(
      () => getComputedStyle(document.documentElement).direction,
    );
    expect(computed, "Hebrew is the RTL default and must stay RTL").toBe("rtl");
  });
});
