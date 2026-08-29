# `merge_group` triggers — the prerequisite for turning on the merge queue (MEH-1603)

**Status: staged for Sapir. NOT APPLIED.** `.github/workflows/**` is CC-deny
(MEH-671), so CC wrote this diff and applied none of it. Every line number below
was read out of the live files on `origin/staging` at
`7cddbb8` (re-checked after a staging sync mid-session; all anchors held across the
move from `e4d0e93`) — re-derive before applying if staging has moved again.

**Do not apply this before [`meh-1523-dnm-label-gate.patch.md`](./meh-1523-dnm-label-gate.patch.md).**
The order is not stylistic: §2.4 below shows that the label gate that patch
ships **hard-fails in merge-group context**, which would red the required check
on every queued merge. Hunk 3 here is the fix, and it is written against the
post-1523 shape of that step. Full ordering: [`meh-1603-runbook.md`](./meh-1603-runbook.md).

---

## 1 · Which workflows actually supply the two required checks

Grepped, not assumed:

```
$ grep -rn "name: *CI gate\|name: *Deploy gate\|name: *E2E gate" .github/workflows/
.github/workflows/deploy.yml:380:    name: Deploy gate (required)
.github/workflows/pr-checks.yml:705:    name: CI gate (required)
.github/workflows/e2e.yml:564:    name: E2E gate
```

| Workflow | Supplies | Required on `staging` today? | In scope here |
|---|---|---|---|
| `pr-checks.yml` | `CI gate (required)` | **yes** | ✅ hunks 1–4 |
| `deploy.yml` | `Deploy gate (required)` | **yes** | ✅ hunks 5–6 |
| `e2e.yml` | `E2E gate` | **no** — never registered on ruleset 15240090 | ⚠️ §6 |

The "required today" column is inherited from
`.claude/rules/testing.md` § *Required status checks*, which records the ruleset
API as verified on 2026-07-04. **CC cannot re-verify it** — reading ruleset
15240090 needs admin scope this session does not have. Sapir should eyeball
Settings → Rules → `protect-staging` and confirm the required-context list is
still exactly those two before applying.

Every other workflow that runs on `pull_request` — `claude-review.yml`,
`dependency-audit.yml`, `i18n-icu-parity.yml`, `skills-audit.yml` — produces
check runs but no required context, so a merge queue does not wait on them and
they need no `merge_group` trigger. Leaving them off the queue is deliberate:
each one added is a full pipeline per queued PR.

---

## 2 · Adding the trigger is necessary and **not** sufficient

The card states the necessary half correctly: without `merge_group` in the
trigger list, the required check is never reported in queue context and every
merge fails. GitHub's own changelog for the feature says the same — *"You must
use the merge_group event to trigger your workflow… otherwise status checks will
not be triggered when you add a pull request to a merge queue, and the merge will
fail as the required status check will not be reported."*

What follows is the other half: **four ways the two gates still misbehave in
merge-group context once the trigger is present** (§2.1 is the shared cause, not
one of the four). Counting them honestly: **two are outright blocking** (§2.3,
§2.4), **one is blocking under one of the two live readings** of an unresolved
expression question and harmless under the other (§2.2), and **one degrades
silently without blocking** (§2.5). That is why the patch is six hunks and not
two lines.

### 2.1 · `merge_group` carries no `pull_request` object at all

The merge-group payload is `head_sha` / `head_ref` / `base_sha` / `base_ref` and
little else. `github.event.pull_request` is null, and so is every field under it.
That single fact drives 2.2 – 2.5.

### 2.2 · ⚠️ OPEN — how `github.event.pull_request.draft == false` evaluates on null

Seven job conditions in `pr-checks.yml` are written in the bare form
`github.event.pull_request.draft == false` — the complete set, at lines 172,
223, 290, 455, 501, 627 and 684 (`grep -c`, not counted by eye). **What that
evaluates to when the left side is null is a
question two sources answer differently, and I could not settle it.**

| Source | Answer | Consequence in queue |
|---|---|---|
| GitHub's expression docs — loose equality coerces mismatched types to number; **`null` → 0**, **`false` → 0** | `0 == 0` → **true** → the jobs **run** | harmless |
| A community summary of the merge-queue payload | condition fails → the jobs **skip** | `ci-gate`'s `check_ran` maps skipped → FAIL → **every queued merge blocked** |

