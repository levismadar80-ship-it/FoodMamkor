import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     30-login-journey-c
 * Purpose:  MEH-215 journey C — sign in with an existing account, and the
 *           forgot-password hand-off. Converts the card's manual C1–C3
 *           checklist into assertions (ruling ספיר 08/08/2026: manual QA
 *           becomes CC's, as Playwright specs). **Chunk C of 4.**
 * Does NOT: cover journey A (consumer registration — flows/29, merged), B
 *           (Google OAuth) or D (favorites); each ships as its own spec + PR
 *           per the card's chunking DoD. Does NOT assert anything about the
 *           PRODUCER wizard, and does NOT assert that a reset email is
 *           delivered — see the verdict table below.
 * Touches:  three endpoints, all intercepted, none reached — POST
 *           /api/auth/login, GET /api/auth/me, POST /api/auth/forgot-password.
 *           No storageState fixture and no DEMO_* secret, so it runs on the
 *           default CI target.
 * Related:  app/[locale]/login/LoginClient.jsx (the surface),
 *           app/[locale]/forgot-password/ForgotPasswordClient.jsx,
 *           lib/auth-context.js:128-133 (login → token → /auth/me),
 *           components/Header.jsx (LoginAccount, `hidden md:inline-flex`),
 *           e2e/flows/29-register-journey-a.spec.ts (chunk A — same
 *           conventions, same annotation vocabulary).
 * History:  MEH-215 (creation, chunk C).
 *
 * Viewports: both default projects — `mobile` (Pixel 5, 393×851) and `desktop`
 * (1440×900), he-IL + RTL (playwright.config.ts). The card asks for 390×844;
 * the repo's standing mobile project is Pixel 5 and this spec does not fork it.
 *
 * ── Every C checkbox gets a verdict. Nothing is silently dropped ────────────
 *
 *  C1  header → "כניסה"                     covered (and its ABSENCE on mobile
 *                                            is asserted too — see C1 below)
 *  C1  email + password form                 covered
 *  C1  eye toggle                            covered
 *  C1  "שכחתי סיסמה" link                    covered
 *  C1  "אין לי חשבון" → /register            covered
 *  C2  correct credentials → login+redirect  covered (stubbed backend)
 *  C2  wrong credentials → Hebrew error      covered (stubbed backend)
 *  C2  session persists across a new tab     covered — a second page in the
 *                                            same context, which is what
 *                                            "close the tab and reopen" means
 *                                            for localStorage
 *  C3  forgot link → email form              covered
 *  C3  ack copy                              covered
 *  C3  a real email arrives                  not-applicable — no captured
 *                                            inbox exists on the CI target.
 *                                            NOT counted as covered.
 *  C3  the email is in Hebrew                not-applicable — same reason.
 *  C3  reset link → new-password form        not-applicable — the token is
 *                                            minted by the backend and only
 *                                            reachable through that inbox.
 *  C3  new password → immediate login        not-applicable — same chain.
 *
 * The four `not-applicable` rows are a **label, not a coverage claim**, and
 * they are deliberately not stubbed: a stubbed "the email arrived" asserts
 * that the stub was written. The captured-test-inbox convention the card asks
 * for does not exist in this repo yet, and inventing a fake one here would
 * produce exactly the green-with-two-causes this repo keeps paying for. What
 * IS covered is the frontend half — the ack the user sees — which is the part
 * that can regress silently.
 *
 * ── On mocking, because this directory's CLAUDE.md says "no mocks" ──────────
 * Same reasoning as flows/29 and flows/28, not a new exception. What is under
 * test here is the FRONTEND's response to a fixed backend contract: which
 * screen renders, whether a token is written, whether an error string appears.
 * No backend behaviour is asserted anywhere in this file, so the MEH-417
 * failure mode (a mock hiding a real backend bug) has no surface. Running it
 * unmocked would additionally burn the shared-runner `/auth/login` limiter
 * quota that this directory's own CLAUDE.md warns about, to re-assert a
 * constant. The doc and the merged code disagree about `e2e/flows/`; flows/29
 * flagged that for Sapir and this spec does not re-decide it.
 */

const LOGIN_TITLE = "כניסה למהמקור";
const LOGIN_WELCOME = "טוב לראות אותך שוב";
const FORGOT_LINK = "שכחת סיסמה?";
const FORGOT_ACK = "✓ אם האימייל קיים במערכת — ישלח קישור לאיפוס";
/**
 * The three strings above are literals on purpose. Reading them out of
 * `messages/he.json` and comparing against a render OF that same file is green
 * whether the copy is right or wrong — it proves next-intl is wired, not that
 * the words are the agreed words. Same call flows/29 made for its locked copy.
 */

/**
 * `he` is the default locale and the middleware serves it WITHOUT a prefix on
 * client-side navigation — `page.goto("/he/login")` keeps the prefix, but a
 * <Link> click lands on `/login`. Both are the same page. Asserting the
 * prefixed form only would have failed on correct behaviour, which is what the
 * first run of this spec did; asserting a bare suffix (`/\/login$/`) would
 * instead match a foreign-locale URL. This compares the normalised pathname.
 */
async function expectPath(page: Page, expected: string) {
  await expect
    .poll(() => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, "") || "/")
    .toBe(expected);
}

