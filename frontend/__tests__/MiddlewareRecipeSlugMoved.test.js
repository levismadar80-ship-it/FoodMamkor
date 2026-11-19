/**
 * MEH-3342 finding 3 — a recipe link from before the business was renamed
 * (`/<old-slug>/recipes/<id>`, listed in the sitemap) answers a 301 to
 * `/<new-slug>/recipes/<id>`, like the business page itself (MEH-3336).
 *
 * DISCRIMINATION: against the old recipeExists (`404 → false`) the two
 * redirect cases get the 404 rewrite and fail; the plain-404 and hostile-slug
 * cases are the controls that stop "always redirect" passing.
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

const RECIPE = "6f1c2b9e-0d4a-4c1e-9b7a-2f3e4d5c6b7a";

describe("middleware — recipe under a renamed business slug (MEH-3342)", () => {
  it("301s /<old>/recipes/<id> to /<new>/recipes/<id>, keeping the query", async () => {
    backend404({ detail: { code: "slug_moved", slug: "new-bakery" } });
    const res = await middleware(requestFor(`/old-bakery/recipes/${RECIPE}`, "?ref=wa"));
    expect(res.__redirect).toBe(true);
    expect(res.status).toBe(301);
    expect(res.url.pathname).toBe(`/new-bakery/recipes/${RECIPE}`);
    expect(res.url.search).toBe("?ref=wa");
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("keeps an explicit /en prefix", async () => {
    backend404({ detail: { code: "slug_moved", slug: "new-bakery" } });
    const res = await middleware(requestFor(`/en/old-bakery/recipes/${RECIPE}`));
    expect(res.status).toBe(301);
    expect(res.url.pathname).toBe(`/en/new-bakery/recipes/${RECIPE}`);
  });

  it("a plain 404 is still the hard 404 (control)", async () => {
    backend404({ detail: "המתכון לא נמצא" });
    const res = await middleware(requestFor(`/old-bakery/recipes/${RECIPE}`));
    expect(redirect).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it("never follows a slug that is not plain Latin (control)", async () => {
    backend404({ detail: { code: "slug_moved", slug: "//evil.example/x" } });
    const res = await middleware(requestFor(`/old-bakery/recipes/${RECIPE}`));
    expect(redirect).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });
});
