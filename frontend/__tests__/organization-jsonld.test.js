import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { buildHomeJsonLd, buildJsonLd, buildOrganizationNode } from "@/lib/seo";
import {
  FOUNDERS,
  BRAND_NAME,
  BRAND_NAME_LATIN,
  BRAND_SAME_AS,
  SITE_DESCRIPTION,
  CANONICAL_SENTENCE,
} from "@/lib/constants";
import he from "../messages/he.json";

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
  it("describes the site with SITE_DESCRIPTION — the same line llms.txt ships (ADR-043)", () => {
    const org = buildOrganizationNode();

    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe(BRAND_NAME);
    // MEH-3424 / ADR-043: the entity description is the one approved line
    // that every describing surface carries (meta description, og, llms.txt).
    // The brand sentence it carried since MEH-2192 is now the `slogan`.
    expect(org.description).toBe(SITE_DESCRIPTION);
    expect(org.slogan).toBe(CANONICAL_SENTENCE);
    expect(org.description).not.toBe(org.slogan);
  });

  it("public/llms.txt carries SITE_DESCRIPTION as its summary line (single owner)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const llms = readFileSync(path.join(here, "..", "public", "llms.txt"), "utf8");
    const lines = llms.split("\n").map((line) => line.trim());
    // llmstxt.org: the summary is the first non-heading line after the H1.
    expect(lines[0]).toBe("# מהמקור");
    expect(lines.find((line, i) => i > 0 && line)).toBe(SITE_DESCRIPTION);
  });

  // MEH-3424: two more describing surfaces read the same line — the root
  // layout's fallback metadata (through the constant, never a literal) and
  // the PWA manifest.
  it("layout.js feeds SITE_DESCRIPTION to description, og and twitter, and manifest.json carries it", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const layout = readFileSync(path.join(here, "..", "app", "[locale]", "layout.js"), "utf8");
    expect(layout.match(/^\s+description: SITE_DESCRIPTION,$/gm)).toHaveLength(3);
    const manifest = JSON.parse(
      readFileSync(path.join(here, "..", "public", "manifest.json"), "utf8"),
    );
    expect(manifest.description).toBe(SITE_DESCRIPTION);
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

  // MEH-2192 close-out: the two Organization fields the card's acceptance
  // criteria named that the #3199 enrichment did not carry.
  it("declares the Latin alternateName the outbound surfaces already use", () => {
    const org = buildOrganizationNode();
    expect(org.alternateName).toBe(BRAND_NAME_LATIN);
    expect(org.alternateName).toBe("Mehamakor");
  });

  it("names both founders as Persons, spelled exactly as the /about signature", () => {
    const org = buildOrganizationNode();
    // MEH-3323: two founders, Sapir first — derived from FOUNDERS, not restated.
    expect(org.founder).toEqual(
      FOUNDERS.map(({ name }) => ({ "@type": "Person", name })),
    );
    expect(org.founder).toHaveLength(2);
    expect(org.founder.map((p) => p.name)).toEqual(["ספיר שנפ", "טופז שנפ"]);
    // The discriminating half: the entity must agree with the page. The
    // signature joins the names with the Hebrew "ו" — a copy edit that drops
    // a founder, or a constant edit that forgets the copy, reds here.
    const [first, second] = org.founder.map((p) => p.name);
    expect(he.about.signature.name).toBe(`${first} ו${second}`);
    expect(he.guides.article.founder_name).toBe(he.about.signature.name);
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
    // MEH-3424: both surfaces carry the descriptor.
    expect(homeOrg.description).toBe(SITE_DESCRIPTION);
    expect(producerOrg.description).toBe(SITE_DESCRIPTION);
    expect(homeOrg.sameAs).toEqual(BRAND_SAME_AS);
    expect(producerOrg.sameAs).toEqual(BRAND_SAME_AS);

    // Both share the @id, which is what makes them one entity across the site
    // rather than two that happen to look alike.
    expect(homeOrg["@id"]).toBe(producerOrg["@id"]);
  });
});
