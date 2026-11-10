# Patch — post-deploy checks: smoke on push, skip when nothing deployable changed, weekly full crawl (MEH-2864)

**For Sapir.** `.github/workflows/**` is CC-deny, so CC prepared this patch and you commit it. Everything it calls is already on `staging` (this PR): `scripts/link-check.mjs --smoke`, `scripts/frontend-touched.sh`, and the «requests to Vercel: N» line every check now prints.

## What it changes (`.github/workflows/post-deploy-checks.yml`)

| today | after |
|---|---|
| every push to staging/main crawls the live site (staging: 40-page sample since #4245; main: up to 2000 pages) | a push runs `link-check --smoke`: **at most 10 URLs** (404 control, home, list, map, health, one business page) |
| runs on every push, docs-only included | a push that changed nothing deployable under `frontend/` (tests excluded) **skips every step that touches the live site**, wait-for-deploy included |
| no full crawl of the live site on a schedule | **weekly full crawl, production only** (Sunday 03:17 UTC, `--max-pages=2000`). Smoke, headers and Lighthouse don't run on that schedule |
| — | the full crawl on every change runs in E2E against a local `next start` (`e2e/flows/manual/link-crawl.spec.ts`): 0 requests to Vercel |

`checkout` gets `fetch-depth: 50` so the helper can see the push's before-commit. If that commit is missing anyway, the helper answers "touched" and the checks run (fail-safe).

## Cost, per run (requests to Vercel)

| run | before | after |
|---|---|---|
| staging push, frontend changed | wait-for-deploy (2 per poll) + up to ~43 (40-page sample + preflight) + 3 headers | wait-for-deploy + **≤ 7 smoke** + 3 headers |
| staging push, docs/backend only | same as above | **0** |
| main push | wait-for-deploy + up to ~2000 crawl + smoke + headers + Lighthouse | wait-for-deploy + ≤ 7 smoke + production smoke + headers + Lighthouse |
| weekly | — | one full production crawl (today: 22 pages locally without data; production has no businesses yet) |

**Still the biggest cost left, not changed here:** `wait_for_deploy.py` polls the home page with a cache-busting query (`?_wfd=<time>`) every 20 s for up to 20 min. That's 2 uncached requests per poll, up to ~120 per push. A follow-up could poll a static asset or `/api/health` only. It's listed in the Phase 0 ranking on MEH-2864.

## Verification (CC, 10/11)

- `git apply --check` against `staging` (this PR's base): applies cleanly.
- The patched file parses as YAML.
- `scripts/link-check.mjs --self-test` still passes. It reads this workflow's `BASE_URL` line, which the patch doesn't touch.

## The patch

```diff
--- a/.github/workflows/post-deploy-checks.yml
+++ b/.github/workflows/post-deploy-checks.yml
@@ -5,6 +5,11 @@
 #   2. broken-link crawl — scripts/link-check.mjs (MEH-1963, reused) +
 #      live security headers — scripts/checks/live_security_headers.py
 #   3. Lighthouse performance budget — scripts/checks/lighthouserc.cjs
+# MEH-2864 («ייעול הבדיקות»): a push checks the live site with a SMOKE of
+# ≤10 URLs (link-check --smoke), and only when the push changed something
+# deployable under frontend/ (scripts/frontend-touched.sh). The full crawl runs
+# in E2E against a local `next start` (e2e/flows/manual/link-crawl.spec.ts) and,
+# against the live site, once a week on production only (the schedule below).
 # Not a required check: it runs after merge, against the live site. A red
 # here means "the deploy that just landed broke something" and arrives as the
 # usual GitHub Actions failure email. All logic lives in scripts/checks/;
@@ -13,6 +18,9 @@
 "on":
   push:
     branches: [staging, main]
+  schedule:
+    # MEH-2864: the weekly full crawl of production (Sunday 03:17 UTC).
+    - cron: "17 3 * * 0"
   workflow_dispatch:
     inputs:
       target:
@@ -41,6 +49,21 @@
         run: echo "BASE_URL=$BASE_URL IS_PRODUCTION=$IS_PRODUCTION (smoke and Lighthouse run only when IS_PRODUCTION=true)"
 
       - uses: actions/checkout@v7
+        with:
+          # MEH-2864: frontend-touched.sh diffs the pushed range; with the
+          # default depth of 1 the before-sha is missing and it fails safe
+          # (checks run). 50 covers any realistic multi-commit push.
+          fetch-depth: 50
+
+      - name: Did this push change the live site?
+        id: touched
+        run: |
+          if [ "${{ github.event_name }}" = "push" ]; then
+            bash scripts/frontend-touched.sh "${{ github.event.before }}" "${{ github.sha }}"
+          else
+            echo "touched=true — ${{ github.event_name }} always checks"
+            echo "touched=true" >> "$GITHUB_OUTPUT"
+          fi
 
       - uses: actions/setup-python@v6
         with:
@@ -51,26 +74,37 @@
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
@@ -82,7 +116,7 @@
         id: lighthouse
         # Production only, and no bypass secret in this step: Lighthouse would
         # send it to every third-party host the page loads.
-        if: env.IS_PRODUCTION == 'true'
+        if: env.IS_PRODUCTION == 'true' && github.event_name != 'schedule' && steps.touched.outputs.touched == 'true'
         continue-on-error: true
         env:
           LHCI_BASE_URL: ${{ env.BASE_URL }}
```

## After applying

- Push one docs-only commit to staging. Expect `touched=false — nothing deployable under frontend/ changed …` and every live step `skipped`.
- Push one frontend commit. Expect `link-check --smoke`, then «URLs checked: ≤10» and «requests to Vercel: N».
- `workflow_dispatch` → production. Expect the smoke (dispatch isn't the schedule). To test the weekly crawl by hand, run `node scripts/link-check.mjs https://mehamakor.co.il --max-pages=2000` locally.
