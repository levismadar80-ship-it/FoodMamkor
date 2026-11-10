# Patch — post-deploy checks: smoke on push, skip when nothing checked changed, weekly full crawl (MEH-2864)

**For Sapir.** `.github/workflows/**` is CC-deny, so CC prepared this patch and you commit it (GitHub web editor, or `git apply`). Everything it calls is already in the repo after #4253: `scripts/link-check.mjs --smoke`, `scripts/frontend-touched.sh`, and the «requests to Vercel: N» line every check prints.

## What it changes (`.github/workflows/post-deploy-checks.yml`)

| today | after |
|---|---|
| every push to staging/main crawls the live site (staging: 40-page sample since #4245; main: up to 2000 pages) | a push runs `link-check --smoke`: **at most 10 URLs** (404 control, business discovery, home, list, map, health, one business page) |
| runs on every push, docs-only included | a push **skips every step that touches the live site** when nothing it checks changed **since the last checked push**: `frontend/` (minus `e2e/`, `__tests__/`), `backend/`, `scripts/checks/`, `scripts/link-check.mjs` and this workflow |
| no full crawl of the live site on a schedule | **weekly full crawl, production only**: Sunday 03:17 UTC, `--max-pages=2000`. Smoke, headers and Lighthouse don't run on that schedule |
| — | the crawl on every E2E run happens against a local `next start` (`e2e/flows/manual/link-crawl.spec.ts`): 0 requests to Vercel |

### The baseline is the last successful push run, not `github.event.before`

This is from the fresh review on #4253. The workflow cancels in-progress runs (`cancel-in-progress: true`). Suppose a frontend push A is still in wait-for-deploy when a docs-only push B lands. B cancels A's run. If B diffed only `A..B`, it would see nothing and skip, so A's change would never be checked and nobody would be told. Docs PRs land right after code PRs (rule 31b), so this is the normal sequence here.

So the step asks `gh run list` for this branch's last **successful push** run and diffs from its head. In the example that is the run before A, so B checks A's change. If no run is found, or the lookup fails, the base is empty and the answer is `touched=true` (fail-safe). This needs `permissions: actions: read`, which the patch adds. `fetch-depth: 50` covers a normal day of merges; a base older than that also fails safe.

### Concurrency

The group key now includes the event (`post-deploy-checks-<event>-<ref>`). The weekly schedule runs on the default branch's ref (staging), so without the event in the key, a staging push and the weekly production crawl would cancel each other.

## Cost, per run (requests to Vercel)

| run | before | after |
|---|---|---|
| staging push, something checked changed | wait-for-deploy (2 per poll) + up to ~43 (40-page sample + preflight) + 3 headers | wait-for-deploy + **≤ 7 smoke** (+ redirect hops) + 3 headers |
| staging push, docs only | same as above | **0** |
| main push | wait-for-deploy + up to ~2000 crawl + production smoke + headers + Lighthouse | wait-for-deploy + ≤ 7 smoke + production smoke + headers + Lighthouse (prints «15 page loads», 5 pages × 3 runs; assets not counted) |
| weekly | — | one full production crawl |

**Still the biggest cost left, not changed here:** `wait_for_deploy.py` polls the home page with a cache-busting query (`?_wfd=<time>`) every 20 s for up to 20 min. That's 2 uncached requests per poll, up to ~120 per push. It's ranked in the Phase 0 report on MEH-2864, and its count now prints.

## Verification (CC, 10/11)

- `git apply --check` against this PR's branch: applies cleanly. The patched file parses as YAML.
- `scripts/link-check.mjs --self-test` still passes. It reads this workflow's `BASE_URL` line, which the patch doesn't touch.
- Read through the schedule run:
  - `BASE_URL` falls through to production and `IS_PRODUCTION` is false; `--max-pages=2000` overrides the sample.
  - Only the links step runs, and the Verdict treats the skipped steps as OK.

## The patch

```diff
--- a/.github/workflows/post-deploy-checks.yml
+++ b/.github/workflows/post-deploy-checks.yml
@@ -5,6 +5,12 @@
 #   2. broken-link crawl — scripts/link-check.mjs (MEH-1963, reused) +
 #      live security headers — scripts/checks/live_security_headers.py
 #   3. Lighthouse performance budget — scripts/checks/lighthouserc.cjs
+# MEH-2864 («ייעול הבדיקות»): a push checks the live site with a SMOKE of
+# ≤10 URLs (link-check --smoke), and only when something it checks changed
+# since the last checked push — frontend/, backend/ or the checks themselves
+# (scripts/frontend-touched.sh). The full crawl runs
+# in E2E against a local `next start` (e2e/flows/manual/link-crawl.spec.ts) and,
+# against the live site, once a week on production only (the schedule below).
 # Not a required check: it runs after merge, against the live site. A red
 # here means "the deploy that just landed broke something" and arrives as the
 # usual GitHub Actions failure email. All logic lives in scripts/checks/;
@@ -13,6 +19,9 @@
 "on":
   push:
     branches: [staging, main]
+  schedule:
+    # MEH-2864: the weekly full crawl of production (Sunday 03:17 UTC).
+    - cron: "17 3 * * 0"
   workflow_dispatch:
     inputs:
       target:
@@ -23,14 +32,19 @@
 
 permissions:
   contents: read
+  # MEH-2864: the "did this push change …" step reads this workflow's own
+  # last successful run (gh run list).
+  actions: read
 
 concurrency:
-  group: post-deploy-checks-${{ github.ref }}
+  # MEH-2864: the event is in the key, so the weekly production crawl (which
+  # runs on the default branch's ref) and a staging push never cancel each other.
+  group: post-deploy-checks-${{ github.event_name }}-${{ github.ref }}
   cancel-in-progress: true
 
 jobs:
   checks:
-    name: Post-deploy checks (${{ github.ref_name }})
+    name: Post-deploy checks (${{ github.event_name == 'schedule' && 'weekly production crawl' || github.ref_name }})
     runs-on: ubuntu-latest
     timeout-minutes: 45
     env:
@@ -41,6 +55,30 @@
         run: echo "BASE_URL=$BASE_URL IS_PRODUCTION=$IS_PRODUCTION (smoke and Lighthouse run only when IS_PRODUCTION=true)"
 
       - uses: actions/checkout@v7
+        with:
+          # MEH-2864: frontend-touched.sh diffs from the last checked push; with
+          # the default depth of 1 that commit is missing and it fails safe
+          # (checks run). 50 covers a normal day of merges.
+          fetch-depth: 50
+
+      - name: Did anything checked change since the last checked push?
+        id: touched
+        env:
+          GH_TOKEN: ${{ github.token }}
+        run: |
+          if [ "${{ github.event_name }}" = "push" ]; then
+            # Diff against the head of this branch's last SUCCESSFUL push run,
+            # not github.event.before: with cancel-in-progress, a frontend
+            # push whose run was cancelled by a later docs-only push would
+            # otherwise never be checked (fresh review on #4253). No such run,
+            # or the lookup fails → empty base → touched=true (fail safe).
+            base="$(gh run list --workflow post-deploy-checks.yml --branch "$GITHUB_REF_NAME" --event push --status success -L 1 --json headSha -q '.[0].headSha' 2>/dev/null || true)"
+            echo "last checked push: ${base:-none found}"
+            bash scripts/frontend-touched.sh "${base}" "${{ github.sha }}"
+          else
+            echo "touched=true — ${{ github.event_name }} always checks"
+            echo "touched=true" >> "$GITHUB_OUTPUT"
+          fi
 
       - uses: actions/setup-python@v6
         with:
@@ -51,26 +89,37 @@
           node-version: "22"
 
       - name: Wait for the new build to be live
-        if: github.event_name == 'push'
+        if: github.event_name == 'push' && steps.touched.outputs.touched == 'true'
         env:
           VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
         run: python scripts/checks/wait_for_deploy.py --base-url "$BASE_URL" --sha "${{ github.sha }}" || echo "::warning title=Deploy not detected::the checks below may describe the previous build"
 
       - name: Production smoke
         id: smoke
-        if: env.IS_PRODUCTION == 'true'
+        if: env.IS_PRODUCTION == 'true' && github.event_name != 'schedule' && steps.touched.outputs.touched == 'true'
         continue-on-error: true
         run: python scripts/checks/smoke_production.py --base-url "$BASE_URL"
 
       - name: Broken links
         id: links
+        if: steps.touched.outputs.touched == 'true'
         continue-on-error: true
         env:
           VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
-        run: node scripts/link-check.mjs "$BASE_URL"
+        # MEH-2864: weekly → full crawl (production host); every other run →
+        # smoke, ≤10 URLs. Both print «requests to Vercel: N».
+        run: |
+          if [ "${{ github.event_name }}" = "schedule" ]; then
+            # IS_PRODUCTION is false on a schedule run, which would mean a
+            # 40-page sample; the weekly crawl asks for the full budget.
+            node scripts/link-check.mjs "$BASE_URL" --max-pages=2000
+          else
+            node scripts/link-check.mjs "$BASE_URL" --smoke
+          fi
 
       - name: Security headers (live)
         id: headers
+        if: github.event_name != 'schedule' && steps.touched.outputs.touched == 'true'
         continue-on-error: true
         env:
           VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
@@ -82,7 +131,7 @@
         id: lighthouse
         # Production only, and no bypass secret in this step: Lighthouse would
         # send it to every third-party host the page loads.
-        if: env.IS_PRODUCTION == 'true'
+        if: env.IS_PRODUCTION == 'true' && github.event_name != 'schedule' && steps.touched.outputs.touched == 'true'
         continue-on-error: true
         env:
           LHCI_BASE_URL: ${{ env.BASE_URL }}
@@ -91,6 +140,9 @@
           # upload (to the local report folder) BEFORE assert, so a red run still keeps its report
           npx --yes @lhci/cli@0.15.1 upload --config=scripts/checks/lighthouserc.cjs
           npx --yes @lhci/cli@0.15.1 assert --config=scripts/checks/lighthouserc.cjs
+          # MEH-2864: the same count every check prints. Page loads only — each
+          # load also fetches its own assets, which are not counted here.
+          node -e "const c=require('./scripts/checks/lighthouserc.cjs').ci.collect; console.log('requests to Vercel: ' + c.url.length * (c.numberOfRuns || 1) + ' page loads (assets not counted)')"
 
       - name: Keep the Lighthouse report
         if: always()
```

## After applying

- Merge one **docs-only PR** to staging. Expect `last checked push: <sha>`, then `touched=false — nothing under frontend/, backend/ or the checks changed …`, and every live step `skipped`.
- Merge one frontend PR. Expect `link-check --smoke`, then «URLs checked: ≤10» and «requests to Vercel: N».
- `workflow_dispatch` → production runs the smoke (dispatch isn't the schedule). To try the weekly crawl by hand, run `node scripts/link-check.mjs https://mehamakor.co.il --max-pages=2000` locally.
- The first push after applying has no earlier successful run under the new step, or one from before the change. Either way it answers `touched=true` and checks: that's expected.
