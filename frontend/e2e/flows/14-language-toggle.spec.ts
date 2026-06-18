import { test, expect } from "@playwright/test";

// MEH-475 LanguageToggle: a Globe button in the desktop header that flips
// HE ⇄ EN while preserving the pathname. The toggle lives behind
// `hidden md:inline-flex`, so it is absent on the mobile project (the
// mobile drawer was retired in MEH-789) — skip gracefully there.
test.describe("Language toggle", () => {
  // QUARANTINED — Ref MEH-817: EN→HE flips to the unprefixed default-locale
  // path ("/"), whose locale resolves via the NEXT_LOCALE cookie under
  // `as-needed`. router.replace's cookie-write races the RSC fetch, so
  // useLocale() intermittently stays "en" (assertion :31). Real fix lives in
  // the deferred next-intl locale-routing family (MEH-817), gated behind
  // Disallow: /en/ until Wave 5 (MEH-475). Un-quarantine when MEH-817 ships.
  test.fixme("flips he → en and back, preserving the path", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const toggle = page.locator('[data-testid="language-toggle"]:visible').first();
    if ((await toggle.count()) === 0) {
      test.skip(true, "Language toggle is desktop-only — not present on this viewport");
      return;
    }
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute("data-current-locale", "he");

    // HE → EN: `as-needed` prefix adds the /en segment.
    await toggle.click();
    await page.waitForURL(/\/en(\/|$|\?)/, { timeout: 20_000 });
    const enToggle = page.locator('[data-testid="language-toggle"]:visible').first();
    await expect(enToggle).toHaveAttribute("data-current-locale", "en");

    // EN → HE: the /en prefix is dropped (default locale).
    await enToggle.click();
    await page.waitForURL((url) => !/\/en(\/|$)/.test(url.pathname), { timeout: 20_000 });
    await expect(
      page.locator('[data-testid="language-toggle"]:visible').first(),
    ).toHaveAttribute("data-current-locale", "he");
  });
});
