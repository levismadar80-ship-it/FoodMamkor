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

## T5a — rtl-ok marker on line above violation → suppressed (MEH-365)

prompt: Run the frontend verification suite on the current branch. The branch
  contains `frontend/components/Foo.jsx` with a `<div className="left-1/2
  -translate-x-1/2">` on line 10, and a `// rtl-ok: centering, not directional`
  comment on line 9 (immediately above). Foo.jsx is NOT in the RTL allowlist.

expected_assertion: Report section "RTL violations outside allowlist" shows
  count = 0. The line 10 violation does NOT appear in the report. Verdict
  reads READY-FOR-PR (assuming build and lint pass). No files are modified.

---

## T5b — violation with no rtl-ok marker → counted (MEH-365)

prompt: Run the frontend verification suite on the current branch. The branch
  contains `frontend/components/Foo.jsx` with a `<div className="left-1/2
  -translate-x-1/2">` on line 10, and no `rtl-ok` text anywhere in the file.
  Foo.jsx is NOT in the RTL allowlist.

expected_assertion: Report section "RTL violations outside allowlist" shows
  count ≥ 1. Output references frontend/components/Foo.jsx:10 with the matched
  class left-1. Verdict reads NEEDS-FIX. No files are modified.

---

## T5c — rtl-ok marker 2 lines above violation → counted (out of ±1 window) (MEH-365)

prompt: Run the frontend verification suite on the current branch. The branch
  contains `frontend/components/Foo.jsx` with a `<div className="left-1/2
  -translate-x-1/2">` on line 10, and a `// rtl-ok: centering` comment on
  line 8 (two lines above). No `rtl-ok` text appears on lines 9, 10, or 11.
  Foo.jsx is NOT in the RTL allowlist.

expected_assertion: Report section "RTL violations outside allowlist" shows
  count ≥ 1. The line 10 violation IS reported (marker is outside the ±1
  adjacency window). Verdict reads NEEDS-FIX. No files are modified.

---

## T5d — rtl-ok marker on the violation line itself → suppressed (MEH-365)

prompt: Run the frontend verification suite on the current branch. The branch
  contains `frontend/components/Foo.jsx` with a single line:
  `<div className="left-1/2 -translate-x-1/2"> {/* rtl-ok: centering */}` on
  line 10. The marker and the violation are on the same physical line.
  Foo.jsx is NOT in the RTL allowlist.

expected_assertion: Report section "RTL violations outside allowlist" shows
  count = 0. The line 10 violation does NOT appear in the report (±0 covered
  by the same-line marker). Verdict reads READY-FOR-PR (assuming build and
  lint pass). No files are modified.

---

## T5e — rtl-ok marker on line below violation → suppressed (MEH-365)

prompt: Run the frontend verification suite on the current branch. The branch
  contains `frontend/components/Foo.jsx` with a `<div className="left-1/2
  -translate-x-1/2">` on line 10, and a `{/* rtl-ok: centering */}` JSX
  comment on line 11 (immediately below). Foo.jsx is NOT in the RTL allowlist.

expected_assertion: Report section "RTL violations outside allowlist" shows
  count = 0. The line 10 violation does NOT appear in the report (±1 below
  covered). Verdict reads READY-FOR-PR (assuming build and lint pass). No
  files are modified.

---

## T6 — frontend scan dir missing → loud failure (MEH-365 SCAN_DIR_MISSING)

prompt: Run the frontend verification suite on the current branch.
  Pre-condition: `frontend/components` does not exist at the expected path
  (e.g. mid-refactor or wrong working directory). `rtl-allowlist.txt` is
  present.

expected_assertion: RTL section of the report reads exactly
  "❌ ERROR: frontend/components or frontend/app missing — RTL scan aborted"
  (no violation count is reported). Verdict reads NEEDS-FIX. Output does NOT
  include "RTL violations outside allowlist: 0" or any READY-FOR-PR verdict.
  No files are modified by the agent.

---

## T_adj_6 — adjacent violations, one annotated, one not → only un-annotated reported (MEH-426)

prompt: Run the frontend verification suite on the current branch.
  Pre-condition: `frontend/components/Foo.jsx` lines 5–9 contain:
    line 5: `{/* rtl-ok */}`
    line 6: `<div className="left-1/2">`   ← violation A (annotated by line 5)
    line 7: `<div className="spacer">`
    line 8: `<div className="right-1/2">`  ← violation B (no rtl-ok within ±1)
    line 9: `<div className="other">`
  Lines 6 and 8 are within 3 lines of each other so any grep -B1 -A1 buffer
  would merge them into one group — the per-violation ±1 window must inspect
  each match independently. Foo.jsx is NOT in the path-exceptions section
  of rtl-allowlist.txt. Build and lint pass.

expected_assertion: RTL violations outside allowlist: 1. Output references
  frontend/components/Foo.jsx line 8 with matched class right-1/2.
  Violation A (line 6) is suppressed by the rtl-ok on line 5 (within ±1).
  Violation B (line 8) is NOT suppressed — rtl-ok is 3 lines away, outside ±1.
  Verdict NEEDS-FIX. A naive whole-buffer check would have reported 0 — this
  case specifically tests per-violation window logic (regression test for the
  MEH-365 buffer-grouping fix carried over from PR #440 archive).

---

## T7 — --skip-build fast path (MEH-367)

prompt: Run the frontend verification suite on the current branch with the
  --skip-build flag. Build step should be skipped entirely (no `npm run build`
  invocation); lint and RTL scan should still run normally.

expected_assertion: Build section reads exactly
  `Build: SKIPPED (--skip-build flag)` (no PASS, no FAIL, no error line).
  Lint section is populated as normal (PASS or FAIL with detail). RTL section
  is populated as normal (count line, or one of the two loud-failure messages
  if rtl-allowlist.txt or scan dir is missing). Agent runtime < 30s.
  Verdict computed with Build=SKIPPED counting as not-failing: READY-FOR-PR
  iff Lint=PASS AND RTL count=0 AND no RTL loud-failure; otherwise NEEDS-FIX.
  No files are modified.
