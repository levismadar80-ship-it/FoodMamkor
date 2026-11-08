import { describe, it, expect } from "vitest";
import { buildHomeJsonLd, buildJsonLd, buildOrganizationNode } from "@/lib/seo";

/**
 * MEH-2851 — the WebSite entity declares the Latin site name.
 *
 * Google Search Central: the site name comes from `WebSite` structured data on
 * the home page — `name`, plus `alternateName` for another name the site is
 * known by. Searching «mehamakor» was auto-corrected to «hamakor» while the
 * Hebrew name already ranked first: only the Organization node carried
 * "Mehamakor" (MEH-2192), the WebSite node did not.
 *
 * The node was also written out twice (buildJsonLd for producer pages,
 * buildHomeJsonLd for the home page). The deep-equality check below fails if a
 * future edit enriches one surface and not the other — the MEH-2192 shape.
 *
 * Literals, not the constants: the assertion is on the rendered strings Google
 * reads, so a constant edited by mistake still turns this red.
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

describe("WebSite JSON-LD (MEH-2851)", () => {
  it.each([
    ["home page", () => buildHomeJsonLd("he")],
    ["producer page", () => buildJsonLd(PRODUCER, "he")],
  ])("%s: WebSite carries name «מהמקור» and alternateName «Mehamakor»", (_, build) => {
    const site = findNode(build(), "WebSite");
    expect(site, "control: the graph has a WebSite node").toBeTruthy();
    expect(site.name).toBe("מהמקור");
    expect(site.alternateName).toBe("Mehamakor");
  });

  it("is the same node on both surfaces, apart from the home page's SearchAction", () => {
    const home = findNode(buildHomeJsonLd("he"), "WebSite");
    const producer = findNode(buildJsonLd(PRODUCER, "he"), "WebSite");
    const { potentialAction, ...homeWithoutSearch } = home;
    expect(potentialAction, "control: the home page keeps its SearchAction").toBeTruthy();
    expect(homeWithoutSearch).toEqual(producer);
  });

  it("the home page keeps its sitelinks SearchAction unchanged", () => {
    const { potentialAction } = findNode(buildHomeJsonLd("he"), "WebSite");
    expect(potentialAction["@type"]).toBe("SearchAction");
    expect(potentialAction.target.urlTemplate).toMatch(/\/producers\?q=\{search_term_string\}$/);
    expect(potentialAction["query-input"]).toBe("required name=search_term_string");
  });

  it("keeps @id, url, inLanguage and publisher, and the en locale tag", () => {
    const he = findNode(buildHomeJsonLd("he"), "WebSite");
    const en = findNode(buildHomeJsonLd("en"), "WebSite");
    expect(he["@id"]).toMatch(/#website$/);
    expect(he.url).toBe(he["@id"].replace(/#website$/, ""));
    expect(he.publisher).toEqual({ "@id": `${he.url}#organization` });
    expect(he.inLanguage).toBe("he-IL");
    expect(en.inLanguage).toBe("en-US");
  });

  it("does not touch the Organization node", () => {
    expect(findNode(buildHomeJsonLd("he"), "Organization")).toEqual(buildOrganizationNode());
  });
});
