/**
 * MEH-3336 — a renamed business's old URL answers a permanent 301 to its
 * current one. The backend says so on a 404 carrying
 * `{detail: {code: "slug_moved", slug}}`; any other 404 stays the hard 404.
 *
 * DISCRIMINATION: against the pre-MEH-3336 middleware (`404 → false`), the two
 * redirect cases produce the 404 rewrite instead and fail; the plain-404 and
 * hostile-slug cases are the controls that stop "always redirect" passing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-intl/middleware", () => ({
  default: () => () => ({ headers: new Map(), __intl: true }),
}));

const rewrite = vi.fn((url, init) => ({ __rewrite: true, url, status: init?.status }));
const redirect = vi.fn((url, status) => ({ __redirect: true, url, status, headers: new Map() }));
vi.mock("next/server", () => ({
  NextResponse: {
    rewrite: (url, init) => rewrite(url, init),
    redirect: (url, status) => redirect(url, status),
    next: () => ({ __next: true }),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

import middleware from "@/middleware";

const requestFor = (pathname, search = "") => {
  const nextUrl = {
    pathname,
    search,
    clone() {
      return { ...nextUrl, clone: nextUrl.clone };
    },
  };
  return { nextUrl, url: `https://staging.mehamakor.online${pathname}${search}`, headers: new Map() };
};

const backend404 = (body) => {
  global.fetch = vi.fn(async () => ({
    ok: false,
    status: 404,
    json: async () => body,
  }));
};

beforeEach(() => {
  rewrite.mockClear();
  redirect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("middleware — renamed business slug (MEH-3336)", () => {
  it("301s a Hebrew-locale old slug to the new one, without a locale prefix", async () => {
    backend404({ detail: { code: "slug_moved", slug: "sandra-perot" } });
    const res = await middleware(requestFor(`/${encodeURIComponent("סנדרה-פירות-איכותיים-2")}`, "?ref=wa"));
    expect(res.__redirect).toBe(true);
    expect(res.status).toBe(301);
    expect(res.url.pathname).toBe("/sandra-perot");
    expect(res.url.search).toBe("?ref=wa");
    // A bounded cache: a rename back (A→B→A) must not loop a browser forever.
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("keeps an explicit /en prefix", async () => {
    backend404({ detail: { code: "slug_moved", slug: "sandra-perot" } });
    const res = await middleware(requestFor("/en/old-sandra"));
    expect(res.status).toBe(301);
    expect(res.url.pathname).toBe("/en/sandra-perot");
  });

  it("a plain 404 is still the hard 404 (control)", async () => {
    backend404({ detail: "בית עסק לא נמצא" });
    const res = await middleware(requestFor("/no-such-business"));
    expect(redirect).not.toHaveBeenCalled();
    expect(res.__rewrite).toBe(true);
    expect(res.status).toBe(404);
  });

  it("never follows a slug that is not plain Latin (control)", async () => {
    backend404({ detail: { code: "slug_moved", slug: "//evil.example/x" } });
    const res = await middleware(requestFor("/old-slug"));
    expect(redirect).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });
});
