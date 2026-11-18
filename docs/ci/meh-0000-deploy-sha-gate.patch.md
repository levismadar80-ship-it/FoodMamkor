# Patch — post-deploy: fail when the live backend is NOT this commit (deploy-sha gate)

> **APPLIED 18/11/2026 (MEH-3358, PR #4747)** — committed through the GitHub web editor; the branch file was `cmp`-identical to this patch applied to staging. Kept as the record of what changed and why.

**For Sapir.** `.github/workflows/**` is CC-deny, so CC prepared and verified this patch and you commit it (GitHub web editor, or `git apply`). Everything it calls is already in the repo: `scripts/checks/wait_for_deploy.py` after this PR.

Verified by CC before writing this file:

```
$ git apply --check docs/ci/meh-0000-deploy-sha-gate.patch.md   # the block below, extracted
PATCH APPLIES CLEANLY
```

The edited YAML was also parsed and asserted (on a copy outside `.github/`, so the deny was never touched):

```
YAML parses · 12 steps
deploy step: continue-on-error = True
the || echo swallow is gone: True
exit 1 only on rc=2: True
R_DEPLOY in Verdict env: True
Verdict aggregates it: True
```

## The bug this closes

`scripts/checks/wait_for_deploy.py` used to `return 0` once the **frontend** build moved and a 3-minute grace expired, even when the backend sha had not moved at all. It printed a note and nothing more:

```
new frontend build is live (backend still at 5af2bec — Railway may not have redeployed for this push)
```

Every check that runs after it — production smoke, security headers, Lighthouse, link-check — then measured an **old backend**, and the workflow went green. A green with two causes.

The script half is fixed in this PR: it now asks git whether the backend code at the deployed sha differs from the backend code at the pushed sha, and exits **2** when it does (or when that cannot be established). It deliberately does **not** ask "did Railway redeploy" — Railway genuinely does not always redeploy, and a blind sha comparison would red every frontend-only push.

## Why the script alone is not enough

Line 95 today is:

```
run: python scripts/checks/wait_for_deploy.py … || echo "::warning title=Deploy not detected::…"
```

`|| echo` swallows **every** exit code, and the `Verdict` step aggregates only smoke / links / headers / lighthouse. So no exit code from that script can fail the job. This patch is what gives exit 2 teeth.

## What it changes

| today | after |
|---|---|
| the step swallows every failure with `\|\| echo ::warning` | the step has `id: deploy` and `continue-on-error: true`, and `Verdict` aggregates its outcome — the same shape smoke / links / headers / lighthouse already use |
| a stale backend is a printed note, job green | a stale backend reds the job |
| a timeout is a `::warning` | **unchanged** — still a `::warning`, still green |

The timeout signal is neither weakened nor strengthened. Only the stale-backend case is new, which is the direction workflow rule 32 allows.

`continue-on-error: true` is load-bearing: without it a red here would skip every check below, and a stuck deploy would produce *less* information rather than more.

## The patch

```diff
--- a/.github/workflows/post-deploy-checks.yml
+++ b/.github/workflows/post-deploy-checks.yml
@@ -89,10 +89,29 @@
           node-version: "22"
 
       - name: Wait for the new build to be live
+        id: deploy
         if: github.event_name == 'push' && steps.touched.outputs.touched == 'true'
+        # continue-on-error + the Verdict step: the same shape every other check
+        # in this workflow already uses. A red here must not stop the checks
+        # below from running, but it must still fail the job.
+        continue-on-error: true
         env:
           VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
-        run: python scripts/checks/wait_for_deploy.py --base-url "$BASE_URL" --sha "${{ github.sha }}" || echo "::warning title=Deploy not detected::the checks below may describe the previous build"
+        run: |
+          set +e
+          python scripts/checks/wait_for_deploy.py --base-url "$BASE_URL" --sha "${{ github.sha }}"
+          rc=$?
+          set -e
+          # 2 = the live backend runs DIFFERENT backend code from this commit,
+          # or that could not be established. Everything below would then
+          # measure the old backend, so this is the one case that reds the job.
+          # 1 = timed out: a warning, exactly as before. The timeout signal is
+          # neither weakened nor strengthened; only the stale case is new.
+          case "$rc" in
+            0) echo "the live build is this commit" ;;
+            2) exit 1 ;;
+            *) echo "::warning title=Deploy not detected::the checks below may describe the previous build" ;;
+          esac
 
       - name: Production smoke
         id: smoke
@@ -156,13 +175,14 @@
       - name: Verdict
         if: always()
         env:
+          R_DEPLOY: ${{ steps.deploy.outcome }}
           R_SMOKE: ${{ steps.smoke.outcome }}
           R_LINKS: ${{ steps.links.outcome }}
           R_HEADERS: ${{ steps.headers.outcome }}
           R_LH: ${{ steps.lighthouse.outcome }}
         run: |
           fail=0
-          for pair in "Production smoke:$R_SMOKE" "Broken links:$R_LINKS" "Security headers:$R_HEADERS" "Lighthouse budget:$R_LH"; do
+          for pair in "Deploy is this commit:$R_DEPLOY" "Production smoke:$R_SMOKE" "Broken links:$R_LINKS" "Security headers:$R_HEADERS" "Lighthouse budget:$R_LH"; do
             name="${pair%%:*}"; res="${pair##*:}"
             case "$res" in
               success|skipped) echo "  OK   $name: $res" ;;
```

## How to verify after you commit it

1. The next push to `staging` that touches **only** `frontend/` must still print `the live build is this commit` and stay green — that is the case the gate must not break.
2. The next push that touches `backend/` must either show the backend sha moving to that commit, or red the job with `::error title=Stale backend build::`.
3. `python scripts/checks/wait_for_deploy.py --self-test` → `self-test: 7/7`.

## Exit codes the step now distinguishes

| code | meaning | job |
|---|---|---|
| 0 | the frontend moved, and the backend is at this sha **or** runs byte-identical backend code | green |
| 1 | timed out — the checks below may describe the previous build | green, with a `::warning` |
| 2 | the live backend runs **different** backend code from this commit, or that could not be established | **red** |
