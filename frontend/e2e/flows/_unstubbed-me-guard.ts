/**
 * Module:   _unstubbed-me-guard
 * Purpose:  Make a fake-token spec FAIL, with the exact URL, when the page calls
 *           `/api/producers/me` or `/api/producers/me/**` and no `page.route` of
 *           the spec answered it — instead of the call reaching the real backend,
 *           drawing a 401, failing the refresh and ending the session in silence.
 * Touches:  page.route() on the Playwright `page` fixture — no DOM, no app code.
 * Does NOT: touch a request that carries a REAL token (a JWT: storageState, the
 *           API login in flows/40, global-setup) — those calls are legitimate and
 *           pass through untouched. Does not touch any other /api path.
 * Related:  flows/_cloudinary-stub.ts (the shared `test` fixture that installs
 *           this, so every flows/** spec gets it by its existing import) ·
 *           frontend/lib/api.js:75-79 (the Bearer header this reads) ·
 *           flows/manual/dashboard-manage-events.spec.ts:91-104 (the two
 *           incidents this exists for, 08/11 and 11/11).
 * History:  MEH-2957 (creation).
 *
 * ── WHY THE ORDER WORKS ─────────────────────────────────────────────────────
 * Playwright runs route handlers in REVERSE registration order: the last one
 * registered that matches is tried first, and it reaches an earlier one only by
 * calling `route.fallback()`. This guard is registered by the fixture BEFORE the
 * spec body runs, so every `page.route` the spec writes wins over it. The guard
 * therefore only ever sees a request that no spec handler claimed. Verified by a
 * run, not assumed (PR body, MEH-2957): a spec that stubs the path stays green,
 * and the same spec with the stub removed goes red with this message.
 *
 * ── WHY THE GATE IS THE TOKEN, NOT storageState ─────────────────────────────
 * The failure has one cause: a token the backend cannot accept. The specs that
 * fake a session put a non-JWT string in localStorage (`"e2e-token"` in 24
 * specs); every real login — storageState, or the API login `flows/40` does
 * without storageState — carries a three-segment JWT. Gating on the token reads
 * the one thing that decides whether the backend will answer 401, so a spec that
 * logs in for real is never touched, however it logged in.
 *
 * ── WHY IT FULFILS 599 AND THROWS ───────────────────────────────────────────
 * The request is answered (never left hanging) with a status nothing in the app
 * maps to "session expired", so api.js does not log the user out and turn the
 * page into /login. The handler then throws: Playwright reports an exception in
 * a route handler as the failure of the running test and ends it at once —
 * measured, the test ended ~140 ms in, its pending locator logging "Test ended"
 * — so the report's FIRST error is this message, not a locator timeout.
 */
import type { Page, Route } from "@playwright/test";

const ME_PATH = /\/api\/producers\/me(\/|$)/;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UNSTUBBED_STATUS = 599;

/** True when the Authorization header carries a Bearer token that is not a JWT. */
function isFakeBearer(authorization: string | undefined): boolean {
  const m = /^Bearer\s+(.+)$/.exec(authorization || "");
  return !!m && !JWT.test(m[1].trim());
}

function unstubbedMessage(method: string, url: string, specFile: string): string {
  const { pathname, search } = new URL(url);
  return (
    `Unstubbed call from a fake-token spec: ${method} ${pathname}${search}\n` +
    `  spec: ${specFile}\n` +
    `  הוסיפו page.route לנתיב הזה.\n` +
    `  Unstubbed, the real backend answers the fake token with 401, the refresh ` +
    `fails and api.js ends the session, so the test would fail later on an ` +
    `unrelated locator (MEH-2957).`
  );
}

/** Installs the guard on `page`. Register it before any spec route. */
export async function guardUnstubbedMe(page: Page, specFile: string): Promise<void> {
  await page.route(
    (url) => ME_PATH.test(url.pathname),
    async (route: Route) => {
      const req = route.request();
      if (!isFakeBearer(req.headers()["authorization"])) {
        await route.fallback();
        return;
      }
      const msg = unstubbedMessage(req.method(), req.url(), specFile);
      await route.fulfill({
        status: UNSTUBBED_STATUS,
        contentType: "application/json",
        body: JSON.stringify({ detail: msg }),
      });
      throw new Error(msg);
    },
  );
}
