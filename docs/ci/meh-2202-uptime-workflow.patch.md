# `uptime.yml` — scheduled external uptime probe, Sentry-independent (MEH-2202, ADDENDUM-11 §Token)

> **Status: ✅ APPLIED 2026-09-07 — `ef1a0bfe` (PR #3482), and on `main` via
> release #3494 (`8e69ff1e`).** ADDENDUM-11 replaced the UptimeRobot account the
> card asked for with a repo-owned workflow: no account, no money, no Sentry
> dependency.
>
> **The 06/09 status line said the harness refused every write path to
> `.github/workflows/**`. That was wrong about the API route** — it conflated a
> Bash/`curl` classifier refusal with a blanket block. The GitHub Contents API
> (`create_or_update_file`) accepts writes to that directory; only
> `.claude/hooks/**` is refused at the sandbox proxy. This is the tool × path
> split `.claude/rules/security.md` already documents.
>
> **Two deviations from §2 as applied**, both deliberate: a `gh label create`
> bootstrap line so the alert path cannot die on a missing label, and the
> issue-lookup error handling rewritten so a failed `gh issue list` aborts the
> tick loudly instead of arriving as an empty string that reads as "no open
> issue" and opens a duplicate on top of a live outage.
>
> **Smoke run:** dispatch `34101513523`, `run_number: 1` — both endpoints
> `HTTP 200`, `FAIL: 0`, no issue opened, label auto-created. **§4's residual
> click (Repo → Watch → Custom → Issues) is still open and is still Sapir's** —
> without it the issue opens to an empty room.

## 1 · What it does

Every 10 minutes, from a GitHub-hosted runner (outside Railway, outside Vercel,
outside Sentry):

1. `GET https://mehamakor.co.il/` — expects `200`.
2. `GET https://mehamakor.co.il/api/health/readiness` — expects `200` (this is
   the deep probe: DB `SELECT 1` + lifespan `db_init_status`; `/health` alone is
   the hard-coded `ok` alias MEH-1905 documents as blind).
3. On the **second consecutive failure** of either probe it opens (or updates)
   one GitHub issue labelled `uptime`; on recovery it closes it with the
   timestamp. One issue per outage, never one per tick.

The "×2 consecutive" rule is carried in the issue itself: a first failure
leaves a comment on a draft issue that stays closed; the second failure within
the next tick reopens it. No external state store.

## 2 · The file — `.github/workflows/uptime.yml`

```yaml
name: Uptime probe

# MEH-2202: external, Sentry-independent liveness + readiness probe. Runs on a
# GitHub-hosted runner every 10 minutes and turns two consecutive failures into
# a GitHub issue (label `uptime`), closed again on recovery. No account, no
# money, no repo secret. Manual dispatch kept for a smoke run after applying.
on:
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch:

permissions:
  contents: read
  issues: write

concurrency:
  group: uptime-probe
  cancel-in-progress: false

jobs:
  probe:
    name: Probe / and /api/health/readiness
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      HOME_URL: https://mehamakor.co.il/
      READY_URL: https://mehamakor.co.il/api/health/readiness
      GH_TOKEN: ${{ github.token }}
      GH_REPO: ${{ github.repository }}
    steps:
      - name: Probe both endpoints
        id: probe
        shell: bash
        run: |
          set -uo pipefail
          fail=0
          for url in "$HOME_URL" "$READY_URL"; do
            code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 --retry 2 --retry-delay 5 "$url" || echo 000)
            echo "$url -> HTTP $code"
            if [ "$code" != "200" ]; then fail=1; fi
          done
          echo "fail=$fail" >> "$GITHUB_OUTPUT"

      # One issue carries the outage state. Title is fixed so `gh issue list`
      # finds it; the body's first line records whether the previous tick
      # already failed (the "×2 consecutive" memory).
      - name: Update the outage issue
        if: always()
        shell: bash
        env:
          FAIL: ${{ steps.probe.outputs.fail }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          set -euo pipefail
          title="uptime: mehamakor.co.il probe failing"
          now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
          open=$(gh issue list --state open --label uptime --search "$title in:title" --json number --jq '.[0].number // empty')
          closed=$(gh issue list --state closed --label uptime --search "$title in:title" --limit 1 --json number,body --jq '.[0] | "\(.number)\t\(.body | split("\n")[0])"' || true)

          if [ "$FAIL" = "1" ]; then
            if [ -n "$open" ]; then
              gh issue comment "$open" --body "still failing at $now — $RUN_URL"
            elif [ -n "$closed" ] && [ "${closed#*$'\t'}" = "first-failure-pending" ]; then
              # second consecutive failure → reopen with the real body
              n="${closed%%$'\t'*}"
              gh issue edit "$n" --body "OUTAGE OPENED $now (two consecutive probe failures) — $RUN_URL"
              gh issue reopen "$n"
            else
              # first failure: create closed, marked pending; the next tick decides
              n=$(gh issue create --title "$title" --label uptime --body "first-failure-pending" | grep -oE '[0-9]+$')
              gh issue close "$n" --comment "first failure at $now — waiting for the next tick before alerting ($RUN_URL)"
            fi
          else
            if [ -n "$open" ]; then
              gh issue close "$open" --comment "recovered at $now — $RUN_URL"
            elif [ -n "$closed" ] && [ "${closed#*$'\t'}" = "first-failure-pending" ]; then
              n="${closed%%$'\t'*}"
              gh issue edit "$n" --body "single failure, recovered by the next tick at $now"
            fi
          fi
```

## 3 · Verification after applying

1. `workflow_dispatch` once — the job log must print two `-> HTTP 200` lines
   and open nothing.
2. Negative control (the only way to prove the alert path): temporarily edit
   `READY_URL` to `https://mehamakor.co.il/api/health/does-not-exist` on a
   branch, dispatch twice — the first run creates a **closed** issue marked
   `first-failure-pending`, the second **reopens** it. Revert. A third dispatch
   on the reverted file closes it with "recovered".
3. Create the `uptime` label once (`gh label create uptime --color d73a4a`).

## 4 · Sapir residual — one click

GitHub → repo → Watch → Custom → **Issues** (or notification settings →
email on issues you are subscribed to). That is the alert channel; without it
the issue opens silently.

## 5 · What this is not

- Not a replacement for Sentry (errors) or Railway's own healthcheck
  (MEH-1905's other half): it is the outside-in "is the site up" signal.
- Not per-minute: 10 minutes is GitHub's practical floor for reliable
  scheduled runs; the ×2 rule means the earliest alert is ~20 minutes after
  the outage starts, which the card's "blind window until ~1/9" already
  accepted as the tier.
- Not staging: the staging host sits behind Vercel deployment protection
  (302 → `vercel.com/sso-api`), so a probe there measures the wall, not the
  site.
