import { test, expect, type Page } from "./_cloudinary-stub";
import fs from "node:fs";
import path from "node:path";
import { settledField } from "./_settled-field";
import { withRateLimitRetry } from "../login-retry";
import { watchLoginSubmit } from "./_login-submit-diagnostics";

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
 *           read `user.role` (admin/AdminLayoutClient.jsx:120, producer/dashboard/DashboardLayoutClient.jsx).
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
// (producer/dashboard/DashboardLayoutClient.jsx, admin/AdminLayoutClient.jsx) on purpose — it is a page
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

// MEH-3380: the second cause has never been seen with a trace — the config
// records `on-first-retry`, i.e. only the attempt that passed. Keep the trace
// of a FAILED attempt for this block, so the next first-attempt red carries
// the evidence `watchLoginSubmit` cannot give (network + DOM snapshots).
// File level: Playwright refuses `trace` inside a describe (it forces a new worker).
test.use({ trace: "retain-on-failure" });

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
    // ORDER MATTERS: assert the STATE first. toHaveURL matches the moment the
    // page arrives, so on its own it would also pass against a redirect that
    // fires a beat later — the very race this spec was rewritten to remove.
    // getByTestId auto-waits for the render, so by the time the URL is checked
    // the page has settled.
    await expect(page.getByTestId(DENIED)).toHaveCount(1);
    await expect(page).toHaveURL(ADMIN_URL);
    await expect(page).not.toHaveURL(LOGIN_URL);
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
    // State before URL — see the ordering note in the producer describe above.
    await expect(page.getByTestId(DENIED)).toHaveCount(1);
    await expect(page).toHaveURL(ADMIN_URL);
    await expect(page.locator(ADMIN_NAV)).toHaveCount(0);

    // A consumer is not a producer either — distinct from the owner above.
    await page.goto("/producer/dashboard");
    await expect(page.getByTestId(DENIED)).toHaveCount(1);
    await expect(page).toHaveURL(DASHBOARD_URL);
    // MEH-1599's whole point: she is NOT silently dropped on the homepage.
    await expect(page).not.toHaveURL(HOME_URL);
    await expect(page).not.toHaveURL(LOGIN_URL);
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
    // MEH-3159: the 429 path below waits out up to three limiter windows
    // (3 x 20s, login-retry.ts). The waits are the SERVER's window, not a
    // product delay, and they only happen on a 429 — the happy path still
    // finishes in seconds. The 45s file default cannot hold them.
    test.setTimeout(150_000);
    const password = process.env.DEMO_OWNER_PASSWORD;
    test.skip(
      !password,
      "DEMO_OWNER_PASSWORD is unset — the round-trip needs a real seeded " +
        "producer login (see docs/ci/e2e-auth-fixtures.patch.md).",
    );

    await page.goto("/producer/dashboard");
    await expect(page).toHaveURL(LOGIN_WITH_DASHBOARD_REDIRECT);

    // MEH-2323: same form, same race as flows/30 C2/C3 — fill only the one
    // React-owned copy, or the value lands on a node React discards and the
    // submit goes out empty (the :196 flake).
    await (await settledField(page, "login-email")).fill("demo-owner@example.com");
    await (await settledField(page, "login-password")).fill(password as string);

    // MEH-3159 — this is the one login in the suite that goes through the
    // BROWSER, and the only one MEH-2895's retry never covered.
    //
    // Reproduced locally with a control, against a seeded stack: `/auth/login`
    // is 5/minute per client IP (auth.py:1280, keyed on IP with no email
    // component). Eight straight posts answered
    // 200,200,200,200,200,429,429,429 — the first five prove the credentials,
    // so the 429s are the limiter and not a bad password. With the window spent,
    // this exact flow then answered 429, the page stayed on
    // `/login?redirect=%2Fproducer%2Fdashboard` showing the generic «משהו
    // השתבש, נסו שוב», and `toHaveURL` timed out at 20067 ms — the card's
    // symptom and its timing (21.9 s, retry 2.3 s once the window had rolled).
    // Neither a product bug nor a race.
    //
    // In CI the suite spends the window on ITSELF: global-setup logs in three
    // accounts per run, and `login-retry.ts` exists because two shards inside
    // one minute from one IP once made a run execute 0 tests (staging
    // 541de4995). That helper covered the API logins; this in-browser one was
    // the site left outside it — so it is REUSED here rather than
    // reimplemented. (A hand-written copy of its loop was the first draft, and
    // the independent reviewer named it correctly as a second owner of one
    // rule — workflow.md Smell #1. Reusing it also keeps docs/TESTING.md's
    // «each through withRateLimitRetry» true, and picks up `Retry-After`
    // handling the copy had dropped.)
    //
    // Nothing about the limiter is weakened and nothing is skipped: the helper
    // retries 429 ONLY, a non-429 returns on the first attempt, and the status
    // is asserted to be 200 below — so a 401 on a wrong password or a 5xx on a
    // broken backend still reds, immediately and by name.
    // MEH-3159, SECOND cause — reopened 17/11: this `waitForResponse` timed out
    // at 20 s on #4641, meaning the POST never went out at all (the 429 path
    // above does go out and is refused, so it is a different failure). The
    // obvious candidate — the bare click below firing before the button is
    // hydrated — was MEASURED AND REFUTED: /he/login's server HTML carries none
    // of the form's data-testids, so there is no un-hydrated copy to click, and
    // with login stubbed the POST was issued 12/12 under load (CPU x6/+120 ms
    // and CPU x20/+400 ms, 6 runs each), against a control that missed 3/3 when
    // clicking before React could render. So do NOT "fix" this by wrapping the
    // click in `settledField` — that change is measured to do nothing. Still
    // unexplained; next untested candidate is the button being `disabled` at
    // click time (auth.spec.ts:316 asserts `toBeEnabled()` elsewhere, which
    // implies such a state exists), in which case Playwright waits for enabled
    // and can expire before the form opens.
    const submit = async () => {
      const [res] = await Promise.all([
        page.waitForResponse((r) => /\/api\/auth\/login$/.test(new URL(r.url()).pathname), {
          timeout: 20_000,
        }),
        page.getByTestId("login-submit").click(),
      ]);
      return res;
    };
    // MEH-3380: when no /api/auth/login request leaves within 20 s, the
    // failure message now says what the form held at the click.
    const diag = watchLoginSubmit(page);
    await diag.beforeClick();
    const { response, attempts } = await diag.explain(() => withRateLimitRetry(submit, {
      sleep: (ms) => page.waitForTimeout(ms),
      onRetry: ({ attempt, waitMs }) => {
        // An annotation, not only a console line: a run that passes on the
        // second attempt must still SAY the limiter refused the first, or the
        // card's «passes on the first attempt» reading could be satisfied by a
        // run full of 429s. Nothing in the flaky gate reads stdout.
        test.info().annotations.push({
          type: "rate-limited",
          description:
            `/auth/login answered 429 (attempt ${attempt}); waited ` +
            `${Math.round(waitMs / 1000)}s for the per-IP window (MEH-3159)`,
        });
      },
    }));
    // Named, so a final 429 reads as the shared-IP limit rather than as a
    // broken redirect — rule 39(c) wants the cause quoted, and this quotes
    // itself. Asserting 200 (not merely «not 429») also keeps a 401 from
    // surfacing 20 s later as «the URL did not change».
    expect(
      response.status(),
      `the browser login did not succeed after ${attempts} attempt(s) — ` +
        "429 here is the per-IP /auth/login limit (5/minute, auth.py:1280) " +
        "spent by this same suite; any other status is a real failure",
    ).toBe(200);

    // Back on the target, not on "/" — the redirect survived the login.
    await expect(page).toHaveURL(DASHBOARD_URL, { timeout: 20_000 });
    await expect(page.locator(PRODUCER_NAV).first()).toBeAttached();
  });
});
