# MEH-2244 chunk D — weekly PR ↔ Linear reconciliation sweep (`pr-reconcile.yml`)

> **`.github/workflows/**` is CC-deny (MEH-671). This file is the workflow for Sapir to
> paste as `.github/workflows/pr-reconcile.yml`.** The script it runs —
> `scripts/oneoff/pr-reconcile.mjs` — and its `node --test` suite are already on the
> branch; only the wiring below needs her hands.

## What it does

Every Sunday 06:00 UTC it runs the sweep in **dry-run** and publishes the
classification table as the job summary. Nothing is written to Linear on the schedule.
A manual `workflow_dispatch` with `mode: write` is the only path that posts comments
and moves cards — one click, attributed, in the Actions log.

The script's behaviour (from its header, kept in one place so this doc cannot drift
from it):

| Issue class | Condition | Action (`--write`) |
|---|---|---|
| **(a)** | no open PR, ≥ 1 merged | every DoD line ticked → comment + **move to Done**; else comment `all PRs merged, DoD unticked:` + the lines, status untouched |
| **(b)** | only closed-unmerged PRs | comment `superseded/abandoned: #N (<reason>)`, status untouched |
| **(c)** | any open PR | skip |
| — | no PR attachments | filtered out, no row |
| — | **control card** — label `control`, or MEH-2227 / MEH-2244 by id | excluded before classification: no row, no PR fetch, no comment, no move; `--issue` cannot re-admit it. Listed on the stdout header as `excluded N control card(s): …`. Extend with `--exclude MEH-N` / `--exclude-label X` (grow-only, rule 32). |

Idempotent: every comment starts with `<!-- pr-reconcile:<sha256> -->`; a body that
already exists (verbatim or by marker) is `skipped-identical`. A card with **no DoD
lines at all** is `dod-unticked`, never `done` — vacuous truth would close every card
that lacks a checklist.

## Secrets and permissions

| Name | Source | Why |
|---|---|---|
| `LINEAR_API_KEY` | repo secret — **must be added** (not present today; the E2E/CI jobs do not use Linear) | read issues + attachments; in `write` mode, `commentCreate` + `issueUpdate` |
| `GITHUB_TOKEN` | automatic | `GET /repos/…/pulls/{n}` and `GET /repos/…/issues/{n}/comments` — reads only |

`permissions: contents: read` + `pull-requests: read` is the whole grant — `contents: read`
because a workflow-level `permissions:` block sets every unlisted scope to `none`, and
`actions/checkout` needs it (the first draft of this doc omitted it; caught on PR #3444
by the CI reviewer). The token never writes to GitHub; all writes go to Linear, gated on
the dispatch input.

The card's constraint was *"no new env vars beyond LINEAR_API_KEY / GITHUB_TOKEN
already used in CI"*. `GITHUB_TOKEN` is; `LINEAR_API_KEY` is named on the card but
**is not in any workflow today** (`grep -rn LINEAR .github/workflows/` → 0 hits,
measured 2026-09-04), so adding the repo secret is a one-time Sapir step, listed here
rather than assumed.

## The workflow

```yaml
# .github/workflows/pr-reconcile.yml
#
# MEH-2244 chunk D — weekly PR <-> Linear reconciliation sweep.
# Schedule = dry-run only (table in the job summary, zero Linear writes).
# Writes happen only through workflow_dispatch with mode=write.
name: PR reconcile (Linear)

on:
  schedule:
    - cron: "0 6 * * 0" # Sunday 06:00 UTC
  workflow_dispatch:
    inputs:
      mode:
        description: "dry-run prints the table; write posts comments + moves done cards"
        type: choice
        required: true
        default: dry-run
        options:
          - dry-run
          - write
      issues:
        description: "optional: space-separated MEH-N filter (e.g. MEH-1754 MEH-2122)"
        type: string
        required: false
        default: ""

permissions:
  contents: read # checkout needs it — a workflow-level block sets every unlisted scope to none
  pull-requests: read

concurrency:
  group: pr-reconcile
  cancel-in-progress: false

jobs:
  reconcile:
    name: Reconcile PRs <-> Linear (${{ github.event.inputs.mode || 'dry-run' }})
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4 # pin the SHA when pasting (repo convention)
        with:
          persist-credentials: false

      - uses: actions/setup-node@v4 # pin the SHA when pasting
        with:
          node-version: 22

      # The suite is the discrimination evidence for the classifier — run it before
      # trusting the table it produces (testing.md: check the instrument first).
      - name: Self-test (node --test, no network)
        run: node --test scripts/oneoff/__tests__/pr-reconcile.test.mjs

      - name: Resolve mode
        id: mode
        env:
          INPUT_MODE: ${{ github.event.inputs.mode }}
          INPUT_ISSUES: ${{ github.event.inputs.issues }}
        run: |
          set -euo pipefail
          # Only an explicit dispatch input may select write; the schedule never does.
          if [ "${{ github.event_name }}" = "workflow_dispatch" ] && [ "$INPUT_MODE" = "write" ]; then
            echo "flag=--write" >> "$GITHUB_OUTPUT"
          else
            echo "flag=--dry-run" >> "$GITHUB_OUTPUT"
          fi
          filter=""
          for id in $INPUT_ISSUES; do filter="$filter --issue $id"; done
          echo "filter=$filter" >> "$GITHUB_OUTPUT"

      - name: Run sweep
        env:
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          node scripts/oneoff/pr-reconcile.mjs ${{ steps.mode.outputs.flag }} ${{ steps.mode.outputs.filter }} \
            | tee reconcile-table.md

      - name: Publish table as job summary
        if: always()
        run: |
          {
            echo "## PR reconcile — ${{ steps.mode.outputs.flag }}"
            echo
            cat reconcile-table.md 2>/dev/null || echo "_no output — the sweep step failed before printing_"
          } >> "$GITHUB_STEP_SUMMARY"
```

