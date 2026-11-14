// MEH-3177: pre-launch SEO fixes from the 14/11 audit. Each case names the
// input it covers; each was shown red against the code before the fix.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildEventJsonLd, israelOffset, buildTitleNoBrand } from "@/lib/seo";

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

describe("israelOffset — DST-aware, from the Israel clock", () => {
  it("winter date → +02:00", () => expect(israelOffset("2026-01-15", "18:00")).toBe("+02:00"));
  it("summer date → +03:00", () => expect(israelOffset("2026-07-15", "18:00")).toBe("+03:00"));
  // Israel 2026: spring forward Fri 27/03 02:00 local (00:00Z); fall back Sun 25/10 02:00 local (23:00Z the day before).
  it("01:30 on the spring-forward day is still winter time", () => expect(israelOffset("2026-03-27", "01:30")).toBe("+02:00"));
  it("00:30 on the fall-back day is still summer time", () => expect(israelOffset("2026-10-25", "00:30")).toBe("+03:00"));
  it("garbage date → empty string, never a wrong offset", () => expect(israelOffset("not-a-date")).toBe(""));
});

describe("buildEventJsonLd eventStatus", () => {
  const base = { id: "e1", title: "יום חווה", event_date: "2026-12-01" };
  it("is_active false → EventCancelled", () => {
    const ld = buildEventJsonLd({ ...base, is_active: false });
    const ev = ld["@graph"].find((n) => n["@type"] === "Event");
    expect(ev.eventStatus).toBe("https://schema.org/EventCancelled");
  });
  it("is_active true → EventScheduled", () => {
    const ld = buildEventJsonLd({ ...base, is_active: true });
    const ev = ld["@graph"].find((n) => n["@type"] === "Event");
    expect(ev.eventStatus).toBe("https://schema.org/EventScheduled");
  });
});

describe("business page title keeps category + city, brand added once by the layout", () => {
  const p = { name: "מאפיית רוח השדה", city: "כפר סבא", categories: [{ name: "לחמים ואפייה" }] };
  it("he: name — category בcity, no brand", () => {
    expect(buildTitleNoBrand(p, "he")).toBe("מאפיית רוח השדה — לחמים ואפייה בכפר סבא");
  });
  it("name only when nothing else is known", () => {
    expect(buildTitleNoBrand({ name: "משק תמר" }, "he")).toBe("משק תמר");
  });
});

describe("noindex on signed-in surfaces", () => {
  for (const f of [
    "app/[locale]/admin/layout.js",
    "app/[locale]/producer/dashboard/layout.js",
    "app/[locale]/settings/layout.js",
    "app/[locale]/messages/page.js",
  ]) {
    it(f, () => expect(read(f)).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/));
  }
});

describe("robots.txt blocks the bare URL, not only the subtree", () => {
  const txt = read("public/robots.txt");
  it("every admin / dashboard subtree rule has its exact-match twin", () => {
    const lines = txt.split("\n");
    for (const sub of lines.filter((l) => /^Disallow: (\/en)?\/(admin|producer\/dashboard)\/$/.test(l))) {
      expect(lines).toContain(sub.replace(/\/$/, "$"));
    }
  });
  it("the bare URL is blocked exactly, not by prefix (a /admin-bakery business slug stays crawlable)", () => {
    const lines = txt.split("\n");
    expect(lines.filter((l) => /^Disallow: (\/en)?\/admin\$$/.test(l)).length).toBeGreaterThanOrEqual(2);
    expect(lines.filter((l) => /^Disallow: (\/en)?\/admin\/$/.test(l)).length).toBeGreaterThanOrEqual(2);
    expect(lines.filter((l) => /^Disallow: (\/en)?\/admin$/.test(l))).toEqual([]);
  });
});

describe("/rescue has its own canonical", () => {
  it("rescue/page.jsx calls buildAlternates(\"/rescue\")", () => {
    expect(read("app/[locale]/rescue/page.jsx")).toContain('buildAlternates("/rescue", locale)');
  });
});

describe("sitemap offers the indexable pages it used to miss", () => {
  const src = read("app/sitemap.js");
  for (const p of ["/privacy", "/accessibility", "/about/for-businesses/guides", "/about/for-businesses/guides/business-story"]) {
    it(p, () => expect(src).toContain(`path: "${p}"`));
  }
});
