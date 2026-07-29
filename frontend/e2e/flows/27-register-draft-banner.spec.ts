import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     27-register-draft-banner
 * Purpose:  MEH-1769 regression net for the producer wizard's draft-resume
 *           banner ("שמרנו טיוטה ממילוי קודם — רוצה להמשיך?"). Pins the
 *           render condition in BOTH directions:
 *             A — empty storage (incognito first visit): the banner never
 *                 renders, and never flashes before hydration.
 *             B — a draft holding only a field the pre-fix condition ignored
 *                 (city) still earns the banner.
 *             C — a draft whose every value is an empty string earns nothing.
 *             D — "לא" stays dismissed across a reload.
 *             E — "כן, המשיכו" restores the stored fields.
 * Touches:  localStorage["producer_registration_draft"] only. No backend — the
 *           wizard's GET /categories is allowed to fail; none of these
 *           assertions depend on the category list, so the spec runs against a
 *           bare `next start` exactly as it runs against a preview.
 * Does NOT: edit 18-producer-register-wizard (mocked wizard) or
 *           22-register-personas (P5 asserts that the draft PERSISTS across a
 *           mid-wizard reload — still true; this spec asserts what the BANNER
 *           does about it, which is a different question).
 * History:  MEH-1769 (creation).
 *
 * // MEH-1619: B and D are the discriminating cases — both are RED against the
 * pre-fix component and green after it. A/C/E pass either way and are here to
 * pin the reported symptom and the AC's restore leg, not to carry the change.
 * No test in this file gates on `count() === 0 → skip`: every assertion fails
 * loudly if the banner, its buttons, or the wizard entry disappear.
 */

const DRAFT_KEY = "producer_registration_draft";

/** Click through the pre-flight intro to frame 01. */
async function enterWizard(page: Page) {
  const start = page.getByTestId("register-preflight-start");
  await expect(start, "pre-flight entry must render").toBeVisible();
  await start.click();
  await expect(page.getByTestId("register-frame-account")).toBeVisible();
}

/**
 * Write a draft the way the app would have, then reload so the wizard's mount
 * read sees it. Deliberately NOT page.addInitScript: that re-seeds on every
 * navigation, which would silently undo the reload leg of test D.
 */
async function seedDraftAndEnter(page: Page, draft: Record<string, unknown>) {
  await page.goto("/register/producer");
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [DRAFT_KEY, JSON.stringify(draft)] as [string, string],
  );
  await page.reload();
  await enterWizard(page);
}

const banner = (page: Page) => page.getByTestId("register-draft-banner");

test.describe("MEH-1769 — draft-resume banner render condition", () => {
  test("A — empty storage: no banner, and no pre-hydration flash", async ({ page }) => {
    // Sample every animation frame from before the first page script until 6s
    // in. This is what makes "no flash before hydration" testable: a banner
    // painted on the first frame and removed once the storage read resolves
    // would be invisible to a post-settle assertion, but is caught here.
    await page.addInitScript(() => {
      (window as unknown as { __bannerFrames: number[] }).__bannerFrames = [];
      const tick = () => {
        if (document.body?.innerText.includes("שמרנו טיוטה")) {
          (window as unknown as { __bannerFrames: number[] }).__bannerFrames.push(
            Math.round(performance.now()),
          );
        }
        if (performance.now() < 6000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.goto("/register/producer");

    // Precondition, asserted rather than assumed: this context really is
    // storage-empty. Without it a leaked draft would make "no banner" green
    // for the wrong reason.
    expect(
      await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY),
      "context must start with no draft (incognito equivalent)",
    ).toBeNull();

    await enterWizard(page);
    await expect(banner(page)).toHaveCount(0);

    const frames = await page.evaluate(
      () => (window as unknown as { __bannerFrames: number[] }).__bannerFrames,
    );
    expect(frames, `banner was painted at ${frames.join(", ")}ms`).toEqual([]);
  });

  test("B — a draft holding only a city still earns the banner", async ({ page }) => {
    // MEH-1769 discriminator: the pre-fix condition tested
    // `producer_name || name || email`, so this real draft was silently
    // unresumable. RED before the fix.
    await seedDraftAndEnter(page, { city: "תל אביב" });
    await expect(banner(page)).toBeVisible();
  });

  test("C — a draft whose values are all empty strings earns no banner", async ({ page }) => {
    await seedDraftAndEnter(page, {
      email: "", name: "", producer_name: "", phone: "", city: "", address: "",
      description: "", short_description: "", producer_license_number: "",
      referral_source: "", referral_source_other: "", category_ids: [],
    });
    await expect(banner(page)).toHaveCount(0);
  });

  test('D — "לא" stays dismissed across a reload', async ({ page }) => {
    // MEH-1769 discriminator: dismissal used to be component state only, so
    // the banner came straight back on the next load. RED before the fix.
    await seedDraftAndEnter(page, { name: "ספיר בודקת", email: "sapir.qa@example.com" });
    await expect(banner(page)).toBeVisible();

    await page.getByTestId("register-draft-dismiss").click();
    await expect(banner(page)).toHaveCount(0);

    await page.reload();
    await enterWizard(page);
    await expect(banner(page), "dismissal must survive a reload").toHaveCount(0);
  });

  test('E — "כן, המשיכו" restores the stored fields', async ({ page }) => {
    await seedDraftAndEnter(page, { name: "ספיר בודקת", email: "sapir.qa@example.com" });
    await expect(banner(page)).toBeVisible();

    await page.getByTestId("register-draft-continue").click();
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByTestId("register-account-name")).toHaveValue("ספיר בודקת");
    await expect(page.getByTestId("register-account-email")).toHaveValue("sapir.qa@example.com");
  });
});
