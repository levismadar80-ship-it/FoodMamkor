/**
 * MEH-2093 chunk B — full-screen dialogs must sit in the modal tier, not at z-50.
 *
 * 14 dialogs rendered `fixed inset-0 … z-50`. None is portaled, and neither
 * `<body>` (`flex flex-col`) nor `<main>` (`flex-1 focus:outline-none`) creates a
 * stacking context, so all of them competed in the ROOT stacking context against
 * the sticky header (z-1050) and the mobile BottomNav (z-1000) — and lost. The
 * overlay dimmed the page while the navigation floated bright on top of it.
 *
 * This guard is an ABSENCE assertion, so it carries the two things an absence
 * assertion needs to mean anything:
 *   1. a CONTROL that proves the scanner can see the pattern at all (a null from
 *      a dead scanner is indistinguishable from a clean tree), and
 *   2. a derived count — never a literal — so adding a dialog moves the number.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components"];

/** Every .js/.jsx file under the scanned dirs. */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
    }
  };
  for (const d of DIRS) walk(path.join(ROOT, d));
  return out;
}

/** Lines where a full-screen overlay carries the bare Tailwind `z-50`. */
function offendingLines(files, text = null) {
  const hits = [];
  for (const f of files) {
    const src = text ?? fs.readFileSync(f, "utf8");
    src.split("\n").forEach((line, i) => {
      if (line.includes("fixed inset-0") && /(?<![\w-])z-50(?![\w-])/.test(line)) {
        hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
      }
    });
    if (text) break;
  }
  return hits;
}

describe("full-screen dialog z-tier (MEH-2093 chunk B)", () => {
  it("CONTROL — the scanner detects the pattern on a known-bad line", () => {
    // Run this FIRST. If the scanner cannot find the pattern in a string that
    // definitely contains it, the zero-count assertion below is meaningless.
    const bad = '        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">';
    expect(offendingLines(["<synthetic>"], bad)).toHaveLength(1);

    // ...and does NOT fire on the tier the dialogs were moved to, nor on a
    // non-overlay z-50 (an absolute dropdown), which must stay untouched.
    expect(offendingLines(["<synthetic>"], bad.replace("z-50", "z-[9000]"))).toHaveLength(0);
    expect(offendingLines(["<synthetic>"], '<ul className="absolute z-50 mt-1 w-full">')).toHaveLength(0);
  });

  it("ANCHOR — the scanner reads the real tree, not just synthetic strings", () => {
    // A probe green against shapes it invented proves nothing about this repo.
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(100);
    // The tier the dialogs moved to must actually be present in the real files,
    // otherwise the zero below could just mean "nothing was scanned".
    const withTier = files.filter((f) => fs.readFileSync(f, "utf8").includes("z-[9000]"));
    expect(withTier.length).toBeGreaterThan(0);
  });

  it("no full-screen overlay is left at z-50", () => {
    const hits = offendingLines(sourceFiles());
    // Derived, not stated: adding one dialog at z-50 makes this fail and names it.
    expect(hits, `full-screen overlays still at z-50:\n${hits.join("\n")}`).toEqual([]);
  });
});
