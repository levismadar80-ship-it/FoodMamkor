/**
 * MEH-3065 — every on/off switch on the site draws its track from
 * components/ui/Switch.jsx (<Switch> or <SwitchTrack>), never by hand.
 *
 * Two checks, each naming the file it fails on:
 *  1. A file that writes role="switch" must import from "@/components/ui/Switch"
 *     — a row that is itself the switch button keeps its own <button> and puts
 *     <SwitchTrack> inside it. (FilterSheet's diet pills keep role="switch"
 *     drawn as pills, MEH-1508; the file imports SwitchTrack for its rows.)
 *  2. No file outside ui/Switch.jsx draws the knob: a round `bg-surface shadow`
 *     span next to start-1/end-1 or translate-x — the signature of a
 *     hand-written track (13 of them before 13/11; the three in
 *     /admin/settings slid the knob with a physical transform, the wrong way
 *     in Hebrew).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components"];
const OWNER = "components/ui/Switch.jsx";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d))).map((p) => ({
  rel: path.relative(ROOT, p).split(path.sep).join("/"),
  src: fs.readFileSync(p, "utf8"),
}));

const KNOB = /(?:w-4 h-4|h-5 w-5) rounded-full bg-surface shadow(?:-sm)?[^`]{0,120}(?:start-1|end-1|translate-x)/;

describe("SwitchGuard (MEH-3065)", () => {
  it("scans a real corpus (control)", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.rel === OWNER)).toBe(true);
    // the owner itself must match the knob signature, or check 2 is blind
    expect(KNOB.test(files.find((f) => f.rel === OWNER).src)).toBe(true);
  });

  it("every file with role=\"switch\" uses ui/Switch", () => {
    const offenders = files
      .filter((f) => f.rel !== OWNER)
      .filter((f) => /role="switch"/.test(f.src))
      .filter((f) => !/from ["']@\/components\/ui\/Switch["']/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("no hand-drawn switch knob outside ui/Switch.jsx", () => {
    const offenders = files
      .filter((f) => f.rel !== OWNER)
      .filter((f) => KNOB.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("the track moves by logical inset, never translate-x", () => {
    const owner = files.find((f) => f.rel === OWNER).src;
    expect(owner).toMatch(/on \? "end-1" : "start-1"/);
    expect(owner).not.toMatch(/translate-x/);
  });
});
