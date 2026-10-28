/**
 * MEH-2474 (audit MEH-2470 findings 11–12) — what the owner wrote and linked
 * reaches Google: the card tagline joins the meta description, Instagram and
 * Facebook join `sameAs`, and the founding year becomes `foundingDate`.
 */
import { describe, it, expect } from "vitest";
import { buildDescription, buildJsonLd } from "@/lib/seo";

const base = { id: 1, slug: "farm", name: "משק הגליל", city: "קצרין", categories: [] };
const business = (p) => buildJsonLd(p)["@graph"].find((e) => e["@type"] === "FoodEstablishment");

describe("buildDescription — the tagline", () => {
  it("tagline + description → «tagline — description», capped at 160", () => {
    const d = buildDescription({ ...base, short_description: "גבינות עיזים מהגולן", description: "x".repeat(300) });
    expect(d.startsWith("גבינות עיזים מהגולן — ")).toBe(true);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("...")).toBe(true);
  });

  it("tagline only → the tagline", () => {
    expect(buildDescription({ ...base, short_description: "גבינות עיזים מהגולן" })).toBe("גבינות עיזים מהגולן");
  });

  it("description only → unchanged behaviour", () => {
    expect(buildDescription({ ...base, description: "תיאור קצר" })).toBe("תיאור קצר");
  });

  it("blank tagline is ignored", () => {
    expect(buildDescription({ ...base, short_description: "  ", description: "תיאור" })).toBe("תיאור");
  });
});

describe("buildJsonLd — sameAs and foundingDate", () => {
  it("website + instagram handle + facebook → three absolute profile URLs", () => {
    const b = business({
      ...base,
      website: "farm.co.il",
      instagram: "@farm_galil",
      facebook: "https://facebook.com/farmgalil",
    });
    expect(b.sameAs).toEqual([
      "https://farm.co.il",
      "https://instagram.com/farm_galil",
      "https://facebook.com/farmgalil",
    ]);
  });

  it("instagram only → sameAs carries just it", () => {
    expect(business({ ...base, instagram: "farm_galil" }).sameAs).toEqual(["https://instagram.com/farm_galil"]);
  });

  it("a facebook value that is not an http(s) URL is left out", () => {
    expect(business({ ...base, facebook: "javascript:alert(1)" }).sameAs).toBeUndefined();
  });

  it("no links → no sameAs key", () => {
    expect(business(base).sameAs).toBeUndefined();
  });

  it("established_year → foundingDate; a non-year is ignored", () => {
    expect(business({ ...base, established_year: 1998 }).foundingDate).toBe("1998");
    expect(business({ ...base, established_year: 98 }).foundingDate).toBeUndefined();
    expect(business(base).foundingDate).toBeUndefined();
  });
});
