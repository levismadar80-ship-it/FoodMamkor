/**
 * MEH-2790 — category x region landing pages (/producers/[category]/[region]).
 *
 * The things that can fail SILENTLY here, which is why each gets an assertion:
 *
 *   1. THE DATA GATE. A cell with fewer than REGION_PAGE_MIN businesses must
 *      be a REAL 404, not a thin page. The gate is checked at runtime, so the
 *      whole feature's safety rests on it.
 *
 *   2. MEH-1754 FAILURE SEMANTICS. Only a genuine below-threshold answer may
 *      become notFound(). A 5xx, a timeout, or an ABSENT X-Total-Count must
 *      THROW — a 404 tells Google the page is gone and de-indexing starts. A
 *      `catch` returning an empty list would turn a backend wobble into every
 *      cell de-indexing at once, and would look exactly like a passing test.
 *
 *   3. CHIPS MUST NOT POINT AT 404s (MEH-1204 §B). A chip to a sub-threshold
 *      cell is a link to a 404. Sibling counting fails OPEN, so a sibling
 *      wobble drops the chip rather than 500-ing this page.
 *
 *   4. THE RESERVED `diet` PATH. /producers/diet/<slug> is the MEH-1935 route;
 *      a category slug "diet" would shadow it.
 *
 * Failing-by-construction runs are in the PR body (MEH-1619).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));

const serverFetch = vi.fn();
vi.mock("@/lib/server-fetch", () => ({
  serverFetch: (...args) => serverFetch(...args),
}));

class NotFoundError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/i18n/navigation", () => ({ Link: ({ children }) => children }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => {
    const t = (key, params) =>
      params ? `${key}:${Object.values(params).join("|")}` : `t:${key}`;
    t.raw = (key) => `raw:${key}`;
    return t;
  },
}));

import RegionLandingPage, {
  generateMetadata,
} from "@/app/[locale]/producers/[category]/[region]/page";
import { REGION_PAGE_MIN, RESERVED_CATEGORY_SLUGS } from "@/lib/region-pages";

const BREAD = { id: 7, slug: "bread", name: "לחמים ואפייה" };
const DAIRY = { id: 9, slug: "dairy", name: "חלב וגבינות" };
const PARAMS = { category: "bread", region: "haifa", locale: "he" };

function listing(total, items = []) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: {
      get: (h) => (h.toLowerCase() === "x-total-count" ? String(total) : null),
    },
    json: async () => items,
  };
}

function categories(rows = [BREAD, DAIRY]) {
  return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, json: async () => rows };
}

function serverError(status = 503) {
  return {
    ok: false,
    status,
    statusText: "Service Unavailable",
    headers: { get: () => null },
    json: async () => ({}),
  };
}

/** A listing response with NO X-Total-Count — "unknown", not "zero". */
function headerless(items = []) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    json: async () => items,
  };
}

/** Route every call: categories → `cats`, cell listings → `cellTotal(url)`. */
function route({ cats = categories(), cellTotal = () => 5, items = [] }) {
  serverFetch.mockImplementation((url) => {
    const href = String(url);
    if (href.includes("/categories")) return Promise.resolve(cats);
    const total = cellTotal(href);
    if (total && typeof total === "object") return Promise.resolve(total); // a raw response
    return Promise.resolve(listing(total, items));
  });
}

const rows = (n) => Array.from({ length: n }, (_x, i) => ({ id: `p-${i}`, name: `עסק ${i}`, slug: `biz-${i}` }));

beforeEach(() => {
  serverFetch.mockReset();
});

