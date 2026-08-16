/**
 * MEH-1899 — the middleware's slug existence check must distinguish "this
 * business does not exist" from "the backend answered about something else".
 *
 * Before: `return res.ok` collapsed 404, 500, 429 and every other non-2xx onto
 * one `false`, which became `NextResponse.rewrite("/__mm_not_found__", {status:
 * 404})`. The page never ran, so neither its `notFound()` nor its `revalidate`
 * were involved — the 404 was minted in the middleware.
 *
 * Why that is the worst of the three siblings (MEH-1521 · MEH-1754 · this):
 * it is the only one that produces a HARD, authoritative-looking 404 on the
 * CANONICAL url. lib/seo.js:120 prefers the slug, so the one URL Google crawls
 * is exactly the one that broke. 404 means GONE (deindex); 5xx means retry.
 *
 * These assert BEHAVIOUR at the middleware boundary — what the response IS for
 * a given backend status — not that a particular line was edited (ADR-032
 * §3.6). An inert fix cannot pass them.
 *
 * DISCRIMINATION: against the old `return res.ok`, the 500 / 429 / 503 cases
 * below each produced a 404 rewrite, so all three fail on it. The 404 case and
 * the 200 case passed before and still pass — they are the controls that stop
 * "always fail open" from satisfying the suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-intl/middleware", () => ({
  default: () => () => ({
    headers: new Map(),
    __intl: true,
  }),
}));

const rewrite = vi.fn((url, init) => ({ __rewrite: true, url, status: init?.status }));
vi.mock("next/server", () => ({
  NextResponse: {
    rewrite: (url, init) => rewrite(url, init),
    next: () => ({ __next: true }),
  },
}));

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...a) => captureMessage(...a),
}));

import middleware from "@/middleware";

const SLUG = "lehem-vezman";

/** Minimal Request stand-in carrying only what the middleware reads. */
const requestFor = (pathname) => {
  const nextUrl = {
    pathname,
    clone() {
      return { ...nextUrl, clone: nextUrl.clone };
    },
  };
  return { nextUrl, url: `https://staging.mehamakor.online${pathname}`, headers: new Map() };
};

const backendReturns = (status) => {
  global.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
  }));
};

/** True when the middleware minted the hard-404 rewrite. */
const wasNotFound = (res) => Boolean(res?.__rewrite) && res.status === 404;

