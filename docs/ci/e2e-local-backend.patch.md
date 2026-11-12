# MEH-2973 — E2E on pull requests runs against a temporary backend inside the run

> ⏳ **Not applied yet.** CC cannot write `.github/**`. Claude in Chrome pastes
> the full staged copy `docs/ci/e2e-local-backend.e2e.yml` over
> `.github/workflows/e2e.yml` on this PR's branch through the GitHub web editor;
> CC then checks the sha256 matches and deletes the staged copy. Sapir chose
> this on 12/11 («שרת זמני בתוך כל ריצה», then «מאשרת לעשות את זה» for the
> parallel setup + uv cache), so it is her decision, not CC loosening a gate.

## Why

Every E2E run, PR or staging, talks to the one shared staging backend, so the
workflow serialises them through one concurrency group per shard
(`e2e-staging-backend-N`, `queue: max`). Two PRs with `run-e2e` wait for each
other, and a staging push waits behind both. A pending staging run is also
replaced by the next one, so staging was often "unverified" for hours.

## What changes (one file)

1. **PR runs get their own backend.** A `postgres:18` service container, then
   `scripts/e2e/start-local-backend.sh` (migrations + the same demo seeds
   staging carries, then uvicorn on `localhost:8080`). The Next build points at
   it through `E2E_API_URL`.
2. **The setup runs in the background**, in parallel with `npm ci`, the
   Playwright install and the Next build. A "Wait for local backend" step joins
   it before the tests start (up to 120 s; prints the setup and server logs on
   failure). `setup-uv` caches the Python deps on `backend/uv.lock`.
3. **PR runs leave the shared queue.** Their concurrency group is per run
   (`e2e-pr-<run_id>-<shard>`), so PRs run in parallel and never hold up
   staging. Staging pushes, the nightly run and manual runs keep the old group
   and keep testing the real staging backend.
4. **Backend changes trigger PR E2E.** The paths filter gets a `backend`
   output (`backend/app/**`, alembic, seed scripts, `uv.lock`,
   `scripts/e2e/**`); a PR with `run-e2e` that changes only the backend now runs
   E2E against its own code, which the shared staging backend could never do.
5. The stale WebKit comment (its paths/run-e2e clauses are dead since MEH-2972)
   is replaced with a correct one.

## Measured locally (sandbox, Postgres 16)

`alembic upgrade head` ≈ 1 s, all seeds ≈ 36 s. Full suite against the local
backend: 1,550 passed, 12 failed, 1 flaky. The failures were VRT parity frames
(sandbox fonts) and `32-register-journey-b-oauth` B1 (fixed by setting the
public `GOOGLE_CLIENT_ID`, re-run green), plus the known MEH-2323 flake
`24-producer-locations` (mobile). CI is the real measurement; the first PR run
is checked for setup time, VRT with local data, and two runs in parallel.

## Not in this patch

- `seed_cities.py` (needs data.gov.il) is not run; no spec was seen to need it.
- Rescue bags are on in the local backend (`RESCUE_BAGS_CITIES=זכרון יעקב`),
  matching staging.

## Diff

