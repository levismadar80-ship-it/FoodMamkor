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
