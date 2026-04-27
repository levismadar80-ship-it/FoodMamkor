---
agent: code-simplifier
meh: MEH-345
---

# code-simplifier — Eval Test Cases

## T1 — Duplicated helper across two files (DRY violation)

prompt: Review the PR diff. The diff adds an identical formatDate() function in two
  files: frontend/lib/dateUtils.js and frontend/components/ProducerCard.jsx. Both
  implementations are 5 lines, same logic, no divergence. Treat this as the current
  git diff staging...HEAD output.

expected_assertion: Output contains a DRY suggestion. Suggestion references both
  files by path. Recommendation is to extract to one shared location (e.g. import
  from dateUtils.js). Output does NOT modify any files.

---

## T2 — Clean focused diff produces no false positives

prompt: Review the PR diff for the MEH-355 RTL allowlist change: a 5-line insertion
  in .claude/hooks/check-rtl.sh adding a categorical *.md file extension exemption,
  plus a README.md update explaining the rationale. Clean focused change, no
  duplication, no nesting, no unused imports.

expected_assertion: Output contains "Diff looks clean. No simplifications
  recommended." or an equivalent no-issue verdict. Zero false-positive suggestions.
  Output does NOT flag the *.md comment lines or shell array syntax as a style issue.

---

## T3 — Overly nested conditional flagged

prompt: Review the PR diff. backend/app/routers/producers.py has a new function with
  4-level nested conditionals: `if current_user:` then `if current_user.role ==
  "admin":` then `if producer.verified:` then `if category in ALLOWED_CATEGORIES:`
  with a single action at the deepest level. This is 4 indent levels of nesting.

expected_assertion: Output flags the nested conditional as overly complex or
  "overly nested". References backend/app/routers/producers.py by file path.
  Suggests flattening via early return or guard clause. Does NOT rewrite the code.
  Does NOT flag it as a style issue (Prettier handles style).
