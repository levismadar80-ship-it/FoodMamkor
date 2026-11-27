// @ts-check
/**
 * MEH-3953 — /llms.txt lists every approved business, one line each, so an
 * AI assistant finds a business page by name, city and what it sells.
 * Runs the real builder and the real route (the catalog walk is mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const walk = vi.hoisted(() => ({ result: /** @type {any} */ (null), throws: false }));
vi.mock("@/lib/all-producers", () => ({
  fetchAllProducers: async () => {
    if (walk.throws) throw new Error("down");
    return walk.result;
  },
}));

import { buildLlmsTxt } from "@/lib/llms-txt";
import { GET } from "@/app/llms.txt/route";
import { SITE_URL } from "@/lib/env";

const tasty = { id: "65f7", slug: "tasty-v", name: "ליקה — מעדנייה טבעונית", city: "הוד השרון", short_description: "גבינות טבעוניות\nעל בסיס אגוזים" };

describe("buildLlmsTxt (MEH-3953)", () => {
  it("0 businesses → no businesses section, pages still there", () => {
    const txt = buildLlmsTxt([]);
    expect(txt).not.toContain("## בתי עסק");
    expect(txt).toContain("## עמודים");
    expect(buildLlmsTxt(null)).toBe(txt);
  });

  it("1 business → one line: name, slug URL, description on one line, city", () => {
    const rows = buildLlmsTxt([tasty]).split("\n").filter((l) => l.startsWith("- [ליקה"));
    expect(rows).toEqual([
      `- [ליקה — מעדנייה טבעונית](${SITE_URL}/tasty-v): גבינות טבעוניות על בסיס אגוזים · הוד השרון`,
    ]);
  });

  it("many → one line each; no slug falls back to /producer/<id>; no name is skipped", () => {
    const txt = buildLlmsTxt([tasty, { id: "abc", name: "בלי סלאג" }, { id: "x" }]);
    const section = txt.split("## בתי עסק")[1].trim().split("\n");
    expect(section).toHaveLength(2);
    expect(section[1]).toBe(`- [בלי סלאג](${SITE_URL}/producer/abc)`);
  });
});

describe("GET /llms.txt (MEH-3953)", () => {
  beforeEach(() => {
    walk.throws = false;
    walk.result = null;
  });

  it("serves plain text with the businesses from the catalog", async () => {
    walk.result = [tasty];
    const res = await GET();
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toContain(`(${SITE_URL}/tasty-v)`);
  });

  it("an unreachable API still serves the pages, without the businesses", async () => {
    walk.throws = true;
    const txt = await (await GET()).text();
    expect(txt).toContain("## עמודים");
    expect(txt).not.toContain("## בתי עסק");
  });
});
