/**
 * Module:   token-freshness
 * Purpose:  Decide whether a fixture's access token still has enough life left
 *           for the request about to be made.
 * Does NOT: read files, mint tokens, or talk to the network — that is
 *           auth-fixture.ts. Pure functions only, so a unit test can exercise
 *           them without pulling @playwright/test into vitest.
 * Related:  e2e/auth-fixture.ts (the only caller) ·
 *           backend/app/config.py:35 (access_token_expire_minutes = 15)
 * History:  MEH-2269 (creation).
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * global-setup mints each role's storageState ONCE, at the start of the run.
 * The access token in it lives 15 minutes. A full suite crossed 25 minutes on
 * 05/09 (run 33982303103), so the mobile project — which runs after desktop —
 * reached `flows/37-outreach-prefill` with an expired token and all eight of
 * its tests failed on `POST /admin/outreach -> 401 «אסימון לא תקין»`, while
 * the same eight passed on desktop in the same run.
 *
 * That 401 is CORRECT behaviour from an expired token. The defect is a fixture
 * whose lifetime is shorter than the run that consumes it.
 *
 * The margin is not decoration. A token with four seconds left passes any
 * "has it expired" test and still 401s by the time the request lands, so the
 * question worth asking is "will it still be valid when this is used", not
 * "is it valid now".
 */

/** Refresh when less than this much life remains. */
export const REFRESH_MARGIN_MS = 120_000;

/**
 * The `exp` claim of a JWT, in epoch milliseconds, or `null` when the token is
 * not a readable JWT.
 *
 * Signature is NOT checked and must not be — this reads a fixture the suite
 * itself minted, to decide whether to ask the server for a new one. The server
 * is the only thing that validates.
 *
 * The base64url → base64 translation is portability, not a Node requirement:
 * measured on this runtime, `Buffer.from(s, "base64")` decodes the `-`/`_`
 * alphabet correctly on its own. `atob` does not, so the translation stays for
 * anything that moves this decode to a browser context. Recorded because a
 * reader who deletes it will see every test still pass.
 */
export function decodeJwtExpMs(
  token: string | null | undefined,
): number | null {
  // The signature admits null/undefined because the guard below is the point:
  // a caller holding a fixture that lost its token must get `null` here, not a
  // TypeError. Narrowing it to `string` would make the unit test's null cases
  // illegal and quietly stop exercising this line (reviewer on the PR).
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3) return null;
  try {
    const payload = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const exp = JSON.parse(payload)?.exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * True when the token should be refreshed before use.
 *
 * An UNREADABLE token returns true. That is deliberate: the two ways to be
 * wrong here are not symmetric. Refreshing a token that did not need it costs
 * one `/auth/refresh` call (30/minute per IP, auth.py:152); not refreshing one
 * that did costs a red spec that names the wrong thing — a 401 on an unrelated
 * assertion, twenty minutes into a run.
 */
export function isStale(
  token: string | null | undefined,
  nowMs: number = Date.now(),
  marginMs: number = REFRESH_MARGIN_MS,
): boolean {
  if (!token) return true;
  const expMs = decodeJwtExpMs(token);
  if (expMs === null) return true;
  return expMs - nowMs <= marginMs;
}
