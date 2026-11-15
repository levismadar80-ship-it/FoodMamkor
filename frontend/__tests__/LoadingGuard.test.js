/**
 * MEH-3068 — loading states come from two owners:
 *   - a loading bar / box: <SkeletonBlock> (or a shaped skeleton) in
 *     components/Skeleton.jsx — the only file that may write `animate-pulse`;
 *   - a spinner: components/ButtonSpinner.jsx — the only file that may write
 *     `animate-spin` (ui/Button renders it too).
 * Before 13/11: 35 hand-written pulse bars in 16 files (four colours) and six
 * hand-made spinners (an inline SVG, a spinning border, spinning Crosshair and
 * CircleNotch icons).
 *
 * EXEMPT is the one pulse that is not a loading placeholder.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components"];

const PULSE_OWNER = "components/Skeleton.jsx";
const SPIN_OWNER = "components/ButtonSpinner.jsx";
const EXEMPT_PULSE = {
  "components/ChatWidget.jsx": "the three typing dots while the assistant answers",
};

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
const byRel = Object.fromEntries(files.map((f) => [f.rel, f.src]));

describe("LoadingGuard (MEH-3068)", () => {
  it("scans a real corpus (control)", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(byRel[PULSE_OWNER]).toMatch(/animate-pulse/);
    expect(byRel[SPIN_OWNER]).toMatch(/animate-spin/);
    for (const f of Object.keys(EXEMPT_PULSE)) expect(byRel[f]).toMatch(/animate-pulse/);
  });

  it("animate-pulse only in Skeleton.jsx", () => {
    const offenders = files
      .filter((f) => f.rel !== PULSE_OWNER && !EXEMPT_PULSE[f.rel])
      .filter((f) => /animate-pulse/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("animate-spin only in ButtonSpinner.jsx", () => {
    const offenders = files
      .filter((f) => f.rel !== SPIN_OWNER)
      .filter((f) => /animate-spin/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("ui/Button's loading state is ButtonSpinner", () => {
    expect(byRel["components/ui/Button.jsx"]).toMatch(/<ButtonSpinner\b/);
  });
});
