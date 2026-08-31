import { describe, it, expect } from "vitest";
import { buildHomeJsonLd, buildJsonLd, buildOrganizationNode } from "@/lib/seo";
import { BRAND_NAME, BRAND_SAME_AS, SITE_DESCRIPTION } from "@/lib/constants";

/**
 * MEH-2192 — the Organization entity, on every surface that emits it.
 *
 * The node already shipped with name/url/logo but carried no `description`
 * and no `sameAs`, which are the two fields an answer engine uses to decide
 * what this entity IS and whether anything corroborates it.
 *
 * It was also written out TWICE — once in buildJsonLd (producer pages) and
 * once in buildHomeJsonLd (homepage) — so a field added to one would silently
 * miss the other. The deep-equality assertion below is aimed squarely at that:
 * it is the one that fails if a future edit enriches a single surface.
 */

const findNode = (graph, type) => graph["@graph"].find((n) => n["@type"] === type);

/** Minimal producer good enough for buildJsonLd to emit its full graph. */
const PRODUCER = {
  id: 42,
  slug: "test-producer",
  name: "יצרן בדיקה",
  description: "תיאור",
  city: "תל אביב",
  category: { name: "מאפים" },
};

describe("Organization JSON-LD (MEH-2192)", () => {
  it("carries the site's own description, verbatim", () => {
    const org = buildOrganizationNode();

    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe(BRAND_NAME);
    expect(org.description).toBe(SITE_DESCRIPTION);
    // Not a paraphrase of the meta description — the same string object-for-
    // object. An entity description that disagrees with the page's own meta
    // description is the inconsistency this ticket exists to remove.
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(0);
  });

  it("declares sameAs, and every entry is an absolute https URL", () => {
    const org = buildOrganizationNode();

    expect(Array.isArray(org.sameAs)).toBe(true);
    expect(org.sameAs.length).toBeGreaterThan(0);
    expect(org.sameAs).toEqual(BRAND_SAME_AS);
    // A sameAs nobody can resolve asserts an identity that cannot be checked,
    // which is worse than omitting the field.
    for (const url of org.sameAs) {
      expect(url).toMatch(/^https:\/\/[^\s]+$/);
    }
  });

  it("is NOT typed as LocalBusiness — this is a directory, not a storefront", () => {
    // LocalBusiness would carry address/geo/openingHours semantics that are
    // false for mehamakor itself. Those belong to the producers, each of which
    // gets its own FoodEstablishment node.
    const org = buildOrganizationNode();
    expect(org["@type"]).not.toBe("LocalBusiness");
  });

  it("is byte-identical on the homepage and on a producer page", () => {
    const homeOrg = findNode(buildHomeJsonLd("he"), "Organization");
    const producerOrg = findNode(buildJsonLd(PRODUCER, "he"), "Organization");

    expect(homeOrg).toBeDefined();
    expect(producerOrg).toBeDefined();

    // The discriminating assertion. Both surfaces used to hand-write this node
    // separately; enriching one and forgetting the other is the regression
    // this catches, and it catches it in either direction.
    expect(homeOrg).toEqual(producerOrg);
    expect(homeOrg.description).toBe(SITE_DESCRIPTION);
    expect(producerOrg.description).toBe(SITE_DESCRIPTION);
    expect(homeOrg.sameAs).toEqual(BRAND_SAME_AS);
    expect(producerOrg.sameAs).toEqual(BRAND_SAME_AS);

    // Both share the @id, which is what makes them one entity across the site
    // rather than two that happen to look alike.
    expect(homeOrg["@id"]).toBe(producerOrg["@id"]);
  });
});
