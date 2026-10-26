/**
 * MEH-997 — admin recipes moderation queue exists and works.
 *
 * Regression tripwire for the MEH-997 seed bug class: the recipes
 * backend (admin_recipes.py, MEH-589) shipped with NO admin frontend —
 * a producer's recipe sat in `producer_recipes` (pending, unpublished)
 * with no surface that could show it. This spec fails if /admin/recipes
 * ever 404s again, loses its sidebar link, or its tabs stop querying
 * the moderation_status filter.
 *
 * REUSES: 19-publish-approve-visible.spec.ts — SMOKE_ADMIN_* env gating
 * + desktop-project-only guard. Login happens IN the browser via the
 * same-origin /api proxy (mirrors lib/auth-context.js), so the
 * fingerprint + refresh cookies land in the browser jar exactly like a
 * real session. The MEH-327 binding note that lived here now lives in
 * e2e/auth-fixture.ts, because it governs flows/19 and 22 as well and its
 * absence from those two is what made a token-only reuse look correct.
 */
import { test, expect } from "./_cloudinary-stub";
import { fixtureExists, fixturePath } from "../auth-fixture";

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;

test.describe("Admin recipes moderation queue (MEH-997)", () => {
  // Loads the cookie jar as well as localStorage — see e2e/auth-fixture.ts for
  // why the cookie is not optional (_check_fingerprint, auth.py:211-230).
  test.use({ storageState: fixturePath("smoke-admin") });

  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD not set — admin smoke skipped",
  );

  test("admin can open /admin/recipes, see the queue and switch tabs", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Admin sidebar assertions are desktop-project-only (mirrors spec 19)",
    );

    // MEH-1858: was a third separate login as the SAME SMOKE_ADMIN account.
    // The storageState below carries both the token and the __Secure-Fgp cookie
    // it is bound to, which is what the removed block was hand-rolling.
    // MEH-999: vars set but fixture absent = provisioning breakage, fail loud.
    expect(
      fixtureExists("smoke-admin"),
      "SMOKE_ADMIN_* are set but e2e/.auth/smoke-admin.json is missing — global-setup did not provision it",
    ).toBeTruthy();

    await page.goto("/admin/recipes");

    // The page exists (no 404 / no redirect back to /login) and renders.
    await expect(page.getByTestId("admin-recipes-title")).toBeVisible({
      timeout: 15_000,
    });

    // Default tab (pending) shows either real rows or the empty state —
    // both prove the queue read the admin_recipes list endpoint.
    const row = page.getByTestId("admin-recipes-row").first();
    const empty = page.getByTestId("admin-recipes-empty");
    await expect(row.or(empty)).toBeVisible({ timeout: 15_000 });

    // MEH-2359: the nav entry is count-gated — listed only while
    // `recipes_awaiting_review` > 0, which on a real target is exactly "the
    // pending tab has rows". Both states are pinned (rows ⇒ link, empty ⇒ no
    // link); the stubbed 3-count case is manual/admin-recipes-kebab MT:MEH-997:3.
    const navRecipes = page.locator('aside nav a[href*="/admin/recipes"], div.md\\:hidden > nav a[href*="/admin/recipes"]');
    if (await row.isVisible()) {
      await expect(navRecipes.locator("visible=true")).toHaveCount(1);
    } else {
      await expect(navRecipes).toHaveCount(0);
    }

    // Tab switch re-queries with the moderation_status filter.
    const [listRequest] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes("/admin/recipes") &&
          req.url().includes("moderation_status=approved"),
      ),
      page.getByTestId("admin-recipes-tab-approved").click(),
    ]);
    expect(listRequest).toBeTruthy();
    await expect(row.or(empty)).toBeVisible({ timeout: 15_000 });
  });
});
