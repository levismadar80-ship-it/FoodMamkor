# MEH-2244 chunk C — stale-PR bot (`stale-prs.yml`), PRs only

> **`.github/workflows/**` is CC-deny (MEH-671). This file is the workflow for Sapir to
> paste as `.github/workflows/stale-prs.yml`.** Nothing else on this branch — the bot is
> configuration, not code.

## What it does, and what it never touches

A PR with **no activity for 14 days** gets the `stale` label and a comment. If nothing
happens for **7 more days** (day 21 of inactivity) it is closed with *"superseded or
abandoned — reopen if wrong"*. Any activity — a push, a comment, a label change —
clears the label and restarts the clock; that is the action's own behaviour
(`remove-stale-when-updated`, default `true`).

**It never touches issues.** `days-before-issue-stale: -1` and
`days-before-issue-close: -1` disable the issue half of the action outright — this
repo's issues live in Linear, and a bot closing GitHub issues would be closing the
wrong thing. The card's line is explicit: *"Never touches issues."*

**Two labels exempt a PR entirely** (`exempt-pr-labels`):

| Label | Why |
|---|---|
| `do-not-merge` | the merge-block marker. `.claude/rules/workflow.md:1615` — *"`do-not-merge` is a GitHub label. It is the only marker."* (rule 30b, MEH-1523). A parked PR is parked on purpose; a bot must not close it. |
| `keep-open` | the explicit "I know it is idle" opt-out for anything else. Create the label when pasting — it does not exist yet. |

Drafts are **not** exempt (`exempt-draft-pr: false`): a draft idle for three weeks is
the abandoned-attempt shape the card describes, and a draft that is still wanted gets
`keep-open`.

## The close threshold — a choice, stated

`actions/stale` counts `days-before-pr-close` **from the moment the `stale` label was
applied**, not from the last human activity. So the two numbers add:

| `days-before-pr-stale` | `days-before-pr-close` | idle days at close |
|---|---|---|
| 14 | 7 | **21** |
| 14 | 21 | 35 |

The card says *"14 days no activity → label `stale` + comment; 21 days → close"*, which
reads as **21 idle days total**. This patch takes that reading: **`days-before-pr-close:
7`**, so the close lands on day 21. If Sapir prefers "21 days after the label" (35 idle
days), change the one number — nothing else moves. The alternative was considered and
not taken because it would make the card's own "21 days" line false as written.

## Permissions

The action labels, comments on, and closes PRs. On GitHub's API those are **issue**
endpoints (PRs are issues), so it needs `issues: write` as well as
`pull-requests: write` — with `pull-requests: write` alone it fails on the label call.
Both are scoped to the automatic `GITHUB_TOKEN`; no secret is added.

## The workflow

```yaml
# .github/workflows/stale-prs.yml
#
# MEH-2244 chunk C — mark idle PRs stale at 14 days, close at 21. PRs only;
# issues live in Linear and are disabled here with -1. Exempt: do-not-merge
# (the merge-block marker, rule 30b) and keep-open.
name: Stale PRs

on:
  schedule:
    - cron: "0 3 * * *" # daily 03:00 UTC
  workflow_dispatch:
    inputs:
      debug-only:
        description: "dry run: log what would be labelled/closed, change nothing"
        type: boolean
        required: false
        default: true

permissions:
  issues: write         # labels + comments go through the issues API, PRs included
  pull-requests: write

concurrency:
  group: stale-prs
  cancel-in-progress: false

jobs:
  stale:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      # Pin the SHA when pasting: actions/stale@v9 -> the v9.x.y commit SHA,
      # same convention as the other workflows in this repo.
      - uses: actions/stale@v9
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}

          # ---- issues: OFF. This repo's issues are in Linear. ----------------
          days-before-issue-stale: -1
          days-before-issue-close: -1

          # ---- PRs ------------------------------------------------------------
          days-before-pr-stale: 14
          # Counted from the stale label, so 14 + 7 = closed on idle day 21
          # (the card's "21 days -> close"). 21 here would mean idle day 35.
          days-before-pr-close: 7
          stale-pr-label: stale
          exempt-pr-labels: "do-not-merge,keep-open"
          exempt-draft-pr: false
          remove-stale-when-updated: true

          stale-pr-message: >-
            This PR has had no activity for 14 days and is now marked `stale`.
            It will be closed in 7 days unless something happens here — a push,
            a comment, or the `keep-open` label. If it is parked on purpose,
            add `do-not-merge` or `keep-open` and the bot leaves it alone.
          close-pr-message: >-
            Closed as superseded or abandoned — 21 days without activity.
            Reopen if wrong; reopening clears the stale label and restarts the clock.

          # ---- run shape -----------------------------------------------------
          operations-per-run: 100
          ascending: true # oldest first, so the ones closest to closing are never starved
          debug-only: ${{ github.event_name == 'workflow_dispatch' && inputs.debug-only || false }}
```

