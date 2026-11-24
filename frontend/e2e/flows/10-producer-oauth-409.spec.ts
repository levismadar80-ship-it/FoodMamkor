import { test, expect } from "./_cloudinary-stub";
import { googleCodeClientReady, sendGoogleCode, stubCodeSwap, stubGoogleCodeClient } from "./_google-code-stub";

/**
 * Regression guard for the silent-409 bug on /register/producer OAuth:
 *
 * Backend returns 409 with a Hebrew detail message when the OAuth identity
 * already has a producer linked, or when the email is registered with a
 * different auth method. The frontend used to redirect to /login and drop
 * the message, so the user landed on /login with no context — making the
 * Google/Apple button look broken.
 *
 * Fix: ProducerOAuthButtons now showToast(detail, "error", 5000) before
 * invoking onError → the toast survives the router.push to /login because
 * <Toaster /> is mounted globally in app/layout.js.
 */

const DETAIL_MSG = "יש לך כבר עסק רשום בחשבון זה. התחברו כדי לנהל אותו.";

test.describe("Producer OAuth 409 surfaces toast", () => {
  test("409 response shows error toast with backend detail then redirects to /login", async ({
    page,
  }) => {
    // MEH-3690: stand in for Google's popup (our own button's code client),
    // and answer the code swap with a fixed ID token. Neither is the subject:
    // the spec asserts what the page does with the producer endpoint's 409.
    await stubGoogleCodeClient(page);
    await stubCodeSwap(page, "fake_id_token_for_test");

    // Mock the producer OAuth endpoint with the realistic 409 payload.
    await page.route("**/auth/register/producer/oauth", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: DETAIL_MSG }),
      })
    );

    await page.goto("/register/producer");
    await page.waitForLoadState("domcontentloaded");

    // If NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset at build time the component
    // renders no Google button — skip rather than fail.
    test.skip(
      !(await googleCodeClientReady(page)),
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured in build env — Google button absent"
    );

    // As if Google's popup returned a code after consent.
    await sendGoogleCode(page, "fake_code_for_test");

    // Toast text should appear (Toaster is global, so it renders on either
    // /register/producer or /login depending on redirect timing).
    await expect(page.getByText(DETAIL_MSG)).toBeVisible({ timeout: 3000 });

    // Then the redirect to /login fires.
    await page.waitForURL(/\/login(\?|$)/, { timeout: 5000 });

    // Toast survives the redirect (5s duration > redirect time).
    await expect(page.getByText(DETAIL_MSG)).toBeVisible();
  });
});
