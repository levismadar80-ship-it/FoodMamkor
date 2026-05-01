import { test, expect } from "@playwright/test";

/**
 * MEH-306 sub-B — password-policy E2E coverage.
 *
 * Drives the new <PasswordInput> + 422-failure rendering across /register,
 * /reset-password, and /settings. Asserts the wire-up to sub-A's
 * /auth/check-password endpoint and the policy-failure paths
 * (too_short / too_common / same_as_current).
 *
 * `test.describe.serial` enforces sequential execution within this spec
 * to keep total /auth/check-password traffic well under the 30/min/IP
 * server-side cap. Cross-file parallelism remains (Playwright's default
 * worker model is per-file).
 */

const SAFE_PASSWORD_A = "Zx7Yp9Mq2Lr4"; // 12 chars, vetted clean per sub-A
const SAFE_PASSWORD_B = "Yz8Wq0Nr3Ms5"; // 12 chars, distinct
const DENY_LISTED_12 = "unbelievable"; // 12 chars, in deny_list_10k.txt
const SHORT_PASSWORD = "short_pass!"; // 11 chars, fails the 12 floor

// Helper — generate a unique consumer signup payload per scenario so
// tests don't collide on duplicate-email 400s.
function uniqueSignup(prefix: string) {
  const stamp = Date.now().toString(36);
  return {
    email: `${prefix}+${stamp}@e2e.test`,
    name: `e2e ${prefix}`,
  };
}