beforeEach(() => {
  rewrite.mockClear();
  captureMessage.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("middleware slug check — only a 404 means the business is absent", () => {
  // ── The two controls. Both passed BEFORE the fix and must keep passing;
  //    without them, "always return true" would satisfy every case below.
  it("backend 200 → the page is served, no 404 rewrite", async () => {
    backendReturns(200);
    const res = await middleware(requestFor(`/he/${SLUG}`));
    expect(wasNotFound(res)).toBe(false);
  });

  it("backend 404 → a real hard 404 (MEH-1398's guarantee is untouched)", async () => {
    backendReturns(404);
    const res = await middleware(requestFor(`/he/${SLUG}`));
    expect(wasNotFound(res)).toBe(true);
  });

  // ── The discriminating cases. Every one of these produced a 404 rewrite
  //    against `return res.ok`, which is precisely the bug.
  it.each([
    [500, "a stuttering backend must not deindex a real business"],
    [503, "a deploy window must not read as GONE"],
    [429, "rate limiting must not be indistinguishable from absence"],
  ])("backend %i → fails OPEN, no 404 rewrite (%s)", async (status) => {
    backendReturns(status);
    const res = await middleware(requestFor(`/he/${SLUG}`));
    expect(wasNotFound(res)).toBe(false);
  });

  it("a thrown fetch still fails open, as before", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const res = await middleware(requestFor(`/he/${SLUG}`));
    expect(wasNotFound(res)).toBe(false);
  });

  // ── Observability. The ticket's §3.2 is that this failure ran with zero
  //    reporting and was found only because an E2E spec bit on it. A silent
  //    fail-open is better than a false 404 and still undiagnosable.
  it("reports the non-2xx status it failed open on, so the next one is diagnosable", async () => {
    backendReturns(500);
    await middleware(requestFor(`/he/${SLUG}`));
    expect(console.error).toHaveBeenCalled();
    const logged = console.error.mock.calls.flat().join(" ");
    expect(logged).toContain("500");
  });

  it("does NOT report on the ordinary 404 path — a real miss is not an incident", async () => {
    backendReturns(404);
    await middleware(requestFor(`/he/${SLUG}`));
    expect(console.error).not.toHaveBeenCalled();
  });

  // ── MEH-1521: a SLOW backend must not hang the edge request indefinitely —
  //    it should degrade to the same fail-open path as "unreachable", bounded.
  it("bounds the existence check with an abort signal, so a hung backend cannot hang the edge request", async () => {
    backendReturns(200);
    await middleware(requestFor(`/he/${SLUG}`));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("a timed-out fetch (TimeoutError) fails open exactly like an unreachable backend", async () => {
    global.fetch = vi.fn(async () => {
      const err = new Error("The operation was aborted");
      err.name = "TimeoutError";
      throw err;
    });
    const res = await middleware(requestFor(`/he/${SLUG}`));
    expect(wasNotFound(res)).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  // ── MEH-1906: the 5xx fail-open branch also reports to Sentry — scoped to
  //    5xx only, so 429 and the unreachable-backend catch must NOT trigger it
  //    (those are the discriminating cases: without the `res.status >= 500`
  //    guard every one of these would also report, which is the bug this
  //    suite must catch). Each case below uses its own slug so the per-URL
  //    rate-guard (module-level Set) can't leak a call count across tests
  //    that share this file's single middleware import.
  describe("MEH-1906 — Sentry reporting scoped to 5xx, rate-guarded per URL", () => {
    it("backend 500 → Sentry.captureMessage called once, with the status", async () => {
      backendReturns(500);
      await middleware(requestFor("/he/meh-1906-report-slug-a"));
      expect(captureMessage).toHaveBeenCalledTimes(1);
      const [message, opts] = captureMessage.mock.calls[0];
      expect(message).toMatch(/5xx/i);
      expect(opts.level).toBe("error");
      expect(opts.extra.status).toBe(500);
    });

    it("backend 503 → Sentry.captureMessage called (5xx is not just 500)", async () => {
      backendReturns(503);
      await middleware(requestFor("/he/meh-1906-report-slug-b"));
      expect(captureMessage).toHaveBeenCalledTimes(1);
    });

    it("backend 429 → Sentry.captureMessage NOT called (still fails open, still logs via report())", async () => {
      backendReturns(429);
      const res = await middleware(requestFor("/he/meh-1906-report-slug-c"));
      expect(wasNotFound(res)).toBe(false);
      expect(console.error).toHaveBeenCalled();
      expect(captureMessage).not.toHaveBeenCalled();
    });

    it("a thrown fetch (unreachable backend) → Sentry.captureMessage NOT called", async () => {
      global.fetch = vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      });
      await middleware(requestFor("/he/meh-1906-report-slug-d"));
      expect(captureMessage).not.toHaveBeenCalled();
    });

    it("rate-guards per URL: a second 500 for the same slug does not re-report", async () => {
      backendReturns(500);
      const req = () => requestFor("/he/meh-1906-report-slug-e");
      await middleware(req());
      await middleware(req());
      expect(captureMessage).toHaveBeenCalledTimes(1);
    });

    // The guard's Set is keyed by URL, and the URL space is attacker-reachable
    // (every slug-shaped path is a distinct key), so it must be bounded. This
    // asserts the bound WITHOUT going silent — which is the half that matters:
    //
    //   `if (size >= CAP) return` (the obvious guard) -> FAILS assertion 1,
    //        because reporting stops dead at the cap. That is the fail-silent
    //        state MEH-1906 exists to remove.
    //   an UNBOUNDED Set -> FAILS assertion 2, because an early URL would
    //        still be remembered after the storm.
    //
    // Assertion 2 is how boundedness is observed without exporting the Set:
    // eviction of an early key IS the bound, visible from the outside.
    it("stays bounded under a many-slug storm AND keeps reporting past the cap", async () => {
      backendReturns(500);
      const CAP = 1000;
      for (let i = 0; i < CAP + 5; i++) {
        await middleware(requestFor(`/he/meh-1906-storm-${i}`));
      }
      // 1 — the cap must not silence the alert.
      expect(captureMessage).toHaveBeenCalledTimes(CAP + 5);

      // 2 — an EARLY url must have been evicted, which is only true if the
      //     Set is bounded. Unbounded ⇒ still remembered ⇒ no re-report ⇒ red.
      captureMessage.mockClear();
      await middleware(requestFor("/he/meh-1906-storm-0"));
      expect(captureMessage).toHaveBeenCalledTimes(1);

      // 3 — and it is still a real guard, not a no-op: the url just reported
      //     is now remembered.
      captureMessage.mockClear();
      await middleware(requestFor("/he/meh-1906-storm-0"));
      expect(captureMessage).not.toHaveBeenCalled();
    });
  });
});
