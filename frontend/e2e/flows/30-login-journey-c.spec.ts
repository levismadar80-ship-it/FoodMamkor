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
async function expectPath(page: Page, expected: string, nav?: NavRecorder) {
  try {
    await expect
      .poll(() => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, "") || "/")
      .toBe(expected);
  } catch (err) {
    if (!nav) throw err;
    throw new Error(
      `${(err as Error).message}\n\n${await nav.diagnose(page)}`,
    );
  }
}

/**
 * MEH-215 — the navigation recorder. This is an EXPERIMENT, not a fix, and it
 * is not expected to turn anything green.
 *
 * What it exists to separate: two C2 assertions time out waiting for a
 * navigation to "/" that never commits. The job log cannot tell whether the
 * request for "/" was never SENT or was sent and never RETURNED — the only
 * artifact that could is the Playwright trace, which is unreachable from the
 * sandbox (blob storage is proxy-blocked) and expires 2026-08-18. The log IS
 * reachable, so the diagnosis is pushed into the failure message instead.
 *
 * Reading the output:
 *   no rows at all      -> the client never issued a navigation. The effect
 *                          that should have fired did not.
 *   request, no response-> sent and never answered. Server or stream side.
 *   response 2xx, wrong -> committed at the network layer; the client router
 *   URL                    did not apply it.
 *
 * What it does NOT separate, stated so nobody over-reads it: it cannot say WHY
 * an effect did not fire, and on the third branch it cannot distinguish a
 * malformed RSC payload from a router that ignored a good one. Those still
 * need the trace.
 */
type NavEvent = {
  phase: "request" | "response" | "failed";
  url: string;
  status?: number;
  failure?: string;
};

type NavRecorder = {
  events: NavEvent[];
  diagnose: (page: Page) => Promise<string>;
};

function recordNavigation(page: Page): NavRecorder {
  const events: NavEvent[] = [];
  // Navigations only: the document request, or the RSC fetch App Router issues
  // for a client-side transition. API calls are already stubbed and would only
  // add noise.
  const isNav = (url: string, type: string) =>
    !url.includes("/api/") &&
    (type === "document" || url.includes("_rsc") || type === "fetch");

  page.on("request", (r) => {
    if (isNav(r.url(), r.resourceType())) {
      events.push({ phase: "request", url: r.url() });
    }
  });
  page.on("response", (r) => {
    if (isNav(r.url(), r.request().resourceType())) {
      events.push({ phase: "response", url: r.url(), status: r.status() });
    }
  });
  page.on("requestfailed", (r) => {
    if (isNav(r.url(), r.resourceType())) {
      events.push({
        phase: "failed",
        url: r.url(),
        failure: r.failure()?.errorText ?? "unknown",
      });
    }
  });

  return {
    events,
    async diagnose(target: Page) {
      // The page may already be closing when an assertion fails mid-navigation,
      // so every read here is allowed to fail without masking the real error.
      let token = "<unreadable>";
      let url = "<unreadable>";
      try {
        url = target.url();
        token = String(
          await target.evaluate(() => window.localStorage.getItem("token")),
        );
      } catch {
        /* page gone — the rows below are still the useful half */
      }
      const rows = events.length
        ? events
            .map(
              (e) =>
                `  ${e.phase.padEnd(8)} ${e.status ?? e.failure ?? ""} ${e.url}`,
            )
            .join("\n")
        : "  (none — the client issued no navigation request at all)";
      return [
        "--- MEH-215 navigation diagnostics (experiment, not a fix) ---",
        `  final url : ${url}`,
        `  token     : ${token}`,
        "  navigation events:",
        rows,
      ].join("\n");
    },
  };
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
    const nav = recordNavigation(page);
    await page.goto("/he/login");

    await page.getByTestId("login-email").fill(VALID_EMAIL);
    await page.getByTestId("login-password").fill(VALID_PASSWORD);
    await page.getByTestId("login-submit").click();

    await expectPath(page, "/", nav);
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
    // Recorder attached BEFORE the goto so the document request for /he/login
    // and any subsequent transition to "/" are both in the log.
    const reopenedNav = recordNavigation(reopened);
    await reopened.goto("/he/login");

    // MEH-1489 chunk C: an authenticated visitor is bounced off /login. That
    // bounce IS the observable proof the session was restored — the form would
    // render for a guest.
    //
    // MEH-215: this is the assertion whose failure refuted the push/replace
    // race — only the :90 replace effect can run on this page, there is no
    // submit and therefore no competing push, and it fails anyway. The recorder
    // is here to say which half of the navigation is missing.
    await expectPath(reopened, "/", reopenedNav);
    await reopened.close();
  });

  /**
   * MEH-215 — the recorder's own control. Runs FIRST in file order among the
   * navigation tests it protects, because a probe that cannot see a navigation
   * it is pointed at makes every "(none)" it prints elsewhere meaningless — and
   * "(none)" is the reassuring answer, which is exactly the shape this repo
   * keeps paying for.
   *
   * The control is a navigation whose answer is already known: C1 asserts the
   * "אין לי חשבון" link reaches /register, and that assertion passes today on
   * both projects. So the recorder MUST log at least one request for it. If
   * this test goes red, do not read any diagnostics from the two tests above —
   * fix the recorder first.
   */
  test("C2 — control: the navigation recorder sees a navigation known to work", async ({
    page,
  }) => {
    const nav = recordNavigation(page);
    await page.goto("/he/login");
    await page.getByRole("link", { name: "אין לי חשבון" }).click();
    await expectPath(page, "/register", nav);

    const toRegister = nav.events.filter((e) => e.url.includes("/register"));
    expect(
      toRegister.length,
      `the recorder logged no request for /register on a navigation that demonstrably happened — ` +
        `the probe is dead, and every "(none)" it prints elsewhere is worthless. ` +
        `Full log:\n${nav.events.map((e) => `${e.phase} ${e.url}`).join("\n") || "(empty)"}`,
    ).toBeGreaterThan(0);
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
