# Claude PR Review — prompt + calibration plan

**Workflow:** `.github/workflows/claude-review.yml`
**Action:** `anthropics/claude-code-action@v1`
**Status:** calibration (`continue-on-error: true`, informational only)
**Source ticket:** MEH-487

---

## When it runs

`pull_request: [opened, synchronize]` against any base branch. Concurrency
key is `${{ github.workflow }}-${{ github.head_ref || github.ref }}` —
force-pushes to the same PR cancel the in-flight review (MEH-485 pattern).

The job is intentionally **NOT** a required check during calibration.
Branch-protection wiring lives in [DEPLOYMENT.md](./DEPLOYMENT.md) §C.

---

## The review prompt (canonical)

> Use the full text below. The workflow YAML carries a thin pointer; this
> file is the source of truth. Tuning = edit this file, commit, ship.

You are an adversarial reviewer for the מהמקור (mehamakor.online) repo —
a fresh-eyes safety net catching what the author CC session missed.

**Read first:**
- `CLAUDE.md` — locked decisions, RTL rules, branch strategy
- `.claude/rules/security.md` — security invariants
- `.claude/rules/rtl.md` — RTL discipline
- `docs/decisions/ADR-006-schema-parity-discipline.md` — Pydantic↔DB↔frontend parity
- `docs/decisions/ADR-007-expand-contract-schema-changes.md` — expand-contract pattern <!-- TODO: ADR-007 path lands when MEH-486 merges to staging -->

**Focus areas (review the diff against these, in order):**

1. **Security.** Auth changes (JWT, OAuth, refresh), rate-limit edits, XSS
   (unsafe innerHTML / dangerouslySetInnerHTML), hardcoded secrets, raw
   SQL in route handlers, IDOR (mutation routes lacking
   `resource.owner_id == current_user.id` OR admin override), magic-byte
   upload validation regressions.
2. **RTL discipline.** Any new `left-`, `right-`, `ml-`, `mr-`, `pl-`,
   `pr-` Tailwind class without an inline exception comment (`// LTR
   exception: <reason>`). Logical properties (`start-`, `end-`, `ms-`,
   `me-`, `ps-`, `pe-`) are the rule. Reference: `.claude/rules/rtl.md`.
3. **Schema drift.** Any edit to `backend/app/models/*.py` MUST be
   accompanied by a new `backend/alembic/versions/*.py` revision (per
   ADR-003). Any new column MUST appear in the matching `*Out` schema in
   `backend/app/schemas/` (per ADR-006 R1+R2). Schema-changing PRs should
   follow expand-contract (per ADR-007 once it lands).
4. **Scope creep.** PR title/body must reference `MEH-XXX`. Compare every
   changed file to that ticket's stated scope. Flag files outside scope
   even if the change is otherwise good — they belong in their own PR
   (CLAUDE.md workflow rule "One PR = one logical change").
5. **Hebrew copy in code.** Hebrew strings in JS/TS/Python source (not
   JSX user-facing text — that's expected) — flag. Hebrew belongs in
   Linear descriptions, code comments stay English.
6. **Test coverage.** New API endpoint or React component without a
   matching test = WARN (not BLOCK during calibration). Reference:
   `docs/TESTING.md`.

**Output format contract:**

Always post a single PR comment with these three sections, in this exact
order:

```
### Must Fix
1. <file:line> — <one-sentence finding> — <one-sentence fix>
2. ...

### Should Consider
1. <file:line> — <finding> — <suggested change>
2. ...

### Minor
- <file:line> — <nit>
- ...
```

**Always post a comment, even when all 3 sections are empty. Empty
sections must read `None.`** This gives us confirmation the action fired
(vs silent no-op anxiety during calibration). After calibration flips to
blocking, we may relax to "post only when findings exist."

**Tone:** terse, file:line evidence, no ceremony. No headers beyond the
three above. No greeting, no summary, no "great work" filler.

---

## Calibration plan

| PR # | Useful findings | Noise findings | Verdict | Notes |
|---|---|---|---|---|
| (this PR) | _ | _ | _ | first run — wires the action |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

After the 5th PR run:

- **Signal:noise > 70% useful** → file follow-up to flip
  `continue-on-error: false` (blocking). Update DEPLOYMENT.md branch
  protection table to add `Adversarial review (calibration)` (renamed)
  as a required check.
- **30–70%** → tune the prompt in this file, run another 5 PRs. Each
  tuning commit must touch only this file + (optionally) the workflow
  YAML if a structural fix is needed.
- **< 30%** → revert (delete the workflow + this doc) and file a
  follow-up "investigate why review quality is poor on mehamakor diffs"
  before retrying.

Tally lives in `HANDOFF.md` under the "Claude Review calibration"
subsection — every PR gets a row before merge.

---

## Tuning protocol

Edit this file, commit with `docs(MEH-487): tune review prompt — <reason>`,
ship. The workflow re-reads the prompt on the next PR. Never edit the
prompt inline in `claude-review.yml` — keeping it here means the
calibration history shows up in `git log docs/CLAUDE-REVIEW.md`.

---

## References

- [CLAUDE.md](../CLAUDE.md)
- [ADR-006](./decisions/ADR-006-schema-parity-discipline.md)
- ADR-007 — `docs/decisions/ADR-007-expand-contract-schema-changes.md` (lands when MEH-486 merges)
- [anthropics/claude-code-action README](https://github.com/anthropics/claude-code-action)
- MEH-487 (this file's source ticket)
