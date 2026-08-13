import { test, expect } from "@playwright/test";

/**
 * Spec:     32-register-journey-b-oauth
 * Purpose:  MEH-215 journey B — the consumer Google-OAuth registration
 *           journey, converted from the card's manual B1-B2 checklist. Covers
 *           what is real and unmocked; documents what is not, and why.
 * Does NOT: complete a successful Google login. Cannot: this requires either
 *           (a) a real Google account clicking through a live consent screen
 *           — the exact manual-QA blocker the card exists to remove, or
 *           (b) mocking the response of POST /api/auth/google — blocked by
 *           MEH-1968 (Sapir's open decision on mocking in e2e/flows/, not
 *           CC's to resolve by building a third spec on the contested
 *           pattern; see "On mocking" below). Journeys A, C, D — flows/29,
 *           /30, /31.
 * Touches:  one endpoint, reached for real, never mocked — POST
 *           /api/auth/google, fed a syntactically-invalid credential so the
 *           REAL backend's real 401 path fires. See "On mocking" below for
 *           why this is the opposite of what MEH-1968 flags. NOT egress-free
 *           — see "A real, unmocked network call" below; corrected after
 *           different-model review found the original claim here false.
 * Related:  app/[locale]/register/RegisterClient.jsx (the surface),
 *           components/GoogleAuthButton.jsx (the SDK wiring),
 *           backend/app/routers/auth.py:806-825 (the 401/503 contract — the
 *           401 raise itself is at :825, not inside the 806-822 span this
 *           docstring first cited; corrected after review),
 *           backend/app/services/oauth_verifiers.py:211-227 (verify_google_token
 *           returns None on any verification failure, malformed token
 *           included).
 * History:  MEH-215 (creation).
 *
 * Viewports: both default projects — `mobile` (Pixel 5, viewport 393x727)
 * and `desktop` (1440x900). The `393x851` figure this docstring first cited
 * is Pixel 5's `screen.height` (unused for layout), not its `viewport`
 * (`playwright-core`'s device descriptor); testing.md makes the same
 * pre-existing mix-up for the same project — not introduced here, but not
 * repeated here either after review. Locale he-IL, RTL
 * (playwright.config.ts:use.locale).
 *
 * ── On mocking, and why this spec does the opposite of the contested pattern ─
 * `frontend/e2e/CLAUDE.md` says functional specs under `e2e/flows/` stay
 * unmocked; flows/28 and /29 already intercept backend endpoints, and MEH-1968
 * is the open, Sapir-owned decision on whether to ratify that as an exception
 * or move both specs. Building journey B by mocking POST /api/auth/google —
 * the shape the card's own text originally proposed ("mocked OAuth callback")
 * — would be a THIRD instance of the exact pattern MEH-1968 asks Sapir to
 * rule on, widening the gap the card names rather than resolving it. Rule 32:
 * CC adds constraints, never removes one; deciding the open policy question
 * by building on top of it removes one.
 *
 * A THIRD occurrence worth flagging on MEH-1968 itself, found while checking
 * this: flows/10-producer-oauth-409.spec.ts also intercepts a backend endpoint
 * (POST /api/auth/register/producer/oauth) and is not in that card's table of
 * two. Reported there, not silently added to this docstring's problem list.
 *
 * So the tests below never call `page.route` against our own backend. The
 * Google SDK itself IS stubbed via `addInitScript` — that is a different,
 * uncontested, already-merged pattern (flows/10, /19, /22 all do it): it
 * replaces a third-party script Playwright cannot reach in CI, not our own
 * backend's response. MEH-1968's table is about endpoints under our control;
 * this stub is not one.
 *
 * The stub's `renderButton` is where this spec diverges from flows/10's copy
 * of the same stub: instead of a no-op, it writes an inert
 * `data-e2e-google-btn` attribute onto the real DOM node GoogleAuthButton.jsx
 * passed it, carrying the real `text`/`locale` options it was called with.
 * That is a test-owned marker on a node the component already rendered — not
 * a new `data-testid` on production markup, which this lane may read
 * (`frontend/app/**`) but not edit (LANES.md — this spec's own PR touches
 * `frontend/e2e/**` only). It lets B1's first two steps be asserted without
 * touching RegisterClient.jsx at all.
 *
 * ── A real, unmocked network call, and what that actually costs ────────────
 * The credential-rejection test's original claim here — that a malformed
 * token fails without the backend reaching Google — was WRONG, caught by
 * different-model review reading the pinned `google-auth` library rather
 * than trusting this docstring: `verify_oauth2_token` → `verify_token` calls
 * `_fetch_certs(request, certs_url)` FIRST, issuing a real HTTP GET to
 * `https://www.googleapis.com/oauth2/v1/certs`, before `jwt.decode` ever
 * inspects the token's shape. A non-JWT-shaped string does not skip that
 * fetch. `oauth_verifiers.py`'s blanket `except Exception` still turns
 * either outcome (cert-fetch failure, or a decode failure after a
 * successful fetch) into the same 401 — so the assertion below is not
 * wrong — but the backend genuinely makes one real outbound call to
 * `googleapis.com` per test run, unmocked, and that call's own transport
 * has a 120s default timeout (`google/auth/transport/requests.py`) that
 * comfortably exceeds this test's 10s wait on `register-error`. This is
 * the first spec in the suite to exercise that path — flows/10 and /22
 * both `page.route()` their OAuth endpoint, so nothing already validates
 * this is safe under CI load. Named here rather than silently believed;
 * not fixed by mocking, which is exactly the move MEH-1968 blocks.
 *
 * ── Coverage map, B1-B2 (every checkbox on the card gets a verdict) ─────────
 *   B1  לוחצת "הרשמה עם Google" ....... COVERED, real+unmocked (button renders,
 *                                       correct options passed to the real SDK
 *                                       call)
 *       redirect לGoogle consent ...... NOT COVERED — genuinely happens in the
 *                                       real product (a live GSI popup/FedCM
 *                                       prompt) but is never invoked here: the
 *                                       SDK itself is stubbed, by necessity
 *                                       (see "On mocking"). Not `not-applicable`
 *                                       — the step is real, just unautomated.
 *       consent → redirect חזרה ....... NOT COVERED, same reason
 *       "אני מחוברת" / welcome toast .. NOT COVERED, same reason — this is the
 *                                       card's own "מוקנן OAuth callback"
 *                                       proposal, blocked on MEH-1968
 *   B1  (this spec's addition) ........ COVERED, real+unmocked: an invalid
 *                                       credential reaches the REAL backend,
 *                                       the REAL 401 fires, and the frontend
 *                                       surfaces it with no navigation. This
 *                                       is real integration coverage of
 *                                       POST /api/auth/google that did not
 *                                       exist before this spec.
 *   B2  ניהול חשבון OAuת (Settings /
 *       re-login) .................... NOT COVERED — requires the B1 happy
 *                                       path first (an authenticated OAuth
 *                                       session), so it inherits B1's block.
 */

