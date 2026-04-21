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
  - `docs/DEPLOYMENT.md` if env vars or infra changed
  - `docs/MANUAL_TESTING.md` if new user-facing flows added

## Central Component Checklist (skip if no central components touched)

Central components: `MapClient.jsx`, `ProducerDetailClient.jsx`, `main.py`, `auth.py`,
`routers/producers.py`, `routers/admin.py`, `routers/auth.py`.
Full list: `.claude/central-components.json`. Protocol: `docs/CENTRAL_COMPONENTS.md`.

- [ ] Read the full file before editing (not a partial read)
- [ ] `/adversarial-review` ran after editing (even if build was failing)
- [ ] Regression test added/updated for any logic change
- [ ] HANDOFF.md documents what changed and why
