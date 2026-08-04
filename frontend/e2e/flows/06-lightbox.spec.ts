import { test, expect } from "@playwright/test";
import { pickProducer, detailPath, REQUIREMENTS } from "./_producer-fixture";

/**
 * MEH-83 — Lightbox on gallery images.
 *
 * MEH-1717 — this spec used to open "the first card" and then skip with "No
 * gallery images on this producer" whenever that business had no photo. Both
 * halves were feed-dependent: which producer it landed on, and whether that
 * one happened to have images. It therefore reported green on every run where
 * the lightbox was never opened at all.
 *
 * Now a producer WITH at least one gallery image is selected up front, so the
 * lightbox path always executes; a seed with no such producer fails by name.
 * Direct navigation is deliberate — this spec's subject is the lightbox, and
 * reaching it through the card grid only re-imported the listing's feed
 * dependency (card-click coverage is 03's job). Every assertion below is
 * unchanged.
 */
test.describe("Lightbox", () => {
  test("clicking gallery image opens lightbox and ESC closes it", async ({ page }) => {
    const producer = await pickProducer(page.request, REQUIREMENTS.hasGalleryImage);
    await page.goto(detailPath(producer));

    // MEH-1550 / MEH-1712: assert the error boundary is absent first. Without
    // it, a failed navigation would surface below as "no gallery images" —
    // which is how this spec previously converted a routing failure into a
    // silent skip and lost the coverage entirely.
    await expect(
      page.locator("#__next_error__"),
      "navigation failed — landed on Next's error page instead of a producer detail",
    ).toHaveCount(0);

    // Gallery image button — the producer was selected for having ≥1 photo, so
    // its absence is a rendering regression, not a data state.
    const imageBtn = page.locator('[aria-label^="הגדלו תמונה"]').first();
    await expect(
      imageBtn,
      `no gallery image button on ${detailPath(producer)}, which the API reports as having ` +
        `${producer.images?.length ?? 0} image(s). The gallery stopped rendering them.`,
    ).toBeVisible({ timeout: 20_000 });

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
