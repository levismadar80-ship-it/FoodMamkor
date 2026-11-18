/**
 * Module:   _login-submit-diagnostics
 * Purpose:  When a login-form test fails, put WHY into the error message —
 *           did the /api/auth/login request leave, what the form held at the
 *           click and at the failure, where the page navigated.
 * Does NOT: change what any test asserts, wait for anything, or retry. It
 *           only listens, and adds text to an error that is already thrown.
 * Related:  e2e/flows/30-login-journey-c.spec.ts (C2 wrong credentials),
 *           e2e/flows/25-role-reachability.spec.ts (return to dashboard),
 *           playwright.config.ts `trace: "on-first-retry"`.
 * History:  MEH-3154 · MEH-3380 (created).
 *
 * Why this exists: both flakes fail on the FIRST attempt and pass on the
 * retry. The trace is recorded only on the retry (`on-first-retry`), so the
 * failing attempt has no trace, and the screenshot/video sit in an artifact
 * that a Claude Code sandbox cannot download (blob storage is egress-denied,
 * measured 18/11). The job log is the one record every session can read, so
 * the evidence goes into the error message, which the list reporter prints.
 *
 * Values are reported by LENGTH, never by content — a password field is read.
 */
import type { Page } from "@playwright/test";

const LOGIN_API = /\/api\/auth\/login$/;
const MAX_CONSOLE_LINES = 5;

type FieldState = {
  count: number;
  react: boolean;
  valueLength: number | null;
  disabled: boolean | null;
};

async function formState(page: Page): Promise<unknown> {
  try {
    return await page.evaluate(() => {
      const pick = (id: string): FieldState => {
        const els = document.querySelectorAll(`[data-testid="${id}"]`);
        const el = els[0] as HTMLInputElement | HTMLButtonElement | undefined;
        return {
          count: els.length,
          react: !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber")),
          valueLength: el && el instanceof HTMLInputElement ? el.value.length : null,
          disabled: el ? !!el.disabled : null,
        };
      };
      const active = document.activeElement;
      return {
        url: location.pathname + location.search,
        readyState: document.readyState,
        email: pick("login-email"),
        password: pick("login-password"),
        submit: pick("login-submit"),
        formError: document.querySelector('[data-testid="login-error"]')?.textContent ?? null,
        alerts: Array.from(document.querySelectorAll('[role="alert"]')).map(
          (n) => n.id || (n.textContent ?? "").slice(0, 60),
        ),
        active: active?.getAttribute("data-testid") ?? active?.tagName ?? null,
      };
    });
  } catch (err) {
    return { evaluateFailed: err instanceof Error ? err.message.split("\n")[0] : String(err) };
  }
}

export function watchLoginSubmit(page: Page) {
  const t0 = Date.now();
  const events: string[] = [];
  const log = (line: string) => events.push(`+${Date.now() - t0}ms ${line}`);
  let consoleLines = 0;

  page.on("request", (r) => {
    if (LOGIN_API.test(new URL(r.url()).pathname)) log(`request ${r.method()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => {
    if (LOGIN_API.test(new URL(r.url()).pathname)) log(`requestfailed ${r.failure()?.errorText}`);
  });
  page.on("response", (r) => {
    if (LOGIN_API.test(new URL(r.url()).pathname)) log(`response ${r.status()}`);
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) log(`navigated ${new URL(f.url()).pathname}`);
  });
  page.on("pageerror", (e) => log(`pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() !== "error" || consoleLines >= MAX_CONSOLE_LINES) return;
    consoleLines += 1;
    log(`console.error ${m.text().slice(0, 200)}`);
  });

  return {
    /** Snapshot the form right before the click — the state the click acted on. */
    async beforeClick(): Promise<void> {
      log(`before-click ${JSON.stringify(await formState(page))}`);
    },
    /**
     * Run an assertion; if it throws, append the recorded events plus a
     * snapshot taken at the failure to its message and rethrow the SAME error
     * (stack and code frame kept). A passing assertion is returned untouched.
     */
    async explain<T>(assertion: () => Promise<T>): Promise<T> {
      try {
        return await assertion();
      } catch (err) {
        log(`at-failure ${JSON.stringify(await formState(page))}`);
        const report =
          "\n\nlogin-submit diagnostics (MEH-3154 · MEH-3380):\n  " +
          (events.length ? events.join("\n  ") : "(no events recorded)");
        if (err instanceof Error) {
          err.message += report;
          throw err;
        }
        throw new Error(String(err) + report);
      }
    },
  };
}
