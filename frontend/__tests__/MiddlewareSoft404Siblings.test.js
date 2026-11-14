/**
 * MEH-2977 siblings — three more routes streamed HTTP 200 for a missing page
 * (measured on production 14/11 with curl):
 *   /organizers/<missing>, /<slug>/recipes/<missing>, /producers/<cat>/<region>.
 * The middleware now mints the real 404 with the same fail-open contract as
 * MiddlewareEventDiet404.test.js: only an ANSWERED absence becomes a 404.
 *
 * DISCRIMINATION: against the old middleware every "→ 404" case is a
 * pass-through, so each fails on it; the "control" cases stop "always 404".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { REGION_KEYS, regionCities } from "@/lib/region-pages";
import { _resetCategoriesMemo } from "@/lib/middleware-exists";

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
const reply = ({ status = 200, total = null, json = null } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => (k.toLowerCase() === "x-total-count" && total !== null ? String(total) : null) },
  json: async () => json,
});
// route(url) → reply spec; the first matching [pattern, spec] wins.
const backend = (routes) => {
  global.fetch = vi.fn(async (url) => {
    for (const [re, spec] of routes) {
      if (re.test(url)) {
        if (spec === "throw") throw new Error("network");
        return reply(spec);
      }
    }
    return reply({ status: 200 });
  });
};
const wasNotFound = (res) => Boolean(res?.__rewrite) && res.status === 404;

beforeEach(() => {
  rewrite.mockClear();
  _resetCategoriesMemo();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const REGION = REGION_KEYS[0];
const CATS = { json: [{ id: 7, slug: "bakery" }] };

describe("/organizers/<slug>", () => {
  it("backend 404 → real 404", async () => {
    backend([[/\/organizers\//, { status: 404 }]]);
    expect(wasNotFound(await middleware(requestFor("/he/organizers/no-such-org")))).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/organizers\/no-such-org$/);
  });
  it("control: an existing organizer passes through", async () => {
    backend([[/\/organizers\//, { status: 200 }]]);
    expect(wasNotFound(await middleware(requestFor("/he/organizers/real-org")))).toBe(false);
  });
  it("a percent-encoded Hebrew slug is decoded once, not double-encoded", async () => {
    backend([[/\/organizers\//, { status: 200 }]]);
    const slug = "מאפיית-הכפר";
    expect(wasNotFound(await middleware(requestFor(`/he/organizers/${encodeURIComponent(slug)}`)))).toBe(false);
    expect(global.fetch.mock.calls[0][0]).toContain(`/organizers/${encodeURIComponent(slug)}`);
    expect(global.fetch.mock.calls[0][0]).not.toMatch(/%25/);
  });
  it("control: backend 500 fails open", async () => {
    backend([[/\/organizers\//, { status: 500 }]]);
    expect(wasNotFound(await middleware(requestFor("/organizers/real-org")))).toBe(false);
  });
});

describe("/<slug>/recipes/<id>", () => {
  const PATH = "/he/some-bakery/recipes/00000000-0000-0000-0000-000000000000";
  it.each([404, 410, 422])("recipe endpoint %i → real 404", async (status) => {
    backend([[/\/recipes\//, { status }]]);
    expect(wasNotFound(await middleware(requestFor(PATH)))).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/producers\/some-bakery\/recipes\/0{8}-/);
  });
  it("control: an existing recipe passes through", async () => {
    backend([[/\/recipes\//, { status: 200 }]]);
    expect(wasNotFound(await middleware(requestFor(PATH)))).toBe(false);
  });
  it("control: a network error fails open", async () => {
    backend([[/\/recipes\//, "throw"]]);
    expect(wasNotFound(await middleware(requestFor(PATH)))).toBe(false);
  });
  it("control: a static route's recipes child (/admin/recipes/x) is not checked", async () => {
    backend([[/./, { status: 404 }]]);
    expect(wasNotFound(await middleware(requestFor("/he/admin/recipes/x")))).toBe(false);
  });
});

describe("/producers/<category>/<region>", () => {
  it("unknown region → real 404 without a fetch", async () => {
    backend([]);
    expect(wasNotFound(await middleware(requestFor("/he/producers/bakery/no-such-region")))).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("unknown category slug → real 404", async () => {
    backend([[/\/categories$/, CATS]]);
    expect(wasNotFound(await middleware(requestFor(`/he/producers/no-such-cat/${REGION}`)))).toBe(true);
  });
  it("fewer than 5 businesses in the cell → real 404", async () => {
    backend([[/\/categories$/, CATS], [/\/producers\?category=7&cities=/, { total: 4 }]]);
    expect(wasNotFound(await middleware(requestFor(`/he/producers/bakery/${REGION}`)))).toBe(true);
  });
  it("control: 5 or more passes through", async () => {
    backend([[/\/categories$/, CATS], [/\/producers\?category=7/, { total: 5 }]]);
    expect(wasNotFound(await middleware(requestFor(`/he/producers/bakery/${REGION}`)))).toBe(false);
  });
  it("control: missing X-Total-Count is unknown, not zero — fails open", async () => {
    backend([[/\/categories$/, CATS], [/\/producers\?category=7/, { total: null }]]);
    expect(wasNotFound(await middleware(requestFor(`/he/producers/bakery/${REGION}`)))).toBe(false);
  });
  it("control: categories 500 fails open", async () => {
    backend([[/\/categories$/, { status: 500 }]]);
    expect(wasNotFound(await middleware(requestFor(`/he/producers/no-such-cat/${REGION}`)))).toBe(false);
  });
  it("queries the region's full city list, like the page's citiesQuery", async () => {
    backend([[/\/categories$/, CATS], [/\/producers\?category=7/, { total: 9 }]]);
    await middleware(requestFor(`/he/producers/bakery/${REGION}`));
    const expected = regionCities(REGION).map((c) => `cities=${encodeURIComponent(c)}`).join("&");
    expect(expected.length).toBeGreaterThan(0);
    expect(global.fetch.mock.calls[1][0]).toContain(`category=7&${expected}&limit=1`);
  });
  it("control: count call 500 fails open", async () => {
    backend([[/\/categories$/, CATS], [/\/producers\?category=7/, { status: 500 }]]);
    expect(wasNotFound(await middleware(requestFor(`/he/producers/bakery/${REGION}`)))).toBe(false);
  });
  it("control: a blank X-Total-Count is unknown, not zero", async () => {
    backend([[/\/categories$/, CATS], [/\/producers\?category=7/, { total: "" }]]);
    expect(wasNotFound(await middleware(requestFor(`/he/producers/bakery/${REGION}`)))).toBe(false);
  });
  it("the category list is fetched once per TTL, not per request (60/min limit)", async () => {
    backend([[/\/categories$/, CATS], [/\/producers\?category=7/, { total: 9 }]]);
    await middleware(requestFor(`/he/producers/bakery/${REGION}`));
    await middleware(requestFor(`/he/producers/bakery/${REGION}`));
    const catCalls = global.fetch.mock.calls.filter(([u]) => /\/categories$/.test(u));
    expect(catCalls).toHaveLength(1);
  });
  it.each([
    [`/he/producers/no-such-cat/${REGION}`],
    ["/he/some-bakery/recipes/00000000-0000-0000-0000-000000000000"],
  ])("a prefetch of %s is not checked", async (path) => {
    backend([[/./, { status: 404 }]]);
    const req = requestFor(path);
    req.headers = new Map([["next-router-prefetch", "1"]]);
    expect(wasNotFound(await middleware(req))).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("control: /producers/diet/<slug> still takes the diet branch", async () => {
    backend([[/gluten_free=true/, { total: 9 }]]);
    expect(wasNotFound(await middleware(requestFor("/he/producers/diet/gluten-free")))).toBe(false);
    expect(global.fetch.mock.calls[0][0]).toMatch(/gluten_free=true/);
  });
});
