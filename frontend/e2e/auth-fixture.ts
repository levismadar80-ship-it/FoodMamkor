/**
 * Module:   auth-fixture
 * Purpose:  Hand a spec an APIRequestContext that is already authenticated as a
 *           role global-setup provisioned, so no spec spends a second
 *           /auth/login permit to get one.
 * Does NOT: log in, refresh, or mint tokens. Provisioning lives in
 *           global-setup.ts; this only consumes what that wrote.
 * Related:  e2e/global-setup.ts (writer) · e2e/flows/19,20,22 (consumers) ·
 *           backend/app/auth.py:211-230 (_check_fingerprint)
 * History:  MEH-1858 (creation).
 *
 * ─── Why a CONTEXT and not just a token ────────────────────────────────────
 *
 * This note lived only in flows/20's header, where it read as a quirk of that
 * one spec. It is not: it governs every authenticated request in the suite, and
 * its absence from 19 and 22 is what made "just reuse the token" look correct.
 *
 * `_check_fingerprint` (backend/app/auth.py:211-230, MEH-327) embeds a
 * `userFingerprint` claim in the access token and, on EVERY authenticated
 * request, hashes the `__Secure-Fgp` cookie and compares. Missing or mismatched
 * cookie → 401. The token alone is therefore not a credential — the token AND
 * the cookie that minted it are, together.
 *
 * `storageState` carries cookies as well as localStorage, so building the
 * context from the fixture keeps the pair intact. A bare `request` fixture with
 * an Authorization header is the bug, not the token.
 *
 * Measured both ways, both environments (qa-meh1858-fingerprint-proof.mjs):
 *
 *              __Secure-Fgp   newContext({storageState})   bare + bearer
 *   staging        YES              200                        401
 *   localhost      YES              200                        401
 *
 * The 401 column is the load-bearing half. Without it the 200s prove nothing —
 * an unauthenticated endpoint would also return 200.
 *
 * ─── Why this exists at all: the rate limit ────────────────────────────────
 *
 * `/auth/login` carries `@limiter.limit("5/minute")` with slowapi's DEFAULT
 * key_func — per client IP, no email component (backend/app/auth.py:999). One
 * GitHub Actions runner is one IP, so the whole suite shares a 5-permit window.
 * Specs 19, 20 and 22 each logged in as the SAME account, spending three
 * permits on one identity before any assertion ran. The overflow never
 * surfaced as a login error: it surfaced as a 20-second `toHaveURL` timeout in
 * spec 25, which reads exactly like a race and is not one (MEH-1858).
 *
 * Raising the limit was rejected — it is the brute-force control on the most
 * sensitive route in the app.
 */
import { request, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const AUTH_DIR = path.join(__dirname, ".auth");

export const fixturePath = (role: string): string => path.join(AUTH_DIR, `${role}.json`);

export const fixtureExists = (role: string): boolean => fs.existsSync(fixturePath(role));

/** The JWT global-setup injected into localStorage["token"] for this role. */
export function tokenFromFixture(role: string): string {
  const file = fixturePath(role);
  if (!fs.existsSync(file)) {
    throw new Error(
      `[auth-fixture] ${file} is missing — global-setup did not provision "${role}". ` +
        `Check that its credentials are exported for this run.`,
    );
  }
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  const token = state?.origins?.[0]?.localStorage?.find(
    (entry: { name: string; value: string }) => entry.name === "token",
  )?.value;
  if (!token) {
    throw new Error(
      `[auth-fixture] ${file} exists but carries no localStorage["token"] — the ` +
        `fixture format changed, or the login response had no access_token.`,
    );
  }
  return token as string;
}

/**
 * An APIRequestContext authenticated as `role`, carrying BOTH the bearer token
 * and the `__Secure-Fgp` cookie it is bound to.
 *
 * The caller owns disposal (`await ctx.dispose()`).
 */
export async function authedContext(
  role: string,
  opts: { baseURL?: string } = {},
): Promise<APIRequestContext> {
  const token = tokenFromFixture(role);
  const bypassSecret =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_BYPASS_SECRET || "";
  return request.newContext({
    ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    ignoreHTTPSErrors: true,
    // storageState is what makes this work — it restores the cookie jar, not
    // just localStorage. Dropping it leaves a context that 401s on every
    // authenticated call while looking perfectly configured.
    storageState: fixturePath(role),
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      ...(bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {}),
    },
  });
}
