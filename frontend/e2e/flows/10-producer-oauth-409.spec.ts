import { test, expect } from "@playwright/test";

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

const DETAIL_MSG = "יש לך כבר עסק רשום בחשבון זה. התחברי כדי לנהל אותו.";

test.describe("Producer OAuth 409 surfaces toast", () => {
  test("409 response shows error toast with backend detail then redirects to /login", async ({
    page,
  }) => {
    // Mock window.google.accounts.id BEFORE the page loads so the GSI
    // initialize() call inside useGoogleSignIn captures our stub callback
    // instead of waiting for the real Google script.
    await page.addInitScript(() => {
      let captured: ((res: { credential: string }) => void) | null = null;
      (window as unknown as { __getProducerGoogleCallback: () => typeof captured }).__getProducerGoogleCallback =
        () => captured;
      (window as unknown as { google: unknown }).google = {
        accounts: {
          id: {
            initialize: ({ callback }: { callback: typeof captured }) => {
              captured = callback;
            },
            renderButton: () => {},
            cancel: () => {},
          },
        },
      };
    });

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
    // renders null and useGoogleSignIn never runs — skip rather than fail.
    const callbackReady = await page.evaluate(() => {
      const getter = (window as unknown as {
        __getProducerGoogleCallback?: () => unknown;
      }).__getProducerGoogleCallback;
      return typeof getter === "function" && typeof getter() === "function";
    });
    test.skip(
      !callbackReady,
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured in build env — Google button absent"
    );

    // Fire the captured GSI callback as if Google returned a credential.
    await page.evaluate(() => {
      const getter = (window as unknown as {
        __getProducerGoogleCallback: () => (res: { credential: string }) => void;
      }).__getProducerGoogleCallback;
      getter()({ credential: "fake_id_token_for_test" });
    });

    // Toast text should appear (Toaster is global, so it renders on either
    // /register/producer or /login depending on redirect timing).
    await expect(page.getByText(DETAIL_MSG)).toBeVisible({ timeout: 3000 });

    // Then the redirect to /login fires.
    await page.waitForURL(/\/login(\?|$)/, { timeout: 5000 });

    // Toast survives the redirect (5s duration > redirect time).
    await expect(page.getByText(DETAIL_MSG)).toBeVisible();
  });
});
