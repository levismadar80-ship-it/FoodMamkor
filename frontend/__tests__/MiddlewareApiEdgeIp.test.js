/**
 * MEH-2298 — /api/* pass-through stamps the visitor IP for the backend
 * rate limiter, and only when EDGE_PROXY_SECRET is configured.
 *
 * Behaviour asserted at the middleware boundary: what upstream request
 * headers the response carries (ADR-032 §3.6), not that a line was edited.
 *
 * DISCRIMINATION: before MEH-2298 the matcher excluded /api, so the
 * "stamps" case has no pass-through to call and fails; the "unset" and
 * "spoofed header" cases are the controls that stop "always stamp" or
 * "trust what the client sent" from satisfying the suite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/middleware", () => ({
  default: () => () => ({ headers: new Map(), __intl: true }),
}));

const next = vi.fn((init) => ({ __next: true, init }));
vi.mock("next/server", () => ({
  NextResponse: {
    rewrite: vi.fn(),
    next: (init) => next(init),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

const SECRET = "e".repeat(64);

function apiRequest(headers = {}) {
  return {
    nextUrl: { pathname: "/api/producers" },
    headers: new Headers(headers),
  };
}

async function load(secret) {
  vi.resetModules();
  if (secret === undefined) delete process.env.EDGE_PROXY_SECRET;
  else process.env.EDGE_PROXY_SECRET = secret;
  return import("@/middleware");
}

describe("MEH-2298 /api pass-through", () => {
  beforeEach(() => next.mockClear());

  it("stamps the visitor IP and the secret when configured", async () => {
    const mod = await load(SECRET);
    const res = await mod.default(
      apiRequest({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "203.0.113.7" }),
    );
    const sent = res.init.request.headers;
    expect(sent.get("x-edge-secret")).toBe(SECRET);
    expect(sent.get("x-edge-client-ip")).toBe("203.0.113.7");
  });

  it("overwrites edge headers a visitor tried to pre-load", async () => {
    const mod = await load(SECRET);
    const res = await mod.default(
      apiRequest({
        "x-real-ip": "203.0.113.7",
        "x-edge-secret": "guess",
        "x-edge-client-ip": "1.2.3.4",
      }),
    );
    const sent = res.init.request.headers;
    expect(sent.get("x-edge-secret")).toBe(SECRET);
    expect(sent.get("x-edge-client-ip")).toBe("203.0.113.7");
  });

  it("is a plain pass-through when the secret is unset", async () => {
    const mod = await load(undefined);
    const res = await mod.default(apiRequest({ "x-real-ip": "203.0.113.7" }));
    expect(res.__next).toBe(true);
    expect(res.init).toBeUndefined();
  });

  it("routes /api before locale handling", async () => {
    const mod = await load(undefined);
    const res = await mod.default(apiRequest());
    expect(res.__intl).toBeUndefined();
    expect(mod.config.matcher).toContain("/api/:path*");
  });
});
