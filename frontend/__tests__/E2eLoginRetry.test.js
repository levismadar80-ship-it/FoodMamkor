import { describe, it, expect, vi } from "vitest";
import {
  withRateLimitRetry,
  retryDelayMs,
  MAX_ATTEMPTS,
  FALLBACK_WAIT_MS,
  MAX_WAIT_MS,
} from "../e2e/login-retry";

// MEH-2895 — global-setup's login survives the per-IP rate limit.
//
// `/auth/login` is 5/minute per client IP. A second suite in the same minute
// from the same IP got a 429 on its first login, global-setup threw, and the
// run executed 0 tests. The retry is the whole fix; it is pure apart from the
// injected sleep, so it is tested here without a backend or a real clock.

const NOW = 1_757_000_000_000;

/** A response-like object with the two methods the module reads. */
const res = (status, headers = {}) => ({
  status: () => status,
  headers: () => headers,
});

/** An attempt function that returns `statuses` in order, recording each call. */
function sequence(...responses) {
  const queue = [...responses];
  const fn = vi.fn(async () => {
    if (queue.length === 0) throw new Error("attempt called more often than scripted");
    return queue.shift();
  });
  return fn;
}

const noSleep = () => {
  const waits = [];
  return { waits, sleep: async (ms) => void waits.push(ms) };
};

describe("withRateLimitRetry (MEH-2895)", () => {
  it("429 then 200 → returns the 200 after one fallback wait", async () => {
    const attempt = sequence(res(429), res(200));
    const { waits, sleep } = noSleep();
    const { response, attempts } = await withRateLimitRetry(attempt, { sleep, now: () => NOW });
    expect(response.status()).toBe(200);
    expect(attempts).toBe(2);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([FALLBACK_WAIT_MS]);
  });

  it("429 on every attempt → stops at MAX_ATTEMPTS and hands back the 429", async () => {
    const attempt = sequence(...Array.from({ length: MAX_ATTEMPTS }, () => res(429)));
    const { waits, sleep } = noSleep();
    const { response, attempts } = await withRateLimitRetry(attempt, { sleep, now: () => NOW });
    expect(response.status()).toBe(429);
    expect(attempts).toBe(MAX_ATTEMPTS);
    expect(attempt).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    // One wait between each pair of attempts, none after the last.
    expect(waits).toHaveLength(MAX_ATTEMPTS - 1);
    // The waits must add up to at least one full limiter window (60 s), or the
    // last attempt can land in the window that refused the first.
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(60_000);
  });

  it.each([200, 401, 422, 500, 502])(
    "%i on the first attempt → returned at once, no wait, no second call",
    async (status) => {
      const attempt = sequence(res(status));
      const { waits, sleep } = noSleep();
      const { response, attempts } = await withRateLimitRetry(attempt, { sleep, now: () => NOW });
      expect(response.status()).toBe(status);
      expect(attempts).toBe(1);
      expect(waits).toEqual([]);
    },
  );

  it("429 then 401 → the 401 comes back (a wrong password is not retried)", async () => {
    const attempt = sequence(res(429), res(401), res(200));
    const { sleep } = noSleep();
    const { response, attempts } = await withRateLimitRetry(attempt, { sleep, now: () => NOW });
    expect(response.status()).toBe(401);
    expect(attempts).toBe(2);
  });

  it("uses Retry-After when the backend sends one", async () => {
    const attempt = sequence(res(429, { "retry-after": "7" }), res(200));
    const { waits, sleep } = noSleep();
    await withRateLimitRetry(attempt, { sleep, now: () => NOW });
    expect(waits).toEqual([7_000]);
  });

  it("reports each retry to onRetry with the wait it is about to take", async () => {
    const attempt = sequence(res(429), res(429), res(200));
    const { sleep } = noSleep();
    const seen = [];
    await withRateLimitRetry(attempt, { sleep, now: () => NOW, onRetry: (i) => seen.push(i) });
    expect(seen).toEqual([
      { attempt: 1, waitMs: FALLBACK_WAIT_MS },
      { attempt: 2, waitMs: FALLBACK_WAIT_MS },
    ]);
  });
});

describe("retryDelayMs (MEH-2895)", () => {
  it("reads delta-seconds", () => {
    expect(retryDelayMs("30", NOW)).toBe(30_000);
  });

  it("reads an HTTP date relative to now", () => {
    const at = new Date(NOW + 12_000).toUTCString();
    // toUTCString drops milliseconds, so allow the sub-second remainder.
    const ms = retryDelayMs(at, NOW);
    expect(ms).toBeGreaterThan(11_000);
    expect(ms).toBeLessThanOrEqual(12_000);
  });

  it.each([undefined, null, "", "   ", "soon", "-5"])(
    "falls back on %j",
    (value) => {
      expect(retryDelayMs(value, NOW)).toBe(FALLBACK_WAIT_MS);
    },
  );

  it("caps a huge header at MAX_WAIT_MS and floors 0 / past dates at 1 s", () => {
    expect(retryDelayMs("3600", NOW)).toBe(MAX_WAIT_MS);
    expect(retryDelayMs("0", NOW)).toBe(1_000);
    expect(retryDelayMs(new Date(NOW - 60_000).toUTCString(), NOW)).toBe(1_000);
  });
});
