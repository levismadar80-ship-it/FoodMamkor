> **✅ Status: APPLIED — as-of 21/11/2026.** `.github/workflows/load-test.yml`
> was committed through Claude in Chrome on this branch (commit `420fc19e0`); its
> sha256 `2e07249e…d4a312` matches the YAML below byte for byte. Register row:
> `load-test` in `docs/ci/patch-register.tsv`.

# 🔧 Staged patch: a manual k6 load test, run from GitHub (MEH-3564)

## Why this is a workflow and not a local run

The only load-test run is from 14/05/2026
(`docs/research/k6-load-testing-baseline.md`), made by hand from Git Bash.
`docs/runbooks/load-testing.md` asks for a re-run the week before launch and
after big router changes. Both have happened since May.

The CC sandbox cannot reach the Railway backend, and `curl` to staging's `/api`
also gets 403 from the proxy (checked 21/11, see MEH-2090). A GitHub runner and
Grafana Cloud's load generators both reach it directly. So the run moves to CI
and stops depending on anyone's computer. This is the industry default:
Grafana's own `setup-k6-action` and `run-k6-action`
([Grafana blog](https://grafana.com/blog/2024/07/15/performance-testing-with-grafana-k6-and-github-actions/)).

## Why `workflow_dispatch` only, never a required check

It loads a live target. A red run can mean that staging was slow, or that the
code regressed, and a gate that goes red for two reasons is not a gate (same
reasoning as `cls-measure.yml`). It also spends Grafana Cloud VUh (500 a month
free, about 25 per run of the current script).

## Two modes

| `where` | Load comes from | Needs |
|---|---|---|
| `cloud` (default) | Grafana Cloud k6 load generators; results kept in Grafana | secrets `K6_CLOUD_TOKEN`, `K6_CLOUD_PROJECT_ID` |
| `local` | the GitHub runner itself; summary in the job log | nothing new. If the two secrets exist, results are also uploaded to Grafana |

**What the cloud mode does not fix.** slowapi limits `GET /producers` to 120 a
minute per IP. A cloud run in one load zone still comes from a handful of IPs,
so the 429 wall from May is still expected after the first seconds. The
first-3-seconds p95 stays the real signal (baseline doc, «Rate-limit-aware
measurement strategy»). A true ceiling needs the limiter lifted on staging for
the test window. That is a security decision and is not part of this patch.

## Guards inside the workflow

- `base_url` must be the staging Railway backend. Anything else fails before k6
  starts, so production cannot be loaded by a typo.
- `cloud` without the two secrets fails with a message naming them, rather than
  silently running locally.
- `PRODUCER_SLUG` and `PRODUCER_ID` come from a real `/producers` row, so the
  numbers are not dominated by 404s. If none is found the run stops.

## The YAML

```yaml
name: Load test (manual)

# workflow_dispatch בלבד: זו מדידה מול staging חי, לא שער, ואסור שתהפוך ל-required.
# אדום שלה יכול להיות «staging היה איטי» באותה מידה כמו «הקוד נסוג». MEH-3564.
# מסמך: docs/ci/load-test.patch.md · runbook: docs/runbooks/load-testing.md
on:
  workflow_dispatch:
    inputs:
      where:
        description: "Where the load comes from: cloud (Grafana Cloud k6) or local (this runner)"
        required: true
        default: cloud
        type: choice
        options:
          - cloud
          - local
      base_url:
        description: "Staging backend URL (never production)"
        required: false
        default: "https://foodmamkor-staging.up.railway.app"
        type: string

permissions:
  contents: read

concurrency:
  group: load-test
  cancel-in-progress: false

jobs:
  load-test:
    name: k6 load test
    runs-on: ${{ (vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest' }}
    timeout-minutes: 30
    env:
      BASE_URL: ${{ inputs.base_url }}
      K6_CLOUD_TOKEN: ${{ secrets.K6_CLOUD_TOKEN }}
      K6_CLOUD_PROJECT_ID: ${{ secrets.K6_CLOUD_PROJECT_ID }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Refuse anything but the staging backend
        run: |
          if [ "$BASE_URL" != "https://foodmamkor-staging.up.railway.app" ]; then
            echo "::error::base_url must be https://foodmamkor-staging.up.railway.app (got: $BASE_URL). Never production."
            exit 1
          fi

      - name: Cloud mode needs both Grafana secrets
        if: inputs.where == 'cloud'
        run: |
          if [ -z "$K6_CLOUD_TOKEN" ] || [ -z "$K6_CLOUD_PROJECT_ID" ]; then
            echo "::error::where=cloud needs secrets K6_CLOUD_TOKEN and K6_CLOUD_PROJECT_ID. Add them, or run with where=local."
            exit 1
          fi

      - name: Pick a real producer
        id: producer
        run: |
          body="$(curl -fsS --max-time 30 "$BASE_URL/producers?page_size=1")"
          slug="$(printf '%s' "$body" | jq -r '(.[0].slug // .producers[0].slug // .items[0].slug) // empty')"
          pid="$(printf '%s' "$body" | jq -r '(.[0].id // .producers[0].id // .items[0].id) // empty')"
          if [ -z "$slug" ] || [ -z "$pid" ]; then
            echo "::error::No producer found at $BASE_URL/producers. The run would measure 404s only."
            exit 1
          fi
          echo "slug=$slug" >> "$GITHUB_OUTPUT"
          echo "id=$pid" >> "$GITHUB_OUTPUT"

      - uses: grafana/setup-k6-action@c47136d33d365efbeb9ae7266908b5dcf98cdece # v1.3.0

      - uses: grafana/run-k6-action@54385d2a25c222a08b4a3aec6b653b8fb370a1ed # v1.6.0
        with:
          path: scripts/load-test.js
          cloud-run-locally: ${{ inputs.where == 'local' }}
          cloud-comment-on-pr: false
          debug: true
          flags: >-
            -e BASE_URL=${{ inputs.base_url }}
            -e PRODUCER_SLUG=${{ steps.producer.outputs.slug }}
            -e PRODUCER_ID=${{ steps.producer.outputs.id }}
```

## How to apply

1. Create `.github/workflows/load-test.yml` with the YAML above, on a
   `feature/meh-3564-*` branch (Claude in Chrome or Sapir; CC cannot write
   `.github/**`).
2. In the same PR: `docs/ci/patch-register.tsv` row `load-test` → `applied`,
   and this banner → APPLIED.
3. After merge: Actions → «Load test (manual)» → Run workflow, `where=cloud`.
4. Copy the per-endpoint p95 and the first-3s p95 into a new dated section of
   `docs/research/k6-load-testing-baseline.md`.
