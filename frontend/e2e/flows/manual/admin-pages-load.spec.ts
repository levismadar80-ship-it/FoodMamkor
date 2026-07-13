import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     manual/admin-pages-load
 * Purpose:  Converted from docs/MANUAL_TESTING.md §§ admin moderation surfaces —
 *           "/admin/kashrut page loads with pending list" (MEH-51 item 13) plus
 *           the sibling admin queues /admin/experiences and /admin/content.
 *           Regression tripwires in the MEH-997 spirit (see spec 20): fail if an
 *           admin route ever 404s, loses its title, or stops querying its list
 *           endpoint (empty-state or rows must render, proving the fetch ran).
 * Touches:  GET /admin/kashrut · /admin/experiences · /admin/categories — reads
 *           only, admin-authed. No writes (the reject-with-notes flow, MEH-51
 *           item 15, is a destructive admin write → separate local-only test).
 * Auth:     REUSES the admin pattern from 20-admin-recipes-queue / manual/
 *           admin-status-labels — SMOKE_ADMIN_* env gate + browser-side
 *           /api/auth/login (MEH-327 fingerprint cookie) + desktop-only.
 * History:  MEH-1171 (creation).
 */

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;

// verbatim admin.* titles + empty-state strings from messages/he.json
const PAGES = [
  { path: "/admin/kashrut", title: "אישור תעודות כשרות", empty: "אין בקשות" },
  { path: "/admin/experiences", title: "חוויות קהילתיות", empty: "אין חוויות בסטטוס הזה" },
  { path: "/admin/content", title: "תוכן", empty: "אין נתונים להצגה" },
];

const adminLogin = (page: Page) =>
  page.evaluate(
    async ({ email, password }) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      if (!r.ok) throw new Error(`login failed: ${r.status}`);
      localStorage.setItem("token", (await r.json()).access_token);
    },
    { email: ADMIN_EMAIL as string, password: ADMIN_PASSWORD as string },
  );

test.describe("admin moderation pages load (MEH-1171 § admin queues)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD not set — admin smoke skipped",
  );

  for (const { path, title, empty } of PAGES) {
    test(`${path} loads with its title and a settled list-or-empty state`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "admin assertions are desktop-project-only (mirrors spec 19/20)");

      await page.goto("/login");
      await adminLogin(page);
      await page.goto(path);

      // the page rendered its own H1 (no 404, no bounce back to /login)
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 15_000 });
      expect(new URL(page.url()).pathname).not.toMatch(/\/login$/);

      // the list endpoint resolved: either the empty-state copy OR real content
      // (a table / list) is present — proves the queue queried its API
      await expect(
        page
          .getByText(empty, { exact: false })
          .or(page.locator("main table").first())
          .or(page.locator("main ul li").first()),
      ).toBeVisible({ timeout: 15_000 });
    });
  }
});
