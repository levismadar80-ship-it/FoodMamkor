import { test, expect } from "@playwright/test";

/**
 * MEH-274 regression guard — /login page must load without:
 *   1. Any POST to /auth/register/producer/oauth (producer endpoint leaked onto consumer page)
 *   2. GSI_LOGGER "initialize() called multiple times" warning
 *   3. apple-mobile-web-app-capable deprecation warning
 *
 * Root cause: GoogleAuthButton and ProducerOAuthButtons each called
 * google.accounts.id.initialize() independently. Fixed by useGoogleSignIn hook.
 *
 * ── MEH-1778 — this file used to pass on an empty universe ──────────────────
 *
 * MEH-1776 Phase 0 found the GSI assertions here were green for two reasons
 * that had nothing to do with the code being correct:
 *
 *   (a) `e2e.yml` sets no NEXT_PUBLIC_GOOGLE_CLIENT_ID. env.client.js:29 marks
 *       it `.optional()`, so it resolves to undefined, and
 *       use-google-sign-in.js:26 returns BEFORE appending the GSI script.
 *       initialize() is never called, no GSI console output is ever emitted,
 *       and "expect(gsiWarnings).toHaveLength(0)" passed on an empty set.
 *   (b) Even fully armed, `page.goto("/login")` is a fresh document: one
 *       component mounts, one initialize() fires. The reported double-init
 *       needs a CLIENT-SIDE navigation between two GSI-bearing routes, which
 *       goto can never produce.
 *
 * Both are fixed below: every GSI test now skips LOUDLY when the script did
 * not load (never a silent pass), and the double-init test reproduces the real
 * condition by following the in-app link /register → /login (RegisterClient.jsx:426)
 * so a second mount actually occurs inside one document.
 *
 * The `msg.type() === "warning"` filter was also removed. GSI's log level is
 * not ours to depend on — if it ever logs the same text as info or error, a
 * type filter would silently stop matching, which is the same failure this
 * ticket exists to remove.
 *
 * NOTE: this spec detects the defect. It does NOT fix it — the fix is
 * MEH-1776 / MEH-282. A red run here is the intended state until then.
 */

const DOUBLE_INIT = /initialize\(\).*multiple times|multiple times.*initialize/i;

/** True when the GSI script actually loaded — i.e. a client id was present at
 *  build time and useGoogleSignIn got past its guard. Skipping on this is the
 *  whole point: without it, every assertion below is vacuous. */
async function gsiLoaded(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    Boolean(
      (window as unknown as { google?: { accounts?: { id?: unknown } } }).google
        ?.accounts?.id,
    ),
  );
}

const SKIP_REASON =
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID not set in the build env — the GSI script never loaded, " +
  "so this assertion would pass on an empty universe rather than because the code is correct (MEH-1778).";

/**
 * MEH-1784 — the POSITIVE half of the assertion.
 *
 * The absence of the double-init warning is not success on its own. A guard
 * that stops the second initialize() by returning early ALSO stops the second
 * mount's renderButton(), and the warning disappears because the button was
 * never drawn. That state is strictly worse than the bug — silent instead of
 * noisy — and it satisfies every negative assertion in this file.
 *
 * So every run that asserts "no warning" must also assert "a live button is
 * present", in the SAME run. Reported here as a structured object rather than
 * a bare boolean: when this fails on CI the message has to say what WAS in the
 * container, because GSI's rendered markup is Google's and can drift.
 *
 * Deliberately NOT mocked. e2e/CLAUDE.md forbids mocks in flow specs
 * (MEH-417); this reads the real GSI-rendered DOM. Proving that a CLICK
 * reaches the right callback cannot be done against real Google in CI — that
 * half lives in __tests__/use-google-sign-in.test.jsx, where stubbing the
 * third-party SDK is legitimate.
 */
async function gsiButtonState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    // GSI renders into whatever element renderButton() was handed. Rather than
    // guess Google's class names — which are obfuscated and version-dependent —
    // look for the artifacts it is documented to produce, then measure the box.
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'iframe[src*="accounts.google.com"], div[role="button"], [aria-labelledby]',
      ),
    );
    const live = candidates.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return {
      candidateCount: candidates.length,
      liveCount: live.length,
      // Diagnostics for a failing run — never asserted on, only printed.
      sample: live.slice(0, 3).map((el) => ({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
      })),
    };
  });
}

test.describe("Login page console clean (MEH-274)", () => {
  test("no producer OAuth call on page load", async ({ page }) => {
    const producerOAuthCalls: string[] = [];

    page.on("request", (req) => {
      if (req.url().includes("/auth/register/producer/oauth")) {
        producerOAuthCalls.push(req.url());
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    // Give GSI scripts a moment to fire any auto-triggers
    await page.waitForTimeout(2000);

    // MEH-1778: without GSI there is no callback that could fire the producer
    // endpoint, so a green here would prove nothing.
    test.skip(!(await gsiLoaded(page)), SKIP_REASON);

    expect(producerOAuthCalls).toHaveLength(0);
  });

  test("no GSI double-init warning across client-side navigation", async ({
    page,
  }) => {
    const gsiWarnings: string[] = [];

    // MEH-1778: no msg.type() filter — match on text alone (see file header).
    page.on("console", (msg) => {
      if (DOUBLE_INIT.test(msg.text())) gsiWarnings.push(msg.text());
    });

    // Mount #1 — /register renders GoogleAuthButton (RegisterClient.jsx:409).
    await page.goto("/register");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    test.skip(!(await gsiLoaded(page)), SKIP_REASON);

    // Mount #2 — follow the IN-APP link (RegisterClient.jsx:426). App Router
    // does not reload the document, so this is a second initialize() inside the
    // same document lifetime. A page.goto() here would reset everything and the
    // test would be vacuous again.
    await page.getByRole("link", { name: /התחבר|כניסה|log ?in|sign ?in/i })
      .first()
      .click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await page.waitForTimeout(2000);

    // MEH-1784 step א — POSITIVE assertion, evaluated BEFORE the warning
    // assertion and active in every run of this test.
    //
    // Order is deliberate. If the button is missing, the warning being absent
    // is meaningless, and reporting "no double-init" first would describe a
    // dead page as a pass. This is the same reasoning as the negative controls
    // in scripts/checks/permissions-patch-guard.sh: the check that can
    // invalidate the other one runs first.
    const afterNav = await gsiButtonState(page);
    expect(
      afterNav.liveCount,
      "No live GSI button on /login after client-side navigation from /register. " +
        "A missing button makes the double-init assertion below vacuous: silencing the " +
        "warning by never drawing the second button is a REGRESSION, not a fix (MEH-1784). " +
        `Observed: ${JSON.stringify(afterNav)}`,
    ).toBeGreaterThan(0);

    expect(
      gsiWarnings,
      "google.accounts.id.initialize() ran more than once in one document — " +
        "the last callback registered wins and the earlier button goes dead (MEH-274 / MEH-1776).",
    ).toHaveLength(0);
  });

  test("no apple-mobile-web-app-capable deprecation warning", async ({
    page,
  }) => {
    const deprecationWarnings: string[] = [];

    page.on("console", (msg) => {
      if (msg.text().includes("apple-mobile-web-app-capable")) {
        deprecationWarnings.push(msg.text());
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // No skip here on purpose: this warning comes from our own <meta> tags, not
    // from GSI, so it is armed regardless of whether a client id is configured.
    expect(deprecationWarnings).toHaveLength(0);
  });
});
