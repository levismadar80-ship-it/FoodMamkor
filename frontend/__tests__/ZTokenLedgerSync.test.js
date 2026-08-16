/**
 * MEH-2093 chunk C — the z-index ledger must actually mirror the code.
 *
 * `.claude/rules/rtl.md` states "Code is the source of truth; this ledger
 * mirrors it". Before this guard that was a promise: 7 live values were absent
 * from the table, and chunks A and B of this ticket both happened *because*
 * nobody could consult a table that was wrong. A ledger that silently drifts is
 * worse than no ledger — it hands the next reader false confidence.
 *
 * This asserts set equality in BOTH directions:
 *   - a token used in code but missing from the table  → someone shipped a value
 *     without recording it (the drift that caused this ticket)
 *   - a token in the table but used nowhere            → the table describes a
 *     component that has since moved or been deleted
 *
 * Both parsers carry a control, because this is two absence assertions facing
 * each other and either one silently returning nothing would make the
 * comparison trivially pass.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const FRONTEND = path.resolve(__dirname, "..");
const LEDGER = path.resolve(FRONTEND, "..", ".claude", "rules", "rtl.md");

/** A line that is purely a comment carries prose about a token, not a usage. */
const isComment = (l) => l.trim().startsWith("*") || l.trim().startsWith("//") ||
  l.trim().startsWith("/*") || l.trim().startsWith("{/*");

/** Every arbitrary z token actually applied in a className, with its owners. */
function tokensInCode() {
  const found = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|jsx)$/.test(e.name)) continue;
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        if (isComment(line)) return;
        for (const m of line.matchAll(/z-\[(\d+)\]/g)) {
          const n = Number(m[1]);
          if (!found.has(n)) found.set(n, []);
          found.get(n).push(`${path.relative(FRONTEND, p)}:${i + 1}`);
        }
      });
    }
  };
  for (const d of ["app", "components"]) walk(path.join(FRONTEND, d));
  return found;
}

/**
 * Tokens listed as ROWS of the ledger table — not ones merely named in prose.
 * Returns token -> the `n` the table claims, so the claim is checkable.
 */
function ledgerRows() {
  const md = fs.readFileSync(LEDGER, "utf8");
  return new Map(
    [...md.matchAll(/^\|\s*`z-\[(\d+)\]`\s*\|\s*(\d+)\s*\|/gm)]
      .map((m) => [Number(m[1]), Number(m[2])]),
  );
}

const tokensInLedger = () => new Set(ledgerRows().keys());

describe("z-index ledger ↔ code (MEH-2093 chunk C)", () => {
  it("CONTROL — both parsers actually find things", () => {
    // Two absence assertions face each other below. If either parser returned
    // an empty set, the comparison would pass while proving nothing.
    const code = tokensInCode();
    const ledger = tokensInLedger();
    expect(code.size, "code scanner found no z tokens at all").toBeGreaterThan(15);
    expect(ledger.size, "ledger parser found no table rows at all").toBeGreaterThan(15);
    // The code scanner must ignore comment-only mentions: 9998 appears solely in
    // a comment (see the note in rtl.md) and must NOT be reported as live.
    expect([...code.keys()]).not.toContain(9998);
    // ...and the ledger parser must read table rows, not the prose around them,
    // so the same value must be absent there too.
    expect([...ledger]).not.toContain(9998);
  });

  it("every token used in code is recorded in the ledger", () => {
    const code = tokensInCode();
    const ledger = tokensInLedger();
    const missing = [...code.keys()].filter((n) => !ledger.has(n)).sort((a, b) => b - a);
    expect(
      missing,
      `z tokens used in code but absent from .claude/rules/rtl.md:\n` +
        missing.map((n) => `  z-[${n}]  e.g. ${code.get(n)[0]}`).join("\n"),
    ).toEqual([]);
  });

  it("every token in the ledger is still used in code", () => {
    const code = tokensInCode();
    const stale = [...tokensInLedger()].filter((n) => !code.has(n)).sort((a, b) => b - a);
    expect(
      stale,
      `z tokens in the ledger that no className uses any more:\n` +
        stale.map((n) => `  z-[${n}]`).join("\n"),
    ).toEqual([]);
  });

  it("the counts match", () => {
    // Derived on both sides — neither number is written down anywhere.
    expect(tokensInLedger().size).toBe(tokensInCode().size);
  });

  it("each row's occurrence count is the real one", () => {
    // The `n` column is a STATED number, which is the shape that goes stale
    // silently — chunk B alone moved z-[9000] from 6 to 20. Checking it here
    // turns the column into a claim the suite refuses to let drift.
    const code = tokensInCode();
    const wrong = [...ledgerRows()]
      .filter(([token, n]) => code.has(token) && code.get(token).length !== n)
      .map(([token, n]) => `  z-[${token}]: table says ${n}, code has ${code.get(token).length}`);
    expect(wrong, `ledger occurrence counts out of date:\n${wrong.join("\n")}`).toEqual([]);
  });
});