The documented coercion table is the stronger source and points at "they run".
But this repo's own `deploy.yml:57-59` carries a comment asserting the opposite
for the structurally identical `push` case — *"the `github.event_name !=
'pull_request'` half of each job's guard keeps them running on push"* — which
only makes sense if the bare form is false on a null PR. **One of those is
wrong and I cannot run a workflow to find out which.**

**So the patch does not depend on the answer.** Hunk 2 rewrites all nine guards
into the explicit form

```
(github.event_name != 'pull_request' || github.event.pull_request.draft == false)
```

which is **correct under both readings** and is already the house pattern —
`deploy.yml:120` and `deploy.yml:157` are written exactly this way. If the
coercion reading is right, hunk 2 is a no-op that costs nothing. If the skip
reading is right, hunk 2 is the difference between a working queue and one where
nothing can ever merge. Applying it is strictly dominant, which is why the open
question is recorded rather than chased.

### 2.3 · 🔴 BLOCKING — `dorny/paths-filter` has no PR to diff against

`changes` (`pr-checks.yml:139`) and `changes` (`deploy.yml:88`) both run
`dorny/paths-filter@v3` with no `base`/`ref` and behind a **depth-1** checkout.
On a `pull_request` event the action reads the Files API and never touches git.
On anything else it diffs with git — and `e2e.yml:69` already carries the
scar tissue for that: `fetch-depth: 0  # MEH-675: paths-filter needs full
history to diff against parent`. The two gate workflows do **not** set it.

If `changes` errors, `ci-gate` exits on its first branch —

```
::error::Paths-filter job did not succeed (result=$R_CHANGES) — cannot determine stack.
```

— and no queued PR can ever land.

**Version note, stated honestly.** The action's `master` README documents
merge-group support (*"The `base` and `ref` input parameters default to commit
hashes from the event unless explicitly specified"*). The README on the **`v3`**
ref — which is what this repo pins — **does not mention `merge_group` anywhere**,
and its `base` description still ends *"Default: repository default branch"*,
which here is `main`. I could not establish which of the two the pinned `v3` tag
actually resolves to.

Hunk 1 therefore **does not rely on the defaults at all.** It short-circuits the
filter in queue context and declares every stack touched. That is also the right
answer on the merits: the queue is the last gate before code lands on `staging`,
so running the full suite there is what the queue is for. Cost is one full
pipeline per queued PR, which is the cost of a merge queue.

### 2.4 · 🔴 BLOCKING — the post-MEH-1523 label gate crashes in queue context

This is the interaction between the two cards, and it is the reason for the
ordering constraint at the top of this file.

The gate live today reads `PR_TITLE` / `PR_BODY`. On `merge_group` both are
null → empty strings → `grep` matches nothing → the gate passes. **The current
gate is queue-safe.**

The gate that [`meh-1523-dnm-label-gate.patch.md`](./meh-1523-dnm-label-gate.patch.md)
installs is not:

```yaml
PR_LABELS: ${{ toJSON(github.event.pull_request.labels.*.name) }}
...
names="$(printf '%s' "$PR_LABELS" | jq -r '.[]')"
```

With no `pull_request` object the filter yields nothing, `jq -r '.[]'` is handed
`null` or an empty string, and **`jq` errors**. The step runs under
`set -euo pipefail`, and that patch's own comment says the failure mode is
deliberate — *"a broken parse BLOCKS rather than falling through"*. That is the
right call for a PR; in queue context it means `DO-NOT-MERGE marker gate` fails
on **every** merge group, `check_ran` propagates it, and the queue can never
drain.

Hunk 3 fixes it by defaulting the label array to `[]` outside `pull_request`.

**The residual hole, named rather than hidden.** Once the gate reads `[]` in
queue context, a PR **already in the queue** that gets labelled mid-flight is no
longer stopped by this gate — the marker blocked entry, but the queue run does
not re-read it. The mitigation is manual: remove the PR from the queue
(Settings → the queue UI, or the PR's own "Remove from queue"). This is not a
regression the patch introduces — it is a property of a payload that carries no
labels — but it is a real narrowing of rule 30's marker, and Sapir should know
it before enabling the queue.

### 2.5 · 🟡 DEGRADED, not blocking — two guards go vacuous

Both run unconditionally (no `if:`), so they will execute in queue context. They
just stop measuring anything.

- **`qa-artifacts size cap`** reads `github.event.pull_request.base.sha` /
  `head.sha`. Both null → `git diff --name-only "" ""` errors inside a process
  substitution, which `set -e` does not catch → the loop sees nothing → `total=0`
  → **passes vacuously**. Harmless: the cap already ran, for real, on the PR.
- **`Repo guards`** → `scripts/checks/changelog-branch-guard.sh` derives its base
  from `GITHUB_BASE_REF`, which **is not set on `merge_group`** (it is a
  pull-request-only variable). The script has a fallback chain
  (`changelog-branch-guard.sh:288`: head branch → `origin/staging` →
  `origin/main`), so it probably degrades rather than dies — **probably is the
  operative word; I did not execute it in queue context and cannot.** Hunk 4
  removes the guesswork by naming the base explicitly, which is one line and
  makes the outcome independent of the fallback chain.

  `builder-model-guard.sh` deserves a sentence of its own: it walks first parents
  past merge commits to find the last *authored* commit. From a merge-group head
  (a merge commit whose first parent is the base tip) that walk lands on a commit
  already on `staging`, not on the PR's work. **Expected effect: the trailer
  check becomes vacuous in queue runs.** No coverage is lost — it already ran on
  the PR — but it is not re-verified at merge time, and that should be confirmed
  on the first queued PR rather than believed from this paragraph.

---

## 3 · The diff — `pr-checks.yml`, four hunks

### Hunk 1 of 6 — add the trigger (line 26-28)

```diff
   pull_request:
     types: [opened, synchronize, reopened, ready_for_review]
     branches: [staging, main]
