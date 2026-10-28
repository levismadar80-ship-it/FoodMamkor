// MEH-803: guard that the dynamic sitemap never lists routes whose page
// sets robots:{index:false} — emitting a noindex URL here triggers Google
// Search Console "Submitted URL marked 'noindex'". The four offenders
// (/register, /login, /contact, /search — MEH-641 auth chrome / MEH-658
// utility) must stay OUT of the sitemap; their noindex directives stay in.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));

import sitemap from "@/app/sitemap";

const BASE = "https://mehamakor.co.il";
const NOINDEX_PATHS = ["/register", "/login", "/contact"];

describe("sitemap noindex exclusion (MEH-803)", () => {
  beforeEach(() => {
    // No dynamic producers/events — isolates the static route set.
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  });

  it("excludes every noindex route, for both locales", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    for (const p of NOINDEX_PATHS) {
      expect(urls).not.toContain(`${BASE}${p}`); // he (no prefix)
      expect(urls).not.toContain(`${BASE}/en${p}`); // en
    }
  });

  it("still lists the indexable static routes", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    // /register/producer is distinct from /register and stays indexable.
    expect(urls).toContain(`${BASE}/register/producer`);
    expect(urls).toContain(`${BASE}/map`);
    expect(urls).toContain(`${BASE}/terms`);
    expect(urls).toContain(BASE); // home ("")
  });
});

describe("MEH-2461 — organizer pages in the sitemap", () => {
  it("lists /organizers/{slug} for both locales from GET /organizers, never under /producers", async () => {
    global.fetch = vi.fn((url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          String(url).endsWith("/organizers") ? [{ slug: "gelem", name: "שוק גלם" }] : [],
      }),
    );
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${BASE}/organizers/gelem`);
    expect(urls).toContain(`${BASE}/en/organizers/gelem`);
    expect(urls.filter((u) => u.includes("gelem"))).toHaveLength(2);
  });

  it("control: GET /organizers down → no organizer URLs, sitemap still builds", async () => {
    global.fetch = vi.fn((url) =>
      String(url).endsWith("/organizers")
        ? Promise.reject(new Error("down"))
        : Promise.resolve({ ok: true, status: 200, json: async () => [] }),
    );
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.includes("/organizers/"))).toBe(false);
    expect(urls).toContain(BASE);
  });
});
