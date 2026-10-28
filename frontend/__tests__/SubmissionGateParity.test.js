/**
 * MEH-2100 — the client submit gate must speak the SAME code strings as the
 * server.
 *
 * WHY THIS EXISTS. lib/submission-gate.js is a deliberate second
 * implementation of backend/app/services/submission_gate.py: without it the
 * only way to know what is missing is to POST and read the 422, so the CTA
 * would always be enabled and the owner would discover the gate by failing it.
 * The duplication is bounded, but the CODES cross the API boundary — they come
 * back in `detail.params.missing` and the banner keys its rows off them. A
 * rename on either side would silently stop matching: the server would reject
 * with `product` while the client looked for `products`, and the banner would
 * render an empty list next to a failing submit.
 *
 * So this test reads the BACKEND SOURCE and requires the two sets to be equal.
 * It is not a mirror of the JS constants (that would be tautological); it
 * parses the Python module, which is the only thing that makes it a parity
 * check rather than a restatement.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ORGANIZER_SUBMISSION_REQUIREMENTS,
  SUBMISSION_REQUIREMENTS,
} from "@/lib/submission-gate";
import { DEFAULT_PRODUCER_DESCRIPTIONS } from "@/lib/producer-completeness";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_GATE = path.join(
  HERE,
  "..",
  "..",
  "backend",
  "app",
  "services",
  "submission_gate.py",
);

/** Pull `MISSING_X = "code"` assignments out of the Python module. */
function backendCodes(source) {
  return [...source.matchAll(/^MISSING_[A-Z_]+\s*=\s*"([a-z_]+)"$/gm)].map(
    (m) => m[1],
  );
}

describe("MEH-2100 submit-gate parity — client codes match the server", () => {
  const source = readFileSync(BACKEND_GATE, "utf8");

  // Run FIRST: a parser that silently matches nothing would make every
  // assertion below vacuously true, which is exactly the null-that-reassures
  // failure this repo keeps getting caught by.
  it("self-test: the parser actually finds codes in the real module", () => {
    const found = backendCodes(source);
    expect(found.length).toBeGreaterThanOrEqual(5);
    expect(found).toContain("phone_verified");

    // And it discriminates — a module without the assignments yields nothing.
    expect(backendCodes("# nothing here\nFOO = 1\n")).toEqual([]);
  });

  it("the two sides declare the same set of requirement codes", () => {
    expect([...backendCodes(source)].sort()).toEqual(
      [...SUBMISSION_REQUIREMENTS].sort(),
    );
  });

  it("the client's canonical order matches the server's tuple order", () => {
    // Order is what the owner reads her remaining items in; the backend
    // declares it in SUBMISSION_REQUIREMENTS and the banner renders in the
    // client's order. Different orders would not break anything, but they
    // would make the email and the dashboard disagree about what to do first.
    // Guarded parse. Without this, a reformatted annotation (or a dropped
    // type hint) makes split()[1] undefined and the next .split() throws an
    // uncaught TypeError — a stack trace instead of a legible "the parser
    // stopped matching" failure. Same class as the self-test above: a probe
    // that silently stops seeing its subject must say so.
    // (adversarial review, MEH-2100/#2987.)
    const [, afterMarker] = source.split(/^SUBMISSION_REQUIREMENTS[^=]*=\s*\(/m);
    expect(
      afterMarker,
      "could not locate SUBMISSION_REQUIREMENTS in the backend module — the " +
        "parser has stopped matching, so this file is no longer checking parity",
    ).toBeDefined();
    const tuple = afterMarker.split(")")[0];
    const serverOrder = [...tuple.matchAll(/MISSING_([A-Z_]+)/g)].map((m) =>
      m[1].toLowerCase(),
    );
    expect(
      serverOrder.length,
      "parsed zero codes from the tuple — a vacuous pass",
    ).toBeGreaterThan(0);
    expect(serverOrder.length).toBe(SUBMISSION_REQUIREMENTS.length);
    expect(serverOrder).toEqual(SUBMISSION_REQUIREMENTS);
  });
});

/** `ORGANIZER_MISSING_X = "code"` assignments (MEH-2460). */
function organizerOnlyCodes(source) {
  return Object.fromEntries(
    [...source.matchAll(/^ORGANIZER_(MISSING_[A-Z_]+)\s*=\s*"([a-z_]+)"$/gm)].map(
      (m) => [m[1], m[2]],
    ),
  );
}

/** The ordered codes of the server's ORGANIZER_SUBMISSION_REQUIREMENTS tuple,
 *  resolved through both the shared MISSING_* and the ORGANIZER_MISSING_*
 *  assignments. null when the tuple cannot be located. */
function organizerServerOrder(source) {
  const [, after] = source.split(/^ORGANIZER_SUBMISSION_REQUIREMENTS[^=]*=\s*\(/m);
  if (after === undefined) return null;
  const shared = Object.fromEntries(
    [...source.matchAll(/^(MISSING_[A-Z_]+)\s*=\s*"([a-z_]+)"$/gm)].map((m) => [m[1], m[2]]),
  );
  const own = organizerOnlyCodes(source);
  return [...after.split(")")[0].matchAll(/(ORGANIZER_)?(MISSING_[A-Z_]+)/g)].map((m) =>
    m[1] ? own[m[2]] : shared[m[2]],
  );
}

/** The strings inside `DEFAULT_PRODUCER_DESCRIPTIONS ... frozenset({ ... })`. */
function backendPlaceholders(source) {
  const [, after] = source.split(/^DEFAULT_PRODUCER_DESCRIPTIONS[^=]*=\s*frozenset\(/m);
  if (after === undefined) return null;
  // The set literal closes with `}` on its own line (ruff format), so cut at the
  // first `}` — cutting at `})` read on into the rest of the module.
  return [...after.split("}")[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("MEH-2460 organizer gate parity — client mirrors server", () => {
  const source = readFileSync(BACKEND_GATE, "utf8");

  it("self-test: the organizer parsers find the real module's values and nothing in a blank one", () => {
    expect(organizerServerOrder(source)?.length).toBeGreaterThanOrEqual(4);
    expect(organizerServerOrder(source)).not.toContain(undefined);
    expect(backendPlaceholders(source)).toHaveLength(2);
    expect(organizerServerOrder("FOO = 1\n")).toBeNull();
    expect(backendPlaceholders("FOO = 1\n")).toBeNull();
  });

  it("the client's organizer requirements equal the server tuple, in order", () => {
    expect(ORGANIZER_SUBMISSION_REQUIREMENTS).toEqual(organizerServerOrder(source));
  });

  it("the placeholder descriptions the gate rejects are the same on both sides", () => {
    expect([...DEFAULT_PRODUCER_DESCRIPTIONS].sort()).toEqual(
      [...backendPlaceholders(source)].sort(),
    );
  });
});
