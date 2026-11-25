// @ts-check
/**
 * MEH-3708 — /producer/{id} of a business that has a slug answers a real 308
 * to the business's own address (/{slug}, /en/{slug}), keeping the query.
 * Before: the id URL rendered the full page with a canonical to the slug, so
 * two public URLs served one business.
 *
 * Two layers, both covered:
 *   1. middleware.js (the real 308 — a redirect() inside the page streams and
 *      lands as a 200 with a meta refresh, Next docs redirect.md).
 *   2. the page itself, for the requests the middleware skips (a router
 *      prefetch, a fail-open lookup): permanentRedirect to the same target.
 *
 * DISCRIMINATION: against the old middleware every "→ 308" case was a
 * pass-through, and against the old page every "redirects" case rendered.
 * The pass-through / render cases stop "always redirect" from passing.
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

// The page's own collaborators.
const permanentRedirect = vi.fn((to) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { to });
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  permanentRedirect: (to) => permanentRedirect(to),
  notFound: () => notFound(),
}));
const fetchSsrEntity = vi.fn();
vi.mock("@/lib/ssr-entity-fetch", () => ({ fetchSsrEntity: (a) => fetchSsrEntity(a) }));
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({ default: () => null }));

import middleware from "@/middleware";
import ProducerPage from "@/app/[locale]/producer/[id]/page";
import ProducerDetail from "@/app/[locale]/producer/[id]/ProducerDetail";

const ID = "11111111-2222-4333-8444-555555555555";

const requestFor = (pathname, search = "") => {
  const nextUrl = {
    pathname,
    search,
    searchParams: new URLSearchParams(search),
    clone() {
      return { ...nextUrl, clone: nextUrl.clone };
    },
  };
  return { nextUrl, url: `https://staging.mehamakor.online${pathname}${search}`, headers: new Map() };
};
/** @param {{ status?: number, body?: unknown, throws?: boolean }} [o] */
const backend = ({ status = 200, body = {}, throws = false } = {}) => {
  global.fetch = vi.fn(async () => {
    if (throws) throw new Error("network");
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body,
    };
  });
};
const wasNotFound = (res) => Boolean(res?.__rewrite) && res.status === 404;

