import { test, expect, type Page } from "../_cloudinary-stub";
import { PASSWORD_MIN_LENGTH } from "../../../lib/validators";

/**
 * Spec:     manual/auth
 * Purpose:  docs/MANUAL_TESTING.md → the `/login` + `/register` sections,
 *           converted under MEH-1249 stage 2 (chunk 10 — one page per PR).
 *           Every test carries a `// MT:<section>:<n>` marker naming the
 *           matrix row it discharges (docs/qa/manual-testing-matrix.md).
 * Touches:  READ PATH ONLY on both pages. Nothing is submitted — no
 *           `POST /auth/register`, no `POST /auth/login`, no account and no
 *           session is created anywhere in this file. The single outbound
 *           call any test here provokes is the debounced
 *           `POST /auth/check-password` that `PasswordInput` fires past
 *           `PASSWORD_MIN_LENGTH`, and that one is stubbed (see below).
 * Does NOT: assert a completed registration, a completed sign-in, the
 *           post-login landing, the refresh-token lifecycle, or the Google /
 *           Apple providers' own flows. Those rows are named in
 *           § "What this file does NOT convert" with their reasons.
 * Locators: every ELEMENT under test is reached by `getByTestId`
 *           (docs/E2E-LOCATORS.md). Two kinds of thing here are not elements
 *           with testids, and both are addressed by what they say:
 *             · the eye toggle on `/login`, which the page renders without a
 *               testid, reached by ARIA role + accessible NAME — and that name
 *               is itself one of the assertions;
 *             · the validation MESSAGES on both pages («האימייל לא תקין»,
 *               «✓ תקין», «הזינו סיסמה», «שם מלא הוא שדה חובה») and the hero
 *               overlay copy, none of which carry a testid. Several of those
 *               are absence assertions, where the string IS the subject: the
 *               claim is that a particular sentence does not render.
 *           So this file uses `getByText` deliberately and not incidentally.
 *           Every such string is quoted from `messages/he.json` — a copy
 *           change moves the assertion, which is the trade the rule warns
 *           about and which is accepted here because the rows being converted
 *           are about the copy.
 * Related:  `flows/30-login-journey-c.spec.ts` (the MEH-215 sign-in journey,
 *           including the wrong-credentials path) and
 *           `flows/29-register-journey-a.spec.ts` (the consumer register
 *           journey against a mocked `POST /auth/register`). This file
 *           repeats neither: it owns the pre-submit surface only.
 * History:  MEH-1249 chunk 10 (creation).
 *
 * ── The one interception, and why it is a stub and not a mock ───────────────
 *
 * `components/PasswordInput.jsx:99-120` debounces a `POST /auth/check-password`
 * 500 ms after the value crosses `PASSWORD_MIN_LENGTH`. No test in this file
 * asserts anything about breach-checking; the call is incidental to every
 * subject here (submit gating, the eye toggle, the absence of a success
 * state). `frontend/e2e/CLAUDE.md` — *"Distinguish a stub from a mock"* —
 * makes that a stub, needing no justification against the three-condition
 * mock exception: removing the interception would change nothing about what
 * any assertion here reads. `flows/29-register-journey-a.spec.ts` intercepts
 * the identical endpoint for the identical reason, and is cited there as the
 * precedent for it.
 *
 * ── What this file does NOT convert, and why ────────────────────────────────
 *
 * · **MEH-326 (JWT refresh), 11 CONVERT rows.** Case A waits 16 real minutes
 *   for a 15-minute access TTL; Case C needs two independent browsers and a
 *   `POST /auth/logout-all-devices`. Both need a real authenticated session
 *   against the deployed backend, which is the destructive class Sapir's
 *   13/07 decision confines to `scripts/local-backend.sh`. Reported, not
 *   converted. (4 of the 15 are already COVERED — the matrix cites them.)
 * · **MEH-805 (post-login redirect), 4 CONVERT rows.** The `?redirect=`
 *   parameter's *construction* is converted below; where the user LANDS after
 *   authenticating is not, for the same reason.
 * · **Password policy wire-up (MEH-306), 11 rows.** All eleven are COVERED in
 *   the matrix. Cited, never duplicated.
 * · **Anti-enumeration (MEH-328), 5 rows.** 4 COVERED, 1 other; and every one
 *   of them registers an account.
 * · **The four `grep -rn '<string>' frontend/app/...` rows** under
 *   "Task-spec exactness". A source-text census is a vitest/source-guard
 *   subject, not a browser one — the matrix routes it that way itself.
 * · **"Google popup opens and completes", "Apple Sign-In still works".** Both
 *   hand off to a third-party origin the CI runner does not reach.
 * · **`accounts.google.com/gsi/style` returns 200.** Asserting a third-party
 *   asset's status from the runner measures the runner's egress, not this
 *   product. A red there would name the wrong thing.
 * · **"zero CSP violations on load".** A console/`securitypolicyviolation`
 *   listener that reports nothing is the null that is also the reassuring
 *   answer (.claude/rules/testing.md), and no control is available that
 *   provokes a real violation on this page without editing the CSP.
 */

