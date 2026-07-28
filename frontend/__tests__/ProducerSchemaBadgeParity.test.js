/**
 * MEH-1704 — ProducerSchema must declare every field the badge system reads.
 *
 * `ProducerSchema` is a `z.object`, which STRIPS undeclared keys by default
 * (`lib/schemas.js:7`). Both Zod-parsed producer feeds — the home grid
 * (`lib/use-home-page.js:326, :360, :430`) and `/map`
 * (`app/[locale]/map/state/useProducersFeed.js:49`) — therefore hand
 * `ProducerCard` a producer with the badge fields already removed, and every
 * badge except `verified` is dead on those two surfaces.
 *
 * This is the FIFTH recurrence of one mechanism. `lib/schemas.js` documents the
 * previous four in its own comments — MEH-826 (`opening_hours`), MEH-901
 * ("12 fields"), MEH-902 (`delivery_areas`), MEH-766 ch5 (`verified_at` +
 * `verification_doc_type`), MEH-1412 (`locations`). Each time a declaration was
 * added; no time was a guard added. This file is the guard.
 *
 * Two assertions, deliberately different in kind:
 *   1. STRUCTURAL — extract every `producer.X` the badge logic actually reads
 *      and assert each is a declared key of ProducerSchema. Catches the NEXT
 *      badge that reads an undeclared field, which is the recurrence itself.
 *   2. BEHAVIOURAL — a fixture carrying every badge field survives a
 *      ProducerSchema round-trip with its badges intact. Catches the case where
 *      a key is declared but with a type so strict the value is rejected.
 *
 * The extractor is a CLASSIFIER (it must sort code from comment), so per
 * `.claude/rules/testing.md` → "Where the assertion is a classifier, ship the
 * self-test" it carries one, and the self-test runs FIRST. That is not
 * ceremony: `earnsBadge` mentions `producer.organic_certified` (`badges.js:189`)
 * and `producer.kosher` (`:206`, `:209`) ONLY inside explanatory comments —
 * MEH-1259 removed the organic badge and MEH-986 made the free-text `kosher`
 * field drive no badge. A comment-blind extractor reports 16 fields instead of
 * 14 and would demand two declarations that must not exist.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ProducerSchema } from "@/lib/schemas";
import { allBadges } from "@/lib/badges";

const BADGES_PATH = path.join(process.cwd(), "lib", "badges.js");

/**
 * Remove `//` line comments and block comments so only executable source
 * remains. String-literal awareness is deliberate: a `//` inside a quoted
 * string is not a comment, and getting that wrong would silently truncate real
 * code and under-report fields — the failure direction that lets the bug back
 * in.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null; // active string delimiter, or null
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === "\\") {
        out += ch + (next ?? "");
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue; // newline itself is copied on the next pass
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Every distinct `producer.X` identifier read by executable badge code. */
function badgeFieldsRead(src) {
  const code = stripComments(src);
  const found = new Set();
  for (const m of code.matchAll(/\bproducer\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    found.add(m[1]);
  }
  return [...found].sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. SELF-TEST — run first. If the classifier cannot sort code from comment,
//    nothing it reports afterwards is worth reading.
// ─────────────────────────────────────────────────────────────────────────────
describe("MEH-1704 self-test — the extractor separates code from comment", () => {
  it("keeps a field read by real code", () => {
    expect(badgeFieldsRead("return !!producer.grass_fed;")).toEqual(["grass_fed"]);
  });

  it("drops a field mentioned only in a line comment", () => {
    expect(badgeFieldsRead("// producer.organic_certified drives NO badge")).toEqual([]);
  });

  it("drops a field mentioned only in a block comment", () => {
    expect(badgeFieldsRead("/* producer.kosher is free text */")).toEqual([]);
  });

  it("keeps code that follows a comment on the same construct", () => {
    const src = ["// MEH-986: producer.kosher drives NO badge", "return !!producer.kashrut_verified_at;"].join("\n");
    expect(badgeFieldsRead(src)).toEqual(["kashrut_verified_at"]);
  });

  it("does not treat a // inside a string literal as a comment", () => {
    const src = 'const u = "https://x.test"; return !!producer.has_delivery;';
    expect(badgeFieldsRead(src)).toEqual(["has_delivery"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. STRUCTURAL GUARD
// ─────────────────────────────────────────────────────────────────────────────
describe("MEH-1704 — ProducerSchema declares every field the badge system reads", () => {
  const src = fs.readFileSync(BADGES_PATH, "utf-8");
  const fieldsRead = badgeFieldsRead(src);
  const declared = new Set(Object.keys(ProducerSchema.shape));

  it("finds the badge fields at all (guards against a silent zero-match)", () => {
    // A regex that matches nothing would make the assertion below vacuously
    // pass — the exact shape of failure this whole file exists to prevent.
    expect(fieldsRead.length).toBeGreaterThanOrEqual(10);
  });

  it("declares every one of them", () => {
    const missing = fieldsRead.filter((f) => !declared.has(f));
    expect(missing, `undeclared in ProducerSchema (z.object strips these): ${missing.join(", ")}`).toEqual([]);
  });

  it("declares them permissively — a badge field can never drop a producer", () => {
    // useProducersFeed.js:41 parses the array all-or-nothing: one non-optional
    // declaration would remove an entire producer from the feed rather than
    // just lose a badge. Every badge field must accept `undefined`.
    const rejects = fieldsRead.filter(
      (f) => declared.has(f) && !ProducerSchema.shape[f].safeParse(undefined).success
    );
    expect(rejects, `badge fields that reject undefined: ${rejects.join(", ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BEHAVIOURAL — badges survive the round-trip a real feed performs
// ─────────────────────────────────────────────────────────────────────────────
describe("MEH-1704 — badges survive a ProducerSchema round-trip", () => {
  const fixture = {
    id: "1a1a1a1a-1111-4111-8111-111111111111",
    name: "מאפייה טרייה",
    verification_tier: "verified",
    has_producer_license: true,
    is_recommended: true,
    days_since_created: 3,
    grass_fed: true,
    has_gluten_free_products: true,
    has_vegetarian_products: true,
    has_vegan_products: true,
    has_lactose_free_products: true,
    kashrut_verified_at: "2026-07-01",
    kashrut_expires_at: "2027-07-01",
    has_delivery: true,
    delivery_count: 3,
    products_count: 12,
  };

  it("earns every badge BEFORE the parse (the fixture is well-formed)", () => {
    // Establishes that any loss below is the parse's doing, not a bad fixture.
    expect(allBadges(fixture).length).toBe(12);
  });

  it("keeps them AFTER the parse — >= 6 badges survive", () => {
    const parsed = ProducerSchema.parse(fixture);
    expect(allBadges(parsed).length).toBeGreaterThanOrEqual(6);
  });

  it("loses nothing at all to the parse", () => {
    const before = allBadges(fixture).map((b) => b.key);
    const after = allBadges(ProducerSchema.parse(fixture)).map((b) => b.key);
    expect(after).toEqual(before);
  });
});
