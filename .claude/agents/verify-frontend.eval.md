---
agent: verify-frontend
meh: MEH-345
---

# verify-frontend — Eval Test Cases

## T1 — RTL violation in non-allowlist file

prompt: Run the frontend verification suite on the current branch. The branch contains
  `ml-4` on line 42 of `frontend/components/ProducerCard.jsx`. ProducerCard.jsx is
  NOT in the RTL allowlist (.claude/hooks/rtl-allowlist.txt).

expected_assertion: Report section "RTL violations outside allowlist" shows count ≥ 1.
  Output references frontend/components/ProducerCard.jsx with matched class ml-4.
  Verdict line reads NEEDS-FIX. No files are modified.

---

## T2 — Clean branch passes all checks

prompt: Run the frontend verification suite on the current branch. This is the clean
  staging branch: no build errors, no lint errors, no RTL violations outside the
  allowlist.

expected_assertion: Output contains "Build: ✅ PASS", "Lint: ✅ PASS",
  "RTL violations outside allowlist: 0", and verdict "READY-FOR-PR".

---

## T3 — Build failure reported with first error line

prompt: Run the frontend verification suite on the current branch. The branch has a
  syntax error in frontend/app/page.jsx (missing closing brace) that causes
  `npm run build` to exit non-zero.

expected_assertion: Output contains "Build: ❌ FAIL". Output includes at least the
  first error line from npm output (must reference the file or error type, not just
  "failed"). Verdict reads NEEDS-FIX. Lint section is present in the report.
  No files are modified.

---

## T4 — rtl-allowlist.txt missing → loud failure (regression test for MEH-368 FIX 2)

prompt: Run the frontend verification suite on the current branch.
  Pre-condition: `.claude/hooks/rtl-allowlist.txt` has been temporarily moved to
  `.claude/hooks/rtl-allowlist.txt.bak` (file does not exist at expected path).
  Build and lint pass cleanly.

expected_assertion: RTL section of the report reads exactly
  "❌ ERROR: rtl-allowlist.txt missing — RTL scan aborted" (no violation count
  is reported). Verdict reads NEEDS-FIX. Output does NOT include
  "RTL violations outside allowlist: 0" or any READY-FOR-PR verdict.
  No files are modified by the agent.

---

## T_adj_1 — rtl-ok on same line suppresses violation

prompt: Run the frontend verification suite on the current branch.
  Pre-condition: `frontend/components/Foo.jsx` line 10 contains
  `<div className="left-4"> {/* rtl-ok */}`. Foo.jsx is NOT in the
  path-exceptions section of rtl-allowlist.txt. Build and lint pass.

expected_assertion: RTL violations outside allowlist: 0. Verdict reads
  READY-FOR-PR. The rtl-ok annotation on the same line suppresses the violation.
  No files are modified.

---

## T_adj_2 — rtl-ok on line before violation suppresses it (adjacency -1)

prompt: Run the frontend verification suite on the current branch.
  Pre-condition: `frontend/components/Foo.jsx` line 9 contains `{/* rtl-ok */}`
  and line 10 contains `<div className="left-4">`. Foo.jsx is NOT in the
  path-exceptions section. Build and lint pass.

expected_assertion: RTL violations outside allowlist: 0. Verdict READY-FOR-PR.
  The rtl-ok one line before the violation is within the ±1 window and suppresses it.

---

## T_adj_3 — rtl-ok on line after violation suppresses it (adjacency +1)

prompt: Run the frontend verification suite on the current branch.
  Pre-condition: `frontend/components/Foo.jsx` line 10 contains
  `<div className="left-4">` and line 11 contains `{/* rtl-ok */}`. Foo.jsx
  is NOT in the path-exceptions section. Build and lint pass.

expected_assertion: RTL violations outside allowlist: 0. Verdict READY-FOR-PR.
  The rtl-ok one line after the violation is within the ±1 window and suppresses it.

---

## T_adj_4 — rtl-ok two lines away does NOT suppress (outside ±1 window)

prompt: Run the frontend verification suite on the current branch.
  Pre-condition: `frontend/components/Foo.jsx` line 8 contains `{/* rtl-ok */}`
  and line 10 contains `<div className="left-4">`. The gap is 2 lines, outside
  the ±1 adjacency window. Foo.jsx is NOT in the path-exceptions section.
  Build and lint pass.

expected_assertion: RTL violations outside allowlist: 1. Output references
  frontend/components/Foo.jsx with matched class left-4. Verdict NEEDS-FIX.
  rtl-ok at distance 2 is NOT within the ±1 window.

---

## T_adj_5 — two violations, both annotated → suppressed

prompt: Run the frontend verification suite on the current branch.
  Pre-condition: `frontend/components/Foo.jsx` line 5 contains
  `<div className="left-4"> {/* rtl-ok */}` and line 10 contains
  `<span className="right-2"> {/* rtl-ok */}`. Both violations annotated on
  the same line. Foo.jsx is NOT in the path-exceptions section. Build and lint pass.

expected_assertion: RTL violations outside allowlist: 0. Verdict READY-FOR-PR.
  Both violations individually suppressed by their same-line rtl-ok annotations.

---

## T_adj_6 — merged grep buffer: one annotated, one not → only unannotated reported

prompt: Run the frontend verification suite on the current branch.
  Pre-condition: `frontend/components/Foo.jsx` lines 5–9 contain:
    line 5: `{/* rtl-ok */}`
    line 6: `<div className="left-1/2">`   ← violation A (annotated by line 5)
    line 7: `<div className="spacer">`
    line 8: `<div className="right-1/2">`  ← violation B (no rtl-ok within ±1)
    line 9: `<div className="other">`
  grep -B1 -A1 merges lines 5–9 into one group (no -- separator between them).
  Foo.jsx is NOT in the path-exceptions section. Build and lint pass.

expected_assertion: RTL violations outside allowlist: 1. Output references
  frontend/components/Foo.jsx line 8 with matched class right-1/2.
  Violation A (line 6) is suppressed by the rtl-ok on line 5 (within ±1).
  Violation B (line 8) is NOT suppressed — rtl-ok is 3 lines away, outside ±1.
  Verdict NEEDS-FIX. Old awk (whole-buffer check) would have reported 0 — this
  case specifically tests the per-violation window logic (regression test for
  MEH-365 buffer-grouping fix).
