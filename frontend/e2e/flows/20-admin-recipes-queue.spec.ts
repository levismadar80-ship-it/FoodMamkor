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
 * real session (MEH-327 binding makes a bearer-only injection 401).
 */
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;

test.describe("Admin recipes moderation queue (MEH-997)", () => {
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

    // Browser-side login — sets the HttpOnly fingerprint/refresh cookies
    // and the localStorage token the same way the real /login page does.
    await page.goto("/login");
    await page.evaluate(
      async ({ email, password }) => {
        const r = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          credentials: "include",
        });
        if (!r.ok) throw new Error(`login failed: ${r.status}`);
        const data = await r.json();
        localStorage.setItem("token", data.access_token);
      },
      { email: ADMIN_EMAIL as string, password: ADMIN_PASSWORD as string },
    );

    await page.goto("/admin/recipes");

    // The page exists (no 404 / no redirect back to /login) and renders.
    await expect(page.getByTestId("admin-recipes-title")).toBeVisible({
      timeout: 15_000,
    });

    // Sidebar nav carries the recipes link.
    await expect(
      page.locator('a[href*="/admin/recipes"]').first(),
    ).toBeVisible();

    // Default tab (pending) shows either real rows or the empty state —
    // both prove the queue read the admin_recipes list endpoint.
    const row = page.getByTestId("admin-recipes-row").first();
    const empty = page.getByTestId("admin-recipes-empty");
    await expect(row.or(empty)).toBeVisible({ timeout: 15_000 });

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
