// MEH-804: the homepage previously emitted no JSON-LD. buildHomeJsonLd()
// supplies the site-level Organization + WebSite graph plus a SearchAction
// (sitelinks search box). These guards lock the @id wiring (must match
// buildJsonLd's #organization/#website so the cross-page graph is consistent),
// the SearchAction target (/search?q= — the real param), and locale-awareness.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.online",
  API_URL: "https://api.example.test",
}));

import { buildHomeJsonLd } from "@/lib/seo";

const SITE = "https://mehamakor.online";
const webNode = (locale) =>
  buildHomeJsonLd(locale)["@graph"].find((n) => n["@type"] === "WebSite");

describe("buildHomeJsonLd (MEH-804)", () => {
  it("emits Organization + WebSite with @ids that match buildJsonLd", () => {
    const ld = buildHomeJsonLd("he");
    expect(ld["@context"]).toBe("https://schema.org");
    const org = ld["@graph"].find((n) => n["@type"] === "Organization");
    const web = ld["@graph"].find((n) => n["@type"] === "WebSite");
    expect(org["@id"]).toBe(`${SITE}#organization`);
    expect(web["@id"]).toBe(`${SITE}#website`);
    expect(web.publisher["@id"]).toBe(`${SITE}#organization`); // resolves to the Org node
    expect(org.logo.url).toBe(`${SITE}/logo.png`);
  });

  it("includes a SearchAction targeting the real /search?q= param", () => {
    const { potentialAction } = webNode("he");
    expect(potentialAction["@type"]).toBe("SearchAction");
    expect(potentialAction.target.urlTemplate).toBe(`${SITE}/search?q={search_term_string}`);
    expect(potentialAction["query-input"]).toBe("required name=search_term_string");
  });

  it("is locale-aware on inLanguage", () => {
    expect(webNode("he").inLanguage).toBe("he-IL");
    expect(webNode("en").inLanguage).toBe("en-US");
  });
});
