/**
 * MEH-1687 batch B (colour swaps, ruling «⚖️ 03/11» §1) — public surfaces spell
 * error red and warning gold as tokens, not as palette shades / raw hex.
 *
 *   text-red-500 (#ef4444)  → text-error  (#b3261e, the semantic error token)
 *   #8B6914 (removed gold, 4.48:1 on cream, sub-AA) → text-accent (#896714)
 *
 * Scope = the audit's: frontend/{app,components,lib} minus /admin/ and
 * /dashboard/ (those carry e2e specs that assert the old class — a separate
 * surface, not swept here).
 *
 * Documented exception: components/PasswordStrength.jsx. The ruling says the
 * strength palette moves only if error/warning/success tokens all exist; there
 * was no warning token then, so the palette stayed as-is (ADR-038 later renamed
 * its shades to danger-500 / warning-500 at identical values). It doubles as the positive control below: the regex must still SEE
 * its text-red-500, or the walk is blind and a null proves nothing.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const EXCEPTION = "components/PasswordStrength.jsx";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = ["app", "components", "lib"]
  .flatMap((d) => walk(path.join(ROOT, d)))
  .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  .filter((rel) => !/\/(admin|dashboard)\//.test(rel));

// ADR-038 renamed red-N to danger-N at identical values; `text-danger-500` is
// the same #ef4444, so it is still not the error token on a public surface.
const RED = /\btext-(?:red|danger)-500\b/g;
// A quoted literal only — the ProducerHeader comment that NAMES the old gold
// ("the pre-revision #8B6914 failed") is history, not a rendered colour.
const OLD_GOLD = /["'`]#8B6914["'`]/gi;

describe("MEH-1687 B — error/accent colours are tokens on public surfaces", () => {
  it("corpus control: the walk is non-empty and the exception is visible to the regex", () => {
    expect(files.length, "corpus control").toBeGreaterThan(200);
    const exc = fs.readFileSync(path.join(ROOT, EXCEPTION), "utf8");
    expect((exc.match(RED) || []).length, "positive control: PasswordStrength still red-500").toBeGreaterThan(0);
  });

  it("no text-red-500 outside the PasswordStrength exception", () => {
    const offenders = [];
    let errorToken = 0;
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (/\btext-error\b/.test(src)) errorToken += 1;
      if (rel === EXCEPTION) continue;
      src.split("\n").forEach((line, i) => {
        if (RED.test(line)) offenders.push(`${rel}:${i + 1}`);
        RED.lastIndex = 0;
      });
    }
    expect(errorToken, "control: text-error is in use somewhere").toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("no rendered #8B6914 literal", () => {
    const offenders = [];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      src.split("\n").forEach((line, i) => {
        if (OLD_GOLD.test(line)) offenders.push(`${rel}:${i + 1}`);
        OLD_GOLD.lastIndex = 0;
      });
    }
    expect(offenders).toEqual([]);
  });
});
