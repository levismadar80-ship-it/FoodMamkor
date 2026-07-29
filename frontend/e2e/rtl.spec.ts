/**
 * RTL regression tests — Hebrew is the product, so a suite reporting coverage
 * it does not have is worse than no suite at all.
 *
 * MEH-1721 P6 F-1 measured this file **passing with zero assertions executed**.
 * Three of its four tests could not fail:
 *
 *   - "admin sidebar" asserted `toHaveURL(/login|admin/)` — a regex matching
 *     BOTH possible outcomes, i.e. a tautology, and nothing about RTL at all.
 *   - "modal close button" wrapped its only assertion in
 *     `if (await forgot.count() > 0)`.
 *   - "ProducerCard premium badge" returned early on `count === 0`, then
 *     wrapped its assertion in a second `count() > 0`.
 *
 * All three are the defect class `.claude/rules/testing.md` names: **a guard
 * that consults its own subject**, converting "the element is gone" — the exact
 * condition worth failing on — into "nothing to check". They are replaced with
 * assertions that fail when their subject is missing, because `expect(locator)`
 * fails on a missing element where `count()` quietly returns 0.
 *
 * Selectors are `data-testid` per `frontend/e2e/CLAUDE.md` — the previous file
 * keyed off the Hebrew string `aria-label='הציגו סיסמה'`, which breaks on any
 * copy edit and is unusable on `/en`.
 *
 * Intentional physical exceptions (the password eye toggle inside a `dir="ltr"`
 * input) are documented in `.claude/rules/rtl.md` and asserted here as
 * *expected physical placement*, so a "logical properties" sweep cannot quietly
 * relocate them either.
 */

import { test, expect } from "@playwright/test";

test.describe("RTL layout regression", () => {
  // ---------------------------------------------------------------
  // The locale-direction invariant. Nothing asserted this before,
  // which is how 8 hardcoded `text-right` reached /en (P7 F-1).
  // ---------------------------------------------------------------

  test("he renders dir=rtl at the document root", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
  });

  test("en renders dir=ltr at the document root", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("form controls inherit the document direction in each locale", async ({ page }) => {
    // The email input declares no `dir` of its own, so it must follow <html>.
    // A hardcoded physical alignment on this control would surface here.
    await page.goto("/login");
    await expect(page.getByTestId("login-email")).toBeVisible();
    expect(
      await page.getByTestId("login-email").evaluate((el) => getComputedStyle(el).direction),
      "he: email input must inherit rtl from <html>",
    ).toBe("rtl");

    await page.goto("/en/login");
    await expect(page.getByTestId("login-email")).toBeVisible();
    expect(
      await page.getByTestId("login-email").evaluate((el) => getComputedStyle(el).direction),
      "en: email input must inherit ltr from <html>",
    ).toBe("ltr");
  });

  // ---------------------------------------------------------------
  // Documented physical exceptions — asserted, not assumed.
  // ---------------------------------------------------------------

  test("password input stays dir=ltr in both locales", async ({ page }) => {
    // A password is LTR content regardless of page direction
    // (.claude/rules/rtl.md § intentional exceptions).
    for (const path of ["/login", "/en/login"]) {
      await page.goto(path);
      await expect(page.getByTestId("login-password")).toHaveAttribute("dir", "ltr");
    }
  });

  test("password eye toggle sits on the physical right of the input", async ({ page }) => {
    await page.goto("/login");

    const input = page.getByTestId("login-password");
    await expect(input).toBeVisible();
    // The toggle is the button inside the input's relative wrapper.
    const toggle = input.locator("xpath=..").getByRole("button").first();
    await expect(toggle).toBeVisible();

    const toggleBox = await toggle.boundingBox();
    const inputBox = await input.boundingBox();
    // boundingBox() returns null for a non-rendered element; assert rather than
    // let `!` coerce null into a comparison that happens to pass.
    expect(toggleBox, "toggle has no layout box").not.toBeNull();
    expect(inputBox, "password input has no layout box").not.toBeNull();

    // Physical right half of the field, and not overflowing it.
    expect(toggleBox!.x).toBeGreaterThan(inputBox!.x + inputBox!.width / 2);
    expect(toggleBox!.x).toBeLessThanOrEqual(inputBox!.x + inputBox!.width);
  });
});