describe("the data gate", () => {
  it(`renders at exactly REGION_PAGE_MIN (${REGION_PAGE_MIN})`, async () => {
    route({ cellTotal: () => REGION_PAGE_MIN, items: rows(REGION_PAGE_MIN) });
    const ui = await RegionLandingPage({ params: Promise.resolve(PARAMS) });
    expect(ui).toBeTruthy();
  });

  it("404s one below the threshold", async () => {
    route({ cellTotal: () => REGION_PAGE_MIN - 1, items: rows(REGION_PAGE_MIN - 1) });
    await expect(
      RegionLandingPage({ params: Promise.resolve(PARAMS) }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s an unknown region key", async () => {
    route({ cellTotal: () => 50 });
    await expect(
      RegionLandingPage({ params: Promise.resolve({ ...PARAMS, region: "atlantis" }) }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s an unknown category slug", async () => {
    route({ cellTotal: () => 50 });
    await expect(
      RegionLandingPage({ params: Promise.resolve({ ...PARAMS, category: "no-such" }) }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s pre-streaming, in generateMetadata", async () => {
    // MEH-1045: a page-level notFound() alone streams 200 + 404 UI, so the
    // status only becomes a real 404 if generateMetadata bails first.
    route({ cellTotal: () => REGION_PAGE_MIN - 1 });
    await expect(
      generateMetadata({ params: Promise.resolve(PARAMS) }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("MEH-1754 failure semantics — a wobble is never a 404", () => {
  it("THROWS on a 5xx rather than 404-ing", async () => {
    route({ cellTotal: () => serverError(503) });
    const err = await RegionLandingPage({ params: Promise.resolve(PARAMS) }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect(err.status).toBe(503);
  });

  it("THROWS when X-Total-Count is absent — unknown is not zero", async () => {
    route({ cellTotal: () => headerless([]) });
    const err = await RegionLandingPage({ params: Promise.resolve(PARAMS) }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect(err.status).toBe(502);
  });

  it("THROWS when the category lookup fails", async () => {
    route({ cats: serverError(500), cellTotal: () => 50 });
    const err = await RegionLandingPage({ params: Promise.resolve(PARAMS) }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NotFoundError);
  });
});

describe("chips never point at a 404", () => {
  it("omits a sibling whose own cell is under the threshold", async () => {
    // haifa passes; every other region returns 1. The dairy sibling passes.
    route({
      cellTotal: (href) => {
        if (href.includes("category=9")) return 50;
        return href.includes(encodeURIComponent("חיפה")) ? 50 : 1;
      },
      items: rows(5),
    });
    const ui = await RegionLandingPage({ params: Promise.resolve(PARAMS) });
    const json = JSON.stringify(ui);
    // the same-category row (other regions) is gone; the same-region row stays
    expect(json).not.toContain("region-chips-same-category");
    expect(json).toContain("region-chips-same-region");
  });

  it("fails OPEN on a sibling error — chip dropped, page still renders", async () => {
    let first = true;
    route({
      cellTotal: () => {
        if (first) {
          first = false;
          return 50; // the page's own cell
        }
        return serverError(500); // every sibling
      },
      items: rows(5),
    });
    const ui = await RegionLandingPage({ params: Promise.resolve(PARAMS) });
    expect(ui).toBeTruthy();
    const json = JSON.stringify(ui);
    expect(json).not.toContain("region-chips-same-category");
    expect(json).not.toContain("region-chips-same-region");
  });
});

describe("the request shape", () => {
  it("sends one repeated cities= per town in the region, plus the category", async () => {
    route({ cellTotal: () => 50, items: rows(5) });
    await RegionLandingPage({ params: Promise.resolve(PARAMS) });
    const cellCall = serverFetch.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/producers?") && u.includes("limit=24"));
    expect(cellCall).toContain("category=7");
    expect(cellCall).toContain(`cities=${encodeURIComponent("חיפה")}`);
    // a region is many towns — a single `city=` would be the wrong param
    expect(cellCall.match(/cities=/g).length).toBeGreaterThan(1);
    expect(cellCall).not.toMatch(/[?&]city=/);
  });
});

describe("the reserved diet path", () => {
  it("declares `diet` reserved so a category can never shadow the diet route", () => {
    expect(RESERVED_CATEGORY_SLUGS).toContain("diet");
  });

  it("404s a category slug that collides with the reserved path", async () => {
    route({ cats: categories([{ id: 1, slug: "diet", name: "x" }]), cellTotal: () => 50 });
    await expect(
      RegionLandingPage({ params: Promise.resolve({ ...PARAMS, category: "vegan" }) }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
