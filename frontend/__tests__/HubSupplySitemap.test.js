/**
 * MEH-2369 — /events, /experiences and /group-buys reach the sitemap only with
 * supply, and their metadata is noindex only when KNOWN to be empty.
 *
 * Discrimination: on the old sitemap.js (the three paths hard-coded in
 * staticDefs) the "0 items" cases go red, because all three URLs are listed
 * regardless of the API. The "1" and "many" cases are the controls that keep
 * this from passing by deleting the paths outright.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));

import sitemap from "@/app/sitemap";
import {
  countFromBody,
  hubBelongsInSitemap,
  hubRobots,
} from "@/lib/listing-supply";

const BASE = "https://mehamakor.co.il";
const HUB_PATHS = ["/events", "/experiences", "/group-buys"];

/** fetch stub: per-hub answers, everything else an empty list. */
function stubFetch({ events = [], experiences = 0, groupBuys = [], fail = false } = {}) {
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (fail && (u.endsWith("/events") || u.endsWith("/experiences/count") || u.endsWith("/group-buys"))) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    if (u.endsWith("/experiences/count")) return { ok: true, json: async () => ({ count: experiences }) };
    if (u.endsWith("/group-buys")) return { ok: true, json: async () => groupBuys };
    if (u.endsWith("/events")) return { ok: true, json: async () => events };
    return { ok: true, headers: { get: () => "0" }, json: async () => [] };
  });
}

const urls = async () => (await sitemap()).map((e) => e.url);

describe("sitemap — hubs follow supply (MEH-2369)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("0 items → none of the three hubs is listed, in either locale", async () => {
    stubFetch();
    const list = await urls();
    for (const p of HUB_PATHS) {
      expect(list).not.toContain(`${BASE}${p}`);
      expect(list).not.toContain(`${BASE}/en${p}`);
    }
    // Control: the sitemap itself still rendered.
    expect(list).toContain(`${BASE}/map`);
  });

  it("1 item each → all three hubs are listed, in both locales", async () => {
    stubFetch({ events: [{ id: "e1" }], experiences: 1, groupBuys: [{ id: "g1" }] });
    const list = await urls();
    for (const p of HUB_PATHS) {
      expect(list).toContain(`${BASE}${p}`);
      expect(list).toContain(`${BASE}/en${p}`);
    }
  });

  it("many items in one hub only → only that hub is listed", async () => {
    stubFetch({ groupBuys: [{ id: "g1" }, { id: "g2" }, { id: "g3" }] });
    const list = await urls();
    expect(list).toContain(`${BASE}/group-buys`);
    expect(list).not.toContain(`${BASE}/events`);
    expect(list).not.toContain(`${BASE}/experiences`);
  });

  it("API failure → hubs omitted (fail-closed), the rest of the sitemap intact", async () => {
    stubFetch({ fail: true });
    const list = await urls();
    for (const p of HUB_PATHS) expect(list).not.toContain(`${BASE}${p}`);
    expect(list).toContain(`${BASE}/terms`);
  });
});

describe("listing-supply rules", () => {
  it("countFromBody reads arrays by length and experiences by {count}", () => {
    expect(countFromBody("events", [])).toBe(0);
    expect(countFromBody("groupBuys", [{}, {}])).toBe(2);
    expect(countFromBody("experiences", { count: 4 })).toBe(4);
  });

  it("countFromBody returns null (unknown) for a malformed body", () => {
    expect(countFromBody("events", { items: [] })).toBeNull();
    expect(countFromBody("experiences", { count: "many" })).toBeNull();
    expect(countFromBody("experiences", { count: -1 })).toBeNull();
  });

  it("sitemap rule: only a known count ≥ 1 belongs", () => {
    expect(hubBelongsInSitemap(0)).toBe(false);
    expect(hubBelongsInSitemap(null)).toBe(false);
    expect(hubBelongsInSitemap(1)).toBe(true);
    expect(hubBelongsInSitemap(30)).toBe(true);
  });

  it("metadata rule: noindex only a KNOWN-empty hub; unknown stays indexable", () => {
    expect(hubRobots(0)).toEqual({ index: false, follow: true });
    expect(hubRobots(null)).toBeUndefined();
    expect(hubRobots(1)).toBeUndefined();
    expect(hubRobots(12)).toBeUndefined();
  });
});
