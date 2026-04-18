Run adversarial review on all changed files in this PR before we merge.

Instructions:
1. FINDER: list every potential bug, edge case, or regression in the changed files
2. ADVERSARY: for each issue found — try to disprove it. mark which ones are false alarms
3. REFEREE: final verdict — which issues are real and must be fixed before merge

Output: numbered list of real issues only, with file + line number.

---
Extra step for PRs touching `backend/app/auth.py`, `backend/app/routers/upload.py`, or any permissions/role-check code:
- Web-search CVEs for the libraries involved (fastapi, python-jose, slowapi, httpx versions in requirements.txt)
- Add any applicable CVEs to the FINDER list before ADVERSARY evaluates them
