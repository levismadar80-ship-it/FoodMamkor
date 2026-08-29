/**
 * Module:   robots-txt-ref-disallow
 * Purpose:  Pin the MEH-2099 crawl rules in public/robots.txt — /ref/ stays
 *           blocked, and the routes that must stay crawlable stay crawlable.
 * Touches:  Nothing. Reads public/robots.txt off disk; no network, no server.
 * Does NOT: assert meta-robots tags. Those live in the route files
 *           (`robots: { index: false, follow: false }`) and are a separate
 *           mechanism — robots.txt governs CRAWLING, meta governs INDEXING.
 * Related:  frontend/public/robots.txt; app/sitemap.js:51-66 (the indexable
 *           set this file must not contradict — the MEH-1955 failure class).
 * History:  MEH-2099 (group A).
 *
 * Why a real matcher and not `expect(txt).toContain("Disallow: /ref/")`:
 * a substring check passes even if the line lands in the GPTBot group, where
 * it would do nothing for Google. It also cannot express the control at all —
 * "/map is still crawlable" is not a substring question. The parser below is
 * scoped to the `User-agent: *` group and implements longest-match-wins, which
 * is what makes both halves of this suite falsifiable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROBOTS_PATH = join(process.cwd(), "public", "robots.txt");
const ROBOTS_TXT = readFileSync(ROBOTS_PATH, "utf8");

/**
 * Collect the Allow/Disallow rules belonging to one user-agent group.
 * Consecutive `User-agent:` lines share the following rule block.
 */
function rulesFor(txt, agent) {
  const allows = [];
  const disallows = [];
  let inGroup = false;
  let atAgentHeader = false;

  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      // A new agent header after a rule block starts a fresh group.
      if (!atAgentHeader) inGroup = false;
      atAgentHeader = true;
      if (value === agent) inGroup = true;
      continue;
    }

    atAgentHeader = false;
    if (!inGroup) continue;
    // `Disallow:` with an empty value means "nothing is disallowed" — it is
    // not a rule matching the empty prefix, which would block the whole site.
    if (key === "allow" && value) allows.push(value);
    if (key === "disallow" && value) disallows.push(value);
  }

  return { allows, disallows };
}

/** Longest-match-wins, tie goes to Allow (Google/Bing). */
function verdict(path, { allows, disallows }) {
  const longest = (rules) =>
    rules.filter((r) => path.startsWith(r)).reduce((best, r) => Math.max(best, r.length), 0);

  const a = longest(allows);
  const d = longest(disallows);
  if (d === 0) return "allow";
  return a >= d ? "allow" : "disallow";
}

const STAR = rulesFor(ROBOTS_TXT, "*");

describe("robots.txt matcher (self-test — run first)", () => {
  // testing.md: a classifier ships with a self-test, and the self-test runs
  // before anything it reports is worth reading. If these fail, every verdict
  // below is void — including the reassuring ones.
  const FIXTURE = [
    "User-agent: *",
    "Allow: /",
    "Allow: /register/producer",
    "Disallow: /register",
    "Disallow: /secret/",
    "",
    "User-agent: EvilBot",
    "Disallow: /",
  ].join("\n");

  const fixtureStar = rulesFor(FIXTURE, "*");

  it("blocks a disallowed prefix", () => {
    expect(verdict("/secret/x", fixtureStar)).toBe("disallow");
  });

  it("allows an unlisted path", () => {
    expect(verdict("/anything", fixtureStar)).toBe("allow");
  });

  it("gives the longer Allow precedence over a shorter Disallow", () => {
    expect(verdict("/register", fixtureStar)).toBe("disallow");
    expect(verdict("/register/producer", fixtureStar)).toBe("allow");
  });

  it("does NOT leak another agent's rules into the * group", () => {
    // The load-bearing one. EvilBot has `Disallow: /`; if group scoping were
    // broken, every control below would report "disallow" and this suite would
    // look like it was catching a catastrophe instead of a parser bug.
    expect(verdict("/anything", fixtureStar)).toBe("allow");
    expect(verdict("/anything", rulesFor(FIXTURE, "EvilBot"))).toBe("disallow");
  });

  it("reads a non-empty rule set from the real committed file", () => {
    // MEH-1909: at least one case anchored to a real repo file, not a fixture.
    // A parser that silently returns nothing would pass every synthetic case
    // above and then report "allow" for everything here.
    expect(STAR.disallows.length).toBeGreaterThan(0);
    expect(STAR.allows.length).toBeGreaterThan(0);
  });
});

describe("MEH-2099 — /ref/ is not crawlable", () => {
  it("disallows /ref/ for the * group", () => {
    expect(verdict("/ref/ABC123", STAR)).toBe("disallow");
    expect(verdict("/ref/anything/deeper", STAR)).toBe("disallow");
  });

  it("puts the rule in the * group, not in an AI-crawler group", () => {
    // A `Disallow: /ref/` line sitting under GPTBot would satisfy a substring
    // check and do nothing for Google. This is the assertion that separates
    // "the line exists" from "the line is in force".
    expect(STAR.disallows).toContain("/ref/");
  });
});

describe("CONTROL — the crawlable surface is still crawlable", () => {
  // Without this, the fix is indistinguishable from blocking the whole site.
  // Every path here is asserted indexable by app/sitemap.js:51-66, so the two
  // files cannot drift apart silently (the MEH-1955 failure class).
  it.each([["/"], ["/map"], ["/producers"], ["/terms"], ["/about"], ["/events"]])(
    "%s stays allowed",
    (path) => {
      expect(verdict(path, STAR)).toBe("allow");
    },
  );

  it("/register/producer stays allowed despite Disallow: /register", () => {
    // Pins the MEH-1955 longest-match note that the file's own comment relies on.
    expect(verdict("/register/producer", STAR)).toBe("allow");
    expect(verdict("/register", STAR)).toBe("disallow");
  });
});
