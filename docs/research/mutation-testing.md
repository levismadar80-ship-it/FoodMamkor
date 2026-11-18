# Mutation testing — the money-and-permissions set (MEH-3295)

> Follows the auth.py-only pilot in [mutation-testing-pilot.md](./mutation-testing-pilot.md) (MEH-558).
> Rules: [.claude/rules/testing.md](../../.claude/rules/testing.md) «Tests that pass for the wrong reason».

## What it answers

A test suite can be green and still miss a broken line. Mutation testing
breaks one line at a time (flips `!=` to `==`, `+` to `-`, a constant to
`None`) and runs the tests. A change the tests do not notice — a **surviving
mutant** — is a line no test really checks.

## How to run

```bash
# once per machine
service postgresql start
createdb mehamakor_mutation          # its own database, see below
cd backend && uv sync --dev && cd ..

bash scripts/mutation/run.sh         # ≈ 35 min on 4 cores
bash scripts/mutation/run.sh --report  # re-read the last run
```

What is mutated and which tests run: `[tool.mutmut]` in `backend/pyproject.toml`
(`only_mutate`, `pytest_add_cli_args_test_selection`).

## Reading the output

```
file | mutants | killed | survived | no tests | timeout | score
NEW SURVIVOR: app/x.py::fn: <old line> => <mutated line>
```

- **score** = killed / (killed + survived + no tests).
- **no tests** = no selected test even runs that function. Treated as a survivor.
- **NEW SURVIVOR** = not explained in `backend/mutation-survivors.txt`. Exit 1.
- **MUTATION VOID** / exit 2 = the runner did not run; no number means anything.
- The fingerprint names the changed line, not mutmut's mutant number, so it
  survives unrelated edits.

## What to do with a survivor

1. Write a test that fails on the mutated line and passes on the real one.
2. Only if no test could tell them apart (an equivalent mutant), add the
   fingerprint to `backend/mutation-survivors.txt` with `  ## <why>`.

## Results

| Run | auth.py | limits | pricing | billing_ledger | billing_summary | capabilities |
|---|---|---|---|---|---|---|
| 15/11 (first, before the copy fix) | 72.7% (123 no tests) | 100% | 100% | not measured | not measured | not measured |
| 18/11 (after the link-token tests) | 100% (467) | 100% (12) | 100% (39) | 100% (287) | 98.5% (5 no tests in `Month.current`) | 100% (96) |
| 18/11 (after the `Month.current` test, 37 min) | 100% (467) | 100% (12) | 100% (39) | 100% (287) | 100% (342) | 100% (96) |

What the runs found:

- **The review-invite and owner-claim link tokens had no direct test** — all
  123 "no tests" mutants in `auth.py`, e.g. the scope check `!=` → `==` and
  the expiry `+` → `-`. Killed by `tests/test_meh3295_auth_tokens.py`.
- **`Month.current()` in billing had no test.** Killed by
  `tests/test_meh3295_properties.py::test_the_current_billing_month_is_the_israel_month`.

## Traps (each one cost a run)

- **One child only.** mutmut forks each mutant from one pytest process that
  already imported `tests/conftest.py`, so children share one database and
  one child's per-test TRUNCATE wipes another's rows.
- **Its own database.** The suite drops and recreates the schema at session
  start; a pytest in another terminal on `mehamakor_test` wiped tables under a
  running mutant ("relation producers does not exist").
- **`source_paths = ["app"]`.** `backend/app/` has no `__init__.py`. With only
  the listed files copied into `mutants/`, `app.services` resolved to the real
  package and those mutants never ran: every one read "no tests".
- **Repo root on `PYTHONPATH`.** Several test files import `tests.conftest`.
- **No incremental run for new tests.** `mutmut run <names>` after adding a
  test fails with `BadTestExecutionCommandsException` (mutmut 3.8.1 passes the
  new test id without its file). Re-run the whole set.

## Why not in CI

≈ 35 minutes per run on 4 cores, serial by necessity. Google runs mutation
testing on changed code at review time rather than as a gate (Petrović et al.,
*State of Mutation Testing at Google*, ICSE-SEIP 2018; *Practical Mutation
Testing at Scale*, IEEE TSE 2021). Here the same shape is: the PR thread runs
it when it touches a listed file (`scripts/checks/mutation-guard.sh` warns
without a `## Mutation` section), and the weekly repo-health scan re-runs the
whole set every Thursday and opens a card per new survivor.
