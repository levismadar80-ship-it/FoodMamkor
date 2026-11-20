# MEH-3507 — nightly E2E skips when staging has not changed

Sapir 20/11 21:05 Israel: «זה לא יבזבז מלא הבדיקה הזאת כל לילה». The nightly
run (cron `30 1 * * *`, MEH-2972) runs the full Chromium suite, plus WebKit in
public mode, even on nights when nothing reached staging. This patch skips it
when the newest run on the same commit that actually executed the Chromium suite
was green.

**Who applies it:** Claude in Chrome, in GitHub's web editor on this branch
(`.github/**` is denied to Claude Code, security.md). The four insertions are below.
The full patched file has sha256
`786dc94d580d20e62da485bff4a4212fe276354ef9f68331bcd25249487313b0`.

## What it does

- **`filter` job.** It gets job-level `permissions: {contents: read, actions: read}`, a new
  `nightly_unchanged` output, and a step that runs on the nightly cron only.
- **How the step decides.** It lists this workflow's completed runs on `staging` for the same commit, newest
  first, from push, schedule or dispatch, and skips runs whose Playwright Chromium jobs were all
  skipped. The first run that executed decides:
  - green → `unchanged=true`;
  - red, or no such run → `false`.
- **Errors.** Any error (API, network, missing python3) → `false`, so a broken probe
  runs the suite. It never skips it.
- **`e2e`, `e2e-webkit` and `e2e-gate`** each get `&& needs.filter.outputs.nightly_unchanged != 'true'`
  appended to their `if:`.
  - On a skipped night no gate job runs. The gate's private-mode «must run» would otherwise read the skip as a failure.
  - `staging_health.py` (rule 41) still reads only jobs that executed.
- **Unchanged:** PR runs, push runs, manual runs and the weekly WebKit cron.

## Shown working (sandbox, the step's own script extracted from the patched file)

| Commit | Newest run that executed | Output |
|---|---|---|
| `4647bad` (v1.5.9 release) | green run 44654487659 | `unchanged=true` |
| `984d72f` | red run 44547382315 | `unchanged=false` |
| `7f12303` (no finished run yet) | none | `unchanged=false` |
| repo `nope/nope` (API error) | exception | `unchanged=false` |

## The diff

```diff
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -90,10 +90,68 @@
         !(vars.CI_MODE == 'private' || github.event.repository.private) || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' ||
         (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'run-e2e'))
       runs-on: ${{ (vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest' }}
+      # MEH-3507: actions: read lets the nightly-skip step below list this
+      # workflow's earlier runs. Job-level, so it replaces the workflow-level
+      # set for this job only (this job comments on nothing).
+      permissions:
+        contents: read
+        actions: read
       outputs:
         frontend: ${{ steps.filter.outputs.frontend }}
         backend: ${{ steps.filter.outputs.backend }}
+        nightly_unchanged: ${{ steps.nightly.outputs.unchanged }}
       steps:
+        # MEH-3507 (Sapir 20/11): skip the nightly suite when staging has not
+        # moved since a run that executed the Chromium suite and passed on the
+        # SAME commit. The newest run on this commit whose Playwright jobs
+        # actually ran decides: green -> skip, red or none -> run. Any error
+        # here prints unchanged=false, so a broken probe runs the suite and
+        # never skips it. Nightly cron only; push, PR and manual runs are
+        # untouched. staging_health.py (rule 41) is unaffected: a skipped job
+        # is never read as a pass, it walks back to the run that executed.
+        - name: Nightly skip check (MEH-3507)
+          id: nightly
+          if: github.event.schedule == '30 1 * * *'
+          env:
+            GH_TOKEN: ${{ github.token }}
+            REPO: ${{ github.repository }}
+            SHA: ${{ github.sha }}
+            RUN_ID: ${{ github.run_id }}
+          run: |
+            python3 - <<'PYEOF' || echo "unchanged=false" >> "$GITHUB_OUTPUT"
+            import json, os, urllib.request
+            api = "https://api.github.com/repos/" + os.environ["REPO"]
+            hdr = {"Authorization": "Bearer " + os.environ["GH_TOKEN"],
+                   "Accept": "application/vnd.github+json"}
+            def get(url):
+                req = urllib.request.Request(url, headers=hdr)
+                with urllib.request.urlopen(req, timeout=20) as r:
+                    return json.load(r)
+            sha = os.environ["SHA"]
+            runs = get(api + "/actions/workflows/e2e.yml/runs?branch=staging"
+                       "&status=completed&per_page=30&head_sha=" + sha)["workflow_runs"]
+            verdict, src = "false", "no earlier run on this commit executed the suite"
+            for run in sorted(runs, key=lambda r: r["created_at"], reverse=True):
+                if str(run["id"]) == os.environ["RUN_ID"] or run["head_sha"] != sha:
+                    continue
+                if run["event"] not in ("push", "schedule", "workflow_dispatch"):
+                    continue
+                jobs = get(run["jobs_url"] + "?per_page=100")["jobs"]
+                pw = [j for j in jobs
+                      if j["name"].startswith("Playwright E2E (Vercel preview)")
+                      and j["conclusion"] != "skipped"]
+                if not pw:
+                    continue
+                ok = all(j["conclusion"] == "success" for j in pw)
+                verdict = "true" if ok else "false"
+                src = ("green" if ok else "red") + " run " + run["html_url"]
+                break
+            print("Newest run on " + sha[:7] + " that executed the suite: " + src)
+            if verdict == "true":
+                print("::notice::Nightly E2E skipped: staging unchanged since " + src)
+            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
+                f.write("unchanged=" + verdict + "\n")
+            PYEOF
         - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
           with:
             fetch-depth: 0  # MEH-675: paths-filter needs full history to diff against parent
@@ -195,7 +253,8 @@
        github.event_name == 'workflow_dispatch' ||
        github.event.schedule == '30 1 * * *') &&
       github.actor != 'dependabot[bot]' &&
-      (github.event.action != 'labeled' || github.event.label.name == 'run-e2e')
+      (github.event.action != 'labeled' || github.event.label.name == 'run-e2e') &&
+      needs.filter.outputs.nightly_unchanged != 'true'
 
     # MEH-2973: PR runs test against a throwaway backend on localhost:8080,
     # seeded from the same scripts as staging; every other event keeps Railway
@@ -862,7 +921,8 @@
       github.actor != 'dependabot[bot]' &&
       (github.event_name != 'pull_request' ||
        (contains(github.event.pull_request.labels.*.name, 'run-e2e') &&
-        (github.event.action != 'labeled' || github.event.label.name == 'run-e2e')))
+        (github.event.action != 'labeled' || github.event.label.name == 'run-e2e'))) &&
+      needs.filter.outputs.nightly_unchanged != 'true'
 
     steps:
       - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
@@ -1022,7 +1082,8 @@
     if: >-
       always() && github.event.schedule != '30 2 * * 0' &&
       (!(vars.CI_MODE == 'private' || github.event.repository.private) || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' ||
-       (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'run-e2e')))
+       (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'run-e2e'))) &&
+      needs.filter.outputs.nightly_unchanged != 'true'
     needs: [filter, e2e]
     runs-on: ${{ (vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest' }}
     timeout-minutes: 3
```

