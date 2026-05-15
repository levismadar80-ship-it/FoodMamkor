---
paths:
  - "**/*.py"
  - "**/*.jsx"
  - "**/*.js"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.sh"
---

# Code execution principles

> Workflow rules 1–20 cover *structure*. These cover *execution*. When
> referencing by number, use "exec §N" to avoid collision with workflow
> rule N.

Sources: Cursor · Devin · V0 · Manus · Windsurf (2026).

---

## Principles (exec §7–13)

7. **Lazy Edit (Cursor)** — changed lines + `// ... existing code ...`
   markers only. Never return a full file.
8. **Atomic Edits (Cursor)** — 3 changes in one file = 1 edit call,
   not 3. All-or-nothing.
9. **Skeptic Mode (Devin)** — "Haven't verified X" > "X probably
   works". Declare uncertainty explicitly.
10. **File:Line Evidence (Devin)** — every code claim needs
    `file:line`. No citation = guess, not fact.
11. **Numbered Plan First (Manus)** — numbered steps before any code,
    even "small" tasks. Wait for `go`.
12. **Narrated Actions (Windsurf)** — one-line per action:
    "Reading X… Found Y… Fixing Z…" No black-box turns.
13. **Real Imports Only (V0)** — verify file exists before writing
    `import`. Never import imaginary modules.

---

## Linter-enforced reinforcement (MEH-443)

The 5 core ESLint rules in `frontend/eslint.config.mjs` (warn mode) are
the runtime enforcement of exec §7 (Lazy Edit) and exec §8 (Atomic Edits).
They surface concretely the same patterns these principles guard against:

| Linter rule | Stack | Reinforces |
|---|---|---|
| `max-lines: 250`, `max-lines-per-function: 50` | ESLint (frontend) | exec §7 — small, lazy edits over rewriting whole files |
| `max-params: 2`, `complexity: 10`, `max-depth: 4` | ESLint (frontend) | exec §8 — atomic, all-or-nothing changes are easier when functions are simple |
| `no-magic-numbers` | ESLint (frontend) | exec §10 — named constants give every value a `file:line` anchor |
| `PLR0913 max-args=5`, `C901 max-complexity=10`, `PLR0911 max-returns=6` | Ruff (backend) | exec §8 — same intent at the Python layer |
| `PLR0915 max-statements=50`, `PLR0912 max-branches=12` | Ruff (backend) | exec §7 — keeps Python functions small enough to lazy-edit |

Frontend warnings are not errors today (MEH-443). Backend Ruff has no
warn level — PL rules ship as errors covered by `per-file-ignores`
referencing the refactor ticket that will eventually remove the ignore
(MEH-444). Promote frontend to error and remove backend ignores after
MEH-437 / MEH-438 / MEH-439 / MEH-440 ship + 30-day soak. Until then,
treat new lint signals as feedback, not a build gate.

---

## Execution order per task

- **Before:** read CLAUDE.md + HANDOFF → numbered plan → grep siblings
  → wait for `go`
- **During:** lazy edit (1 call / file / turn) → narrate each action →
  real imports only
- **After:** file:line evidence per claim → build + tests → preview
  URL → HANDOFF update

---

## §14 — File-header contract

Forward-only convention for new files with non-trivial logic (>50 LOC,
central-component, or security-sensitive). Existing files retrofit only
when otherwise edited. 6 fields, omit lines that don't apply:

```
"""
Module:   <filename, no path/ext — pure label>
Purpose:  <1-2 sentence outcome, not implementation>
Touches:  <DB tables / Cloudinary / Resend / Twilio / Anthropic — side
          effects invisible from imports>
Does NOT: <inverse responsibility — point at the sibling file>
Related:  <file:line refs, not whole-file refs>
History:  <MEH-XX (creation); MEH-YY (revision); MEH-ZZ (incident)>
"""
```

**Does NOT** is the highest-value field — anti-knowledge ("not here,
see `producer_me.py`") saves more grep cycles than positive description.
**History** updates in the same PR that meaningfully revises the file
(cross-link: workflow rule 11).

Canonical exemplars, one per language style:

1. `backend/app/rate_limit.py:1-46` — Python `"""..."""` with full
   MEH-256 incident trail (Railway `X-Real-IP` discovery), Touches
   (slowapi limiter), Related (`config.py`).
2. `frontend/components/Footer.jsx:1-40` — JSDoc `/** ... */`:
   top→bottom structure, scope guarantees (`POST /newsletter`
   untouched), about-decision (WCAG contrast vs brand-token).

New files mirror whichever style matches the language.

---

## §15 — Sentinel markers (grep-able anchors)

Three inline-comment conventions that make `grep` precise. CC's primary
navigation is grep (Cherny, Anthropic, March 2026), not a vector index.

**1. `# MEH-XXX:` — history anchor.** Near any non-trivial decision, drop
`# MEH-XXX:` (or `// MEH-XXX:` for JS/JSX). Marks the Linear issue that
introduced or last touched the line. Exemplars: `backend/app/rate_limit.py:31`
(MEH-256 real-client-IP), `frontend/components/Header.jsx:11` (MEH-29
sticky). Every PR adding non-trivial logic drops at least one anchor.

**2. `# DO NOT:` — anti-pattern anchor.** Format:
`# DO NOT <action> — <reason / MEH-XXX>`. For code that LOOKS editable
but is structurally locked. Example:

```python
# DO NOT add column changes here — Alembic only since MEH-267
# (root cause of MEH-265 incident).
```

The anti-knowledge is more valuable than the positive code next to it.
Prose sibling: `.claude/rules/backend.md` "Never add PostGIS".

**3. `# REUSES: <file:line>` — pattern provenance.** When copying a pattern
from another file: `# REUSES: backend/app/routers/producers.py:142 —
slowapi limit + Hebrew error`. `<examples>` blocks in prompts are
ephemeral; REUSES anchors are permanent — they give the next CC session
the provenance for free.

**Discovery recipe:**

```
grep -rE "# (MEH-[0-9]+|DO NOT|REUSES):" backend/ frontend/
```

Forward-only — existing files retrofit only when otherwise edited. No
hook enforcement here; if drift becomes a problem, open a follow-up for
`.claude/hooks/check-sentinel-format.sh`.
