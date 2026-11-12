/**
 * MEH-3012 — every tool in lib/business-features.js is placed in the site
 * chat's knowledge map, backend/app/services/chat_feature_coverage.py.
 *
 * Why this lives in vitest as well as pytest: a PR that only adds a tool to
 * the registry touches frontend/** alone, and pr-checks.yml runs pytest only
 * on backend/** or tests/** changes. Without this file such a PR would skip
 * the guard entirely — the exact way MEH-3004 happened. The pytest twin
 * (tests/test_meh3012_chat_feature_coverage.py) also checks that each
 * COVERED anchor is really in the chat's knowledge.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BUSINESS_FEATURES } from "../lib/business-features";

const COVERAGE = path.resolve(
  __dirname,
  "../../backend/app/services/chat_feature_coverage.py",
);

/** Keys of the three dicts, read as text — no Python runtime here. */
function coverageKeys(source) {
  const keys = [];
  for (const name of ["COVERED", "PENDING_COPY", "NOT_FOR_CHAT"]) {
    const block = source.match(
      new RegExp(`^${name}: dict\\[str, str\\] = \\{([\\s\\S]*?)^\\}`, "m"),
    );
    if (!block) throw new Error(`${name} not found in ${COVERAGE}`);
    for (const m of block[1].matchAll(/^\s*"([a-z0-9_]+)":/gm)) keys.push(m[1]);
  }
  return keys;
}

describe("chat feature coverage (MEH-3012)", () => {
  const source = fs.readFileSync(COVERAGE, "utf8");

  it("self-test: the parser reads the real file and a synthetic one", () => {
    const keys = coverageKeys(source);
    // Anchored to entries that exist in each map, so an empty parse is red.
    expect(keys).toContain("group_buys"); // COVERED
    expect(keys).toContain("experiences"); // PENDING_COPY
    expect(keys).toContain("completeness"); // NOT_FOR_CHAT
    const synthetic = [
      'COVERED: dict[str, str] = {\n    "a": "x",\n}',
      'PENDING_COPY: dict[str, str] = {\n    # "commented": "no",\n    "b": "y",\n}',
      'NOT_FOR_CHAT: dict[str, str] = {\n    "c": _X,\n}',
    ].join("\n");
    expect(coverageKeys(synthetic)).toEqual(["a", "b", "c"]);
  });

  it("every registry tool is placed exactly once, and nothing stale", () => {
    const keys = coverageKeys(source);
    const ids = BUSINESS_FEATURES.map((f) => f.id);
    const missing = ids.filter((id) => !keys.includes(id));
    expect(
      missing,
      "add each new tool to COVERED, PENDING_COPY or NOT_FOR_CHAT in backend/app/services/chat_feature_coverage.py",
    ).toEqual([]);
    expect(keys.filter((k) => !ids.includes(k))).toEqual([]);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });
});
