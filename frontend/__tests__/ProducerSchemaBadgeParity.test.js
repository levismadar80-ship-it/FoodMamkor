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

// ─── MEH-1719 additions ──────────────────────────────────────────────────────
// The extractor above is correct for `lib/badges.js` and wrong for a COMPONENT,
// in two independent ways. Both were found by running it, not by reading it.

/**
 * Blank out quoted-string CONTENTS, keeping `${...}` interpolations (which are
 * real code, e.g. `${producer.name}`).
 *
 * Why: components carry i18n keys — `t("producer.card.badges.overflow_aria")`.
 * That is a string, not a property read, but a comment-only stripper reports
 * `card` as a producer field. This over-reports, which would demand a
 * declaration for a field that does not exist.
 */
function stripStringLiterals(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      out += ch;
      i += 1;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === "\\") i += 1;
        i += 1;
      }
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "`") {
      out += ch;
      i += 1;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "$" && src[i + 1] === "{") {
          out += "${";
          i += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === "{") depth += 1;
            if (src[i] === "}") {
              depth -= 1;
              if (depth === 0) break;
            }
            out += src[i];
            i += 1;
          }
          out += "}";
          i += 1;
          continue;
        }
        i += 1;
      }
      out += "`";
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Names that refer to the producer object in this file.
 *
 * Why: `MapProducerCard.jsx:48` does `const p = producer;` and then reads
 * `p.images`, `p.slug`, `p.avg_rating`, … everywhere. Matching only
 * `producer.X` finds ZERO fields in that file — a silent zero-match that
 * under-reports, which is the failure direction that lets the bug back in.
 * Deliberately narrow: only a direct `const <id> = producer;` alias. Anything
 * cleverer (destructuring, nested renames) would be guessing, and the
 * per-file floor below is what catches a file this fails to read.
 */
function producerNames(code) {
  const names = new Set(["producer"]);
  for (const m of code.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*producer\s*;/g)) {
    names.add(m[1]);
  }
  return names;
}

/** Every distinct producer field a COMPONENT reads, aliases resolved. */
function cardFieldsRead(src) {
  const code = stripStringLiterals(stripComments(src));
  const found = new Set();
  for (const name of producerNames(code)) {
    for (const m of code.matchAll(new RegExp(`\\b${name}\\.([A-Za-z_][A-Za-z0-9_]*)`, "g"))) {
      found.add(m[1]);
    }
  }
  return [...found].sort();
}

const CARD_PATHS = {
  "components/ProducerCard.jsx": path.join(process.cwd(), "components", "ProducerCard.jsx"),
  "components/MapProducerCard.jsx": path.join(process.cwd(), "components", "MapProducerCard.jsx"),
};

