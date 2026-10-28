/**
 * MEH-2478 — /experiences/[id] and /group-buys/[id] reach the sitemap, the
 * same way /events/[id] and /organizers/[slug] do: one entry per locale, each
 * carrying the full hreflang alternates map.
 *
 * What is listed is decided by the endpoint the hub itself lists from:
 *   - GET /experiences already returns only approved, upcoming, not-cancelled
 *     experiences from an approved business (experiences.py
 *     _public_listing_query), so every id it returns is listed.
 *   - GET /group-buys returns status=open, but nothing closes an open group
 *     buy past its deadline (group_buys.py OWNER_TRANSITIONS note), so an
 *     expired one is filtered out here. A non-open status is filtered too,
 *     so the rule does not lean on the endpoint's default.
 *
 * Discrimination: on the old sitemap.js neither detail route is emitted at
 * all, so every "is listed" assertion below goes red. The "expired" and
 * "funded" cases keep a list-everything implementation from passing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));

import sitemap from "@/app/sitemap";

const BASE = "https://mehamakor.co.il";
const FUTURE = "2099-12-01T10:00:00";
const PAST = "2020-01-01T10:00:00";

function stubFetch({ experiences = [], groupBuys = [], down = false } = {}) {
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (down && (u.endsWith("/experiences") || u.endsWith("/group-buys"))) {
      throw new Error("down");
    }
    if (u.endsWith("/experiences")) return { ok: true, status: 200, json: async () => experiences };
    if (u.endsWith("/group-buys")) return { ok: true, status: 200, json: async () => groupBuys };
    if (u.endsWith("/experiences/count")) {
      return { ok: true, status: 200, json: async () => ({ count: experiences.length }) };
    }
    return { ok: true, status: 200, headers: { get: () => "0" }, json: async () => [] };
  });
}

const entries = async () => sitemap();
const urlsOf = (list) => list.map((e) => e.url);

describe("sitemap — experience detail pages (MEH-2478)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("1 experience → listed in both locales with hreflang alternates", async () => {
    stubFetch({ experiences: [{ id: "ex-1", title: "קטיף בכרם", event_date: "2099-11-01" }] });
    const list = await entries();
    const urls = urlsOf(list);
    expect(urls).toContain(`${BASE}/experiences/ex-1`);
    expect(urls).toContain(`${BASE}/en/experiences/ex-1`);
    const he = list.find((e) => e.url === `${BASE}/experiences/ex-1`);
    expect(he.alternates.languages).toEqual({
      "he-IL": `${BASE}/experiences/ex-1`,
      en: `${BASE}/en/experiences/ex-1`,
    });
  });

  it("many experiences → one pair of entries each", async () => {
    stubFetch({
      experiences: [
        { id: "ex-1", event_date: "2099-11-01" },
        { id: "ex-2", event_date: "2099-11-02" },
        { id: "ex-3", event_date: "2099-11-03" },
      ],
    });
    const urls = urlsOf(await entries());
    expect(urls.filter((u) => /\/experiences\/ex-\d$/.test(u))).toHaveLength(6);
  });

  it("0 experiences → no experience detail URL", async () => {
    stubFetch();
    const urls = urlsOf(await entries());
    expect(urls.some((u) => u.includes("/experiences/"))).toBe(false);
    expect(urls).toContain(`${BASE}/map`);
  });
});

describe("sitemap — group-buy detail pages (MEH-2478)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("open group buy before its deadline → listed in both locales with alternates", async () => {
    stubFetch({ groupBuys: [{ id: "gb-1", status: "open", deadline: FUTURE }] });
    const list = await entries();
    const urls = urlsOf(list);
    expect(urls).toContain(`${BASE}/group-buys/gb-1`);
    expect(urls).toContain(`${BASE}/en/group-buys/gb-1`);
    const en = list.find((e) => e.url === `${BASE}/en/group-buys/gb-1`);
    expect(en.alternates.languages["he-IL"]).toBe(`${BASE}/group-buys/gb-1`);
  });

  it("an open group buy past its deadline is NOT listed (expired), the live one is", async () => {
    stubFetch({
      groupBuys: [
        { id: "gb-live", status: "open", deadline: FUTURE },
        { id: "gb-expired", status: "open", deadline: PAST },
      ],
    });
    const urls = urlsOf(await entries());
    expect(urls).toContain(`${BASE}/group-buys/gb-live`);
    expect(urls.some((u) => u.includes("gb-expired"))).toBe(false);
  });

  it("a non-open group buy (funded / cancelled) is NOT listed", async () => {
    stubFetch({
      groupBuys: [
        { id: "gb-live", status: "open", deadline: FUTURE },
        { id: "gb-funded", status: "funded", deadline: FUTURE },
        { id: "gb-cancelled", status: "cancelled", deadline: FUTURE },
      ],
    });
    const urls = urlsOf(await entries());
    expect(urls).toContain(`${BASE}/group-buys/gb-live`);
    expect(urls.some((u) => u.includes("gb-funded") || u.includes("gb-cancelled"))).toBe(false);
  });

  it("control: both endpoints down → no detail URLs, the sitemap still builds", async () => {
    stubFetch({ down: true });
    const urls = urlsOf(await entries());
    expect(urls.some((u) => u.includes("/group-buys/") || u.includes("/experiences/"))).toBe(false);
    expect(urls).toContain(BASE);
  });
});
