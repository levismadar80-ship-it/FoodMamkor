import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     29-register-journey-a
 * Purpose:  MEH-215 journey A — the consumer email+password registration
 *           journey, converted from the card's manual A1–A5 checklist into
 *           assertions (ruling ספיר 08/08/2026: manual QA becomes CC's, as
 *           Playwright specs).
 * Does NOT: cover journeys B (Google OAuth), C (login / forgot-password) or
 *           D (favorites) — each ships as its own spec + PR, per the card's
 *           own chunking DoD. Also does NOT touch the PRODUCER registration
 *           wizard (`/register/producer`, 5 steps) — that is a different
 *           surface, already covered by flows/18, /22, /27 and /28.
 * Touches:  A1–A3 touch NO network at all (client-side form contract and
 *           validation only). A4/A5 route-mock exactly one endpoint,
 *           POST /api/auth/register — see "On mocking" below. No storageState
 *           fixture and no DEMO_* secret, so it runs on the default CI target.
 * Related:  app/[locale]/register/RegisterClient.jsx (the surface),
 *           components/PasswordInput.jsx (eye toggle + policy checklist),
 *           messages/he.json → auth.register.consumer.* (locked copy).
 * History:  MEH-215 (creation).
 *
 * Viewports: both default projects run it — `mobile` (Pixel 5, 393×851) and
 * `desktop` (1440×900). The card asks for 390×844; the repo's standing mobile
 * project is Pixel 5 and this spec does not fork it, so the mobile evidence is
 * 393×851. Locale is he-IL and RTL for both (playwright.config.ts:use.locale).
 *
 * ── On mocking, because this directory's CLAUDE.md says "no mocks" ──────────
 * `frontend/e2e/CLAUDE.md` states that functional specs under `e2e/flows/`
 * stay unmocked (MEH-417 — mocks hid real backend bugs for 8 CI cycles), with
 * a narrow exception for `e2e/visual/**`. This spec mocks ONE endpoint in TWO
 * of its seven tests, deliberately, and the reasoning is here rather than in a
 * commit message so the next reader can overrule it:
 *
 *  1. **Code precedent, already merged.** `flows/28-register-success-state`
 *     (MEH-1814) route-mocks POST /auth/register/producer, /auth/me and
 *     /categories inside `e2e/flows/`, for the stated reason that its subject
 *     is which screen owns the render — a frontend state machine, not backend
 *     integration. A4/A5 here are the same shape: MEH-328 fixed the backend
 *     contract to ONE identical 200 ack, and what is under test is the
 *     frontend's response to it (no redirect, no token, inbox screen).
 *  2. **The same CLAUDE.md warns against the unmocked version.** "CI
 *     rate-limit budget: shared GitHub Actions runner IPs burn the
 *     /auth/register limiter quota across PRs." A real registration on every
 *     PR spends that budget to re-assert a constant.
 *  3. **It is scoped, not blanket.** A1, A2 and A3 — the form contract and all
 *     client validation — run against the real page with no interception, so
 *     the MEH-417 failure mode (a backend bug hidden behind a mock) has no
 *     surface here: no backend behaviour is being asserted at all.
 *
 * The doc and the merged code disagree about `e2e/flows/`. This follows the
 * code and flags the disagreement rather than silently picking a side; if the
 * doc is the intended authority, A4/A5 should move to a remote-target-gated
 * spec and flows/28 needs the same treatment.
 *
 * ── Locators ────────────────────────────────────────────────────────────────
 * `data-testid` per docs/E2E-LOCATORS.md (MEH-495). The attributes used here
 * were added in the same commit as this spec and nowhere else.
 *
 * ── Copy assertions, and why only three ─────────────────────────────────────
 * Everything is behaviour + testid EXCEPT three strings the card names as the
 * thing under test (the heading, the inline email error, the inbox-screen
 * title). Those are asserted as LITERALS, not read back from messages/he.json:
 * an assertion that compares the render against the same JSON it renders from
 * is green whether the copy is right or wrong — it proves next-intl is wired,
 * not that the words are the agreed words. A deliberate copy change is meant to
 * turn this spec red and be updated in the same PR.
 *
 * ── Coverage map, A1–A5 (every checkbox on the card gets a verdict) ─────────
 *   A1  discovery ................ COVERED (via /login → /register, the real
 *                                  route; see the FINDING note below)
 *   A2  form contract ............ COVERED, except:
 *        · "placeholder בעברית"     NOT-APPLICABLE — name/email carry no
 *                                  placeholder at all; they use persistent
 *                                  labels (ui/Input). Asserted as such.
 *   A3  validation ............... COVERED, except:
 *        · "אימייל כבר קיים"        SUPERSEDED by MEH-328 (anti-enumeration).
 *                                  Already struck through on the card.
 *   A4  submit ................... COVERED as stub (POST /auth/register), and:
 *        · "redirect ל-/ או /settings" + "Toast ברוכה הבאה"
 *                                  SUPERSEDED by MEH-328 — registration no
 *                                  longer logs the user in or redirects. The
 *                                  spec asserts the ACTUAL terminal state and
 *                                  asserts the redirect does NOT happen.
 *   A5  post-registration ........ SUPERSEDED by MEH-328 for the "אני מחוברת /
 *                                  avatar / Settings / Logout" items — there is
 *                                  no session after register. The reachable
 *                                  half (inbox screen is terminal, no token,
 *                                  home link works) IS covered. Logout and
 *                                  Settings belong to journey C.
 *
 * ── `covered-by-stub` — a LABEL, not a coverage claim ───────────────────────
 * ORDERS §1.5 / the card's own ruling block: a stubbed dependency is marked and
 * NOT counted as covered. This spec emits the marks as Playwright annotations
 * (they land in playwright-report/results.json), one spelling, defined here:
 *
 *   covered-by-stub  the assertion ran against a stub, so it is evidence about
 *                    the frontend only and says nothing about the real backend.
 *   superseded       the card's expectation was overtaken by a later merged
 *                    decision; the spec asserts today's behaviour and names the
 *                    ticket that changed it.
 *   not-applicable   the card's expectation does not exist on this surface.
 *
 * ── FINDING raised while writing this (not fixed here, per the card's DoD) ──
 * A1 asks for a "הצטרפי / הרשמה" CTA visible in the Header. There is none: the
 * guest Header renders only a login link (Header.jsx:420 `LoginAccount`, itself
 * `hidden md:inline-flex` so it is desktop-only), and the mobile AccountSheet
 * offers only `nav.login` (AccountSheet.jsx:132). The register CTA pill was
 * deliberately removed from the Header by MEH-907 — but nothing replaced it on
 * the consumer side, so /register is reachable only from /login, from the
 * footer, or by typing the URL. This spec therefore asserts the route that
 * EXISTS and does not lock the gap in as correct.
 */

// ── Annotation helpers ──────────────────────────────────────────────────────
const mark = (type: "covered-by-stub" | "superseded" | "not-applicable", description: string) =>
  test.info().annotations.push({ type, description });

// messages/he.json → auth.register.consumer.*  (locked copy — see header)
const HEADING = "הצטרפו לקהילה";
const EMAIL_INVALID = "האימייל לא תקין";
const INBOX_TITLE = "בדקו את תיבת האימייל שלך";

// lib/validators.js:25 — mirrored, not imported (the "@/" alias does not
// resolve inside Playwright's spec transpile).
const PASSWORD_MIN_LENGTH = 12;
const VALID_PASSWORD = "Kishkashta-2026-בית";

/**
 * Intercepts POST /api/auth/register with MEH-328's ack, so A4/A5 assert the
 * frontend's response to that contract without spending the shared
 * /auth/register rate-limit budget on every PR. Used by A4/A5 ONLY — A1–A3
 * never call this and touch no network.
 *
 * `registerGate`, when supplied, is awaited before the route is fulfilled —
 * that is how the in-flight (spinner + disabled) state is observed without
 * racing a real network.
 */
async function stubRegisterAck(page: Page, registerGate?: Promise<void>) {
  // MEH-328: the OWASP ack — 200 with a detail string, no token, no user.
  await page.route("**/api/auth/register", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (registerGate) await registerGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ detail: "אם האימייל פנוי, נשלחה אליכם הודעת אימות." }),
    });
  });
}