## Round 2 (fresh reviewer, 20/11) — second Chrome commit

The rule-5a reviewer's findings, and what changed. The full patched file now has sha256
`46a6770626b4543ac0aa6699a02015b823739640f349aede815d65f87e3bae1b`.

1. **Blocking.** The job-level `permissions` dropped `pull-requests`, and `dorny/paths-filter` lists a PR's files through the API.
   - Fixed: `pull-requests: read` was added.
2. **Coverage.** A green **push** run never runs WebKit, so counting it would skip WebKit on a commit WebKit never saw.
   - Fixed: only `schedule` and `workflow_dispatch` runs count.
   - Measured on 8 recent green staging push commits: the first patch skipped 3 of them (`9d47d68`, `4857721`, `ad87d5b`), and this one skips none. `4647bad`, a green nightly, still skips.
3. **Errors.** A failure outside python could still fail `filter`.
   - Fixed: `continue-on-error: true` on the step. The output is then empty, and `!= 'true'` runs the suite.

```diff
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -92,19 +92,23 @@
       runs-on: ${{ (vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest' }}
       # MEH-3507: actions: read lets the nightly-skip step below list this
       # workflow's earlier runs. Job-level, so it replaces the workflow-level
-      # set for this job only (this job comments on nothing).
+      # set for this job only (this job comments on nothing). pull-requests:
+      # read stays: dorny/paths-filter lists a PR's files through the API.
       permissions:
         contents: read
         actions: read
+        pull-requests: read
       outputs:
         frontend: ${{ steps.filter.outputs.frontend }}
         backend: ${{ steps.filter.outputs.backend }}
         nightly_unchanged: ${{ steps.nightly.outputs.unchanged }}
       steps:
         # MEH-3507 (Sapir 20/11): skip the nightly suite when staging has not
-        # moved since a run that executed the Chromium suite and passed on the
-        # SAME commit. The newest run on this commit whose Playwright jobs
-        # actually ran decides: green -> skip, red or none -> run. Any error
+        # moved since a nightly or manual run that executed the Chromium suite
+        # and passed on the SAME commit. Push runs do not count: they never run
+        # WebKit, so counting them would let WebKit go untested. The newest
+        # such run whose Playwright jobs actually ran decides: green -> skip,
+        # red or none -> run. Any error
         # here prints unchanged=false, so a broken probe runs the suite and
         # never skips it. Nightly cron only; push, PR and manual runs are
         # untouched. staging_health.py (rule 41) is unaffected: a skipped job
@@ -112,6 +116,7 @@
         - name: Nightly skip check (MEH-3507)
           id: nightly
           if: github.event.schedule == '30 1 * * *'
+          continue-on-error: true
           env:
             GH_TOKEN: ${{ github.token }}
             REPO: ${{ github.repository }}
@@ -134,7 +139,7 @@
             for run in sorted(runs, key=lambda r: r["created_at"], reverse=True):
                 if str(run["id"]) == os.environ["RUN_ID"] or run["head_sha"] != sha:
                     continue
-                if run["event"] not in ("push", "schedule", "workflow_dispatch"):
+                if run["event"] not in ("schedule", "workflow_dispatch"):
                     continue
                 jobs = get(run["jobs_url"] + "?per_page=100")["jobs"]
                 pw = [j for j in jobs
```
