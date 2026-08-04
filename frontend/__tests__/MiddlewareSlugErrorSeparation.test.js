/**
 * MEH-1899 — the edge middleware must distinguish "this business does not
 * exist" from "the backend answered, badly".
 *
 * `middleware.js` returns `res.ok` from the by-slug existence check, so 404,
 * 429 and 500 all collapse to `false` and all produce the same hard 404 rewrite
 * to `/__mm_not_found__`. The `catch` fails OPEN, but only for a *thrown* error
 * — a non-2xx *response* never reaches it.
 *
 * Why that is worse than it sounds: `lib/seo.js:120` makes the slug the
 * canonical URL, so the one address Google crawls is the one that hard-404s on
 * a transient backend fault. 404 tells a crawler the business is GONE; 5xx and
 * 429 tell it to come back. And because the middleware rewrites *before* the
 * page renders, `app/[locale]/[slug]/page.js` never runs — the MEH-1754 fix
 * that already separates these states at the page boundary
 * (`SlugResolverErrorSeparation.test.jsx`) is unreachable on this route.
 *
 * These assert BEHAVIOUR at the middleware boundary — for a given backend
 * response, does the request get rewritten to a 404 or passed through? — not
 * that a particular line was edited (ADR-032 §3.6). An inert "fix" cannot pass.
 *
 * Discrimination: against the CURRENT middleware, the 429 and 5xx cases below
 * fail, because every one of them rewrites to a hard 404 today. The 404, 200
 * and thrown-error cases pass both before and after; they are here to pin the
 * behaviour that must NOT change.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rewrite = vi.fn((url, init) => ({ __rewrite: true, url, init }));

vi.mock("next/server", () => ({
  NextResponse: { rewrite: (...args) => rewrite(...args) },
}));

// The locale layer is not under test: return a response with no `location`
// header so the middleware proceeds to the existence check.
const INTL_RESPONSE = { __intl: true, headers: new Headers() };
vi.mock("next-intl/middleware", () => ({
  default: () => () => INTL_RESPONSE,
}));

import middleware from "@/middleware";

const SLUG = "lehem-vezman";

/** A fetch Response stub carrying only what producerExists reads. */
const response = (status) => ({
  status,
  ok: status >= 200 && status < 300,
});

/** Minimal NextRequest stand-in — the middleware reads nextUrl only. */
function request(pathname) {
  const clone = { pathname };
  return { nextUrl: { pathname, clone: () => clone } };
}

beforeEach(() => {
  vi.clearAllMocks();
  rewrite.mockClear();
});

async function runWith(fetchImpl, pathname = `/he/${SLUG}`) {
  global.fetch = fetchImpl;
  return middleware(request(pathname));
}

describe("MEH-1899 — middleware separates not-found from backend fault", () => {
  it("backend 404 → hard 404 rewrite (MEH-1398's guarantee, must not change)", async () => {
    const res = await runWith(vi.fn(async () => response(404)));
    expect(rewrite).toHaveBeenCalledTimes(1);
    expect(rewrite.mock.calls[0][0].pathname).toBe("/__mm_not_found__");
    expect(rewrite.mock.calls[0][1]).toEqual({ status: 404 });
    expect(res.__rewrite).toBe(true);
  });

  it("backend 200 → passes through untouched", async () => {
    const res = await runWith(vi.fn(async () => response(200)));
    expect(rewrite).not.toHaveBeenCalled();
    expect(res).toBe(INTL_RESPONSE);
  });

  // ── The two cases that fail against the current middleware ──────────────

  it("backend 429 → must NOT hard-404 the canonical URL", async () => {
    const res = await runWith(vi.fn(async () => response(429)));
    expect(
      rewrite,
      "a rate-limited existence check must not tell a crawler the business is gone",
    ).not.toHaveBeenCalled();
    expect(res).toBe(INTL_RESPONSE);
  });

  it("backend 500 → must NOT hard-404 the canonical URL", async () => {
    const res = await runWith(vi.fn(async () => response(500)));
    expect(
      rewrite,
      "a backend fault must surface as a fault, not as a permanent not-found",
    ).not.toHaveBeenCalled();
    expect(res).toBe(INTL_RESPONSE);
  });

  it("backend 503 → must NOT hard-404 the canonical URL", async () => {
    await runWith(vi.fn(async () => response(503)));
    expect(rewrite).not.toHaveBeenCalled();
  });

  // ── Behaviour that already holds and must be preserved ──────────────────

  it("fetch throws (backend unreachable) → fails open, as today", async () => {
    const res = await runWith(
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(rewrite).not.toHaveBeenCalled();
    expect(res).toBe(INTL_RESPONSE);
  });

  it("a static route is never existence-checked", async () => {
    const fetchSpy = vi.fn(async () => response(404));
    await runWith(fetchSpy, "/he/about");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("/producer/{id} is never existence-checked (MEH-1632)", async () => {
    const fetchSpy = vi.fn(async () => response(404));
    await runWith(fetchSpy, "/he/producer/0208cb12-dac4-474e-a640-8d308c074c93");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rewrite).not.toHaveBeenCalled();
  });
});
