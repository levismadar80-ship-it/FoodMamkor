# MEH-3153 — alert on a red nightly WebKit/iPhone run

**What it does:** the `e2e-webkit` job (non-voting, nightly) gets one extra step.
On a scheduled night with `failed > 0` or `executed = 0`, it opens an issue
labelled `webkit-nightly`, or comments on the one already open. On a clean night
it closes that issue. Manual dispatch runs never touch it. The job also gets
`issues: write` (job-level `permissions`), which nothing else in the job uses.

**Edges, on purpose:**
- A night that hits the job timeout leaves no `results.json`, which reads as
  `executed=0`, so it alerts. A hung night is not silent.
- A night whose only problems are flaky tests counts as green, the same trade as
  MEH-2972 for staging. The flaky count is in the summary line, and the weekly
  scan reads it.

**Why a patch:** `.github/**` cannot be written from a Claude Code session
(`.claude/rules/security.md`). Claude in Chrome commits it on the PR branch,
and then the session checks the PR diff byte for byte against this file.

**Verified (14/11/2026, against `origin/staging` at the time):**
- `git apply --check` passes;
- the patched file parses as YAML (`yaml.safe_load`).

The issue logic copies `uptime.yml` (MEH-2202). The weekly repo-health scan
reads the open `webkit-nightly` issue, plus the step summary line
`WebKit iPhone 13 — executed=… failed=…`.

```diff
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -813,6 +813,11 @@
       queue: max
     # Never fails the workflow. See property 1 above.
     continue-on-error: true
+    # MEH-3153: issues: write is for the nightly alert step only (one issue,
+    # label webkit-nightly, opened on a red night, closed on a green one).
+    permissions:
+      contents: read
+      issues: write
 
     # MEH-2972: nightly + manual only (no PR, no push), so the paths filter and
     # the `run-e2e` clauses below never decide anything — left in place so the
@@ -937,6 +942,42 @@
             echo "::warning::WebKit run executed 0 tests — the shadow job proved nothing this run."
           fi
 
+      # MEH-3153: a red night must reach someone. The job stays non-voting;
+      # this step only keeps ONE open issue (label webkit-nightly) in step with
+      # the nightly result: opened or commented when failed > 0 or executed = 0,
+      # closed when a night is clean. Schedule only, so a manual dispatch on a
+      # branch never opens or closes it. Same shape as uptime.yml.
+      - name: Alert on a red WebKit night
+        if: always() && github.event_name == 'schedule'
+        working-directory: frontend
+        env:
+          GH_TOKEN: ${{ github.token }}
+          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
+        run: |
+          REPORT=playwright-report/results.json
+          if [ -f "$REPORT" ]; then
+            FAILED=$(jq '.stats.unexpected // 0' "$REPORT")
+            EXECUTED=$(jq '(.stats.expected // 0) + (.stats.unexpected // 0) + (.stats.flaky // 0)' "$REPORT")
+          else
+            FAILED=0; EXECUTED=0
+          fi
+          gh label create webkit-nightly --color d73a4a --description "MEH-3153 nightly WebKit/iPhone run" 2>/dev/null || true
+          title="webkit-nightly: iPhone (WebKit) run is red"
+          if ! open=$(gh issue list --state open --label webkit-nightly --search "\"$title\" in:title" --json number --jq '.[0].number // empty'); then
+            echo "::error::gh issue list failed; issue state left untouched."
+            exit 1
+          fi
+          summary="executed=$EXECUTED failed=$FAILED — $RUN_URL"
+          if [ "$FAILED" -gt 0 ] || [ "$EXECUTED" -eq 0 ]; then
+            if [ -n "$open" ]; then
+              gh issue comment "$open" --body "still red: $summary"
+            else
+              gh issue create --title "$title" --label webkit-nightly --body "The nightly WebKit/iPhone 13 run (non-blocking) is red: $summary. Failing tests are in the playwright-report-webkit artifact of that run."
+            fi
+          elif [ -n "$open" ]; then
+            gh issue close "$open" --comment "green again: $summary"
+          fi
+
       # Distinct artifact name: two jobs uploading `playwright-report` in the
       # same run collide.
       - name: Upload Playwright report (webkit)
```