**First run: dispatch with `debug-only: true`.** The action then logs every PR it
*would* label or close and changes nothing — that log is the discrimination check
for the exempt list and the thresholds, on the live PR set, before any label lands.
The daily schedule always runs live (`debug-only` is `false` there); that is
deliberate — a scheduled dry-run would be a bot that never does anything.

## What it will do on day one

Measured 2026-09-04 against the live repo, every open PR in **one** window
(`state=open`, `per_page=100`, sorted by `updated` ascending — 44 returned, fewer than
the page size, so this is the complete set and not a slice of it):

| Measure | Value |
|---|---|
| open PRs | **44** |
| open PRs with no activity for ≥ 14 days | **0** |
| oldest `updated_at` | #3277 — 2026-09-02 (2 days) |
| oldest `created_at` | #3277 — 2026-09-02 |
| drafts | 1 — #3307, and it already carries `do-not-merge` |
| PRs carrying `do-not-merge` | 1 (#3307) |
| PRs carrying `keep-open` | 0 (the label does not exist yet) |

**So on day one the bot labels nothing and closes nothing.** Every open PR was
touched inside the last 48 hours — the drain batch of 04/09 is what the listing shows,
and it is all live. The earliest a `stale` label can land is **2026-09-16**, and only
on a PR that receives no push, comment, or label change between now and then; the
earliest close is 2026-09-23. In other words: pasting this workflow today changes
nothing until the current batch has been merged or genuinely gone quiet, which is the
right first behaviour for a closing bot.

The five oldest by last activity, for the record:

| PR | last updated | created | draft | labels |
|---|---|---|---|---|
| #3277 | 2026-09-02 | 2026-09-02 | no | — |
| #3293 | 2026-09-02 | 2026-09-02 | no | — |
| #3297 | 2026-09-02 | 2026-09-02 | no | — |
| #3306 | 2026-09-03 | 2026-09-03 | no | — |
| #3307 | 2026-09-03 | 2026-09-03 | **yes** | `do-not-merge` |

**How this was measured, because the prescribed instrument did not work.** The card
asked for `curl` with `$GITHUB_TOKEN` against the REST API. In the CC sandbox that
variable holds a 14-character proxy placeholder, not a GitHub credential: the REST
call returned `401 Bad credentials` under both the `Bearer` and `token` schemes, and
the unauthenticated fallback returned `403 API rate limit exceeded` on the shared
egress IP. The numbers above come from the GitHub MCP `list_pull_requests` call
(`perPage: 100`, `sort: updated`, `direction: asc`) — the same endpoint, through the
credential the harness actually holds. Same data; different door. Re-measure from a
machine with a real token if the door matters.

## Interaction with the reconcile sweep (chunk D)

A PR this bot closes becomes `closed-unmerged` on the next weekly
`scripts/oneoff/pr-reconcile.mjs` run, and its card gets the `superseded/abandoned:
#N (<reason>)` comment — the reason will be the close message above, since the sweep
reads the first PR comment mentioning "superseded"/"abandoned". The two mechanisms
compose without either knowing about the other.

Refs MEH-2244 (chunk 3/4)