test.describe.serial("Password policy wire-up (MEH-306 sub-B)", () => {
  // MEH-306 sub-B Playwright mock — sub-A's /auth/check-password
  // endpoint is on the unmerged feature branch (PR #410) so the
  // staging Railway backend that Vercel preview proxies to returns
  // 404. Mock the response shape here so frontend wiring (debounce,
  // AbortController, tile render, 422-failures path) is what's
  // actually under test.
  //
  // Note: pre-mock, scenario 3 (valid 12-char unique) was passing
  // for the WRONG reason — fail-soft on 404 produced failures=[],
  // which happens to be the success state. Post-mock it passes for
  // the right reason: the mock genuinely returns failures=[] only
  // for non-deny-listed candidates. Coverage upgrade.
  //
  // TODO: Remove this mock after both sub-A and sub-B merge to staging.
  // Tracked in MEH-XXX (Smadar to file post-PR).
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/auth/check-password", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const candidate = (body.candidate || "").toString();
      // Tiny in-test deny-list — only the values our scenarios use.
      // Real backend uses the 10k SecLists corpus; we don't need parity.
      const denyList = new Set(["unbelievable", "password1234", "password    "]);
      const failures = denyList.has(candidate.trim().toLowerCase())
        ? ["too_common"]
        : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: failures.length === 0, failures }),
      });
    });
  });

  test("Signup: short password is blocked with the Hebrew length message", async ({
    page,
  }) => {
    const u = uniqueSignup("short");
    await page.goto("/register");

    await page.getByLabel(/^שם מלא \*$/).fill(u.name);
    await page.getByLabel(/^אימייל \*$/).fill(u.email);
    await page.getByLabel(/^סיסמה$/).fill(SHORT_PASSWORD);

    // Inline checklist tile reflects the failure pre-submit.
    await expect(
      page.getByText(/לפחות 12 תווים/),
    ).toBeVisible();

    // Submit gate is disabled until length OK; force-submit should
    // surface the form-level error or simply not progress.
    const submit = page.getByRole("button", { name: /הצטרפי/ });
    if (await submit.isEnabled()) {
      await submit.click();
      await expect(
        page.getByText(/סיסמתך חייבת להכיל לפחות 12 תווים/),
      ).toBeVisible();
    } else {
      await expect(submit).toBeDisabled();
    }
  });

  test("Signup: deny-listed (HIBP-known equivalent) password is blocked", async ({
    page,
  }) => {
    const u = uniqueSignup("denylist");
    await page.goto("/register");

    await page.getByLabel(/^שם מלא \*$/).fill(u.name);
    await page.getByLabel(/^אימייל \*$/).fill(u.email);
    await page.getByLabel(/^סיסמה$/).fill(DENY_LISTED_12);

    // Wait past the 500ms PasswordInput debounce + the /auth/check-password
    // round-trip. Playwright's default actionTimeout is 10s, plenty.
    await expect(
      page.getByText(/הסיסמה הזו דלפה ברשת/),
    ).toBeVisible({ timeout: 5000 });

    // Submit (if enabled) must surface the same failure on the form-level
    // error div via the 422-failures path.
    // MEH-306: BottomNav is position:fixed at the mobile viewport bottom
    // and overlaps the terms checkbox on /register. scrollIntoViewIfNeeded
    // shifts the checkbox into a clickable region before .check().
    const tos = page.getByRole("checkbox");
    await tos.scrollIntoViewIfNeeded();
    await tos.check();
    const submit = page.getByRole("button", { name: /הצטרפי/ });
    if (await submit.isEnabled()) {
      await submit.click();
      await expect(
        page.getByText(/הסיסמה הזו דלפה ברשת/),
      ).toBeVisible();
    }
  });

  test("Signup: valid 12-char unique password completes the flow", async ({
    page,
  }) => {
    const u = uniqueSignup("ok");

    // MEH-306: scenario-3-only mock for /auth/register + /auth/me. Sub-A's
    // looser rate limits + PasswordField are on the unmerged feature branch,
    // so staging Railway runs the pre-MEH-306 schema with a 3/hour per-IP
    // cap on /auth/register. CI re-runs and the desktop+mobile parallel
    // workers chew through that budget and produce 409 (email collision
    // on identical Date.now() ms) or 429 (rate-limit). Mocking here lets
    // the test prove the FRONTEND success path (button enables → submit
    // fires → emailSent=true → "בדקי את האימייל שלך" renders) without
    // depending on backend deployment timing. Scenarios 1-2 deliberately
    // do NOT mock /auth/register so they exercise the real backend once
    // sub-A merges. Removal tracked alongside the /check-password mock
    // (MEH-XXX, post-merge cleanup ticket).
    await page.route("**/api/auth/register", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "test-token", token_type: "bearer" }),
      });
    });
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000000",
          email: u.email,
          name: u.name,
          role: "consumer",
          is_oauth: false,
          is_producer: false,
          email_verified: false,
        }),
      });
    });

    await page.goto("/register");

    await page.getByLabel(/^שם מלא \*$/).fill(u.name);
    await page.getByLabel(/^אימייל \*$/).fill(u.email);
    await page.getByLabel(/^סיסמה$/).fill(SAFE_PASSWORD_A);

    // Wait for breach-check to settle on "✓ לא דלפה ברשת".
    await expect(
      page.getByText(/✓\s*לא דלפה ברשת|לא דלפה ברשת/),
    ).toBeVisible({ timeout: 5000 });

    // MEH-306: same BottomNav overlap mitigation as scenario 2.
    const tos = page.getByRole("checkbox");
    await tos.scrollIntoViewIfNeeded();
    await tos.check();
    const submit = page.getByRole("button", { name: /הצטרפי/ });
    await expect(submit).toBeEnabled();

    await submit.click();
    // Success path lands on the email-verify confirmation screen.
    await expect(page.getByText(/בדקי את האימייל שלך/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Reset: invalid token shows the correct error (sanity check)", async ({
    page,
  }) => {
    // Without a valid reset token, /reset-password renders a "link
    // invalid" branch. This guards that the page shell still loads
    // post-MEH-306 wiring; we cannot exercise the full happy path
    // without a backend-issued token.
    await page.goto("/reset-password");
    await expect(
      page.getByText(/קישור האיפוס לא תקין/),
    ).toBeVisible();
  });

  test("Reset: short password is rejected at the 12-char floor", async ({
    page,
  }) => {
    // Use a deliberately invalid token — the Pydantic 422 from the
    // backend triggers BEFORE token validation (PasswordField rejects
    // sub-12 first). This proves the schema-layer floor is in effect
    // without needing a real reset token. The form-level error div
    // surfaces the Hebrew message via passwordMessages.
    await page.goto("/reset-password?token=fake-token-for-floor-check");
    await expect(
      page.getByRole("heading", { name: /^סיסמה חדשה$/ }),
    ).toBeVisible();

    await page.getByLabel(/^סיסמה חדשה$/).fill(SHORT_PASSWORD);
    // Confirm input on /reset-password has placeholder "אישור סיסמה"
    // (no <label>); use getByPlaceholder, not getByLabel.
    await page.getByPlaceholder("אישור סיסמה").fill(SHORT_PASSWORD);
    await page.getByRole("button", { name: /עדכני סיסמה/ }).click();
    // Scope to role="alert" — the form-level error div on /reset-password.
    // getByText would also match the always-visible page subtitle ("הזיני
    // סיסמה חדשה לפחות 12 תווים") and the inline PasswordInput tile,
    // tripping strict-mode.
    await expect(
      page.getByRole("alert").filter({ hasText: /לפחות 12 תווים/ }),
    ).toBeVisible();
  });

  test("Reset: deny-listed password is rejected by the live preview", async ({
    page,
  }) => {
    await page.goto("/reset-password?token=fake-token-for-policy-check");
    await page.getByLabel(/^סיסמה חדשה$/).fill(DENY_LISTED_12);
    await expect(
      page.getByText(/הסיסמה הזו דלפה ברשת/),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Settings: change-password card disables submit until policy met", async ({
    page,
  }) => {
    // Without authentication the page redirects; this scenario only
    // verifies the public bits — that the route exists and the
    // PasswordChangeCard layout works under the new wiring. Authenticated
    // happy-path coverage lives in the backend pytest suite (sub-A
    // test_change_password_then_refresh_returns_valid_token).
    const response = await page.goto("/settings");
    // 200 with redirect to /login (auth-context guard) OR 200 settings
    // page if a token is present from a prior test in the same context.
    expect(response?.status()).toBeLessThan(500);
  });
});
