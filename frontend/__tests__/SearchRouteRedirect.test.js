/**
 * MEH-819: /search is gone; the one results page is /producers. The header,
 * the sitelinks SearchAction and old links all end up there. This reads the
 * real next.config.js redirects, so a dropped rule goes red here, not in a
 * crawler report.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("/search → /producers redirect (MEH-819)", () => {
  // next.config.js cannot be require()d under the jsdom suite (jiti needs a
  // filesystem __filename), so this reads the rule objects out of the source.
  // A dropped or edited rule still goes red; the control below proves the
  // reader sees the real rule set and not an empty match.
  const src = fs.readFileSync(path.join(process.cwd(), "next.config.js"), "utf-8");
  const rule = (source) => {
    const m = src.match(new RegExp(`\\{\\s*source:\\s*"${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}",([^}]*)\\}`));
    return m ? m[1] : null;
  };

  it("308s /search and /:locale/search to /producers (Next forwards ?q= and ?focus=1)", () => {
    expect(rule("/search")).toMatch(/destination:\s*"\/producers"/);
    expect(rule("/search")).toMatch(/permanent:\s*true/);
    expect(rule("/:locale(he|en)/search")).toMatch(/destination:\s*"\/:locale\/producers"/);
    expect(rule("/:locale(he|en)/search")).toMatch(/permanent:\s*true/);
  });

  it("control: the reader finds a rule that predates this change", () => {
    expect(rule("/neighbor/:path*")).toMatch(/destination:\s*"\/"/);
    expect(rule("/does-not-exist")).toBeNull();
  });

  it("the search page files are gone (RouteManifestSync covers the manifest)", () => {
    expect(fs.existsSync(path.join(process.cwd(), "app", "[locale]", "search"))).toBe(false);
  });
});
