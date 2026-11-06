/**
 * MEH-2706 — /events/<id> and /producers/diet/<slug> streamed HTTP 200 for a
 * missing page (measured on staging 6/11, browser and Googlebot UA alike):
 * their notFound() runs inside generateMetadata, which streams in Next 16.
 * The middleware now mints the real 404, with the same fail-open contract as
 * the slug check (MiddlewareSlugErrorSeparation.test.jsx): only an ANSWERED
 * "absent" becomes a 404.
 *
 * DISCRIMINATION: against the old middleware every "→ 404" case below was a
 * pass-through (no rewrite), so each fails on it. The "passes through" cases
 * are the controls that stop "always 404" from satisfying the suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-intl/middleware", () => ({
  default: () => () => ({ headers: new Map(), __intl: true }),
}));
const rewrite = vi.fn((url, init) => ({ __rewrite: true, url, status: init?.status }));
vi.mock("next/server", () => ({
  NextResponse: { rewrite: (url, init) => rewrite(url, init), next: () => ({ __next: true }) },
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

import middleware from "@/middleware";

const requestFor = (pathname) => {
  const nextUrl = { pathname, clone() { return { ...nextUrl, clone: nextUrl.clone }; } };
  return { nextUrl, url: `https://staging.mehamakor.online${pathname}`, headers: new Map() };
};
const backend = ({ status = 200, total = null, throws = false } = {}) => {
  global.fetch = vi.fn(async () => {
    if (throws) throw new Error("network");
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k) => (k.toLowerCase() === "x-total-count" && total !== null ? String(total) : null) },
    };
  });
};
const wasNotFound = (res) => Boolean(res?.__rewrite) && res.status === 404;

beforeEach(() => {
  rewrite.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const EVENT = "/he/events/00000000-0000-0000-0000-000000000000";

describe("/events/<id> (MEH-2706)", () => {
  it("backend 404 → real 404", async () => {
    backend({ status: 404 });
    expect(wasNotFound(await middleware(requestFor(EVENT)))).toBe(true);
  });
  it("backend 422 (id is not a UUID) → real 404", async () => {
    backend({ status: 422 });
    expect(wasNotFound(await middleware(requestFor("/he/events/not-a-uuid")))).toBe(true);
  });
  it("asks the backend about exactly that event", async () => {
    backend({ status: 404 });
    await middleware(requestFor(EVENT));
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/events\/00000000-0000-0000-0000-000000000000$/);
  });
  it("the /en/ locale gets the same real 404", async () => {
    backend({ status: 404 });
    expect(wasNotFound(await middleware(requestFor("/en/events/00000000-0000-0000-0000-000000000000")))).toBe(true);
  });
  it("control: existing event passes through", async () => {
    backend({ status: 200 });
    expect(wasNotFound(await middleware(requestFor(EVENT)))).toBe(false);
  });
  it.each([500, 429, 503])("control: backend %i fails open", async (status) => {
    backend({ status });
    expect(wasNotFound(await middleware(requestFor(EVENT)))).toBe(false);
  });
  it("control: network error fails open", async () => {
    backend({ throws: true });
    expect(wasNotFound(await middleware(requestFor(EVENT)))).toBe(false);
  });
  it("control: the /events list itself is never checked", async () => {
    backend({ status: 404 });
    expect(wasNotFound(await middleware(requestFor("/he/events")))).toBe(false);
  });
});

describe("/producers/diet/<slug> (MEH-2706)", () => {
  it("fewer than 5 matching businesses → real 404", async () => {
    backend({ total: 4 });
    expect(wasNotFound(await middleware(requestFor("/he/producers/diet/gluten-free")))).toBe(true);
  });
  it("unknown slug → real 404 without a fetch", async () => {
    backend({ total: 99 });
    expect(wasNotFound(await middleware(requestFor("/he/producers/diet/low-carb")))).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("queries the slug's own filter", async () => {
    backend({ total: 0 });
    await middleware(requestFor("/producers/diet/gluten-free"));
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/producers\?gluten_free=true&limit=1/);
  });
  it("a percent-encoded known slug is decoded, not treated as unknown", async () => {
    backend({ total: 9 });
    expect(wasNotFound(await middleware(requestFor("/he/producers/diet/%76egan")))).toBe(false);
    expect(global.fetch.mock.calls[0][0]).toMatch(/vegan=true/);
  });
  it("control: 5 or more passes through", async () => {
    backend({ total: 5 });
    expect(wasNotFound(await middleware(requestFor("/he/producers/diet/vegan")))).toBe(false);
  });
  it("control: missing X-Total-Count is unknown, not zero — fails open", async () => {
    backend({ total: null });
    expect(wasNotFound(await middleware(requestFor("/he/producers/diet/vegan")))).toBe(false);
  });
  it("control: an empty or blank X-Total-Count is unknown, not zero — fails open", async () => {
    for (const blank of ["", "  "]) {
      backend({ total: blank });
      expect(wasNotFound(await middleware(requestFor("/he/producers/diet/vegan")))).toBe(false);
    }
  });
  it("control: backend 500 fails open", async () => {
    backend({ status: 500 });
    expect(wasNotFound(await middleware(requestFor("/he/producers/diet/vegan")))).toBe(false);
  });
});
