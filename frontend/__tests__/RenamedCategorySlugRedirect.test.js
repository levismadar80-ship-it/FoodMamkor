/**
 * MEH-3911: revision b3d5f7a9c1e2 renamed three category slugs to English. A
 * /producers/<old>/<region> link shared before it must 308 to the new slug.
 *
 * Source-text on purpose (testing.md MEH-3531 allows it for a config shape):
 * next.config.js cannot be require()d under the jsdom suite (jiti needs a
 * filesystem __filename), the same limit SearchRouteRedirect.test.js names.
 * The pairs are checked against the revision itself, so the two lists cannot
 * drift apart.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const config = fs
  .readFileSync(path.join(process.cwd(), "next.config.js"), "utf-8")
  .replace(/^\s*\/\/.*$/gm, "");
const versions = path.join(process.cwd(), "..", "backend", "alembic", "versions");
const revision = fs.readFileSync(
  path.join(versions, fs.readdirSync(versions).find((f) => f.includes("_b3d5f7a9c1e2_"))),
  "utf-8",
);
const pairs = (text, re) => [...text.matchAll(re)].map((m) => [m[1], m[2]]);

describe("old category slugs 308 to the English ones (MEH-3911)", () => {
  const block = config.match(/RENAMED_CATEGORY_SLUGS = \[([\s\S]*?)\];/)?.[1] ?? "";
  const inConfig = pairs(block, /\["([a-z0-9-]+)",\s*"([a-z0-9-]+)"\]/g);
  const inRevision = pairs(revision, /\("([a-z0-9-]+)",\s*"([a-z0-9-]+)"\)/g);

  it("lists exactly the revision's renames", () => {
    expect(inRevision).toHaveLength(3); // control: the revision was read
    expect(inConfig).toEqual(inRevision);
  });

  it("spreads the list into permanent rules, with and without a locale", () => {
    const spread = config.match(/\.\.\.RENAMED_CATEGORY_SLUGS\.flatMap\(\(\[from, to\]\) => \[([\s\S]*?)\]\),/)?.[1];
    expect(spread).toBeDefined();
    expect(spread).toContain("source: `/:locale(he|en)/producers/${from}/:path*`, destination: `/:locale/producers/${to}/:path*`, permanent: true");
    expect(spread).toContain("source: `/producers/${from}/:path*`, destination: `/producers/${to}/:path*`, permanent: true");
  });
});
