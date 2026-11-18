# `Staging health` — rule 41 as a required status (MEH-3176 follow-up)

**Status: staged for Sapir. NOT APPLIED.** `.github/workflows/**` is CC-deny,
so CC wrote the logic in `scripts/ci/staging_health.py` (committable, with a
self-test) and only the thin workflow below needs a human commit.

## What it does

Rule 41: nothing merges to staging while staging is red, and «the latest
staging run passed» is the wrong test, because a run that skipped Playwright
reports green. `staging_health.py` walks back through the staging E2E runs to
the last one whose `Playwright E2E (Vercel preview)` jobs actually executed, and
uses that conclusion. Skipped, cancelled and still-running runs say nothing. No
executed run in a 50-run window = unknown, which is not a green.

It posts a commit status named `Staging health` on every open PR into staging:

- when a PR is opened, pushed, reopened or relabeled (that PR);
- when a staging E2E run finishes (every open PR, so armed auto-merges stop
  the moment staging goes red and resume when it goes green).

The PR that fixes the red carries the `fixes-staging-red` label and gets a
green status with that reason. This is the industry «stop merging when main is
red» gate (Uber's Submit Queue, the stop-merging GitHub Action), built on what
the repo already has.

Checked on 18/11 against the live API: `staging d9aa42e: 2 Playwright job(s)
passed`, run 44328181747. Self-test: 14/14, and 2 cases go red when the
«skips say nothing» line is broken.

## Steps (Sapir, or the Chrome thread with her typed OK)

1. Create the label `fixes-staging-red`.
2. Commit `.github/workflows/staging-health.yml`:

```yaml
name: Staging health

# Rule 41 — see docs/ci/staging-health.patch.md. Logic: scripts/ci/staging_health.py
on:
  pull_request:
    branches: [staging]
    types: [opened, synchronize, reopened, labeled, unlabeled]
  workflow_run:
    workflows: ["E2E Tests"]
    types: [completed]
    branches: [staging]

permissions:
  actions: read
  contents: read
  pull-requests: read
  statuses: write

concurrency:
  group: staging-health-${{ github.event.pull_request.number || 'all' }}
  cancel-in-progress: true

jobs:
  health:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v7
        with:
          ref: staging   # the script comes from staging, never from the PR head
      - name: Post Staging health
        env:
          GITHUB_TOKEN: ${{ github.token }}
          LABELS: ${{ join(github.event.pull_request.labels.*.name, ',') }}
          SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            python3 scripts/ci/staging_health.py post --sha "$SHA" --labels "$LABELS"
          else
            python3 scripts/ci/staging_health.py post-all
          fi
```

3. After one PR shows the `Staging health` status, add it to the required
   checks of ruleset `protect-staging` (15240090), next to `CI gate` and
   `Deploy gate`.

## Limits

- A PR from a fork gets a read-only token and cannot post the status. Every
  PR here is from a branch of this repo.
- `pull_request` with `ref: staging` runs the script from staging, so a PR
  cannot change the gate that judges it.
- The status says whether the base is red. Whether a red in the PR's own E2E
  may be passed is still rule 39.
