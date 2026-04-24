## Summary

<!--
1-3 bullet points: what changed + why.
Example:
- Add `?q=` full-text search to `/producers` endpoint
- Show "תוצאות עבור: X" heading in ProducersClient when search is active
-->

-
-

## Type

- [ ] Feature
- [ ] Bug fix
- [ ] Docs / config only (skip mobile testing)
- [ ] Hotfix (direct to `main` — back-merge to `staging` immediately after)

---

## Automated checks (CI enforced — must pass before merge)

- [ ] `npm run build` green
- [ ] `pytest tests/test_api.py` green

## Manual checks (required before marking Ready for Review)

- [ ] `/adversarial-review` ran on all changed files — every REFEREE verdict fixed
- [ ] Tested on mobile: iOS Safari + Android Chrome (skip for docs-only)
- [ ] Tested on desktop
- [ ] CHANGELOG.md updated (skip for docs-only PRs)
- [ ] HANDOFF.md updated with session summary
- [ ] Docs updated for changed surfaces:
  - `docs/DATA.md` if DB schema or endpoints changed
  - `docs/DESIGN.md` if UI/UX changed
  - `docs/ADMIN.md` if admin panel changed
  - `docs/SECURITY.md` if auth or permissions changed
  - `docs/SECURITY-CHECKLIST.md` — run the trap checklist if touching auth, rate limit, IDOR, or mutation endpoints
  - `docs/DEPLOYMENT.md` if env vars or infra changed
  - `docs/MANUAL_TESTING.md` if new user-facing flows added

## Database Checklist (MEH-266 — skip only when truthfully not relevant)

Production broke on 2026-04-24 because MEH-206 + MEH-192 added columns to
the `User` model without updating `_migrate_columns()`. Railway container
booted fine but every `/auth/login` returned 500 "column does not exist".
Full post-mortem: MEH-265. Until we migrate to Alembic (MEH-267), this
checklist is the contract.

- [ ] PR does **not** touch `backend/app/models/*.py` — **OR** —
- [ ] `backend/app/main.py:_migrate_columns()` has an `ALTER TABLE ADD
      COLUMN` entry for every new column added to a model in this PR
- [ ] Verified the migration runs on an **existing** DB (not just on
      `create_all` in pytest — pytest builds a fresh DB every run and
      silently hides missing migration entries)
- [ ] Any endpoint that queries the new column(s) was hit manually after
      the migration ran

## Central Component Checklist (skip if no central components touched)

Central components: `MapClient.jsx`, `ProducerDetailClient.jsx`, `main.py`, `auth.py`,
`routers/producers.py`, `routers/admin.py`, `routers/auth.py`.
Full list: `.claude/central-components.json`. Protocol: `docs/CENTRAL_COMPONENTS.md`.

- [ ] Read the full file before editing (not a partial read)
- [ ] `/adversarial-review` ran after editing (even if build was failing)
- [ ] Regression test added/updated for any logic change
- [ ] HANDOFF.md documents what changed and why

## 🔍 File preservation check (reviewer)

- [ ] Ran `git diff origin/staging...HEAD --stat` — file count matches task scope?
- [ ] For each changed file: reviewed full diff, no unexpected deletions?
- [ ] No silent removal of sections, comments, or imports that weren't explicitly mentioned in PR description?
- [ ] If any surprise change found → blocked merge, asked Claude Code to explain