// The two fields ProducerSchema requires ON PURPOSE — see schemas.js:172-174.
// Held as an explicit set rather than an exception in the assertion so that a
// THIRD required field reds the dedicated test below instead of quietly
// joining an allowlist.
const REQUIRED_CORE = new Set(["id", "name"]);

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
    // MEH-2046: `delivers` is what earns the delivery badge now. The two legacy
    // operands stay on the fixture deliberately — this file's whole subject is
    // fields surviving the strict parse, and they are still declared in
    // ProducerSchema for their other consumers.
    delivers: true,
    has_delivery: true,
    delivery_count: 3,
    products_count: 12,
  };

  it("earns every badge BEFORE the parse (the fixture is well-formed)", () => {
    // Establishes that any loss below is the parse's doing, not a bad fixture.
    // MEH-1846: 12 → 11. The fixture still sets products_count: 12 on purpose —
    // it is now a field that earns nothing, so this count also asserts the
    // removal held.
    expect(allBadges(fixture).length).toBe(11);
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

// ─────────────────────────────────────────────────────────────────────────────
// 3. MEH-1719 SELF-TEST — the WIDENED extractor. Runs before the guard that
//    uses it, same rationale as section 0: a classifier that cannot sort its
//    inputs makes every later report worthless. Both cases below are real
//    shapes taken from the two files under test, not hypotheticals.
// ─────────────────────────────────────────────────────────────────────────────
describe("MEH-1719 self-test — the card extractor handles strings and aliases", () => {
  it("does NOT report an i18n key path as a producer field", () => {
    // The exact shape at ProducerCard.jsx:324 — `card` is a message namespace.
    const src = 't("producer.card.badges.overflow_aria"); return producer.trust_tier;';
    expect(cardFieldsRead(src)).toEqual(["trust_tier"]);
  });

  it("resolves a `const p = producer` alias", () => {
    // The exact shape at MapProducerCard.jsx:48. Without this the file yields
    // zero fields and the guard silently covers only ProducerCard.
    const src = "const p = producer;\nconst r = p.avg_rating;\nreturn p.slug;";
    expect(cardFieldsRead(src)).toEqual(["avg_rating", "slug"]);
  });

  it("keeps a field read inside a template interpolation", () => {
    expect(cardFieldsRead("const s = `${producer.name} — x`;")).toEqual(["name"]);
  });

  it("still drops comment-only mentions", () => {
    expect(cardFieldsRead("// producer.legacy_field is gone\nreturn producer.slug;")).toEqual([
      "slug",
    ]);
  });

  it("reports nothing for a file that never touches a producer", () => {
    expect(cardFieldsRead("const x = 1;")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MEH-1719 STRUCTURAL GUARD — derived from what the CARD consumes.
//
//    Section 1 derives its field list from `badges.js::earnsBadge`. That is
//    correct and too narrow: `trust_tier`, `favorites_count`,
//    `short_description` and friends are not badge inputs, so they sit outside
//    section 1's proof BY CONSTRUCTION — which is exactly how nine fields the
//    card renders stayed undeclared through the MEH-1704 fix.
// ─────────────────────────────────────────────────────────────────────────────
describe("MEH-1719 — ProducerSchema declares every field the card renders", () => {
  const declared = new Set(Object.keys(ProducerSchema.shape));

  for (const [label, filePath] of Object.entries(CARD_PATHS)) {
    const fieldsRead = cardFieldsRead(fs.readFileSync(filePath, "utf-8"));

    // PER FILE, not across the union: a union floor stays satisfied by
    // ProducerCard alone, so an extractor that silently reads nothing from
    // MapProducerCard would still pass. That is the MapProducerCard alias bug
    // this ticket found, turned into an assertion.
    it(`${label} — extractor finds fields at all (no silent zero-match)`, () => {
      expect(fieldsRead.length).toBeGreaterThanOrEqual(3);
    });

    it(`${label} — every field it reads is declared`, () => {
      const missing = fieldsRead.filter((f) => !declared.has(f));
      expect(
        missing,
        `undeclared in ProducerSchema (z.object strips these on the grid and /map): ${missing.join(", ")}`,
      ).toEqual([]);
    });

    it(`${label} — declared permissively (a card field can never drop a producer)`, () => {
      // REQUIRED_CORE is not a loophole, it is the documented contract:
      // `schemas.js:172-174` states that "only a structural mismatch (e.g.
      // name missing/non-string, or the whole payload not an array) fails the
      // parse". A producer with no id or no name IS structurally broken and
      // SHOULD drop out of the feed — that is the one case where dropping a
      // business is right. Every other field must tolerate undefined, because
      // the /map parse is all-or-nothing and a strict declaration there costs
      // a whole business rather than one missing dot.
      const rejects = fieldsRead.filter(
        (f) =>
          declared.has(f) &&
          !REQUIRED_CORE.has(f) &&
          !ProducerSchema.shape[f].safeParse(undefined).success,
      );
      expect(rejects, `card fields that reject undefined: ${rejects.join(", ")}`).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. MEH-1719 BEHAVIOURAL — the three fields the ticket names by hand.
//    `kashrut_badges` is NOT read by ProducerCard, so section 4 cannot reach
//    it; it is a MEH-1711 label input and only this assertion covers it.
// ─────────────────────────────────────────────────────────────────────────────
describe("MEH-1719 — card fields survive a ProducerSchema round-trip", () => {
  const fixture = {
    id: "2b2b2b2b-2222-4222-8222-222222222222",
    name: "משק הבוסתן",
    trust_tier: 5,
    favorites_count: 12,
    kashrut_badges: ["chalak"],
    short_description: "גבינות עיזים מהחווה",
    availability_state: "available_today",
    has_physical_location: false,
    offers_delivery: true,
  };

  it("keeps trust_tier, favorites_count and kashrut_badges intact", () => {
    const parsed = ProducerSchema.parse(fixture);
    expect(parsed.trust_tier).toBe(5);
    expect(parsed.favorites_count).toBe(12);
    expect(parsed.kashrut_badges).toEqual(["chalak"]);
  });

  it("crosses the TrustBadge gate after the parse (ProducerCard.jsx:353)", () => {
    // The behaviour, not just the value: before this ticket the parsed
    // producer fell back to `?? 1` and the badge could never render.
    const parsed = ProducerSchema.parse(fixture);
    expect((parsed.trust_tier ?? 1) >= 4).toBe(true);
  });

  it("loses no card field at all to the parse", () => {
    const parsed = ProducerSchema.parse(fixture);
    const lost = Object.keys(fixture).filter((k) => !(k in parsed));
    expect(lost, `stripped by ProducerSchema: ${lost.join(", ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. MEH-1719 — REQUIRED_CORE is exactly two fields, and stays that way.
//    Without this, REQUIRED_CORE degrades into an allowlist: a future strict
//    declaration could be "fixed" by adding its name to the set, which is the
//    quarantine-lifting anti-pattern .claude/rules/testing.md warns about.
// ─────────────────────────────────────────────────────────────────────────────
describe("MEH-1719 — the required core stays exactly {id, name}", () => {
  it("has no third required field in ProducerSchema", () => {
    const required = Object.keys(ProducerSchema.shape).filter(
      (k) => !ProducerSchema.shape[k].safeParse(undefined).success,
    );
    expect(required.sort(), "a new required field drops whole producers from the all-or-nothing /map parse").toEqual([
      "id",
      "name",
    ]);
  });
});
