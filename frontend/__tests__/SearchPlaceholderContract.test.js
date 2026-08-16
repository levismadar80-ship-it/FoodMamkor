import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// MEH-1800 — Search Placeholder Contract, structural half.
//
// A search placeholder teaches the user what the field accepts, so a string
// that returns ZERO results does not merely fail to help — it teaches a lie.
// MEH-1690 replaced three rotted strings and added no guard, so the next card
// touching copy or data would have restored the state (MEH-1800 §2).
//
// THE SPLIT — why this file is only half the guard
//   A placeholder can return zero for two unrelated reasons:
//     (a) STRUCTURAL — the string cannot match anything no matter what is in
//         the database. Deterministic, decidable from the string alone, and
//         therefore safe to block a PR on. That is what this file checks.
//     (b) DATA ROT — the string is well formed but the catalogue moved under
//         it ("גבינת עיזים" once matched; "עיזים" is in no field today).
//         Only the live search can answer that, so blocking a PR on it would
//         redden PRs for reasons that are not their fault — the flake class
//         MEH-1792 closed. That half is scripts/check_placeholder_search.py,
//         run periodically, reporting rather than blocking (MEH-1800 §3, ב).
//
//   Neither half subsumes the other, and this one is NOT the important one —
//   it is the one that is free. Read it as a lint, not as evidence that the
//   placeholders work.
//
// Implemented as a vitest test rather than a .github/workflows step because
// .github/workflows/** is CC-deny (MEH-671) and vitest already gates every PR.
// Same precedent as LabelScopeContract.test.js (MEH-1507) and the MEH-1472
// emoji guard.

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const REGISTRY = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "scripts", "search-placeholder-keys.json"), "utf8")
);
const MESSAGES = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, REGISTRY.messagesFile), "utf8")
);

// backend/app/utils/hebrew_search.py:59 — a query is split on whitespace and
// capped at MAX_TOKENS. Tokens past the cap are silently dropped, so a longer
// placeholder DISPLAYS a query the backend never runs.
const MAX_TOKENS = 5;

// Characters that cannot appear inside a producer / product / city / category
// name, and therefore cannot appear inside a token. The tokenizer splits on
// whitespace ONLY, so punctuation stays glued to its token: "מחמצת," becomes
// the pattern "%מחמצת,%", which no row can satisfy. That single mechanic is
// what made all three of MEH-1800 §4's comma-separated example lists return
// zero — the list form is unanswerable BY CONSTRUCTION under AND-over-tokens,
// which is why the fix is a single example rather than a shorter list.
//
// Deliberately narrow: separators and terminators, not "all punctuation".
// Apostrophes and hyphens DO occur in real names (מ'עילא, grass-fed).
//
// ACCEPTED FALSE POSITIVE — "." is on the list for the trailing-ellipsis form
// ("חפשו לחם מחמצת…", en.json's "…grass-fed beef..."), which really does
// return zero. A business name with internal periods ("י.ח. גבינות") used as
// a placeholder would be flagged even though it works. That direction is the
// safe one — a visible red naming the exact token, not a silent pass — and the
// fix is to drop the key from the registry, which shows up in the diff.
const UNANSWERABLE_CHARS = [",", ".", "…", ";", ":", "|", "/", "\\", "!", "?"];

// The registry is the guard's only subject list. A truncated or emptied one
// would let every assertion below pass having checked nothing — the
// count()===0 silent-pass shape (.claude/rules/testing.md, MEH-1698).
const MIN_REGISTERED_PLACEHOLDERS = 7;

function lookup(obj, dottedKey) {
  return dottedKey
    .split(".")
    .reduce((node, part) => (node === null || node === undefined ? undefined : node[part]), obj);
}

// The classifier under test. Returns [] for an answerable placeholder, else
// one string per problem. Exercised directly by the self-test below — per
// .claude/rules/testing.md, a guard whose assertion is a classifier ships a
// self-test against the REAL implementation, never a copy.
export function unanswerableReasons(value) {
  const problems = [];
  if (typeof value !== "string" || value.trim() === "") {
    return [`not a non-empty string: ${JSON.stringify(value)}`];
  }
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length > MAX_TOKENS) {
    problems.push(
      `${tokens.length} tokens > MAX_TOKENS ${MAX_TOKENS} — the backend drops the ` +
        `rest, so the displayed string is not the query it runs`
    );
  }
  for (const token of tokens) {
    const bad = UNANSWERABLE_CHARS.filter((ch) => token.includes(ch));
    if (bad.length > 0) {
      problems.push(
        `token ${JSON.stringify(token)} carries ${bad.map((ch) => JSON.stringify(ch)).join(", ")} — ` +
          `the pattern "%${token}%" cannot match any field`
      );
    }
  }
  return problems;
}

describe("SearchPlaceholderContract — self-test (run FIRST)", () => {
  // If the classifier cannot separate a correct string from a broken one,
  // nothing it reports afterwards is worth reading. Three synthetic inputs:
  // correct / regression-shaped / neutral, asserted on how it SORTS them.
  it("accepts the shipped single-example strings", () => {
    for (const good of ["לחם מחמצת", "מאפיית המחמצת", "לחמים ואפייה", "זכרון יעקב"]) {
      expect(unanswerableReasons(good), good).toEqual([]);
    }
  });

  it("rejects the exact strings MEH-1800 measured at zero on staging", () => {
    // Regression-shaped: these three were live and returned 0/0/0/0.
    for (const broken of [
      "לחם מחמצת, ביצים אורגניות, ירקות ופירות",
      "לחם מחמצת, גבינת עזים, ירקות אורגניים",
      "Search fresh veggies, grass-fed beef...",
    ]) {
      expect(unanswerableReasons(broken).length, broken).toBeGreaterThan(0);
    }
  });

  it("rejects an over-long query the backend would truncate", () => {
    expect(unanswerableReasons("א ב ג ד ה ו ז").length).toBeGreaterThan(0);
  });

  it("does NOT reject names carrying legitimate hyphens or apostrophes", () => {
    // Neutral input — proves the rule is about separators, not punctuation.
    expect(unanswerableReasons("גבינת מ'עילא")).toEqual([]);
  });

  it("cannot be satisfied by an empty registry", () => {
    expect(Array.isArray(REGISTRY.keys)).toBe(true);
    expect(REGISTRY.keys.length).toBeGreaterThanOrEqual(MIN_REGISTERED_PLACEHOLDERS);
  });
});

describe("SearchPlaceholderContract — every registered placeholder", () => {
  it("resolves to a string in the messages file", () => {
    const missing = REGISTRY.keys.filter((key) => typeof lookup(MESSAGES, key) !== "string");
    expect(missing, `keys absent from ${REGISTRY.messagesFile}`).toEqual([]);
  });

  // "Structurally sound", NOT "returns results" — this half cannot know the
  // latter, and a name promising it would be the over-claim the split above
  // exists to avoid. scripts/check_placeholder_search.py answers that.
  it("is a query the backend can actually run, in full", () => {
    const failures = [];
    for (const key of REGISTRY.keys) {
      for (const reason of unanswerableReasons(lookup(MESSAGES, key))) {
        failures.push(`${REGISTRY.messagesFile} → ${key}: ${reason}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