```diff
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -84,6 +84,7 @@
       runs-on: ubuntu-latest
       outputs:
         frontend: ${{ steps.filter.outputs.frontend }}
+        backend: ${{ steps.filter.outputs.backend }}
       steps:
         - uses: actions/checkout@v7
           with:
@@ -97,6 +98,16 @@
                 - 'public/**'
                 - 'package.json'
                 - 'package-lock.json'
+              # MEH-2973: a PR run now tests its OWN backend (below), so a
+              # backend change is something the suite can catch. Push runs
+              # still test Railway staging and ignore this output.
+              backend:
+                - 'backend/app/**'
+                - 'backend/alembic/**'
+                - 'backend/scripts/seed_*.py'
+                - 'backend/seed_data.py'
+                - 'backend/uv.lock'
+                - 'scripts/e2e/**'
 
   e2e:
     # NOTE (MEH-1044): job name kept verbatim although the target is now
@@ -121,8 +132,12 @@
     # MEH-2895: one queue PER SHARD, so the two halves of one run go in
     # parallel. The shared-backend protection stays: at most one run's shard N
     # at a time, so at most two suites hit Railway staging together.
+    # MEH-2973: a PR run brings its own backend + database (steps below), so
+    # it shares nothing and needs no queue — its group is unique per run. Only
+    # push / schedule / dispatch runs still hit Railway staging and keep the
+    # one-at-a-time queue per shard.
     concurrency:
-      group: e2e-staging-backend-${{ matrix.shard }}
+      group: ${{ github.event_name == 'pull_request' && format('e2e-pr-{0}-{1}', github.run_id, matrix.shard) || format('e2e-staging-backend-{0}', matrix.shard) }}
       cancel-in-progress: false
       queue: max
 
@@ -149,6 +164,7 @@
     # workflow_dispatch are unchanged.
     if: |
       (needs.filter.outputs.frontend == 'true' ||
+       (github.event_name == 'pull_request' && needs.filter.outputs.backend == 'true') ||
        github.event_name == 'workflow_dispatch' ||
        github.event_name == 'schedule') &&
       github.actor != 'dependabot[bot]' &&
@@ -156,9 +172,57 @@
        (contains(github.event.pull_request.labels.*.name, 'run-e2e') &&
         (github.event.action != 'labeled' || github.event.label.name == 'run-e2e')))
 
+    # MEH-2973: PR runs test against a throwaway backend on localhost:8080,
+    # seeded from the same scripts as staging; every other event keeps Railway
+    # staging. One expression, used by every step that names the backend.
+    env:
+      E2E_API_URL: ${{ github.event_name == 'pull_request' && 'http://localhost:8080' || 'https://foodmamkor-staging.up.railway.app' }}
+
+    # Started on every event (a few seconds), used only by PR runs.
+    services:
+      postgres:
+        image: postgres:18
+        env:
+          POSTGRES_USER: postgres
+          POSTGRES_PASSWORD: postgres
+          POSTGRES_DB: mehamakor_e2e
+        ports:
+          - 5432:5432
+        options: >-
+          --health-cmd pg_isready
+          --health-interval 5s
+          --health-timeout 5s
+          --health-retries 10
+
     steps:
       - uses: actions/checkout@v7
 
+      - name: Set up uv (PR runs — local backend)
+        if: github.event_name == 'pull_request'
+        uses: astral-sh/setup-uv@v7
+        with:
+          version: "latest"
+          enable-cache: true
+          cache-dependency-glob: "backend/uv.lock"
+
+      - name: Install backend dependencies (PR runs)
+        if: github.event_name == 'pull_request'
+        run: uv sync --frozen
+        working-directory: backend
+
+      # Runs in the BACKGROUND, in parallel with npm ci + the Next build
+      # (~2–3 min); migrate + seed take ~40 s, so the backend is normally
+      # ready before the build is. "Wait for local backend" below joins it.
+      - name: Start local backend (PR runs, background)
+        if: github.event_name == 'pull_request'
+        run: nohup scripts/e2e/start-local-backend.sh > /tmp/backend-setup.log 2>&1 &
+        env:
+          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_e2e
+          BACKEND_LOG: /tmp/backend.log
+          DEMO_OWNER_PASSWORD: ${{ secrets.DEMO_OWNER_PASSWORD }}
+          DEMO_CONSUMER_PASSWORD: ${{ secrets.DEMO_CONSUMER_PASSWORD }}
+          DEMO_ADMIN_PASSWORD: ${{ secrets.DEMO_ADMIN_PASSWORD }}
+
       - name: Set up Node.js 20
         uses: actions/setup-node@v7
         with:
@@ -191,7 +255,7 @@
           # Same backend the Vercel previews proxied to (Railway staging,
           # docs/DEPLOYMENT.md → env table). NEXT_PUBLIC_* is inlined at
           # build time; rewrites() reads it again at server boot.
-          NEXT_PUBLIC_API_URL: https://foodmamkor-staging.up.railway.app
+          NEXT_PUBLIC_API_URL: ${{ env.E2E_API_URL }}
           # MEH-1778: without this the GSI script is never appended
           # (use-google-sign-in.js:26 returns early on an absent client id), so
           # every "no GSI console warning" assertion in
@@ -212,7 +276,7 @@
           nohup npm run start > /tmp/next-start.log 2>&1 &
         working-directory: frontend
         env:
-          NEXT_PUBLIC_API_URL: https://foodmamkor-staging.up.railway.app
+          NEXT_PUBLIC_API_URL: ${{ env.E2E_API_URL }}
 
       - name: Wait for localhost readiness
         run: |
@@ -229,6 +293,22 @@
           tail -50 /tmp/next-start.log
           exit 1
 
+      - name: Wait for local backend (PR runs)
+        if: github.event_name == 'pull_request'
+        run: |
+          for i in $(seq 1 120); do
+            if curl -sf -o /dev/null http://127.0.0.1:8080/health; then
+              echo "local backend ready (waited ${i}s after the build)"
+              cat /tmp/backend-setup.log | tail -5
+              exit 0
+            fi
+            sleep 1
+          done
+          echo "::error::local backend not ready — setup log:"
+          cat /tmp/backend-setup.log
+          tail -50 /tmp/backend.log || true
+          exit 1
+
       # MEH-1712 — CAPTURE ONLY. Dials Railway FROM THE RUNNER, which is the one
       # path nobody has measured: the CC sandbox is blocked from *.up.railway.app
       # (MEH-360), and staging.mehamakor.online reaches the same backend only via
@@ -252,7 +332,7 @@
         if: always()
         continue-on-error: true
         env:
-          NEXT_PUBLIC_API_URL: https://foodmamkor-staging.up.railway.app
+          NEXT_PUBLIC_API_URL: ${{ env.E2E_API_URL }}
         run: |
           probe() {
             printf '%-12s ' "$1"
@@ -708,8 +788,9 @@
     # Never fails the workflow. See property 1 above.
     continue-on-error: true
 
-    # Identical trigger condition to the `e2e` job — same frontend paths-filter,
-    # same workflow_dispatch escape (MEH-1712), same dependabot exclusion.
+    # MEH-2972: nightly + manual only (no PR, no push), so the paths filter and
+    # the `run-e2e` clauses below never decide anything — left in place so the
+    # condition can be widened again without re-deriving it.
     #
     # MEH-2779 — on a PR the suite runs only once the PR carries the `run-e2e`
     # label. It used to run on every push of every PR, and the job-level
```