+  # MEH-1603: the merge queue runs checks on a `merge_group` event, which is
+  # separate from `pull_request` and from `push`. WITHOUT this trigger the
+  # required context `CI gate (required)` is never reported in queue context
+  # and EVERY queued merge fails — the check simply does not exist there.
+  # This trigger must be merged and live on `staging` BEFORE the queue is
+  # enabled (see docs/ci/meh-1603-runbook.md).
+  merge_group:
```

> If [`meh-1523-dnm-label-gate.patch.md`](./meh-1523-dnm-label-gate.patch.md) has
> already been applied, line 27 reads
> `types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]`.
> That is expected and this hunk is unaffected — it appends a sibling key to
> `on:`, it does not touch `types:`.

### Hunk 2 of 6 — make the paths filter total in queue context (lines 139-152)

```diff
   changes:
     name: Paths filter
     runs-on: ubuntu-latest
     timeout-minutes: 5
     outputs:
-      frontend: ${{ steps.filter.outputs.frontend }}
-      backend: ${{ steps.filter.outputs.backend }}
-      workflows: ${{ steps.filter.outputs.workflows }}
-      deps: ${{ steps.filter.outputs.deps }}
+      # MEH-1603: in queue context EVERY stack counts as touched. Two reasons.
+      # (1) Correctness: the merge group is the last thing evaluated before code
+      #     lands on staging, so the full suite is what should run there — that
+      #     is the entire point of the queue.
+      # (2) Mechanism: dorny/paths-filter reads the Files API on `pull_request`
+      #     and falls back to a git diff on every other event. This checkout is
+      #     depth-1 (contrast e2e.yml:69, which sets fetch-depth: 0 with the
+      #     comment "paths-filter needs full history"), and the pinned v3 ref's
+      #     README documents no merge_group handling at all. Short-circuiting is
+      #     immune to both.
+      frontend: ${{ github.event_name == 'merge_group' && 'true' || steps.filter.outputs.frontend }}
+      backend: ${{ github.event_name == 'merge_group' && 'true' || steps.filter.outputs.backend }}
+      workflows: ${{ github.event_name == 'merge_group' && 'true' || steps.filter.outputs.workflows }}
+      deps: ${{ github.event_name == 'merge_group' && 'true' || steps.filter.outputs.deps }}
     steps:
       - uses: actions/checkout@v7
       - uses: dorny/paths-filter@v3
         id: filter
+        # Skipped in queue context — the outputs above are already forced true,
+        # and running it here is exactly the git-diff path that has no history.
+        if: github.event_name != 'merge_group'
         with:
