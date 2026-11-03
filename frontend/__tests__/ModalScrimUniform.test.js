/**
 * MEH-1687 batch D (ruling «⚖️ 03/11» §3) — one scrim for every modal:
 * `bg-black/40`, no blur.
 *
 * The ruling: LocationModal's `bg-primary/10` is too weak at 1440, and the
 * scrims should be uniform across all modals (Material ≈32%, Tailwind UI 75%
 * grey — 40% black in between). Before this, the `fixed inset-0` overlays
 * carried five different scrims: black/40, black/50, black/60, green-900/50
 * and primary/10.
 *
 * Rule: every class string containing `fixed inset-0` whose BASE background
 * (no `sm:`/`lg:` variant prefix) is set must set it to `bg-black/40`.
 * Responsive variants are left alone (FilterSheet's `lg:bg-transparent` is the
 * desktop side panel, which has no scrim by design). The sticky header glass is
 * not a `fixed inset-0` overlay (ADR-023) and is not seen here; blur is guarded
 * by the sibling ModalOverlayNoBlur.test.js.
 *
 * Two `fixed inset-0` surfaces are NOT scrims and are exempt by value:
 *   - components/Lightbox.jsx  bg-black/95 — the immersive photo viewer
 *   - components/MiniMap.jsx   bg-white    — the full-screen map surface
 * They double as the positive control: the walk must find both, so a regex
 * that sees nothing cannot pass as clean.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SCRIM = "bg-black/40";
const EXEMPT = {
  "components/Lightbox.jsx": "bg-black/95",
  "components/MiniMap.jsx": "bg-white",
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// The base (un-prefixed) bg-* utility of a class string, or null.
function baseBg(cls) {
  const hit = cls.split(/\s+/).filter((c) => /^bg-/.test(c));
  return hit.length ? hit : null;
}

describe("MEH-1687 D — every modal scrim is bg-black/40", () => {
  it("all fixed inset-0 overlays use the one scrim (exempt non-scrims aside)", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    let scrims = 0;
    const exemptSeen = new Set();
    const offenders = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      for (const m of fs.readFileSync(f, "utf8").matchAll(/(["'`])([^"'`]*\bfixed inset-0\b[^"'`]*)\1/g)) {
        const bgs = baseBg(m[2]);
        if (!bgs) continue; // no background at all (e.g. a pointer-events-none layer)
        if (EXEMPT[rel] && bgs.includes(EXEMPT[rel])) {
          exemptSeen.add(rel);
          continue;
        }
        scrims += 1;
        if (bgs.length !== 1 || bgs[0] !== SCRIM) offenders.push(`${rel}: ${bgs.join(" ")}`);
      }
    }
    expect(scrims, "corpus control: scrims must be found").toBeGreaterThanOrEqual(15);
    expect([...exemptSeen].sort(), "positive control: both exempt surfaces seen").toEqual(Object.keys(EXEMPT).sort());
    expect(offenders).toEqual([]);
  });
});
