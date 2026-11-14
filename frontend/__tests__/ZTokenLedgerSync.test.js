/**
 * MEH-2093 chunk C — the z-index ledger must actually mirror the code.
 *
 * `.claude/rules/rtl.md` states "Code is the source of truth; this ledger
 * mirrors it". Before this guard that was a promise: 7 live values were absent
 * from the table, and chunks A and B of this ticket both happened *because*
 * nobody could consult a table that was wrong. A ledger that silently drifts is
 * worse than no ledger — it hands the next reader false confidence.
 *
 * MEH-3169 replaced every literal (bracketed Tailwind values, `z-index: 1000`,
 * `zIndex: 9999`) with a NAMED token from the one `Z_INDEX` object in
 * tailwind.config.js: a class `z-<name>` or a property `var(--z-<name>)`. The
 * ledger rows are now names, and this guard checks three sources against each
 * other:
 *   - the scale (tailwind.config.js)  — what each name is worth
 *   - the code (app/ + components/)   — where each name is used, and how often
 *   - the ledger (rtl.md table)       — what the docs claim about both
 *
 * Set equality is asserted in BOTH directions, and every parser carries a
 * control, because these are absence assertions facing each other and any one
 * of them silently returning nothing would make the comparison trivially pass.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import tailwindConfig from "../tailwind.config.js";

const FRONTEND = path.resolve(__dirname, "..");
const LEDGER = path.resolve(FRONTEND, "..", ".claude", "rules", "rtl.md");
const SCALE = tailwindConfig.theme.extend.zIndex;

/** A line that is purely a comment carries prose about a token, not a usage. */
const isComment = (l) => l.trim().startsWith("*") || l.trim().startsWith("//") ||
  l.trim().startsWith("/*") || l.trim().startsWith("{/*");

/**
 * Token uses on one source line: `z-<name>` classes whose name is in the scale
 * (any variant prefix, e.g. `focus:z-skip-link`) and every `var(--z-<name>)`.
 * A `var(--z-…)` name is reported even when the scale lacks it — that is an
 * undefined property, and the "defined in the scale" test fails on it.
 */
function usesOnLine(line) {
  if (isComment(line)) return [];
  const out = [];
  for (const m of line.matchAll(/(?<![\w-])z-([a-z][a-z0-9-]*)(?![\w-])/g)) {
    if (m[1] in SCALE) out.push(m[1]);
  }
  for (const m of line.matchAll(/var\(--z-([a-z0-9-]+)\)/g)) out.push(m[1]);
  return out;
}

/** Every token used in app/ + components/ (.js/.jsx/.css), with its owners. */
function tokensInCode() {
  const found = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|jsx|css)$/.test(e.name)) continue;
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        for (const name of usesOnLine(line)) {
          if (!found.has(name)) found.set(name, []);
          found.get(name).push(`${path.relative(FRONTEND, p)}:${i + 1}`);
        }
      });
    }
  };
  for (const d of ["app", "components"]) walk(path.join(FRONTEND, d));
  return found;
}

/**
 * Rows of the ledger table — not names merely mentioned in prose.
 * Returns name -> { value, n } as the table states them, so both are checkable.
 */
function ledgerRows() {
  const md = fs.readFileSync(LEDGER, "utf8");
  return new Map(
    [...md.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/gm)]
      .map((m) => [m[1], { value: Number(m[2]), n: Number(m[3]) }]),
  );
}

describe("z-index ledger ↔ scale ↔ code (MEH-2093 chunk C · MEH-3169)", () => {
  it("CONTROL — every parser actually finds things", () => {
    expect(Object.keys(SCALE).length, "tailwind.config.js has no zIndex scale").toBeGreaterThan(15);
    expect(tokensInCode().size, "code scanner found no z tokens at all").toBeGreaterThan(15);
    expect(ledgerRows().size, "ledger parser found no table rows at all").toBeGreaterThan(15);
    // The line scanner must see a class and a property, and must ignore a
    // comment-only mention of the same tokens.
    expect(usesOnLine('<div className="fixed inset-0 z-modal" />')).toEqual(["modal"]);
    expect(usesOnLine("  z-index: var(--z-cursor);")).toEqual(["cursor"]);
    expect(usesOnLine("  // the z-modal tier, var(--z-cursor) above it")).toEqual([]);
    // `z-modal-interrupt` is its own token, not a `z-modal` use.
    expect(usesOnLine('className="z-modal-interrupt"')).toEqual(["modal-interrupt"]);
  });

  it("every token in the scale is used in code (no dead name)", () => {
    const code = tokensInCode();
    const dead = Object.keys(SCALE).filter((name) => !code.has(name));
    expect(dead, `zIndex tokens in tailwind.config.js that nothing uses:\n  ${dead.join("\n  ")}`).toEqual([]);
  });

  it("every var(--z-…) used in code is defined in the scale", () => {
    const unknown = [...tokensInCode()].filter(([name]) => !(name in SCALE))
      .map(([name, at]) => `  var(--z-${name})  e.g. ${at[0]}`);
    expect(unknown, `undefined z properties (they render as no z-index at all):\n${unknown.join("\n")}`).toEqual([]);
  });

  it("every token used in code is recorded in the ledger", () => {
    const code = tokensInCode();
    const ledger = ledgerRows();
    const missing = [...code.keys()].filter((name) => !ledger.has(name)).sort();
    expect(
      missing,
      `z tokens used in code but absent from .claude/rules/rtl.md:\n` +
        missing.map((name) => `  ${name}  e.g. ${code.get(name)[0]}`).join("\n"),
    ).toEqual([]);
  });

  it("every token in the ledger is still used in code", () => {
    const code = tokensInCode();
    const stale = [...ledgerRows().keys()].filter((name) => !code.has(name)).sort();
    expect(stale, `z tokens in the ledger that nothing uses any more:\n  ${stale.join("\n  ")}`).toEqual([]);
  });

  it("each row's value is the scale's value", () => {
    const wrong = [...ledgerRows()]
      .filter(([name, { value }]) => name in SCALE && Number(SCALE[name]) !== value)
      .map(([name, { value }]) => `  ${name}: table says ${value}, tailwind.config.js has ${SCALE[name]}`);
    expect(wrong, `ledger values out of date:\n${wrong.join("\n")}`).toEqual([]);
  });

  it("each row's occurrence count is the real one", () => {
    // The `n` column is a STATED number, which is the shape that goes stale
    // silently — chunk B alone moved the modal tier from 6 to 20. Checking it
    // here turns the column into a claim the suite refuses to let drift.
    const code = tokensInCode();
    const wrong = [...ledgerRows()]
      .filter(([name, { n }]) => code.has(name) && code.get(name).length !== n)
      .map(([name, { n }]) => `  ${name}: table says ${n}, code has ${code.get(name).length}`);
    expect(wrong, `ledger occurrence counts out of date:\n${wrong.join("\n")}`).toEqual([]);
  });

  it("the counts match", () => {
    // Derived on all three sides — no number is written down anywhere.
    expect(ledgerRows().size).toBe(tokensInCode().size);
    expect(ledgerRows().size).toBe(Object.keys(SCALE).length);
  });
});