```

A skipped step leaves `steps.filter.outputs.*` empty, which the `&&`/`||` never
reads in that branch. On `pull_request` the expression's left side is false and
the outputs pass through byte-identically — **no behaviour change on any PR.**

### Hunk 3 of 6 — the seven draft guards (lines 172, 223, 290, 455, 501, 627, 684)

Mechanical, applied to **every** occurrence of the bare form in the file:

```diff
-    if: ${{ (needs.changes.outputs.frontend == 'true' || needs.changes.outputs.workflows == 'true') && github.event.pull_request.draft == false }}
+    if: ${{ (needs.changes.outputs.frontend == 'true' || needs.changes.outputs.workflows == 'true') && (github.event_name != 'pull_request' || github.event.pull_request.draft == false) }}
```

and, for the bare one at line 501 (`env-drift`):

```diff
   env-drift:
     name: Env drift (.env.example)
-    if: ${{ github.event.pull_request.draft == false }}
+    # MEH-1603: `merge_group` carries no pull_request object. This is the shape
+    # deploy.yml:120/157 already use. See meh-1603-merge-queue.patch.md §2.2 —
+    # it is correct whether or not `null == false` is true, which is a question
+    # this repo has two contradictory answers to.
+    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false }}
```

`env-drift` is the one to check first if the queue jams: it is in `ci-gate`'s
**always-required** block under `check_ran`, so if it skips, the gate fails
regardless of which stack the PR touched.

### Hunk 4 of 6 — the marker gate + the guards' base ref

`do-not-merge-gate`, **post-MEH-1523 only.** If that patch has not been applied,
skip this half — the text-scanning gate in place today is already queue-safe
(§2.4).

```diff
       - name: Fail if the PR carries the marker label (MEH-1523)
         env:
-          PR_LABELS: ${{ toJSON(github.event.pull_request.labels.*.name) }}
+          # MEH-1603: `merge_group` has no pull_request object, so the filter
+          # yields nothing and `jq -r '.[]'` ERRORS — which under set -euo
+          # pipefail fails this step by design (MEH-1523 made that failure
+          # deliberate). In queue context that would red a required check on
+          # every merge group and the queue could never drain. An empty array is
+          # the correct reading: the marker already blocked entry to the queue.
+          PR_LABELS: ${{ github.event_name == 'pull_request' && toJSON(github.event.pull_request.labels.*.name) || '[]' }}
         run: |
           set -euo pipefail
+          # Belt and braces: an empty expression must not reach jq either.
+          [ -n "${PR_LABELS:-}" ] || PR_LABELS='[]'
```

`repo-guards`:

```diff
   repo-guards:
     name: Repo guards
     runs-on: ubuntu-latest
     timeout-minutes: 3
+    env:
+      # MEH-1603: GITHUB_BASE_REF is a pull-request-only variable and is UNSET
+      # on merge_group, which sends changelog-branch-guard.sh down its fallback
+      # base chain (changelog-branch-guard.sh:288). The queue only ever targets
+      # the branch it is enabled on, so name it rather than let the guard guess.
+      GITHUB_BASE_REF: ${{ github.event_name == 'merge_group' && 'staging' || github.base_ref }}
     steps:
```

On `pull_request` this assigns `github.base_ref`, which is the value the runner
already sets — **a no-op on every PR.**

---

## 4 · The diff — `deploy.yml`, two hunks

`deploy.yml` needs far less: its two PR-side jobs (`lint:120`,
`api-contract-static:157`) already carry the explicit
`github.event_name != 'pull_request' || …` form, and `deploy-gate` uses the
lenient `ok()` (skipped passes) rather than `check_ran`. The three deploy jobs
are `github.event_name == 'push'`-gated and correctly stay out of queue runs.

### Hunk 5 of 6 — the trigger (line 60-66)

```diff
 on:
   push:
     branches: [main, staging]
   pull_request:
     types: [opened, synchronize, reopened, ready_for_review]
     branches: [main, staging]
+  # MEH-1603 — see pr-checks.yml. `Deploy gate (required)` must report in queue
+  # context or the queue cannot merge.
+  merge_group:
   workflow_dispatch:
```

### Hunk 6 of 6 — the paths filter (lines 91-94)

Same shape and same reasoning as hunk 2:

```diff
     outputs:
-      frontend: ${{ steps.filter.outputs.frontend }}
-      backend: ${{ steps.filter.outputs.backend }}
-      workflows: ${{ steps.filter.outputs.workflows }}
+      # MEH-1603: everything counts as touched in queue context. See
+      # docs/ci/meh-1603-merge-queue.patch.md §2.3.
+      frontend: ${{ github.event_name == 'merge_group' && 'true' || steps.filter.outputs.frontend }}
+      backend: ${{ github.event_name == 'merge_group' && 'true' || steps.filter.outputs.backend }}
+      workflows: ${{ github.event_name == 'merge_group' && 'true' || steps.filter.outputs.workflows }}
     steps:
       - uses: actions/checkout@v7
       - uses: dorny/paths-filter@v3
         id: filter
+        if: github.event_name != 'merge_group'
         with:
```

---

## 5 · What is verified and what is predicted

Stated separately because a patch doc that blurs the two gets believed as a
whole. CC cannot execute a workflow — `.github/workflows/**` is CC-deny and
there is no queue to run one in — so **nothing in the "predicted" column has been
observed**, and the first queued PR is the experiment.

| Claim | Basis |
|---|---|
| Which workflows carry the two gate jobs, and their line numbers | ✅ **verified** — grepped from the live files |
| `merge_group` is required or the check is never reported | ✅ **verified** — GitHub's feature changelog + docs, consistent across sources |
| Exactly seven bare draft guards exist, at the listed lines | ✅ **verified** — `grep -c` returned 7; the lines are its output, not a hand count |
| `deploy.yml` already uses the explicit form at 120/157 | ✅ **verified** — read |
| `ci-gate` maps a skipped always-required job to FAIL | ✅ **verified** — `check_ran`/`strict_ok`, `pr-checks.yml:757-775` |
| The `v3` README documents no `merge_group` handling | ✅ **verified** — fetched both refs; they differ |
| `null == false` in a GitHub expression | ❌ **unresolved** — two sources disagree (§2.2). Patch is written to not care |
| `jq` errors on the null label array → gate fails in queue | 🔶 **predicted** from the payload shape + `set -euo pipefail`. Mechanism is solid; not executed |
| `changelog-branch-guard.sh` degrades rather than dies without `GITHUB_BASE_REF` | 🔶 **predicted** from reading the fallback chain. Hunk 4 makes it moot |
| `builder-model-guard.sh` goes vacuous in queue runs | 🔶 **predicted** from first-parent walk semantics. Confirm on the first queued PR |

---

## 6 · `E2E gate` — deliberately out of scope, with a tripwire

`e2e.yml` reports `E2E gate`, which ruleset 15240090 has never required
(`.claude/rules/testing.md`; MEH-1907 measured the consequence directly — PR
#2592 merged on one green E2E run because E2E carries no vote). So the queue
does not wait on it and it needs no `merge_group` trigger **today**.

**The tripwire:** if `E2E gate` is ever promoted to a required context — which is
what [`e2e-gate.patch.md`](./e2e-gate.patch.md) exists to do — it must get a
`merge_group` trigger **in the same change**, or the queue jams instantly for
the reason in §2. `e2e.yml` also has a paths filter (`e2e.yml:64`, already
`fetch-depth: 0`) and its own `filter`/`e2e-gate` skip semantics, so it needs the
§2.3 treatment too. Recorded here so promotion and queue-compatibility are not
discovered to be coupled after the fact.

---

## 7 · `strict_required_status_checks_policy` — the card's claim, checked

The card asserts: *"with merge queue, `strict_required_status_checks_policy` is
redundant — the queue builds a temporary branch with the PR plus everything ahead
of it in the queue, and tests that."*

**Verdict: the claim is correct, and it is GitHub's own framing.** GitHub's
merge-queue documentation states that the merge queue *"provides the same
benefits as the 'Require branches to be up to date before merging' branch
protection, but does not require a pull request author to update their pull
request branch and wait for status checks to finish before trying to merge"*,
and that the queue *"ensures the pull request's changes pass all required status
checks when applied to the latest version of the target branch and any pull
requests already in the queue."* Those two sentences are exactly the redundancy
the card describes.

**Two caveats worth stating plainly.**

1. **Read via search result, not fetched directly.** `docs.github.com` is blocked
   by this sandbox's egress proxy (`EGRESS_BLOCKED`), so the quotes above came
   back through the search index rather than from a page CC opened. The wording
   is consistent across the Enterprise Cloud and Enterprise Server mirrors of the
   same page, which is decent corroboration — but it is one step removed, and
   Sapir can confirm it in ten seconds on the live page.
2. **Redundant is not the same as harmful, and turning it off is a separate
   decision from turning the queue on.** The safe order is: enable the queue,
   watch one PR land through it, *then* drop the strict policy if it is still
   set. Dropping it first removes a live constraint before its replacement is
   proven — the wrong direction under rule 32.

---

## Appendix A · `mheap/github-action-required-labels` — evaluated, recommendation is **keep the in-house gate**

The card asks whether the off-the-shelf action (`mode: exactly`, `count: 0`)
should replace the in-house marker gate merged in #2846. **Recommendation: keep
ours.** Not a close call, and the deciding argument is specific to this card.

**What the action genuinely does better.** Its `add_comment` option posts a
comment on the PR explaining why it is blocked and deletes that comment when the
gate passes. That is a real ergonomic gain over an inline shell step whose only
output is a `::error::` annotation someone has to open the run to read. If the
in-house gate is ever felt to be too silent, this is the feature to copy.

**Why it still loses, on this card specifically.**

1. **It is broken in a merge queue — the exact feature MEH-1603 exists to
   enable.** [Issue #66](https://github.com/mheap/github-action-required-labels/issues/66),
   *"Action fails with 'Not Found' when run in a merge queue"*: the action reaches
   for pull-request data that a `merge_group` payload does not carry and errors
   out. Reported December 2023, **still open**, no fix and no maintainer
   workaround in the thread. The community remedy is
   `if: github.event_name != 'merge_group'` — which in **this** repo means the job
   skips in queue context, `ci-gate`'s `check_ran` maps skipped to FAIL, and the
   queue never drains. Adopting it would trade a working gate for one that has to
   be disabled precisely where the card needs it working.
2. **The in-house gate already solves the harder problem the action does not
   address.** MEH-1523's matcher is anchored (`^(dono?tmerge|dnmlock)$`) after
   normalisation, specifically so a documentation label like
   `audit-do-not-merge-findings` cannot trip a blocking gate. That is fixture (e2)
   in `dnm-matcher-guard.sh`, and it is the #2637 false positive reborn on the
   label surface. A third-party matcher would have to be re-verified against those
   15 fixtures — and the fixtures are the actual asset here, not the 20 lines of
   shell they test.
3. **Supply chain.** A third-party action inside a blocking gate is a new
   dependency in the one place where a compromise is worth the most. `.claude/rules/skills.md`
   is this repo's stance on exactly that trade, and the in-house alternative is
   twenty lines with no dependency.
4. **The maintenance trade-off is real but small, and it points the same way.**
   The honest cost of ours is that Sapir owns twenty lines of shell forever. The
   honest cost of theirs is a pinned SHA to bump, a changelog to track, and an
   open merge-queue defect with no owner. Ours is bounded and already written;
   theirs is unbounded and currently incompatible.

**If the auto-comment is wanted anyway**, the cheap path is to add an
`actions/github-script` step to the existing job that upserts and deletes one
comment — keeping our matcher and our fixtures, borrowing only the ergonomics.
That is a separate card, not this one, and CC has not filed it (ORDERS §5).

**This is a recommendation. Nothing was swapped, and no workflow was touched.**

---

## Cross-references

| For | Read |
|---|---|
| what Sapir clicks, in order | [`meh-1603-runbook.md`](./meh-1603-runbook.md) |
| native auto-merge + the 25/03/2026 change | [`meh-1603-automerge.patch.md`](./meh-1603-automerge.patch.md) |
| the label gate this must be applied after | [`meh-1523-dnm-label-gate.patch.md`](./meh-1523-dnm-label-gate.patch.md) |
| why a skipped required leg is a FAIL, not a pass | `.claude/rules/testing.md` § *A green that has two possible causes* |
| the E2E promotion this is coupled to | [`e2e-gate.patch.md`](./e2e-gate.patch.md) |