beforeEach(() => {
  rewrite.mockClear();
  redirect.mockClear();
  permanentRedirect.mockClear();
  notFound.mockClear();
  fetchSsrEntity.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("middleware: /producer/{id} → 308 /{slug} (MEH-3708)", () => {
  it("he (no prefix): 308 to /{slug}", async () => {
    backend({ body: { id: ID, slug: "dvash-hagalil" } });
    const res = await middleware(requestFor(`/producer/${ID}`));
    expect(res.__redirect).toBe(true);
    expect(res.status).toBe(308);
    expect(res.url.pathname).toBe("/dvash-hagalil");
  });

  it("/en prefix: 308 to /en/{slug}", async () => {
    backend({ body: { id: ID, slug: "dvash-hagalil" } });
    const res = await middleware(requestFor(`/en/producer/${ID}`));
    expect(res.status).toBe(308);
    expect(res.url.pathname).toBe("/en/dvash-hagalil");
  });

  it("keeps the query string (?product=, ?rt=)", async () => {
    backend({ body: { id: ID, slug: "dvash-hagalil" } });
    const res = await middleware(requestFor(`/producer/${ID}`, "?product=7&rt=abc"));
    expect(res.status).toBe(308);
    expect(res.url.search).toBe("?product=7&rt=abc");
  });

  it("a Hebrew slug is percent-encoded in the Location", async () => {
    backend({ body: { id: ID, slug: "דבש-הגליל" } });
    const res = await middleware(requestFor(`/producer/${ID}`));
    expect(res.status).toBe(308);
    expect(res.url.pathname).toBe(`/${encodeURIComponent("דבש-הגליל")}`);
  });

  it("bounds the cache (a slug can change)", async () => {
    backend({ body: { id: ID, slug: "dvash-hagalil" } });
    const res = await middleware(requestFor(`/producer/${ID}`));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("no slug → passes through (the id page renders)", async () => {
    backend({ body: { id: ID, slug: null } });
    const res = await middleware(requestFor(`/producer/${ID}`));
    expect(redirect).not.toHaveBeenCalled();
    expect(wasNotFound(res)).toBe(false);
  });

  it("a slug that is not slug-shaped (a reserved route, a path) → no redirect", async () => {
    for (const slug of ["map", "a/b", "..", "x.php"]) {
      backend({ body: { id: ID, slug } });
      const res = await middleware(requestFor(`/producer/${ID}`));
      expect(redirect, `slug ${slug}`).not.toHaveBeenCalled();
      expect(wasNotFound(res)).toBe(false);
    }
  });

  it("?preview=1 keeps the id page (no redirect)", async () => {
    backend({ body: { id: ID, slug: "dvash-hagalil" } });
    const res = await middleware(requestFor(`/producer/${ID}`, "?preview=1"));
    expect(redirect).not.toHaveBeenCalled();
    expect(wasNotFound(res)).toBe(false);
  });

  it("missing business stays a real 404 (MEH-3024)", async () => {
    backend({ status: 404 });
    expect(wasNotFound(await middleware(requestFor(`/producer/${ID}`)))).toBe(true);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("backend down → fails open, no redirect", async () => {
    backend({ throws: true });
    const res = await middleware(requestFor(`/producer/${ID}`));
    expect(redirect).not.toHaveBeenCalled();
    expect(wasNotFound(res)).toBe(false);
  });

  it("/producer/dashboard is untouched", async () => {
    backend({ body: { slug: "dashboard-x" } });
    const res = await middleware(requestFor("/producer/dashboard"));
    expect(redirect).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(wasNotFound(res)).toBe(false);
  });
});

const pageProps = (locale, searchParams = {}) => ({
  params: Promise.resolve({ id: ID, locale }),
  searchParams: Promise.resolve(searchParams),
});

describe("page: fallback when the middleware did not redirect (MEH-3708)", () => {
  it("he: permanentRedirect to /{slug} with the query", async () => {
    fetchSsrEntity.mockResolvedValue({ id: ID, slug: "dvash-hagalil", name: "דבש" });
    await expect(ProducerPage(pageProps("he", { product: "7", from: "map" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(permanentRedirect).toHaveBeenCalledWith("/dvash-hagalil?product=7&from=map");
  });

  it("en: permanentRedirect to /en/{slug}, Hebrew slug encoded", async () => {
    fetchSsrEntity.mockResolvedValue({ id: ID, slug: "דבש-הגליל", name: "דבש" });
    await expect(ProducerPage(pageProps("en"))).rejects.toThrow("NEXT_REDIRECT");
    expect(permanentRedirect).toHaveBeenCalledWith(`/en/${encodeURIComponent("דבש-הגליל")}`);
  });

  it("no slug → renders at /producer/{id}", async () => {
    fetchSsrEntity.mockResolvedValue({ id: ID, slug: null, name: "דבש" });
    const out = await ProducerPage(pageProps("he"));
    expect(out).toBeTruthy();
    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  // MEH-3819: keyed per business, so a client move between two id pages
  // remounts ProducerDetail and its lists start empty, not with the last one's.
  it("no slug → the business page is keyed by the id it renders", async () => {
    fetchSsrEntity.mockResolvedValue({ id: ID, slug: null, name: "דבש" });
    const out = await ProducerPage(pageProps("he"));
    const kids = [out.props.children].flat(Infinity).filter(Boolean);
    const detail = kids.find((k) => k?.type === ProducerDetail);
    expect(detail).toBeTruthy();
    expect(detail.key).toBe(ID);
  });

  it("a slug that names a site route (map) renders here, no redirect", async () => {
    fetchSsrEntity.mockResolvedValue({ id: ID, slug: "map", name: "דבש" });
    expect(await ProducerPage(pageProps("he"))).toBeTruthy();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("?preview=1 renders at /producer/{id}", async () => {
    fetchSsrEntity.mockResolvedValue({ id: ID, slug: "dvash-hagalil", name: "דבש" });
    expect(await ProducerPage(pageProps("he", { preview: "1" }))).toBeTruthy();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("missing business → notFound", async () => {
    fetchSsrEntity.mockResolvedValue(null);
    await expect(ProducerPage(pageProps("he"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});
