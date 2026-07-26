import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Spec:     25-role-reachability
 * Purpose:  Prove the three seeded QA roles are DISTINCT identities — not three
 *           copies of the same login. Each role loads from its OWN storageState
 *           (e2e/.auth/{admin,producer,consumer}.json, provisioned by
 *           global-setup.ts from DEMO_ADMIN/OWNER/CONSUMER_PASSWORD) and the
 *           admin-panel gate resolves differently per role:
 *             - admin    → reaches /admin (admin layout renders).
 *             - producer → denied /admin IN PLACE (403 state, URL unchanged)
 *                          but reaches its OWN /producer/dashboard.
 *             - consumer → denied BOTH /admin and /producer/dashboard, in place.
 *           Three different outcomes from three valid JWTs = role-based gating,
 *           the point of MEH-1528's per-role auth state. A fourth describe
 *           covers the 401 half: a guest gets /login?redirect= and returns.
 * Does NOT: assert on any transient URL. MEH-1599 — the pre-fix assertions
 *           raced a /login that LoginClient.jsx:89-91 replaced within the same
 *           poll window, which is what made the mobile consumer test flaky.
 * Touches:  REAL backend (no mocks) via the Next.js /api proxy — the auth
 *           context calls GET /auth/me to resolve each role; the layout gates
 *           read `user.role` (admin/layout.js:120, producer/dashboard/layout.js).
 * Does NOT: exercise any admin/producer WRITE. This is a read-only reachability
 *           gate, not a lifecycle test (that is flows/19,20).
 * History:  MEH-1528 (creation); MEH-999 (fixture guard — see below);
 *           MEH-1599 (403 renders in place; assertions moved to the resting
 *           state; 401 round-trip describe added).
 *
 * MEH-999 — WHY THESE SKIP ON THE DEFAULT CI RUN.
 * global-setup.ts:72-80 deliberately does NOT provision storageState when the
 * target is localhost and no DEMO_*_PASSWORD is set. The default CI E2E job is
 * exactly that shape (e2e.yml:158 PLAYWRIGHT_BASE_URL=http://localhost:3000,
 * and the job exports no DEMO_* secret), so e2e/.auth/*.json never exists there.
 * This spec originally called test.use({ storageState }) unconditionally, so all
 * three describes died at fixture setup with
 * `ENOENT: e2e/.auth/producer.json` — six red tests on every PR, which is a
 * FALSE signal: nothing is broken, the fixtures were never meant to exist on
 * that target. Worse, six permanent reds train everyone to ignore the E2E job.
 *
 * The guard below is the same one flows/21-account-menu-auth.spec.ts:38 has
 * carried since MEH-1241; this spec simply never copied it. It is deliberately
 * STRICTER than spec 21's: it skips only when the fixture is missing AND that
 * role's password is unset (provisioning was skipped by design). If the password
 * IS set the spec does NOT skip — a missing fixture then means provisioning
 * genuinely failed, which must stay loud. (global-setup throws in that case
 * anyway, at :105 / :122; this keeps the spec honest if that ever changes.)
 *
 * WHERE THIS COVERAGE ACTUALLY RUNS: a target with the passwords exported —
 * `TEST_URL=https://staging.mehamakor.online` plus DEMO_*_PASSWORD (+
 * VERCEL_AUTOMATION_BYPASS_SECRET for a protected preview), or a seeded local
 * full stack. To turn it on in CI, the E2E job needs the three secrets in its
 * env: docs/ci/e2e-auth-fixtures.patch.md.
 *
 * // MEH-360: runs against a seeded local full stack (verification) or the
 * Vercel preview / staging (CI); the CC sandbox can't reach *.up.railway.app.
 *
 * Locators are attribute-based (nav `href`), not Hebrew text, so they survive
 * copy changes (frontend/e2e/CLAUDE.md) and hold on both the desktop sidebar
 * and the md:hidden mobile nav (both render the same hrefs).
 */

// MEH-999: one entry per role — the storageState file plus the env var whose
// absence means "global-setup skipped provisioning on purpose".
const AUTH_DIR = path.join(__dirname, "..", ".auth");
const FIXTURES = {
  admin: { file: "e2e/.auth/admin.json", passwordEnv: "DEMO_ADMIN_PASSWORD" },
  producer: { file: "e2e/.auth/producer.json", passwordEnv: "DEMO_OWNER_PASSWORD" },
  consumer: { file: "e2e/.auth/consumer.json", passwordEnv: "DEMO_CONSUMER_PASSWORD" },
} as const;

/**
 * Skip ONLY the "provisioning was skipped by design" case: fixture absent AND
 * the role's password unset. Fixture absent WITH the password set is a real
 * breakage and must not be skipped.
 */
function skipUnlessProvisioned(role: keyof typeof FIXTURES): void {
  const { file, passwordEnv } = FIXTURES[role];
  const exists = fs.existsSync(path.join(AUTH_DIR, `${role}.json`));
  test.skip(
    !exists && !process.env[passwordEnv],
    `no ${file} and ${passwordEnv} is unset — global-setup skips QA auth ` +
      `provisioning on a localhost target (global-setup.ts:72-80), so this ` +
      `role-gating proof cannot run here. It runs against a seeded target: see ` +
      `docs/ci/e2e-auth-fixtures.patch.md to enable it in CI.`,
  );
}