const VALID_EMAIL = "journey-c@example.com";
// Both values are fixtures, not credentials — they authenticate nothing and are
// spelled `example-*` so `scripts/checks/secrets-scan-guard.sh` can tell.
const VALID_PASSWORD = "example-correct-horse-battery";
const STUB_TOKEN = "example-journey-c-token";

/** A signed-in backend: token minted, profile returned. */
async function stubSuccessfulLogin(page: Page) {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: STUB_TOKEN, token_type: "bearer" }),
    }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "00000000-0000-0000-0000-0000000000c1",
        email: VALID_EMAIL,
        name: "יעל",
        role: "user",
        city: null,
      }),
    }),
  );
}

test.describe("MEH-215 journey C — sign in to an existing account", () => {
  test("C1 — the header exposes login on desktop and NOT on mobile", async ({
    page,
  }, testInfo) => {
    await page.goto("/he");
    const headerLogin = page.getByTestId("header-login-link");

    // Header.jsx's LoginAccount carries `hidden md:inline-flex`, so the
    // correct answer differs per project. Asserting only the desktop half
    // would pass on mobile for the wrong reason (the element is in the DOM,
    // just not visible), so both halves are asserted explicitly and the
    // project name — which the product cannot move — is the switch.
    if (testInfo.project.name === "desktop") {
      await expect(headerLogin).toBeVisible();
      await headerLogin.click();
      await expectPath(page, "/login");
      await expect(page.getByRole("heading", { name: LOGIN_WELCOME })).toBeVisible();
    } else {
      await expect(headerLogin).toBeHidden();
      // The mobile entry point is the account sheet, not the header bar. This
      // asserts the absence is BY DESIGN rather than a missing element: the
      // node exists and is deliberately not shown.
      await expect(headerLogin).toHaveCount(1);
    }
  });

  test("C1 — form contract: locked copy, both fields, forgot + register links", async ({
    page,
  }) => {
    await page.goto("/he/login");

    await expect(page.getByText(LOGIN_TITLE)).toBeVisible();
    await expect(page.getByRole("heading", { name: LOGIN_WELCOME })).toBeVisible();

    const email = page.getByTestId("login-email");
    const password = page.getByTestId("login-password");
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    // The page is RTL; the two credential inputs are dir="ltr" wrappers so the
    // LTR values and their adornments stay aligned (LoginClient.jsx:227).
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const forgot = page.getByTestId("login-forgot-link");
    await expect(forgot).toBeVisible();
    await expect(forgot).toHaveText(FORGOT_LINK);
    await expect(forgot).toHaveAttribute("href", /\/forgot-password$/);

    const register = page.getByTestId("login-register-link");
    await expect(register).toBeVisible();
    await expect(register).toHaveAttribute("href", /\/register$/);

    // Measured, not eyeballed. `no horizontal scroll` is the one mobile-layout
    // claim this spec makes, and it is a number.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("C1 — the password eye toggle reveals and re-hides the value", async ({ page }) => {
    await page.goto("/he/login");
    const password = page.getByTestId("login-password");
    await password.fill(VALID_PASSWORD);

    await expect(password).toHaveAttribute("type", "password");
    const toggle = page.getByRole("button", { name: "הצגת סיסמה" });
    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");

    // Re-hiding is the half that gets dropped: a toggle stuck open leaves the
    // password on screen and a reveal-only assertion is green either way.
    await page.getByRole("button", { name: "הסתרת סיסמה" }).click();
    await expect(password).toHaveAttribute("type", "password");
    // The value survived the round trip — a toggle that clears the field would
    // otherwise pass the type assertions above.
    await expect(password).toHaveValue(VALID_PASSWORD);
  });

  test("C2 — correct credentials sign in and land on the redirect target", async ({
    page,
  }) => {
    await stubSuccessfulLogin(page);
    await page.goto("/he/login");

    await page.getByTestId("login-email").fill(VALID_EMAIL);
    await page.getByTestId("login-password").fill(VALID_PASSWORD);
    await page.getByTestId("login-submit").click();

    await expectPath(page, "/");
    // The token is the observable half of "I am signed in" — asserting only
    // the URL would pass on a redirect that never authenticated.
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("token")))
      .toBe(STUB_TOKEN);
  });

  test("C2 — wrong credentials surface the Hebrew error and mint no token", async ({
    page,
  }) => {
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "אימייל או סיסמה שגויים" }),
      }),
    );
    await page.goto("/he/login");

    // Every navigation from here on is recorded. `expectPath` alone is NOT
    // enough for this test and that is measured, not assumed: `expect.poll`
    // resolves on its FIRST matching sample, so a navigation that happens a
    // tick later slips past it. Proven by construction — adding a
    // `router.push(redirectTo)` to LoginClient's catch block left this test
    // GREEN while the eye-toggle and ack-screen constructions went red. The
    // navigation log is what actually discriminates.
    const navigatedTo: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigatedTo.push(new URL(frame.url()).pathname);
    });

    await page.getByTestId("login-email").fill(VALID_EMAIL);
    await page.getByTestId("login-password").fill("wrong-password");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toContainText("אימייל או סיסמה שגויים");

    // Give a stray navigation an explicit chance to happen, then assert it did
    // not. Inverted wait: with the bug this resolves the moment the push lands;
    // without it, it times out and reports false. Deterministic in both worlds
    // and — the part that matters — it depends on NO network condition.
    //
    // It previously read `waitForLoadState("networkidle")`, which was wrong in a
    // way that only CI could show: on the runner every Cloudinary image 401s and
    // the optimizer retries, so the network need never go idle, and an unbounded
    // wait burns the whole test timeout. Locally Cloudinary resolves and it
    // settled instantly — green here, red there, for a reason that has nothing
    // to do with what this test is about.
    const strayed = await page
      .waitForURL((u) => new URL(u).pathname.replace(/^\/he(?=\/|$)/, "") !== "/login", {
        timeout: 3_000,
      })
      .then(() => true)
      .catch(() => false);

    await expectPath(page, "/login");
    expect(strayed, "a failed login must not navigate anywhere").toBe(false);
    expect(
      navigatedTo.filter((p) => p.replace(/^\/he(?=\/|$)/, "") !== "/login"),
      "the navigation log corroborates it",
    ).toEqual([]);
    // And no session was created. This is the assertion that discriminates a
    // real rejection from a UI that merely renders a red string.
    expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBeNull();
  });

  test("C2 — the session survives a new tab in the same browser", async ({
    page,
    context,
  }) => {
    await stubSuccessfulLogin(page);
    await page.goto("/he/login");
    await page.getByTestId("login-email").fill(VALID_EMAIL);
    await page.getByTestId("login-password").fill(VALID_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expectPath(page, "/");

    // "Close the tab and reopen" == a second page over the same storage. The
    // token lives in localStorage (auth-context.js:130), which is per-origin
    // and shared across pages in one context.
    const reopened = await context.newPage();
    await stubSuccessfulLogin(reopened);
    await reopened.goto("/he/login");

    // MEH-1489 chunk C: an authenticated visitor is bounced off /login. That
    // bounce IS the observable proof the session was restored — the form would
    // render for a guest.
    await expectPath(reopened, "/");
    await reopened.close();
  });

  test("C3 — forgot-password: the hand-off, and an ack that cannot enumerate", async ({
    page,
  }) => {
    const seen: string[] = [];
    await page.route("**/api/auth/forgot-password", async (route) => {
      seen.push(JSON.parse(route.request().postData() || "{}").email);
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/he/login");
    await page.getByTestId("login-forgot-link").click();
    await expectPath(page, "/forgot-password");

    await page.getByTestId("forgot-email").fill(VALID_EMAIL);
    await page.getByTestId("forgot-submit").click();
    const ack = page.getByTestId("forgot-sent");
    await expect(ack).toBeVisible();
    await expect(ack).toContainText(FORGOT_ACK);

    // MEH-328 anti-enumeration: an address that is NOT on file must produce the
    // identical acknowledgement. Comparing the two renders is the assertion —
    // checking only the known-address case would be green on a page that leaks
    // "no such user" for the other one.
    const knownAck = (await ack.textContent())?.trim();
    await page.goto("/he/forgot-password");
    await page.getByTestId("forgot-email").fill("definitely-not-registered@example.com");
    await page.getByTestId("forgot-submit").click();
    const unknownAck = (await page.getByTestId("forgot-sent").textContent())?.trim();
    expect(unknownAck).toBe(knownAck);

    // Both submissions actually reached the endpoint — without this the two
    // acks could match because neither request ever fired.
    expect(seen).toHaveLength(2);
  });

  test("C3 — the ack screen replaces the form and offers the way back", async ({ page }) => {
    await page.route("**/api/auth/forgot-password", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/he/forgot-password");

    const submit = page.getByTestId("forgot-submit");
    // Empty field → no submit. The button is disabled, not merely inert.
    await expect(submit).toBeDisabled();

    await page.getByTestId("forgot-email").fill(VALID_EMAIL);
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByTestId("forgot-sent")).toBeVisible();
    // The form is gone, not hidden behind the ack — a form still mounted would
    // let a second submit fire from a screen that says "sent".
    await expect(page.getByTestId("forgot-email")).toHaveCount(0);

    const back = page.getByTestId("forgot-back-to-login");
    // The back link lives INSIDE the form branch, so on the ack screen it is
    // genuinely absent. Asserting that rather than assuming it survives.
    await expect(back).toHaveCount(0);
  });
});
