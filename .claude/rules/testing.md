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
