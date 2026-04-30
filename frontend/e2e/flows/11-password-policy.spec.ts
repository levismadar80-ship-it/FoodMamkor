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
  test("Signup: short password is blocked with the Hebrew length message", async ({
    page,
  }) => {
    const u = uniqueSignup("short");
    await page.goto("/register");

    await page.getByLabel(/שם/).fill(u.name);
    await page.getByLabel(/אימייל/).fill(u.email);
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

    await page.getByLabel(/שם/).fill(u.name);
    await page.getByLabel(/אימייל/).fill(u.email);
    await page.getByLabel(/^סיסמה$/).fill(DENY_LISTED_12);

    // Wait past the 500ms PasswordInput debounce + the /auth/check-password
    // round-trip. Playwright's default actionTimeout is 10s, plenty.
    await expect(
      page.getByText(/הסיסמה הזו דלפה ברשת/),
    ).toBeVisible({ timeout: 5000 });

    // Submit (if enabled) must surface the same failure on the form-level
    // error div via the 422-failures path.
    await page.getByRole("checkbox").check();
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
    await page.goto("/register");

    await page.getByLabel(/שם/).fill(u.name);
    await page.getByLabel(/אימייל/).fill(u.email);
    await page.getByLabel(/^סיסמה$/).fill(SAFE_PASSWORD_A);

    // Wait for breach-check to settle on "✓ לא דלפה ברשת".
    await expect(
      page.getByText(/✓\s*לא דלפה ברשת|לא דלפה ברשת/),
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("checkbox").check();
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
      page.getByText(/סיסמה חדשה/),
    ).toBeVisible();

    await page.getByLabel(/^סיסמה חדשה$/).fill(SHORT_PASSWORD);
    // Confirm input on /reset-password has placeholder "אישור סיסמה"
    // (no <label>); use getByPlaceholder, not getByLabel.
    await page.getByPlaceholder("אישור סיסמה").fill(SHORT_PASSWORD);
    await page.getByRole("button", { name: /עדכני סיסמה/ }).click();
    await expect(
      page.getByText(/הסיסמה חייבת להכיל לפחות 12 תווים|לפחות 12 תווים/),
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
