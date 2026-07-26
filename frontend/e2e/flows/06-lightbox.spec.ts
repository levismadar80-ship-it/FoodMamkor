import { test, expect } from "@playwright/test";

/**
 * MEH-83 — Lightbox on gallery images.
 * Requires at least one producer with ≥1 gallery image in staging DB.
 * Tests are skipped gracefully if the DB is empty.
 */
test.describe("Lightbox", () => {
  test("clicking gallery image opens lightbox and ESC closes it", async ({ page }) => {
    await page.goto("/producers");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator('[data-testid="producer-card"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "No producer cards — staging DB may be empty");
      return;
    }
    // MEH-1369: click the card's inner nav anchor (real <a href>), not the
    // <article> wrapper whose click races hydration. See parity.spec.ts header.
    await firstCard.locator('a[href^="/"]').first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/producers"), { timeout: 20_000 });
    // MEH-1550: the predicate above is permissive (a 404/redirect satisfies it),
    // and Next's error document has its own <h1>. Without this the spec would
    // SKIP on a failed navigation ("no gallery images") rather than fail —
    // silently losing coverage. Assert the error boundary is absent first.
    await expect(
      page.locator("#__next_error__"),
      "navigation failed — landed on Next's error page instead of a producer detail",
    ).toHaveCount(0);

    // Gallery image button — only exists when the producer has ≥1 photo
    const imageBtn = page.locator('[aria-label^="הגדלו תמונה"]').first();
    if ((await imageBtn.count()) === 0) {
      test.skip(true, "No gallery images on this producer — skipping lightbox test");
      return;
    }

    await imageBtn.click();

    // Lightbox dialog should be visible
    const dialog = page.locator('[role="dialog"][aria-label="תצוגת תמונה"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Close button should be focused
    const closeBtn = dialog.locator('[aria-label="סגרו תצוגה"]');
    await expect(closeBtn).toBeFocused();

    // ESC closes the lightbox
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    // Focus should return to the image button in the gallery
    await expect(imageBtn).toBeFocused();
  });
});
