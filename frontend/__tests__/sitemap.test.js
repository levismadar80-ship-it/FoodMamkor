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

// ---------------------------------------------------------------------------
// MEH-2787 — the producer walk: every approved business, not the first 100.
//
// DISCRIMINATION. Each case fails against the single-fetch version:
//   - one `GET /producers` with no limit/offset → "walks past 100" reds, because
//     only the first page's 100 businesses reach the sitemap;
//   - totalPages computed from 100 instead of 150 → "paginated index" reds;
//   - an unbounded Promise.all over the recipes fan-out → "never exceeds 10"
//     reds at a measured peak of 150;
//   - returning [] instead of null when page 1 fails → "API down" reds, since
//     a sitemap that lists zero businesses is not the same as one that omits
//     the section.
// ---------------------------------------------------------------------------
describe("MEH-2787 — the sitemap lists every approved business", () => {
  const PAGE = 100;

  /** `total` businesses served as pages of 100, like the real endpoint. */
  function mockCatalog(total, { recipesPerProducer = 0, onRecipeCall } = {}) {
    const all = Array.from({ length: total }, (_, i) => ({
      id: `id-${i}`,
      slug: `biz-${i}`,
    }));
    return vi.fn((url) => {
      const href = String(url);
      if (href.includes("/recipes")) {
        onRecipeCall?.();
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                json: async () =>
                  Array.from({ length: recipesPerProducer }, (_r, i) => ({ id: `r-${i}` })),
              }),
            0,
          ),
        );
      }
      if (href.includes("/producers?")) {
        const offset = Number(new URL(href).searchParams.get("offset") || 0);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => all.slice(offset, offset + PAGE),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
  }

  it("walks past 100: 150 businesses → 150 URLs per locale", async () => {
    global.fetch = mockCatalog(150);
    const urls = (await sitemap()).map((e) => e.url);

    const he = urls.filter((u) => /^https:\/\/mehamakor\.co\.il\/biz-\d+$/.test(u));
    const en = urls.filter((u) => /^https:\/\/mehamakor\.co\.il\/en\/biz-\d+$/.test(u));
    expect(he).toHaveLength(150);
    expect(en).toHaveLength(150);
    // the 101st and the last are the ones a single fetch would have lost
    expect(urls).toContain(`${BASE}/biz-100`);
    expect(urls).toContain(`${BASE}/biz-149`);
    expect(urls).toContain(`${BASE}/en/biz-149`);
  });

  it("asks for pages with limit+offset, and stops on a short page", async () => {
    global.fetch = mockCatalog(150);
    await sitemap();
    // Only the catalog walk — the diet-landing block also calls /producers?,
    // with limit=1 per slug, and those are not part of this walk.
    const listCalls = global.fetch.mock.calls
      .map((call) => String(call[0]))
      .filter((u) => u.includes("/producers?limit=100"));
    expect(listCalls).toEqual([
      "https://api.example.test/producers?limit=100&offset=0",
      "https://api.example.test/producers?limit=100&offset=100",
    ]);
  });

  it("derives the paginated index from the FULL count (150 / 24 = 7 pages)", async () => {
    global.fetch = mockCatalog(150);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${BASE}/producers?page=7`);
    expect(urls).not.toContain(`${BASE}/producers?page=8`);
    // from the first 100 alone this would have stopped at 5
    expect(urls).toContain(`${BASE}/producers?page=6`);
  });

  it("the recipes fan-out never exceeds 10 requests in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const settle = [];
    global.fetch = vi.fn((url) => {
      const href = String(url);
      if (href.includes("/recipes")) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        return new Promise((resolve) => {
          settle.push(() => {
            inFlight -= 1;
            resolve({ ok: true, status: 200, json: async () => [] });
          });
          setTimeout(() => settle.pop()?.(), 0);
        });
      }
      if (href.includes("/producers?")) {
        const offset = Number(new URL(href).searchParams.get("offset") || 0);
        const all = Array.from({ length: 150 }, (_x, i) => ({ id: `id-${i}`, slug: `biz-${i}` }));
        return Promise.resolve({ ok: true, status: 200, json: async () => all.slice(offset, offset + PAGE) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });

    await sitemap();
    expect(peak).toBeGreaterThan(0); // control: the fan-out actually ran
    expect(peak).toBeLessThanOrEqual(10);
  });

  it("keeps each business's recipes attached to that business (input order)", async () => {
    global.fetch = vi.fn((url) => {
      const href = String(url);
      if (href.includes("/recipes")) {
        const slug = href.match(/producers\/([^/]+)\/recipes/)[1];
        // resolve out of order: later slugs finish first
        const delay = slug === "biz-0" ? 5 : 0;
        return new Promise((resolve) =>
          setTimeout(
            () => resolve({ ok: true, status: 200, json: async () => [{ id: `recipe-of-${slug}` }] }),
            delay,
          ),
        );
      }
      if (href.includes("/producers?")) {
        const offset = Number(new URL(href).searchParams.get("offset") || 0);
        const all = [{ id: "a", slug: "biz-0" }, { id: "b", slug: "biz-1" }];
        return Promise.resolve({ ok: true, status: 200, json: async () => all.slice(offset, offset + PAGE) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });

    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${BASE}/biz-0/recipes/recipe-of-biz-0`);
    expect(urls).toContain(`${BASE}/biz-1/recipes/recipe-of-biz-1`);
    expect(urls).not.toContain(`${BASE}/biz-0/recipes/recipe-of-biz-1`);
  });

  it("API down on page 1 → no producer URLs, and the sitemap still builds", async () => {
    global.fetch = vi.fn((url) =>
      String(url).includes("/producers?")
        ? Promise.resolve({ ok: false, status: 503, json: async () => ({}) })
        : Promise.resolve({ ok: true, status: 200, json: async () => [] }),
    );
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => /\/biz-\d+$/.test(u))).toBe(false);
    expect(urls).toContain(BASE); // the static routes still ship
    expect(urls).toContain(`${BASE}/map`);
  });

  it("API fails mid-walk → keeps the businesses it already has", async () => {
    global.fetch = vi.fn((url) => {
      const href = String(url);
      if (href.includes("/producers?")) {
        const offset = Number(new URL(href).searchParams.get("offset") || 0);
        if (offset > 0) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () =>
            Array.from({ length: 100 }, (_x, i) => ({ id: `id-${i}`, slug: `biz-${i}` })),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${BASE}/biz-0`);
    expect(urls).toContain(`${BASE}/biz-99`);
  });
});
