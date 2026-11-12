import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * MEH-2983 — /join is the main door for businesses (Sapir chose option א׳,
 * 12/11; research https://claude.ai/artifact/9UKUdBtqmKUMXVDTHN3qTE).
 *
 * General "join" buttons outside the business pages lead to /join, not
 * straight into the registration wizard. Pages whose reader has already
 * decided (/join itself, /about/for-businesses, /about/process) keep their
 * direct link and are deliberately NOT listed here.
 *
 * Static check on purpose: three of these surfaces are large client
 * components whose render needs auth, API and router stubs; the href is a
 * literal in each file. The recommend owner line also has a rendered
 * assertion in ShareSiteActions.test.jsx.
 */
const ROOT = join(__dirname, "..");
const SURFACES = {
  "home closing band": "app/[locale]/home/HomeStaticBlocks.jsx",
  "producers empty state": "components/ProducersClient.jsx",
  "recommend owner line": "app/[locale]/recommend/RecommendClient.jsx",
  "consumer signup «יש לכם עסק?»": "app/[locale]/register/RegisterClient.jsx",
};
const HREF_TO = (path) => new RegExp(`(?:ctaHref|href)=\\{?"${path.replace(/\//g, "\\/")}"`, "g");

describe("MEH-2983: general business CTAs lead to /join", () => {
  for (const [name, rel] of Object.entries(SURFACES)) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    it(`${name} has no href straight to /register/producer`, () => {
      expect(src.match(HREF_TO("/register/producer")) ?? []).toEqual([]);
    });
    it(`${name} links to /join`, () => {
      expect((src.match(HREF_TO("/join")) ?? []).length).toBeGreaterThanOrEqual(1);
    });
  }
});