// No annotation helper here (flows/29/30's `mark()` shape was tried and
// removed — see the second test below): neither of this file's two tests
// ends up needing `covered-by-stub` / `superseded` / `not-applicable`. The
// happy-path gap is documented in the header's coverage map instead.

// backend/app/routers/auth.py:825 — the real, deterministic 401 detail string
// for an id_token that fails google.oauth2.id_token.verify_oauth2_token().
// NOT egress-free: see the header's "A real, unmocked network call" section —
// the backend fetches Google's certs before it ever inspects the token's
// shape, so this assertion still depends on a real outbound HTTP call.
const GOOGLE_TOKEN_INVALID = "אסימון Google לא תקין";

// /auth/google is limited to 10/minute (auth.py:805). This spec's two real
// calls (mobile + desktop) are far under that, but on shared CI runner IPs
// under concurrent PR load a 429 instead of 401 is possible — same exposure
// flows/29's docstring names for /auth/register, not yet hit in practice.

/**
 * Installs a stub for `window.google.accounts.id` BEFORE the page loads, so
 * `useGoogleSignIn`'s `initialize()` call captures our callback instead of
 * waiting for the real (network-unreachable in CI) Google script. Same shape
 * as flows/10's stub, with one addition: `renderButton` marks the real DOM
 * node it receives, carrying the real options GoogleAuthButton.jsx passed —
 * see the header's "On mocking" section for why this avoids a production edit.
 */
