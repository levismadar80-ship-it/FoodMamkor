# Testing rules

Rules 5, 5a, and 20 from the workflow list — grouped here because they
describe the same pre-merge pipeline.

---

## Rule 5 — Tests before implementation

Write the failing test first (pytest for backend, playwright/component
for frontend), then make it pass. See
[docs/TESTING.md](../../docs/TESTING.md).

### Frontend critical flows — Playwright test required before writing code

- login / register
- WhatsApp button click
- פרסום מוצר שכנה (home product form)
- טופס הרשמת עסק

### NOT required for

- Styling changes
- Color / spacing tweaks
- Minor UI adjustments

---

## Rule 5a — Adversarial review before every merge to staging

Run `/adversarial-review` on all changed files. Fix every REFEREE
verdict before opening the PR.

PRs touching `auth.py` / `upload.py` / permissions also get a web-search
CVE check (see [.claude/rules/security.md](./security.md)).

---

## Rule 20 — Review order: CI before adversarial (mandatory)

Every PR must follow this exact sequence:

```
npm run build  →  pytest tests/test_api.py  →  /adversarial-review  →  merge
```

Never run `/adversarial-review` before CI passes — adversarial review on
broken code wastes time.

### Exception — central components

Central components (`MapClient.jsx`, `ProducerDetail`, `main.py`) — run
adversarial even if build fails. Logic risk > syntax risk on these
files. Central component list: `.claude/central-components.json`.

---

## Definition of Done (every PR, no exceptions)

- [ ] `npm run build` passes
- [ ] `pytest tests/test_api.py` passes
- [ ] `/adversarial-review` עבר — all REFEREE verdicts fixed

---

## Required status checks + docs-only merge (MEH-716)

**Staging required checks = 6** (confirmed by Sapir 2026-06; all `pull_request`-triggered):
`Frontend build (Next.js)`, `Backend tests (pytest)`, `Backend lint (ruff)`,
`Env drift (.env.example)` (`pr-checks.yml`); `Frontend lint (RTL + Next.js rules)`,
`API contract audit (static)` (`deploy.yml`). All except env-drift are job-level
paths-filter gated → on a docs-only diff they report `skipped`, which **satisfies**
the required check (no manual override needed).

**`Playwright E2E (Vercel preview)` is NOT a required check.** It lives in
`e2e.yml`, triggered by `deployment_status` (after the Vercel preview deploys),
and job-skips on docs diffs (`e2e.yml:54-60`). **Docs-only PRs: don't poll E2E.**
Merge when the **6 `pull_request` required checks** are green.

**Transient "X of 6 expected" right after push** = the required checks are still
registering (workflow startup), **not** a failure. Let them settle, then retry the
merge once. (Observed on PR #908 — first merge attempt blocked on `expected`,
second succeeded with no override.)
