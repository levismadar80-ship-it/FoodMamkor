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
`API contract audit (static)` (`deploy.yml`). env-drift always runs; the other 5 are
job-level paths-filter gated and **skip** on a docs-only diff. **Under Rulesets a
skipped required check reports as "Expected" and BLOCKS merge — it does NOT satisfy
the check.** (That was classic-branch-protection behavior; the repo is on Rulesets
now, so the old "skipped satisfies" claim was stale — it forced admin-merges on
2026-06: #910, #913, + a near-miss.) **MEH-736** adds no-op **docs-only twin jobs**
(identical `name:`, exact-complement `if:`, exit 0) in `pr-checks.yml` + `deploy.yml`
so docs-only PRs satisfy all 6 with no admin override. Full mechanism:
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) → "Required checks".

**`Playwright E2E (Vercel preview)` is NOT a required check.** It lives in
`e2e.yml`, triggered by `deployment_status` (after the Vercel preview deploys),
and job-skips on docs diffs (`e2e.yml:54-60`). **Docs-only PRs: don't poll E2E.**
Merge when the **6 `pull_request` required checks** are green.

**Transient "X of 6 expected" right after push** = the required checks are still
registering (workflow startup), **not** a failure — distinct from the *permanent*
docs-only skip case above (now fixed by the MEH-736 twins). Let them settle, then
retry the merge once. (Observed on PR #908 — first merge attempt blocked on
`expected`, second succeeded with no override.)
