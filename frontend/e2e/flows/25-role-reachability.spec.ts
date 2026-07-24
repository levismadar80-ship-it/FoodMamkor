import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     25-role-reachability
 * Purpose:  Prove the three seeded QA roles are DISTINCT identities — not three
 *           copies of the same login. Each role loads from its OWN storageState
 *           (e2e/.auth/{admin,producer,consumer}.json, provisioned by
 *           global-setup.ts from DEMO_ADMIN/OWNER/CONSUMER_PASSWORD) and the
 *           admin-panel gate resolves differently per role:
 *             - admin    → reaches /admin (admin layout renders).
 *             - producer → denied /admin (→ /login) but reaches its OWN
 *                          /producer/dashboard (a real producer session).
 *             - consumer → denied BOTH /admin and /producer/dashboard.
 *           Three different outcomes from three valid JWTs = role-based gating,
 *           the point of MEH-1528's per-role auth state.
 * Touches:  REAL backend (no mocks) via the Next.js /api proxy — the auth
 *           context calls GET /auth/me to resolve each role; the layout gates
 *           read `user.role` (admin/layout.js:120, producer/dashboard/layout.js).
 * Does NOT: exercise any admin/producer WRITE. This is a read-only reachability
 *           gate, not a lifecycle test (that is flows/19,20).
 * History:  MEH-1528 (creation).
 *
 * // MEH-360: runs against a seeded local full stack (verification) or the
 * Vercel preview / staging (CI); the CC sandbox can't reach *.up.railway.app.
 *
 * Locators are attribute-based (nav `href`), not Hebrew text, so they survive
 * copy changes (frontend/e2e/CLAUDE.md) and hold on both the desktop sidebar
 * and the md:hidden mobile nav (both render the same hrefs).
 */

const ADMIN_NAV = 'a[href$="/admin/producers"]'; // only the admin layout renders it
const PRODUCER_NAV = 'a[href$="/producer/dashboard/edit"]'; // only the producer dashboard layout
const LOGIN_URL = /\/login(\/|$|\?)/;
const ADMIN_URL = /\/admin(\/|$|\?)/;

// A provisioned storageState injects the JWT into localStorage["token"]
// (lib/auth-context.js). Asserting it is present proves this is a REAL
// authenticated session — the "not just three logins" guarantee.
async function assertAuthenticated(page: Page): Promise<void> {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token, "storageState must carry an authenticated JWT").toBeTruthy();
}

test.describe("admin role reaches the admin panel", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("admin storageState renders /admin", async ({ page }) => {
    await page.goto("/admin");
    await assertAuthenticated(page);
    await expect(page).toHaveURL(ADMIN_URL);
    // The admin layout (role==="admin" only) renders the producers nav link.
    await expect(page.locator(ADMIN_NAV).first()).toBeAttached();
  });
});

test.describe("producer (owner) role is denied the admin panel", () => {
  test.use({ storageState: "e2e/.auth/producer.json" });

  test("owner is redirected from /admin yet reaches its own dashboard", async ({ page }) => {
    await page.goto("/admin");
    await assertAuthenticated(page);
    // A valid producer JWT is bounced off /admin (role-based, not auth-based).
    await expect(page).toHaveURL(LOGIN_URL);
    await expect(page.locator(ADMIN_NAV)).toHaveCount(0);

    // Positive contrast: the SAME session reaches the producer-only dashboard,
    // so the /admin denial is about role, not a broken login.
    await page.goto("/producer/dashboard");
    await expect(page).not.toHaveURL(LOGIN_URL);
    await expect(page.locator(PRODUCER_NAV).first()).toBeAttached();
  });
});

test.describe("consumer role is denied the admin panel", () => {
  test.use({ storageState: "e2e/.auth/consumer.json" });

  test("consumer is redirected from both /admin and /producer/dashboard", async ({ page }) => {
    await page.goto("/admin");
    await assertAuthenticated(page);
    await expect(page).toHaveURL(LOGIN_URL);
    await expect(page.locator(ADMIN_NAV)).toHaveCount(0);

    // A consumer is not a producer either — distinct from the owner above.
    await page.goto("/producer/dashboard");
    await expect(page).toHaveURL(LOGIN_URL);
    await expect(page.locator(PRODUCER_NAV)).toHaveCount(0);
  });
});