async function stubGoogleSdk(page) {
  await page.addInitScript(() => {
    let captured: ((res: { credential: string }) => void) | null = null;
    (
      window as unknown as { __getConsumerGoogleCallback: () => typeof captured }
    ).__getConsumerGoogleCallback = () => captured;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: ({ callback }: { callback: typeof captured }) => {
            captured = callback;
          },
          renderButton: (
            el: HTMLElement,
            opts: { text?: string; locale?: string },
          ) => {
            el.setAttribute(
              "data-e2e-google-btn",
              JSON.stringify({ text: opts.text ?? null, locale: opts.locale ?? null }),
            );
          },
          cancel: () => {},
        },
      },
    };
  });
}

/**
 * True once the GSI stub's callback has actually been captured — i.e. the
 * component mounted and called initialize(). False when
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset at build time and GoogleAuthButton
 * renders null.
 *
 * Polls for up to 5s rather than checking once. flows/10's identical-shaped
 * check (a single `page.evaluate` right after `domcontentloaded`) races
 * `useGoogleSignIn`'s effect, which only runs once React hydration reaches
 * that component — not guaranteed by `domcontentloaded` (HTML-parse
 * completion, not hydration). A false skip there would read as a
 * legitimate "not configured" case and silently drop this test's real
 * coverage. `waitForFunction`'s own default timeout is 30s; capped to 5s
 * here so a genuinely-unconfigured run still skips promptly rather than
 * waiting out the default.
 */
async function googleCallbackReady(page): Promise<boolean> {
  return page
    .waitForFunction(
      () => {
        const getter = (
          window as unknown as { __getConsumerGoogleCallback?: () => unknown }
        ).__getConsumerGoogleCallback;
        return typeof getter === "function" && typeof getter() === "function";
      },
      { timeout: 5_000 },
    )
    .then(() => true)
    .catch(() => false);
}

test.describe("MEH-215 journey B — consumer Google OAuth registration", () => {
  test("B1 - the Google button renders with the real SDK call, unmocked backend", async ({
    page,
  }) => {
    await stubGoogleSdk(page);
    await page.goto("/register");
    await page.waitForLoadState("domcontentloaded");

    test.skip(
      !(await googleCallbackReady(page)),
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured in build env — Google button absent",
    );

    const marker = page.locator("[data-e2e-google-btn]");
    await expect(marker).toBeVisible();

    // GoogleAuthButton.jsx's real renderButton call — asserted, not assumed.
    const opts = JSON.parse(
      (await marker.getAttribute("data-e2e-google-btn")) ?? "{}",
    );
    expect(opts.text).toBe("continue_with");
    expect(opts.locale).toBe("he");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("B1 - an invalid credential hits the REAL backend and surfaces its REAL 401, no navigation", async ({
    page,
  }) => {
    await stubGoogleSdk(page);
    await page.goto("/register");
    await page.waitForLoadState("domcontentloaded");

    test.skip(
      !(await googleCallbackReady(page)),
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured in build env — Google button absent",
    );

    // Deliberate asymmetry: this skip covers the FRONTEND's client ID only.
    // If the BACKEND's GOOGLE_CLIENT_ID were unset on the target, auth.py's
    // 503 branch would fire instead of 401, and the toHaveText assertion
    // below would fail LOUDLY with a legible diff — not silently skip. That
    // is the wanted behaviour (a real backend misconfiguration should be
    // visible), not an oversight to fix.

    // Fire the captured GSI callback with a credential that is not even
    // JWT-shaped — no dots, no base64 segments. Deliberately NOT
    // page.route()'d: this is the real POST /api/auth/google, hitting the
    // real backend, and the real oauth_verifiers.verify_google_token()
    // rejection path. No user is created — the route returns 401 before any
    // DB lookup (auth.py:825, before the first db.query at :833), so this
    // leaves no row to clean up.
    await page.evaluate(() => {
      const getter = (
        window as unknown as {
          __getConsumerGoogleCallback: () => (res: { credential: string }) => void;
        }
      ).__getConsumerGoogleCallback;
      getter()({ credential: "not-a-real-google-jwt" });
    });

    const error = page.getByTestId("register-error");
    await expect(error).toBeVisible({ timeout: 10_000 });
    await expect(error).toHaveText(GOOGLE_TOKEN_INVALID);
    await expect(error).toHaveAttribute("role", "alert");

    // The redirect-on-success path (RegisterClient.jsx:434, router.push) must
    // NOT have fired — the same "assert the absence, not just the presence"
    // shape flows/29's A4 uses for the post-MEH-328 no-redirect contract.
    await expect(page).toHaveURL(/\/register$/);
  });
});
