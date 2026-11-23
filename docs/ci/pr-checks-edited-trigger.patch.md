# Patch: PR checks re-run when the PR body is edited

Sapir approved 22/11 («מאשרת את שניהם»). Target: `.github/workflows/pr-checks.yml`.
Applied 22/11 in 7e80274567 (sha256 matched) through the GitHub web editor (Claude in Chrome), because
the sandbox may not write `.github/**` (security.md).

## Why

`pr-evidence-guard.sh`, `skills-line-guard.sh`, `big-sites-guard.sh` and
`mutation-guard.sh` read the PR body. The workflow listened to `opened`,
`synchronize`, `reopened`, `ready_for_review`, `labeled` and `unlabeled`, so a
line added to the body did not re-run them. «Re-run failed jobs» does not help
either, because a re-run reads the event payload of the original run, with the
old body. The red stood until the next push, and on #5109 that push spent a
Vercel deployment and a full E2E run only to re-read the body.

## The change

1. Add `edited` to `on.pull_request.types`.
2. Give `edited` its own concurrency bucket, next to `ready_for_review`,
   `labeled` and `unlabeled`. Without it an edit would land in the `code`
   bucket and cancel a running `synchronize` run, and the aggregator maps
   `cancelled` to FAIL.

## Cost

An `edited` event also fires when the title or base branch changes. The run
goes through `Paths filter` like any other, so on a body edit the expensive
jobs run again only if the diff touches their paths. Body edits are rare next
to pushes.

## Diff

```diff
@@ -30,7 +30,10 @@
     # not re-run the gate and the stale green stands — the marker would never
     # block anything. Removing it would likewise not clear the red without a
     # push, which rule 30 does not permit CC to manufacture.
-    types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]
+    # `edited` (22/11, Sapir): pr-evidence-guard reads the PR body, so a line
+    # added to the body must re-run it. Without it the red stood until the next
+    # push, and that push spent a Vercel deployment for nothing (#5109).
+    types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled, edited]
     branches: [staging, main]
 
 # MEH-485: dorny/paths-filter@v3 needs pull-requests:read on pull_request
@@ -44,10 +47,10 @@
   # שבאוויר. ריצה מבוטלת מדווחת cancelled, וה-aggregator ממפה cancelled ל-FAIL —
   # אודם שקרי. GitHub Support על אותה מחלקה: community discussion #77942.
   # MEH-1523 extends MEH-1653's reasoning to the two label actions. Buckets:
-  #   ...-ready_for_review | ...-labeled | ...-unlabeled | ...-code
+  #   ...-ready_for_review | ...-labeled | ...-unlabeled | ...-edited | ...-code
   # Each action class cancels only its own kind, so a label toggle can never
   # cancel a synchronize run (cancelled maps to FAIL in the aggregator).
-  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}-${{ (github.event.action == 'ready_for_review' || github.event.action == 'labeled' || github.event.action == 'unlabeled') && github.event.action || 'code' }}
+  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}-${{ (github.event.action == 'ready_for_review' || github.event.action == 'labeled' || github.event.action == 'unlabeled' || github.event.action == 'edited') && github.event.action || 'code' }}
   cancel-in-progress: true
 
 jobs:
```

Prepared file sha256: `b16d93529cf34a69d88c3040300995ab95755b80183b155b54fdbe165ba0041a`.

Marker in the register: `unlabeled, edited]`.
