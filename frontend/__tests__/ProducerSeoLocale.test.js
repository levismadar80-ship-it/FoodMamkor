/**
 * MEH-2774 — producer <title>, fallback description and the not-found title
 * are built from messages (seo.producer) per locale. Hebrew output is pinned
 * byte-for-byte by seo.test.js; this file pins the English side, which used
 * to come out in Hebrew.
 */
import { describe, it, expect } from "vitest";
import { buildTitle, buildDescription, buildProducerMetadata, buildJsonLd } from "@/lib/seo";

const p = {
  id: 1, slug: "x", name: "Shikma Farm", city: "Rehovot",
  categories: [{ id: 1, name: "Dairy" }], images: [],
};

describe("producer SEO copy — en", () => {
  it("title in English, Latin brand", () => {
    expect(buildTitle(p, "en")).toBe("Shikma Farm — Dairy in Rehovot | Mehamakor");
    expect(buildTitle({ ...p, categories: [] }, "en")).toBe("Shikma Farm in Rehovot | Mehamakor");
    expect(buildTitle({ ...p, city: null }, "en")).toBe("Shikma Farm — Dairy | Mehamakor");
    expect(buildTitle({ ...p, city: null, categories: [] }, "en")).toBe("Shikma Farm | Mehamakor");
  });

  it("fallback description in English", () => {
    expect(buildDescription(p, "en")).toBe("Shikma Farm — a local business in Rehovot. Dairy");
    expect(buildDescription({ ...p, city: null, categories: [] }, "en")).toBe("Shikma Farm — a local business");
  });

  it("metadata and JSON-LD carry the locale's title", () => {
    expect(buildProducerMetadata(null, "en")).toEqual({ title: "Business not found | Mehamakor" });
    expect(buildProducerMetadata(p, "en").title).toBe("Shikma Farm — Dairy in Rehovot | Mehamakor");
    const crumbs = buildJsonLd(p, "en")["@graph"].find((e) => e["@type"] === "BreadcrumbList");
    expect(crumbs.itemListElement[0].name).toBe("Israel");
  });

  it("an unknown locale falls back to Hebrew, never a raw key", () => {
    expect(buildTitle(p, "fr")).toBe("Shikma Farm — Dairy בRehovot | מהמקור");
  });
});

describe("nameless producer", () => {
  it("falls back to the locale's brand", () => {
    expect(buildTitle(null, "en")).toBe("Mehamakor");
    expect(buildTitle(null, "he")).toBe("מהמקור");
  });
});