const ADMIN_NAV = 'a[href$="/admin/producers"]'; // only the admin layout renders it
const PRODUCER_NAV = 'a[href$="/producer/dashboard/edit"]'; // only the producer dashboard layout
const LOGIN_URL = /\/login(\/|$|\?)/;
const ADMIN_URL = /\/admin(\/|$|\?)/;
const DASHBOARD_URL = /\/producer\/dashboard(\/|$|\?)/;
const HOME_URL = /^https?:\/\/[^/]+\/(he|en)?\/?$/;

// MEH-1599: the in-app 403 state. ONE testid across both gates
// (producer/dashboard/layout.js, admin/layout.js) on purpose — it is a page
// STATE, not a per-surface control, so a single id lets the assertions below
// count it and prove exactly one renders. The two gates never render together.
const DENIED = "access-denied";

// MEH-1599: ?redirect= is URL-encoded by the gate (encodeURIComponent), but a
// browser may present either form — accept both rather than assert on encoding.
const LOGIN_WITH_DASHBOARD_REDIRECT = /\/login\?redirect=(%2F|\/)producer(%2F|\/)dashboard/;

// A provisioned storageState injects the JWT into localStorage["token"]
// (lib/auth-context.js). Asserting it is present proves this is a REAL
// authenticated session — the "not just three logins" guarantee.
async function assertAuthenticated(page: Page): Promise<void> {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token, "storageState must carry an authenticated JWT").toBeTruthy();
}

test.describe("admin role reaches the admin panel", () => {
  skipUnlessProvisioned("admin");
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
  skipUnlessProvisioned("producer");
  test.use({ storageState: "e2e/.auth/producer.json" });

  test("owner is denied /admin in place yet reaches its own dashboard", async ({ page }) => {
    await page.goto("/admin");
    await assertAuthenticated(page);
    // MEH-1599: a valid producer JWT is denied /admin by ROLE, so the denial
    // renders in place — no redirect at all. Asserting the URL is unchanged is
    // what makes this deterministic: the old toHaveURL(LOGIN_URL) sampled a
    // transient /login that LoginClient.jsx:89-91 immediately replaced.
    await expect(page).toHaveURL(ADMIN_URL);
    await expect(page).not.toHaveURL(LOGIN_URL);
    await expect(page.getByTestId(DENIED)).toHaveCount(1);
    await expect(page.locator(ADMIN_NAV)).toHaveCount(0);

    // Positive contrast: the SAME session reaches the producer-only dashboard,
    // so the /admin denial is about role, not a broken login.
    await page.goto("/producer/dashboard");
    await expect(page).not.toHaveURL(LOGIN_URL);
    await expect(page.getByTestId(DENIED)).toHaveCount(0);
    await expect(page.locator(PRODUCER_NAV).first()).toBeAttached();
  });
});

test.describe("consumer role is denied the admin panel", () => {
  skipUnlessProvisioned("consumer");
  test.use({ storageState: "e2e/.auth/consumer.json" });

  test("consumer is denied both /admin and /producer/dashboard, in place", async ({ page }) => {
    await page.goto("/admin");
    await assertAuthenticated(page);
    await expect(page).toHaveURL(ADMIN_URL);
    await expect(page.getByTestId(DENIED)).toHaveCount(1);
    await expect(page.locator(ADMIN_NAV)).toHaveCount(0);

    // A consumer is not a producer either — distinct from the owner above.
    await page.goto("/producer/dashboard");
    await expect(page).toHaveURL(DASHBOARD_URL);
    // MEH-1599's whole point: she is NOT silently dropped on the homepage.
    await expect(page).not.toHaveURL(HOME_URL);
    await expect(page).not.toHaveURL(LOGIN_URL);
    await expect(page.getByTestId(DENIED)).toHaveCount(1);
    await expect(page.locator(PRODUCER_NAV)).toHaveCount(0);
  });
});

// MEH-1599: the 401 half of the split. No storageState — a genuinely
// unauthenticated visitor still redirects to /login, but now carries
// ?redirect= so she lands back on the page she asked for.
test.describe("unauthenticated visitor is redirected with a return target", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Needs no fixture and no password, so this one runs on the DEFAULT
  // unauthenticated CI job too — the ?redirect= contract is covered on
  // every PR, not only on a seeded target.
  test("guest hitting /producer/dashboard lands on /login?redirect=", async ({ page }) => {
    await page.goto("/producer/dashboard");
    await expect(page).toHaveURL(LOGIN_WITH_DASHBOARD_REDIRECT);
    await expect(page.getByTestId(DENIED)).toHaveCount(0);
  });

  test("logging in from that /login returns her to the dashboard", async ({ page }) => {
    const password = process.env.DEMO_OWNER_PASSWORD;
    test.skip(
      !password,
      "DEMO_OWNER_PASSWORD is unset — the round-trip needs a real seeded " +
        "producer login (see docs/ci/e2e-auth-fixtures.patch.md).",
    );

    await page.goto("/producer/dashboard");
    await expect(page).toHaveURL(LOGIN_WITH_DASHBOARD_REDIRECT);

    await page.getByTestId("login-email").fill("demo-owner@example.com");
    await page.getByTestId("login-password").fill(password as string);
    await page.getByTestId("login-submit").click();

    // Back on the target, not on "/" — the redirect survived the login.
    await expect(page).toHaveURL(DASHBOARD_URL, { timeout: 20_000 });
    await expect(page.locator(PRODUCER_NAV).first()).toBeAttached();
  });
});
