---
name: mehamakor-dod
description: Run Mehamakor's Definition-of-Done as one executable gate. Invoke before declaring any /goal loop or agentic task "done", and before opening a PR to staging. Runs frontend build, vitest, backend pytest, the RTL physical-props scan, the lucide-react import ban, the forbidden-"יצרן" UI-string check, and en.json key parity — exit 0 means the DoD is met, non-zero names every failed gate.
---

# mehamakor-dod — Definition-of-Done self-check

A single bash entrypoint that encodes Mehamakor's manual DoD (CLAUDE.md → PR
approval guide + `.claude/rules/testing.md`) so an agentic loop can verify
itself with one exit code instead of a human re-running each gate by hand.

## When to invoke

- **Before declaring any `/goal` loop done.** A `/goal` stop condition that
  ends at "done" must first run `bash .claude/skills/mehamakor-dod/check.sh`
  and see exit 0. The evaluator cannot judge DoD compliance; this can.
- **Before opening a PR to `staging`** — as the mechanical pre-flight that the
  DoD requires (`npm run build` → tests → guards).
- Any time you want a single deterministic answer to "is the working tree
  DoD-clean?".

Not a replacement for `/adversarial-review` (rule 5a) — that is a judgment
pass a script can't encode. This gate covers the mechanical half of the DoD;
run `/adversarial-review` for the rest.

## How to run

```bash
bash .claude/skills/mehamakor-dod/check.sh
```

- **exit 0** — all 7 gates passed (clean staging).
- **exit 1** — one or more failed; each failure is named on stderr and in the
  final `DoD: FAIL` summary, so a loop can read the reason, fix, and re-run.

No arguments, no flags, no config. Bash only — no network, no new deps. Heavy
gates assume the standard dev toolchain is already installed (frontend
`node_modules`, backend venv, reachable test Postgres); a missing toolchain is
reported as a named failure rather than auto-installed.

## What each check covers

| # | Check | Covers | Reuses |
|---|---|---|---|
| 1 | Frontend build | `cd frontend && npm run build` compiles (the "113/113 pages" gate) | — |
| 2 | Frontend vitest | full unit suite green | — |
| 3 | Backend pytest | `pytest tests/test_api.py` green (needs test Postgres) | — |
| 4 | RTL physical-props | no `left-`/`right-`/`ml-`/`mr-`/`pl-`/`pr-` Tailwind classes outside the allowlist; `rtl-ok` annotations honored | `.claude/scripts/rtl-scan.sh` |
| 5 | lucide-react ban | zero `lucide-react` imports (Phosphor is the icon lib) | — |
| 6 | Forbidden "יצרן" | zero `יצרן`/`יצרנית` in frontend UI strings — businesses are "בית עסק" (ADR-024). The legal term "רישיון יצרן" (Ministry-of-Health producer license) is excluded | — |
| 7 | en.json parity | every he.json key has an en.json twin (no `MISSING_MESSAGE` on /en) | `frontend/__tests__/en-parity-guard.test.js` (MEH-978) |

Checks 4 and 7 **call the existing guards** rather than reimplementing them —
one authority per job (MEH-271). Check 7 re-runs the MEH-978 parity test in
isolation purely to surface i18n drift as its own named line; the full vitest
run (check 2) already executes it.

## Risk-tier note

Loop primitives (`/goal`, `/loop`, `/schedule`) are gated by tier per
[ADR-025](../../../docs/decisions/ADR-025-loop-tiers.md): GREEN allows
end-to-end `/goal` with this gate as the "done" precondition; YELLOW is
per-chunk with WAIT gates; RED (`.github/workflows`, `alembic/versions`, prod
deploy, `DROP`) forbids loops entirely.