const LOGIN = "/login";
const REGISTER = "/register";

/** Long enough to clear `PASSWORD_MIN_LENGTH`, so the submit-gating tests
 *  exercise the same branch a real password would. Derived from the shipped
 *  constant rather than typed: the checklist this gate reads is
 *  `lib/validators.js:25`, which is **12** today and which the manual doc
 *  still calls 8 in six places. A literal here would have encoded the doc's
 *  number and made the gate test pass for the wrong reason. */
const VALID_PASSWORD = `Ab1${"c".repeat(Math.max(0, PASSWORD_MIN_LENGTH - 3))}`;

/** Silences the incidental debounced breach check — see the file header.
 *  `failures: []` is the shape `PasswordInput` reads (`:106-109`). */
async function stubBreachCheck(page: Page): Promise<void> {
  await page.route("**/auth/check-password", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ failures: [] }),
    }),
  );
}

/** The rendered `content` of `<meta name="robots">`, or `null` when the page
 *  ships no such tag. Both are meaningful answers here — the regression half
 *  of the noindex row asserts the absence. */
function robotsContent(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MEH-641 PR-A — auth chrome noindex verification
// ────────────────────────────────────────────────────────────────────────────

test.describe("manual › auth chrome is noindex, and the public pages are not (MEH-641)", () => {
  const PRIVATE = ["/login", "/register", "/contact", "/search"];
  const PUBLIC = ["/", "/about", "/map", "/terms", "/privacy"];

  for (const locale of ["he", "en"] as const) {
    // MT:MEH-641:1 — the matrix carries this as one row covering both locales.
    test(`/${locale}: the four auth-chrome pages carry noindex and the five public ones do not`, async ({
      page,
    }) => {
      const noindexed: string[] = [];
      const indexed: string[] = [];

      for (const path of [...PRIVATE, ...PUBLIC]) {
        await page.goto(`/${locale}${path}`);
        const content = await robotsContent(page);
        (content?.includes("noindex") ? noindexed : indexed).push(path);
      }

      // Asserted as an exact partition rather than "every private page has
      // noindex": a spec that only checked the private half would pass just as
      // happily against a build that noindexed the entire site, which is the
      // failure this row exists to catch. Sorting keeps the message readable
      // when it does go red.
      expect(noindexed.sort(), `/${locale} — pages serving <meta name="robots" content="noindex">`).toEqual(
        [...PRIVATE].sort(),
      );
      expect(indexed.sort(), `/${locale} — pages a crawler is allowed to index`).toEqual([...PUBLIC].sort());
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Password visibility toggle (task 7) — both pages
// ────────────────────────────────────────────────────────────────────────────

test.describe("manual › the password eye toggle on both auth pages", () => {
  // MT:eye-toggle:2-3 + :33 — /login: the eye flips the input type both ways,
  // and its accessible name + `aria-pressed` follow the state. NOT row 1 (the
  // icon's POSITION — see the file header's note on what is not asserted) and
  // NOT row 4 (which phosphor component renders): neither is read here, so
  // neither is claimed.
  test("/login: the eye flips the field between password and text, and says which state it is in", async ({
    page,
  }) => {
    await page.goto(LOGIN);
    const field = page.getByTestId("login-password");
    await expect(field).toHaveAttribute("type", "password");

    // The button carries no testid — it is reached by role + accessible name,
    // and the name itself is the assertion's subject on the next three lines.
    const eye = page.getByRole("button", { name: "הצגת סיסמה" });
    await expect(eye).toBeVisible();
    await expect(eye).toHaveAttribute("aria-pressed", "false");

    await eye.click();
    await expect(field).toHaveAttribute("type", "text");
    const eyeShown = page.getByRole("button", { name: "הסתרת סיסמה" });
    await expect(eyeShown).toHaveAttribute("aria-pressed", "true");

    await eyeShown.click();
    await expect(field).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "הצגת סיסמה" })).toHaveAttribute("aria-pressed", "false");
  });

  // MT:eye-toggle:5 + :6 — /register runs the same control through
  // `PasswordInput`, which DOES expose a testid, and the row about reaching it
  // from the keyboard.
  test("/register: the same control, reachable from the keyboard, with its own copy", async ({ page }) => {
    await stubBreachCheck(page);
    await page.goto(REGISTER);
    const field = page.getByTestId("register-password");
    const eye = page.getByTestId("register-password-toggle");

    await expect(field).toHaveAttribute("type", "password");
    await expect(eye).toHaveAttribute("aria-pressed", "false");

    // The keyboard row: focus the field, then Tab — focus must land on the
    // toggle, and Enter must operate it. Asserted through the field's type so
    // the check is about the control working, not about focus for its own sake.
    await field.focus();
    await page.keyboard.press("Tab");
    await expect(eye).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(field).toHaveAttribute("type", "text");
    await expect(eye).toHaveAttribute("aria-pressed", "true");

    await eye.click();
    await expect(field).toHaveAttribute("type", "password");
  });

  // MT:eye-toggle:7 — the two pages do not share the string. This is asserted
  // rather than reported so the divergence cannot widen silently; which of the
  // two is correct is a copy ruling (rule 22), not this spec's call.
  test("the two pages label the identical control with two different strings", async ({ page }) => {
    await stubBreachCheck(page);
    await page.goto(LOGIN);
    await expect(page.getByRole("button", { name: "הצגת סיסמה" })).toBeVisible();

    await page.goto(REGISTER);
    await expect(page.getByTestId("register-password-toggle")).toHaveAttribute(
      "aria-label",
      "הציגו סיסמה",
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Inline validation — /login (task 8)
// ────────────────────────────────────────────────────────────────────────────

test.describe("manual › /login inline validation and submit gating", () => {
  // MT:eye-toggle:8-12 + :34 — the email field's three states, the gate, and
  // the `aria-invalid` row. NOT row 16 (the server-error path): that submits
  // credentials, which this file never does.
  test("email: neutral while untouched-empty, red with a message when malformed, green once fixed", async ({
    page,
  }) => {
    await page.goto(LOGIN);
    const email = page.getByTestId("login-email");
    const submit = page.getByTestId("login-submit");
    const invalid = page.getByText("האימייל לא תקין", { exact: true });
    const valid = page.getByText("✓ תקין", { exact: true });

    await expect(submit).toBeDisabled();

    // touched-but-empty is deliberately neutral, not an error.
    await email.click();
    await page.getByTestId("login-password").click();
    await expect(invalid).toHaveCount(0);
    await expect(valid).toHaveCount(0);
    await expect(email).not.toHaveAttribute("aria-invalid", "true");

    await email.fill("foo");
    await page.getByTestId("login-password").click();
    await expect(invalid).toBeVisible();
    await expect(email).toHaveAttribute("aria-invalid", "true");

    await email.fill("valid@example.com");
    await expect(invalid).toHaveCount(0);
    await expect(valid).toBeVisible();
    await expect(email).not.toHaveAttribute("aria-invalid", "true");

    // Still disabled: the password half of the gate has not been satisfied.
    await expect(submit).toBeDisabled();
    await page.getByTestId("login-password").fill("x");
    await expect(submit).toBeEnabled();
  });

  // MT:eye-toggle:15 — and rows 13-14 are STALE rather than converted, which is
  // the subject of this comment. The doc describes an 8-character floor with the
  // message «סיסמא חייבת להכיל לפחות 8 תווים». There is no floor on /login and
  // that string is not this page's copy: MEH-835 removed the minimum on
  // purpose, because login validates a stored hash and legacy short passwords
  // must still sign in (`LoginClient.jsx:290-293`). What this asserts is the
  // behaviour that replaced it — a single character satisfies the field — so
  // the test goes red if a floor is ever reintroduced.
  test("password: one character is enough, and no length message is shown at any point", async ({
    page,
  }) => {
    await page.goto(LOGIN);
    const email = page.getByTestId("login-email");
    const password = page.getByTestId("login-password");
    const anyLengthMessage = page.getByText(/לפחות \d+ תווים/);

    await email.fill("valid@example.com");
    await password.click();
    await email.click(); // blur the password with nothing in it
    await expect(anyLengthMessage).toHaveCount(0);

    await password.fill("abc");
    await expect(anyLengthMessage).toHaveCount(0);
    await expect(page.getByTestId("login-submit")).toBeEnabled();
  });

  // MT:eye-toggle:12 — the password field's touched-empty state. Until
  // MEH-2256 the row read "tap then tap away empty → no error" and the spec
  // asserted exactly that, because `LoginClient.jsx` computed
  //   passwordTouched && password.length > 0 && password.length < 1
  // — a predicate no integer satisfies, so «הזינו סיסמה» and `aria-invalid`
  // were unreachable in every state a user can produce. MEH-2256 option 1
  // made the branch reachable (`password.length === 0`), so this row now
  // asserts the accessible error state the branch always existed to give a
  // screen reader; the three states below are exhaustive over the predicate's
  // inputs (untouched, touched-empty, touched-non-empty). Against the pre-fix
  // component the touched-empty expectations go red — that is the bug.
  test("password: neutral while untouched, «הזינו סיסמה» + aria-invalid once blurred empty, clear again when typed", async ({
    page,
  }) => {
    await page.goto(LOGIN);
    const password = page.getByTestId("login-password");
    const email = page.getByTestId("login-email");
    const required = page.getByText("הזינו סיסמה", { exact: true });

    await expect(required).toHaveCount(0); // untouched
    await expect(password).not.toHaveAttribute("aria-invalid", "true");

    await password.click();
    await email.click();
    await expect(required).toBeVisible(); // touched, empty
    await expect(password).toHaveAttribute("aria-invalid", "true");

    await password.fill("x");
    await email.click();
    await expect(required).toHaveCount(0); // touched, non-empty
    await expect(password).not.toHaveAttribute("aria-invalid", "true");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MEH-1919 — quiet fields on the consumer register form
// ────────────────────────────────────────────────────────────────────────────

test.describe("manual › /register says nothing when a field is merely correct (MEH-1919)", () => {
  // MT:MEH-1919:1-4 — the whole point of that ticket: success is silent.
  test("a filled name and a valid email produce no check, no «תקין», no success text", async ({ page }) => {
    await stubBreachCheck(page);
    await page.goto(REGISTER);
    const name = page.getByTestId("register-name");
    const email = page.getByTestId("register-email");
    const valid = page.getByText("✓ תקין", { exact: true });

    await name.fill("שרה");
    await email.click(); // blur the name with a good value in it
    await expect(valid).toHaveCount(0);

    await email.fill("sara@example.com");
    await expect(valid).toHaveCount(0); // still typing
    await name.click(); // blur the email with a good value in it
    await expect(valid).toHaveCount(0);
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
  });

  // MT:MEH-1919:5 + MT:eye-toggle:18 + :20 — errors were explicitly NOT part of
  // what that ticket
  // silenced, and they persist while the value is still wrong.
  test("errors still appear on blur, and stay put while the value is still wrong", async ({ page }) => {
    await stubBreachCheck(page);
    await page.goto(REGISTER);
    const name = page.getByTestId("register-name");
    const email = page.getByTestId("register-email");

    await name.click();
    await email.click();
    await expect(page.getByText("שם מלא הוא שדה חובה", { exact: true })).toBeVisible();

    await email.fill("foo");
    await name.click();
    const emailError = page.getByText("האימייל לא תקין", { exact: true });
    await expect(emailError).toBeVisible();

    await email.fill("fooo"); // still malformed — the error must not flicker off
    await expect(emailError).toBeVisible();

    await email.fill("valid@example.com");
    await expect(emailError).toHaveCount(0);
  });

  // MT:eye-toggle:17 + :28 — the register gate: row 17 is «disabled on load»,
  // row 28 the four-condition rule. The test walks the last condition on its own
  // so the assertion is falsifiable by dropping any single one rather than only
  // by dropping the whole gate. Rows 19-27 in between are STALE or absent from
  // the page (the success affordance, the strength bar, phone, city) and are
  // reported in `docs/qa/conversion-progress.md`, not converted.
  test("submit stays disabled until name, email, password AND the terms box are all satisfied", async ({
    page,
  }) => {
    await stubBreachCheck(page);
    await page.goto(REGISTER);
    const submit = page.getByTestId("register-submit");

    await expect(submit).toBeDisabled();
    await page.getByTestId("register-name").fill("שרה");
    await expect(submit).toBeDisabled();
    await page.getByTestId("register-email").fill("sara@example.com");
    await expect(submit).toBeDisabled();
    await page.getByTestId("register-password").fill(VALID_PASSWORD);
    await expect(submit).toBeDisabled(); // everything filled, terms still unticked

    await page.getByTestId("register-terms").check();
    await expect(submit).toBeEnabled();

    // …and untick again: the gate is a live predicate, not a one-way latch.
    await page.getByTestId("register-terms").uncheck();
    await expect(submit).toBeDisabled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MEH-788 — /register split-editorial
// ────────────────────────────────────────────────────────────────────────────

test.describe("manual › /register split-editorial layout (MEH-788)", () => {
  // MT:MEH-788:2 + :3 — two panes side by side at ≥1024, image covering its
  // own pane, overlay legible over the scrim.
  test("desktop: form pane at the start edge, image pane at the end edge, overlay over the image", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "the two-pane grid is a ≥1024px layout");
    await page.goto(REGISTER);

    const form = page.getByTestId("register-form-pane");
    const hero = page.getByTestId("register-hero-pane");
    const formBox = (await form.boundingBox())!;
    const heroBox = (await hero.boundingBox())!;

    // RTL page: START is the right edge. The form must be the right-hand pane.
    expect(
      formBox.x,
      "the form pane sits at the START side — which on this RTL page is the RIGHT of the image pane in screen coordinates",
    ).toBeGreaterThan(heroBox.x);
    // Side by side, not stacked.
    expect(Math.abs(formBox.y - heroBox.y), "both panes start at the same y").toBeLessThan(4);

    const overlay = page.getByText("טרי · מקומי · מהמקור", { exact: true });
    await expect(overlay).toBeVisible();
    const overlayBox = (await overlay.boundingBox())!;
    expect(
      overlayBox.x >= heroBox.x - 1 && overlayBox.x + overlayBox.width <= heroBox.x + heroBox.width + 1,
      "the overlay is inside the image pane, not floating over the form",
    ).toBe(true);
  });

  // MT:MEH-788:4 — mobile stacks image over form, and the page must not scroll
  // sideways.
  test("mobile: the image band sits above the form, and nothing scrolls sideways", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "the stacked band is the <1024px layout");
    await page.goto(REGISTER);

    const formBox = (await page.getByTestId("register-form-pane").boundingBox())!;
    const heroBox = (await page.getByTestId("register-hero-pane").boundingBox())!;
    expect(heroBox.y + heroBox.height, "the image band ends above where the form begins").toBeLessThanOrEqual(
      formBox.y + 1,
    );

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow in CSS pixels").toBeLessThanOrEqual(0);
    await expect(page.getByTestId("register-form")).toBeVisible();
  });

  // MT:MEH-788:1 — the headline scale matches /login's, and the three-feature
  // strip is gone. Asserted by the absence of all three of its strings, which
  // are still present in `messages/he.json` — so re-adding the strip reds this.
  test("the heading matches /login's scale and the three-feature strip is absent", async ({ page }) => {
    await page.goto(LOGIN);
    const loginHeadingSize = await page
      .getByRole("heading", { level: 1 })
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize);

    await page.goto(REGISTER);
    const heading = page.getByTestId("register-heading");
    await expect(heading).toHaveText("הצטרפו לקהילה");
    expect(
      await heading.evaluate((el) => getComputedStyle(el).fontSize),
      "the register headline is on the same utility-page scale as /login's",
    ).toBe(loginHeadingSize);

    for (const stripString of ["גלו בתי עסק", "שמרו מועדפים", "דרגו ושתפו"]) {
      await expect(page.getByText(stripString, { exact: true })).toHaveCount(0);
    }
  });

  // MT:MEH-788:6 — the English mirror carries the translated overlay.
  test("/en/register: the overlay is in English and the heading with it", async ({ page }) => {
    await page.goto("/en/register");
    await expect(page.getByText("Fresh · Local · From the source", { exact: true })).toBeVisible();
    await expect(page.getByTestId("register-heading")).toHaveText("Join the community");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MEH-805 — post-login redirect: the half that is observable without a session
// ────────────────────────────────────────────────────────────────────────────

test.describe("manual › a guest sent to /login carries where they came from (MEH-805)", () => {
  // MT:MEH-805:3 — the sender this converts is the experience-publishing
  // route, which redirects to the dashboard and whose gate then sends a guest
  // to /login. Where the user lands AFTER authenticating is the destructive
  // half and is not converted (see the file header).
  test("a guest opening the publish route arrives at /login with a redirect back to it", async ({ page }) => {
    // Entered at the route the row names. It no longer renders a page of its
    // own — PR #3382 moved experience creation under the dashboard and left a
    // 308 behind — so this walks 308 → dashboard gate → /login, which is the
    // row's flow as it exists today rather than as it was written.
    await page.goto("/experiences/new");
    await page.waitForURL(/\/login\?/);

    const url = new URL(page.url());
    expect(url.pathname, "the guest is on the login page").toBe("/login");
    const back = url.searchParams.get("redirect");
    // Locale-STRIPPED, because the gate reads `pathname` from
    // `@/i18n/navigation` (`producer/dashboard/layout.js:113-119` says so in
    // as many words) and LoginClient re-adds the locale on the way back.
    expect(back, "…carrying the path they were trying to reach").toBe(
      "/producer/dashboard/experiences/new",
    );
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  // NOT MT:MEH-805:4. That row is «/register/producer still returns to
  // /register/producer after login», and it does not hold as written: a GUEST
  // on /register/producer sees the wizard, not a redirect — the gate at
  // `RegisterProducerClient.jsx:788` fires only for an authenticated producer
  // or admin. Its subject is therefore the post-login landing, which is the
  // destructive half. What this test adds instead is the property that makes
  // the row above worth having: a SECOND sender through the same gate, so a
  // change that hardcoded one path cannot pass both.
  test("a second dashboard route sends a guest back to itself the same way", async ({ page }) => {
    await page.goto("/he/producer/dashboard/edit");
    await page.waitForURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/producer/dashboard/edit");
  });
});