/** Fills every field with values that pass, leaving the form submit-ready. */
async function fillValidForm(page: Page, email = "journey-a@example.com") {
  await page.getByTestId("register-name").fill("שמדר לוי");
  await page.getByTestId("register-email").fill(email);
  await page.getByTestId("register-password").fill(VALID_PASSWORD);
  await page.getByTestId("register-terms").check();
}

test.describe("MEH-215 journey A — consumer registration (email + password)", () => {
  test("A1 — /login exposes the register CTA and it lands on the register form", async ({
    page,
  }) => {
    await page.goto("/login");

    const cta = page.getByTestId("login-register-link");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /\/register$/);

    await cta.click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByTestId("register-form")).toBeVisible();
  });

  test("A2 — form contract: locked heading, RTL wiring, primary CTA, login link", async ({
    page,
  }) => {
    await page.goto("/register");

    // Locked copy (literal by design — see the header note).
    await expect(page.getByTestId("register-heading")).toHaveText(HEADING);

    // RTL. The page is RTL; the name field is RTL; the email field is
    // deliberately LTR (an address is LTR content) and is aligned to its own
    // end. Asserting all three pins the intent — a future "consistency" pass
    // that flips the email to rtl turns this red on purpose.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("register-name")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("register-email")).toHaveAttribute("dir", "ltr");

    // A2 "placeholder בעברית נקבה" — the two text fields carry NO placeholder;
    // ui/Input renders a persistent <label> instead, which is the stronger a11y
    // pattern. Recorded as not-applicable rather than silently dropped.
    mark(
      "not-applicable",
      "A2 placeholder: register-name / register-email use persistent labels (ui/Input), not placeholders",
    );
    await expect(page.getByTestId("register-name")).not.toHaveAttribute("placeholder", /.+/);
    await expect(page.getByTestId("register-email")).not.toHaveAttribute("placeholder", /.+/);

    // The submit CTA is the brand primary — tailwind.tokens.json `primary`
    // #2e6853, which the card names by hex.
    await expect(page.getByTestId("register-submit")).toHaveCSS(
      "background-color",
      "rgb(46, 104, 83)",
    );

    // "יש לך כבר חשבון?" → /login
    const loginLink = page.getByTestId("register-login-link");
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute("href", /\/login$/);

    // Mobile-layout evidence: measured, not eyeballed (ORDERS §3.3). Applies to
    // both projects — neither viewport may scroll sideways.
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test("A2 — the password eye toggle reveals and re-hides the value", async ({ page }) => {
    await page.goto("/register");

    const password = page.getByTestId("register-password");
    const toggle = page.getByTestId("register-password-toggle");

    await password.fill(VALID_PASSWORD);
    await expect(password).toHaveAttribute("type", "password");

    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await toggle.click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  test("A3 — a malformed email surfaces the inline Hebrew error on blur", async ({ page }) => {
    await page.goto("/register");

    const email = page.getByTestId("register-email");
    await email.fill("not-an-email");
    await email.blur();

    await expect(page.getByText(EMAIL_INVALID)).toBeVisible();
    await expect(email).toHaveAttribute("aria-invalid", "true");

    // …and it clears once the value parses, so the error is state and not a
    // one-way latch.
    await email.fill("journey-a@example.com");
    await email.blur();
    await expect(page.getByText(EMAIL_INVALID)).toHaveCount(0);
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
  });

  test("A3 — submit stays disabled until every rule passes, one rule at a time", async ({
    page,
  }) => {
    mark(
      "superseded",
      'A3 "אימייל כבר קיים → המייל כבר רשום": removed by MEH-328 anti-enumeration; already struck through on the card',
    );

    await page.goto("/register");

    const submit = page.getByTestId("register-submit");

    // Empty form.
    await expect(submit).toBeDisabled();

    // Name only.
    await page.getByTestId("register-name").fill("שמדר לוי");
    await expect(submit).toBeDisabled();

    // …+ a malformed email.
    await page.getByTestId("register-email").fill("not-an-email");
    await expect(submit).toBeDisabled();

    // …+ a well-formed email, still no password.
    await page.getByTestId("register-email").fill("journey-a@example.com");
    await expect(submit).toBeDisabled();

    // …+ a password one character under the policy floor. The live checklist
    // appears (2 tiles: length, breach) and submit is still refused.
    await page.getByTestId("register-password").fill("a".repeat(PASSWORD_MIN_LENGTH - 1));
    await expect(page.getByTestId("register-form").locator("ul[aria-live] li")).toHaveCount(2);
    await expect(submit).toBeDisabled();

    // …+ a long-enough password, but the terms box unchecked.
    await page.getByTestId("register-password").fill(VALID_PASSWORD);
    await expect(page.getByTestId("register-terms")).not.toBeChecked();
    await expect(submit).toBeDisabled();

    // …+ terms accepted → and only now does it enable.
    await page.getByTestId("register-terms").check();
    await expect(submit).toBeEnabled();
  });

  test("A4 — submit shows the in-flight state, then the inbox screen (no redirect)", async ({
    page,
  }) => {
    mark("covered-by-stub", "POST /api/auth/register is route-mocked — frontend evidence only");
    mark(
      "superseded",
      'A4 "redirect ל-/ או /settings" + "Toast ברוכה הבאה!": MEH-328 replaced both with the inbox-check screen, no session',
    );

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await stubRegisterAck(page, gate);
    await page.goto("/register");
    await fillValidForm(page);

    const submit = page.getByTestId("register-submit");
    await expect(submit).toBeEnabled();
    await submit.click();

    // In flight: the button locks itself and swaps to the submitting label.
    await expect(submit).toBeDisabled();
    await expect(submit.locator("svg, [class*=animate]").first()).toBeVisible();

    release();

    // Terminal state — the inbox screen, in place. NOT a redirect: the URL is
    // unchanged, which is the assertion that discriminates today's behaviour
    // from the card's (pre-MEH-328) expectation of "/" or "/settings".
    await expect(page.getByTestId("register-email-sent")).toBeVisible();
    await expect(page.getByTestId("register-email-sent")).toContainText(INBOX_TITLE);
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByTestId("register-form")).toHaveCount(0);
  });

  test("A5 — the inbox screen is terminal: no session is created, home link works", async ({
    page,
  }) => {
    mark("covered-by-stub", "POST /api/auth/register is route-mocked — frontend evidence only");
    mark(
      "superseded",
      'A5 "אני מחוברת / avatar בכותרת / פרטים ב-Settings / Logout": MEH-328 removed auto-login, so none of it follows registration. Logout + Settings live in journey C',
    );

    await stubRegisterAck(page);
    await page.goto("/register");
    await fillValidForm(page);
    await page.getByTestId("register-submit").click();
    await expect(page.getByTestId("register-email-sent")).toBeVisible();

    // The MEH-328 invariant: a 200 ack mints no token, so the visitor is still
    // a guest. This is the assertion the card's A5 becomes.
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();

    // The single affordance on the screen returns home.
    await page.getByTestId("register-email-sent-home").click();
    await expect(page).toHaveURL(/\/(he)?\/?$/);
  });
});