**Pins.** The repo pins actions by SHA (`claude-review.yml:68` is the precedent). The
`@v4` tags above are placeholders so the YAML reads; replace them with the SHAs the
other workflows already use when pasting.

**Why the self-test runs first.** The table is only as good as the classifier, and the
classifier's evidence is the suite — 5 of 18 cases go red when `classifyIssue` is forced
to `skip` (recorded in the chunk D PR body). A run whose suite fails must not publish a
table that looks authoritative.

## Discrimination — what the first dry-run must show

The MEH-2244 card §2 names five cards with attached PRs. **CC could not run the sweep**:
the sandbox has no `LINEAR_API_KEY`, and its `GITHUB_TOKEN` is a proxy placeholder
that returns `401 Bad credentials` against `api.github.com` (measured 2026-09-04, both
`Bearer` and `token` schemes). So the expected classes below are **read off the card**,
not measured — and the first scheduled run is the measurement. If a row disagrees, the
script is wrong or the card is stale; either way, do not `write` until it agrees.

| Card | Card says | Expected class → action | What would falsify it |
|---|---|---|---|
| MEH-1754 | 5 PRs, all landed over August | **(a)** → `done` if every DoD bullet reads `[x]`, else `dod-unticked` with the bullets listed | an `open` PR in the row → the class is (c) and the card's "5 PRs" hides a live one |
| MEH-2122 | #3007 — **merged** 18/08 (`b43b6176`; this row used to say "closed without merge", which was wrong — the card itself was right, the error was in MEH-2244 §2 and here; corrected 06/09, rule 34) | **(a)** → `dod-unticked` (chunk A DoD is `*` bullets without checkboxes, so zero checkbox lines) | an `open` PR in the row → chunks B–D started |
| MEH-1606 | #3321, in flight | **(c)** → `skip` | #3321 showing `merged`/`closed-unmerged` → it landed or died since the card was written |
| MEH-2241 | 2 PRs | not stated on the card — read the row | — |
| MEH-817 | 2 PRs | not stated on the card — read the row | — |

Run it narrowed first, so the five rows are the whole output:

```
node scripts/oneoff/pr-reconcile.mjs --dry-run \
  --issue MEH-1754 --issue MEH-2122 --issue MEH-1606 --issue MEH-2241 --issue MEH-817
```

(Through the workflow: dispatch with `mode: dry-run`, `issues: MEH-1754 MEH-2122 MEH-1606
MEH-2241 MEH-817`.)

**Measured 06/09 (runs `34024051854` full, `34024053379` narrowed, both dry-run on
`staging`):** 52 issues with PR attachments → `done` 1 (MEH-1508 — stale ticks, since
re-opened by hand), `dod-unticked` 39, `skip` 12; zero contradictions against the manual
sweep of 06/09 on MEH-2227. MEH-2122 came back **(a)**, MEH-1606 **(a)** (#3321 had
merged), MEH-1754 was filtered (Done). The 39 included MEH-2227 and MEH-2244 themselves,
which is why the control-card exclusion above exists and why no `write` run happened
before it landed.

**Control for the null.** If the table prints `(no issues with PR attachments)` for
that filter, the sweep did not see the cards — a Linear auth or team-name problem, not
five clean cards. Every one of the five is known to carry attachments, so an empty
table here is the instrument failing, never the answer.

## Shape of the output

From the test fixtures (the same code path the workflow runs):

```
| issue | PRs | class | action |
|---|---|---|---|
| MEH-9001 | #3001 (merged), #3002 (merged) | a | done |
| MEH-9002 | #3003 (merged) | a | dod-unticked |
| MEH-9003 | #3007 (closed-unmerged) | b | superseded |
| MEH-9004 | #3003 (merged), #3010 (open) | c | skip |
| MEH-9006 | #3011 (merged), #3012 (closed-unmerged) | a | done |
```

`--write` adds a fifth column, `result` — `done` / `skipped-identical` / `n/a`.

## Not in scope, on purpose (card §over_engineering_guard)

No auto-merge, no detaching PRs from cards, no stale bot on issues (that is chunk C,
`meh-2244-stale.patch.md`), and **no closing of a card whose DoD is unticked** — the
`done` path requires every DoD line ticked and at least one DoD line to exist.

Refs MEH-2244 (chunk 4/4)
