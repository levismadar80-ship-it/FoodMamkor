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
  // Line comments are stripped first: a rule that was commented out must read
  // as absent, not as present (the referee reproduced that false green).
  // Known limit: the `([^}]*)` capture stops at the first `}`, so a rule that
  // grows a nested block (a `has:` clause) would truncate the capture and
  // could hide `destination` / `permanent`. The e2e check in
  // e2e/flows/17-producers-search.spec.ts asks the running server and does
  // not share that limit.
  const stripLineComments = (text) => text.replace(/^\s*\/\/.*$/gm, "");
  const raw = fs.readFileSync(path.join(process.cwd(), "next.config.js"), "utf-8");
  const ruleIn = (text, source) => {
    const m = stripLineComments(text).match(
      new RegExp(`\\{\\s*source:\\s*"${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}",([^}]*)\\}`),
    );
    return m ? m[1] : null;
  };
  const rule = (source) => ruleIn(raw, source);

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

  it("control: a commented-out rule reads as absent", () => {
    const commentedOut = raw.replace(/^(\s*)(\{\s*source:\s*"\/search",[^}]*\})/m, "$1// $2");
    expect(commentedOut).not.toBe(raw);
    expect(ruleIn(commentedOut, "/search")).toBeNull();
    expect(ruleIn(commentedOut, "/neighbor/:path*")).not.toBeNull();
  });

  it("the search page files are gone (RouteManifestSync covers the manifest)", () => {
    expect(fs.existsSync(path.join(process.cwd(), "app", "[locale]", "search"))).toBe(false);
  });
});
