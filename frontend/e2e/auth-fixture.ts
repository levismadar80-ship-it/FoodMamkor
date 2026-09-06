/**
 * Module:   auth-fixture
 * Purpose:  Hand a spec an APIRequestContext that is already authenticated as a
 *           role global-setup provisioned, so no spec spends a second
 *           /auth/login permit to get one.
 * Does NOT: LOG IN. Provisioning lives in global-setup.ts; this consumes what
 *           that wrote and, since MEH-2269, renews it through /auth/refresh —
 *           never through /auth/login, whose 5/minute per-IP budget is the
 *           whole reason this file exists.
 * Related:  e2e/global-setup.ts (writer) · e2e/flows/19,20,22 (consumers) ·
 *           backend/app/auth.py:211-230 (_check_fingerprint)
 * History:  MEH-1858 (creation); MEH-2269 (refresh-before-use).
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
import { isStale } from "./token-freshness";

export const AUTH_DIR = path.join(__dirname, ".auth");

export const fixturePath = (role: string): string =>
  path.join(AUTH_DIR, `${role}.json`);

export const fixtureExists = (role: string): boolean =>
  fs.existsSync(fixturePath(role));

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
  // MEH-2269: renew first. global-setup minted this token once, at the start of
  // a run that can last 25 minutes against a 15-minute TTL, so by the time a
  // late spec calls this the fixture on disk may already be dead.
  await ensureFreshFixture(role);
  const token = tokenFromFixture(role);
  const bypassSecret =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    process.env.VERCEL_BYPASS_SECRET ||
    "";
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

/** The origin global-setup logged in against, read back off the fixture. */
function originFromFixture(role: string): string {
  const state = JSON.parse(fs.readFileSync(fixturePath(role), "utf8"));
  const origin = state?.origins?.[0]?.origin;
  if (!origin) {
    throw new Error(
      `[auth-fixture] ${fixturePath(role)} carries no origins[0].origin — cannot ` +
        `tell which target to refresh against.`,
    );
  }
  return origin as string;
}

function bypassHeaders(): Record<string, string> {
  const secret =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    process.env.VERCEL_BYPASS_SECRET ||
    "";
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}

/**
 * Renew `role`'s storageState through `POST /auth/refresh` and rewrite the
 * fixture file. No-op unless the stored token is stale (token-freshness.ts).
 *
 * MEH-2269. Three things make this the renewal that works, and each of them is
 * a way earlier attempts at "just get a new token" would have failed:
 *
 * 1. **Refresh, not login.** `/auth/login` is `5/minute` per IP with
 *    slowapi's default key_func (auth.py:999) and one Actions runner is one IP
 *    for the entire suite — the constraint MEH-1858 was opened to fix. Refresh
 *    is `30/minute` (auth.py:152) and needs no credentials in the process,
 *    only the HttpOnly cookie the fixture already carries.
 * 2. **The context is built FROM the fixture**, so the refresh cookie is sent.
 *    A bare context with a bearer header cannot refresh — there is nothing to
 *    refresh with.
 * 3. **The rotated cookies are written back, not just the token.** The refresh
 *    route re-mints `__Secure-Fgp` and returns an access token bound to the
 *    NEW fingerprint (auth.py:211-217). Keeping the old cookie beside the new token
 *    fails `_check_fingerprint` on every request — a 401 identical to the
 *    expiry this is fixing, which is exactly the trap the header note above
 *    describes for a bare bearer context.
 *
 * The write is atomic (tmp + rename) because parallel workers read this file
 * while another may be rewriting it; a torn read would surface as a JSON parse
 * error in an unrelated spec.
 */
export async function ensureFreshFixture(role: string): Promise<boolean> {
  if (!fixtureExists(role)) return false;
  if (!isStale(tokenFromFixture(role))) return false;

  const origin = originFromFixture(role);
  const ctx = await request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    storageState: fixturePath(role),
    extraHTTPHeaders: bypassHeaders(),
  });
  let res;
  try {
    res = await ctx.post("/api/auth/refresh");
    if (!res.ok()) {
      throw new Error(
        `[auth-fixture] /auth/refresh for "${role}" at ${origin} returned ` +
          `HTTP ${res.status()}. The stored refresh cookie is 14 days old at most ` +
          `(config.py:36), so a 401 here means the cookie was never captured or the ` +
          `account's token_version moved.`,
      );
    }
    const { access_token: accessToken } = await res.json();
    if (!accessToken) {
      throw new Error(
        `[auth-fixture] /auth/refresh for "${role}" returned no access_token.`,
      );
    }
    const state = await ctx.storageState();
    state.origins = [
      {
        origin,
        localStorage: [
          { name: "token", value: accessToken },
          // Same reason global-setup seeds it: without it CookieBanner's
          // role="dialog" collides with every other dialog locator.
          { name: "cookieConsent", value: "essential" },
        ],
      },
    ];
    const tmp = path.join(
      AUTH_DIR,
      `.${role}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`,
    );
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, fixturePath(role));
    console.log(
      `[auth-fixture] refreshed ${role} storageState (token was stale).`,
    );
    return true;
  } finally {
    await ctx.dispose();
  }
}
