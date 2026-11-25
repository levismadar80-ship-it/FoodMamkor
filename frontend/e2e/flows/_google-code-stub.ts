/**
 * Module:   _google-code-stub
 * Purpose:  Stand in for Google in a flow spec (MEH-3690). Our own Google
 *           button opens Google's popup through the GIS code client; no CI
 *           runner can click through a real Google consent screen, so the
 *           spec replaces `window.google` before the page loads, captures the
 *           code client's callback, and fires it with a code of its choosing.
 * Does NOT: touch our backend. What the code is swapped for is the spec's
 *           decision: `stubCodeSwap` answers POST /api/auth/google/code with a
 *           fixed ID token (the swap needs a real Google code, which a spec
 *           cannot have), or the spec leaves the real route to answer.
 * Related:  frontend/lib/use-google-code-sign-in.js (the code client it
 *           replaces); backend/app/routers/auth_google_code.py (the swap).
 * History:  MEH-3690 (creation; replaces the google.accounts.id stub that
 *           flows/10, /22 and /32 each carried).
 */
import type { Page } from "@playwright/test";

type CodeCallback = (response: { code?: string; error?: string }) => void;
type Probe = { callback: () => CodeCallback | null; config: () => Record<string, unknown> | null };

/** Install the fake `window.google` before any page script runs. */
export async function stubGoogleCodeClient(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let callback: CodeCallback | null = null;
    let config: Record<string, unknown> | null = null;
    const w = window as unknown as { __googleCode: Probe; google: unknown };
    w.__googleCode = { callback: () => callback, config: () => config };
    w.google = {
      accounts: {
        id: { initialize() {}, renderButton() {}, cancel() {}, prompt() {} },
        oauth2: {
          initCodeClient(c: Record<string, unknown> & { callback: CodeCallback }) {
            config = c;
            callback = c.callback;
            return { requestCode() {} };
          },
        },
      },
    };
  });
}

/**
 * True once a Google button mounted and created its code client; false when
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset at build time and no button renders.
 * Waits up to 5s: the client is created in an effect, after hydration, which
 * `domcontentloaded` does not wait for.
 */
export async function googleCodeClientReady(page: Page): Promise<boolean> {
  return page
    .waitForFunction(
      () => typeof (window as unknown as { __googleCode?: Probe }).__googleCode?.callback() === "function",
      undefined,
      { timeout: 5_000 },
    )
    .then(() => true)
    .catch(() => false);
}

/** The config our button handed `initCodeClient` (client id, scope, ux_mode). */
export async function googleCodeConfig(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const config = (window as unknown as { __googleCode: Probe }).__googleCode.config();
    // Functions do not cross page.evaluate; keep the plain fields.
    return config ? Object.fromEntries(Object.entries(config).filter(([, v]) => typeof v !== "function")) : null;
  });
}

/** Answer as Google's popup does after consent: hand the page a one-time code. */
export async function sendGoogleCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    (window as unknown as { __googleCode: Probe }).__googleCode.callback()?.({ code: c });
  }, code);
}

/** Answer POST /api/auth/google/code with a fixed ID token. */
export async function stubCodeSwap(page: Page, idToken: string): Promise<void> {
  await page.route("**/auth/google/code", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id_token: idToken }) }),
  );
}
