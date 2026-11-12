/**
 * Module:   login-retry
 * Purpose:  Retry a login request that the backend's rate limiter refused (429),
 *           and nothing else.
 * Does NOT: build the request, read credentials, or decide what a non-429 error
 *           means — global-setup.ts does that, exactly as before. Pure apart from
 *           the injected `sleep`, so a unit test can exercise it without a
 *           browser, a backend or a real clock.
 * Related:  e2e/global-setup.ts (the only caller) ·
 *           backend/app/routers/auth.py (`/auth/login`, 5/minute) ·
 *           backend/app/rate_limit.py (key = client IP, no email component)
 * History:  MEH-2895 (creation).
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * `/auth/login` allows 5 requests a minute per client IP. global-setup logs in
 * three or four accounts in a row. A second suite starting within the same
 * minute from the same IP (two E2E shards, or a re-run right after a run) spends
 * the remaining permits, and the setup used to throw on the first 429: the run
 * then executed 0 tests (staging run on 541de4995, 10/11/2026).
 *
 * slowapi sends no `Retry-After` here (`headers_enabled` is off), and its
 * window is one minute. So the fallback waits 20 s and tries up to 4 times:
 * 3 waits = 60 s, which always crosses into a new window. A `Retry-After`
 * header, if the backend ever sends one, wins over the fallback (capped).
 *
 * Only 429 is retried. A 401 is a wrong password and a 5xx is a broken
 * backend: waiting would only hide them, so they return on the first attempt.
 */

export const MAX_ATTEMPTS = 4;
export const FALLBACK_WAIT_MS = 20_000;
/** Never wait longer than one limiter window plus a margin on a single header. */
export const MAX_WAIT_MS = 65_000;

/** The slice of Playwright's APIResponse this module reads. */
export type ResponseLike = {
  status(): number;
  headers(): Record<string, string>;
};

/**
 * How long to wait before the next attempt. `Retry-After` is either a number of
 * seconds or an HTTP date (RFC 9110 §10.2.3); anything unreadable falls back.
 */
export function retryDelayMs(
  retryAfter: string | undefined | null,
  nowMs: number,
  fallbackMs: number = FALLBACK_WAIT_MS,
): number {
  if (retryAfter == null || retryAfter.trim() === "") return fallbackMs;
  const value = retryAfter.trim();
  let ms: number;
  if (/^\d+$/.test(value)) {
    ms = Number(value) * 1000;
  } else {
    // An HTTP date always names a weekday and month. Without the letter check
    // V8 parses "-5" as the year 5 BC, which would read as "retry now".
    if (!/[a-z]/i.test(value)) return fallbackMs;
    const at = Date.parse(value);
    if (Number.isNaN(at)) return fallbackMs;
    ms = at - nowMs;
  }
  // A date in the past or "0" still needs a beat, or the retry lands in the
  // same window that just refused it.
  return Math.min(Math.max(ms, 1_000), MAX_WAIT_MS);
}

export type RetryOptions = {
  maxAttempts?: number;
  fallbackMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Called before each wait — global-setup logs it (never the credentials). */
  onRetry?: (info: { attempt: number; waitMs: number }) => void;
};

/**
 * Run `attempt` until it returns something other than 429, or until
 * `maxAttempts` is spent. Returns the LAST response either way: the caller's
 * existing `ok()` check then reports a final 429 as the failure it is.
 */
export async function withRateLimitRetry<R extends ResponseLike>(
  attempt: () => Promise<R>,
  {
    maxAttempts = MAX_ATTEMPTS,
    fallbackMs = FALLBACK_WAIT_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
    onRetry,
  }: RetryOptions = {},
): Promise<{ response: R; attempts: number }> {
  let response = await attempt();
  let attempts = 1;
  while (response.status() === 429 && attempts < maxAttempts) {
    const waitMs = retryDelayMs(response.headers()["retry-after"], now(), fallbackMs);
    onRetry?.({ attempt: attempts, waitMs });
    await sleep(waitMs);
    response = await attempt();
    attempts += 1;
  }
  return { response, attempts };
}

/**
 * The error global-setup throws when a login still fails. Kept here, beside the
 * retry, so the 429 wording is unit-tested: a final 429 must read as the rate
 * limit, never as a seeding problem (which sends the reader to re-seed staging).
 */
export function loginFailureMessage(
  role: string,
  email: string,
  baseURL: string,
  status: number,
  attempts: number,
): string {
  const head =
    `[global-setup] login failed for ${role} (${email}) at ${baseURL}: ` +
    `HTTP ${status} after ${attempts} attempt(s).`;
  return status === 429
    ? `${head} Still rate-limited (5/minute per IP) — another suite is logging in from the same IP.`
    : `${head} Did the staging --sync-users run succeed?`;
}
