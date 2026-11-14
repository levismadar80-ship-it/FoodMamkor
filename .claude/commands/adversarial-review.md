Run adversarial review on all changed files in this PR before we merge.

Instructions:
1. FINDER: list every potential bug, edge case, or regression in the changed files
2. ADVERSARY: for each issue found — try to disprove it. mark which ones are false alarms
3. REFEREE: final verdict — which issues are real and must be fixed before merge

FINDER also checks reuse, for any diff under `frontend/`: does it hand-write
something that has an owner in the «Shared components» table of
`frontend/components/CLAUDE.md` (a button, field, dialog, message, heading,
toggle, empty state, tooltip, loading state, back link, date print)? A new
component file that duplicates an owner, or a copy of an owner's classes, is a
real issue: the fix is to use or extend the owner. A new primitive in
`components/ui/` without a row in that table is one too.

Output: numbered list of real issues only, with file + line number.

---
Extra step for PRs touching `backend/app/auth.py`, `backend/app/routers/upload.py`, or any permissions/role-check code:
- Web-search CVEs for the libraries involved (fastapi, python-jose, slowapi, httpx versions in requirements.txt)
- Add any applicable CVEs to the FINDER list before ADVERSARY evaluates them
