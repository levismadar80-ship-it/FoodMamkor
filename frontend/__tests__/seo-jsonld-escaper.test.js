/**
 * MEH-1069: JSON-LD `</script>` breakout escaper + builder coverage.
 *
 * serializeJsonLd() is the single owner of JSON-LD serialization for all 7
 * `<script type="application/ld+json">` injection sites. These tests lock in:
 *   1. the security property — no literal `</script>` survives serialization,
 *      HTML-significant chars become `\uXXXX` escapes;
 *   2. data integrity — the escaped output is still valid JSON that parses
 *      back to the exact input object (only wire bytes change);
 *   3. the #1545 builders (buildEventJsonLd / buildRecipeBreadcrumbJsonLd,
 *      and buildBreadcrumbList indirectly) that were orphaned by merge timing.
 *
 * buildBreadcrumbList is module-private (not exported) by design — it is
 * exercised through the two public builders that emit BreadcrumbList rather
 * than exported solely for testing.
 */
import { describe, it, expect } from "vitest";
import {
  serializeJsonLd,
  buildEventJsonLd,
  buildRecipeBreadcrumbJsonLd,
  buildJsonLd,
} from "@/lib/seo";

describe("serializeJsonLd — </script> breakout escaper", () => {
  it("neutralizes a </script><script> payload in a string value", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    // No literal tag-closer survives — the HTML parser never sees </script>.
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    // The load-bearing escape: `<` becomes the 6-char sequence <.
    expect(out).toContain("\\u003c");
  });

  it("escapes <, >, and & to their \\uXXXX forms (defense in depth)", () => {
    const out = serializeJsonLd({ a: "1 < 2 > 0 && x" });
    expect(out).toContain("\\u003c"); // <
    expect(out).toContain("\\u003e"); // >
    expect(out).toContain("\\u0026"); // &
    expect(out).not.toMatch(/[<>&]/); // zero raw HTML-significant chars
  });

  it("is data-preserving: escaped output parses back to the exact input", () => {
    const input = {
      "@context": "https://schema.org",
      name: "בית עסק </script> & <b>test</b>",
      nested: { note: "a > b & c < d" },
      list: ["x < y", "p & q"],
    };
    // Valid JSON: a spec parser decodes < etc. back to < > & — so the
    // rendered schema.org data is byte-identical, only the wire bytes differ.
    expect(JSON.parse(serializeJsonLd(input))).toEqual(input);
  });

  it("produces identical decoded output for a seeded producer (before/after)", () => {
    const producer = {
      id: 42,
      slug: "havat-hashikma",
      name: "חוות השקמה",
      city: "רחובות",
      description: "גבינות עיזים ארטיזן",
      categories: [{ id: 1, name: "חלב וגבינות" }],
      lat: 31.8928,
      lng: 34.8113,
    };
    const raw = buildJsonLd(producer, "he");
    // Decoding the escaped bytes yields the same object raw JSON.stringify held.
    expect(JSON.parse(serializeJsonLd(raw))).toEqual(raw);
  });
});

describe("buildEventJsonLd (#1545, orphaned)", () => {
  const event = {
    id: 7,
    title: "שוק איכרים",
    event_date: "2026-08-01",
    event_time: "18:00",
    city: "תל אביב",
    price: 0,
    producer_name: "חוות השקמה",
    producer_id: 42,
  };

  it("emits an Event + BreadcrumbList @graph", () => {
    const ld = buildEventJsonLd(event, "he");
    expect(ld["@context"]).toBe("https://schema.org");
    const types = ld["@graph"].map((n) => n["@type"]);
    expect(types).toContain("Event");
    expect(types).toContain("BreadcrumbList");
  });

  it("builds an ordered BreadcrumbList (positions 1..n, no gaps)", () => {
    const ld = buildEventJsonLd(event, "he");
    const crumb = ld["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    const positions = crumb.itemListElement.map((i) => i.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
    expect(crumb.itemListElement.at(-1).name).toBe(event.title);
  });

  it("returns null for a missing event", () => {
    expect(buildEventJsonLd(null)).toBeNull();
  });

  it("survives a </script> payload in the event title via the escaper", () => {
    const evil = { ...event, title: "x</script><script>alert(1)</script>" };
    const out = serializeJsonLd(buildEventJsonLd(evil, "he"));
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)["@graph"][0].name).toBe(evil.title); // decodes back
  });
});

describe("buildRecipeBreadcrumbJsonLd (#1545, orphaned)", () => {
  const producer = { name: "חוות השקמה", slug: "havat-hashikma" };
  const recipe = { title: "לחם מחמצת" };

  it("emits a BreadcrumbList with the full trail (ישראל → עסק → מתכון)", () => {
    const ld = buildRecipeBreadcrumbJsonLd(
      producer,
      recipe,
      "/havat-hashikma/recipes/9",
      "he",
    );
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("BreadcrumbList");
    const names = ld.itemListElement.map((i) => i.name);
    expect(names).toEqual(["ישראל", producer.name, recipe.title]);
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it("returns null when producer or recipe is missing", () => {
    expect(buildRecipeBreadcrumbJsonLd(null, recipe, "/x", "he")).toBeNull();
    expect(buildRecipeBreadcrumbJsonLd(producer, null, "/x", "he")).toBeNull();
  });
});
