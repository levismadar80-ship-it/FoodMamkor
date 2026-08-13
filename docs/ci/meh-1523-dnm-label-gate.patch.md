# `do-not-merge-gate` — swap the mechanism from text to a label (MEH-1523)

**Status:** staged for Sapir. `.github/workflows/**` is CC-deny (MEH-671), so CC
cannot apply this. Everything below was measured against a live fixture corpus
before this doc was written, and that corpus ships as a guard —
`scripts/checks/dnm-matcher-guard.sh`, third mode `label`.

**Relationship to [`dnm-gate-regex.patch.md`](./dnm-gate-regex.patch.md)
(MEH-1922) — this one SUPERSEDES it.** That patch narrows the regex and keeps
text scanning; this one deletes text scanning. They are alternatives, not a
sequence. **Apply this one and the other becomes moot** — do not apply both, and
if this one is applied, `dnm-gate-regex.patch.md` should be marked superseded
rather than left looking pending.

---

## 1 · Why — the third defect, which neither previous ticket named

MEH-1922 fixed two defects in the matcher (a false positive on ordinary English,
a false negative on `[DNM]`). Both are about *what the regex matches*. The defect
below is about *where the marker lives*, and no regex can fix it.

### The marker sits in an editable PR body, so removing it leaves no trace

**PR #2813 (MEH-1980), measured 13/08.** CC's own PR body contained the sentence
*"Do not merge this as complete."* — prose describing the PR's state, not an
attempt to set a marker. The gate matched it and `DO-NOT-MERGE marker gate` went
red, which is the documented #2637 false-positive class repeating.

What happened next is the new part. The block was cleared, the PR merged at
`2026-08-12T23:55:56Z`, and **the PR body no longer contains the sentence**:

```
$ RE='(^|[^A-Za-z0-9_-])do[ _-]?not[ _-]?merge([^A-Za-z0-9_-]|$)|DNM-LOCK'
$ # control A — a string whose answer is known: MUST match
$ printf '%s' "Do not merge this as complete." | grep -Eiq "$RE" ; echo $?
0
$ # control B — MUST NOT match
$ printf '%s' "this is ordinary prose" | grep -Eiq "$RE" ; echo $?
1
$ # subject — the live #2813 body, fetched from the API
$ grep -Eiq "$RE" body2813.txt ; echo $?
1        # the tripping sentence is gone
```

The two controls are there because a `no match` from a malformed regex and a
`no match` from a genuinely clean body are the same output (ORDERS §3.0).

**Nothing on the PR records that it was ever blocked.** Not the body, not the
title. The check-run history holds a red, but the *reason* — which sentence, set
by whom, cleared by whom — is unrecoverable from the PR. A reviewer reading #2813
today cannot tell the difference between:

| | |
|---|---|
| a marker deliberately set, then cleared by Sapir under rule 30 | ← what happened |
| a marker tripped by accident and edited away by CC | ← what rule 30 forbids |

That indistinguishability is the defect. Rule 30 makes clearing the marker
Sapir's alone, and then stores the marker in the one place whose edit history
nobody reads and whose current state carries no author.

### Why the `||` in the current matcher makes this inevitable

```
grep -Eiq '(^|[^A-Za-z0-9_-])do[ _-]?not[ _-]?merge([^A-Za-z0-9_-]|$)|DNM-LOCK'
                          ^ prose-shaped                              ^ literal token
```

A literal token **already exists** (`DNM-LOCK`), and it already does everything a
literal token can do. It bought nothing, because it is `||`-ed with a
prose-shaped alternative — and when two cues are OR-ed, the loose one carries
every match. `.claude/rules/testing.md` states the general form ("an `||` between
two cues lets either one carry the assertion"); this is that shape in a blocking
gate.

**So "add a literal token" is not the fix — the token is present and was
present during every incident.** The fix is removing the alternative that
dominates it, and once the prose branch is gone the marker may as well live on
structured metadata, which is what MEH-1523 §4 locked.

---

## 2 · What is NOT re-litigated

MEH-1523 §4 locked the mechanism on 23/07 after a six-source industry review
(§2 of the card). Two things were considered and **rejected** there, and this
patch does not reopen either:

- **A token in the PR title.** Rejected as *"מיותר (יש label ו-draft), ומחזיר
  בדיקת-טקסט מהדלת האחורית"* — redundant, and it reintroduces text checking
  through the back door. The evidence above strengthens that call rather than
  weakening it: a title is as editable as a body and equally traceless.
- **Draft PR as the marker.** Rejected because the #2121 case is a PR that is
  *ready and green*, waiting on a human — and draft can stop CI, which CC needs
  running. Draft remains the right tool for "still being worked on"; the label is
  for "ready, do not land yet". Two states, two tools.

---

## 3 · The change — three edits, all in `.github/workflows/pr-checks.yml`

All three are required. Edit 1 alone produces a gate that **cannot fire** — see Edit 2 immediately below for why.

### Edit 1 of 3 — the gate step itself (replaces lines 67–77)

```yaml
      - name: Fail if the PR carries the marker label (MEH-1523)
        env:
          # Label NAMES only. `.*.name` flattens the label objects to a JSON
          # array of strings; toJSON keeps it one safe scalar for the shell.
          PR_LABELS: ${{ toJSON(github.event.pull_request.labels.*.name) }}
        run: |
          set -euo pipefail
          # MEH-1523: the marker is a LABEL. This step reads NOTHING else — no
          # title, no body, no commit messages. That absence is asserted by
          # scripts/checks/dnm-matcher-guard.sh, which fails if PR_BODY or
          # PR_TITLE reappears anywhere in this job.
          #
          # Why not text: PR #2637 was blocked by a pasted test name, and
          # PR #2813 by CC's own prose — and clearing #2813's marker left no
          # trace on the PR at all, so a cleared accident and a cleared
          # deliberate block are indistinguishable. A label has an actor and a
          # timestamp in the PR timeline; a sentence in a body has neither.
          #
          # The name DNM_LABEL_RE is load-bearing: the guard detects this patch
          # by it and switches to the label fixture table. Do not rename it.
          #
          # Matched against each label name NORMALISED to lowercase with every
          # non-alphanumeric stripped, so do-not-merge / DO NOT MERGE /
          # do_not_merge / don't merge all collapse onto donotmerge|dontmerge.
          # The two `tr` calls below are mirrored exactly in the guard's
          # normalise_label(); they must stay identical.
          # ANCHORED (^...$) deliberately. MEH-1523 acceptance criterion 2
          # says to match "the normalized form /dono?tmerge/" — unanchored.
          # Do NOT ship that: normalisation strips non-alphanumerics, so
          # `audit-do-not-merge-findings` becomes `auditdonotmergefindings`,
          # which CONTAINS `donotmerge` and would trip this BLOCKING gate on a
          # documentation label. That is #2637's false positive moved from prose
          # onto metadata — the swap shipping the very bug it was sent to fix.
          # The variant-tolerance AC2 actually wants is fully preserved:
          # `do_not_merge`, `DO NOT MERGE` and `don't merge` all normalise onto
          # the two strings below.
          DNM_LABEL_RE='^(dono?tmerge|dnmlock)$'
          # Fail-closed: a jq error fails the assignment under `set -e` +
          # pipefail, so a broken parse BLOCKS rather than falling through.
          # Deliberately NOT a process substitution — that would swallow it.
          names="$(printf '%s' "$PR_LABELS" | jq -r '.[]')"
          hit=""
          while IFS= read -r name; do
            [ -n "$name" ] || continue
            norm="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')"
            [ -n "$norm" ] || continue
            if printf '%s' "$norm" | grep -Eq "$DNM_LABEL_RE"; then hit="$name"; break; fi
          done <<< "$names"
          if [ -n "$hit" ]; then
            echo "::error::This PR carries the '$hit' label. Per ADR-016 (amendment, MEH-1155) auto-merge authority is VOID regardless of risk tier. Only Sapir may remove the label."
            exit 1
          fi
          echo "No marker label. OK."
```

`jq` is present on `ubuntu-latest`. An empty label array yields an empty
`names`, the loop body never runs, and the gate passes — the correct answer for
an unlabelled PR.

### Edit 2 of 3 — trigger types (line 27)

```diff
   pull_request:
-    types: [opened, synchronize, reopened, ready_for_review]
+    # MEH-1523: `labeled`/`unlabeled` are load-bearing, exactly as
+    # `ready_for_review` is. The marker gate reads the labels on the event
+    # payload, so WITHOUT these two, adding the label after the last run does
+    # not re-run the gate and the stale green stands — the marker would never
+    # block anything. Removing it would likewise not clear the red without a
+    # push, which rule 30 does not permit CC to manufacture.
+    types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]
     branches: [staging, main]
```

**This is the edit that makes the mechanism work at all**, and it is the one
most likely to be dropped as incidental. Without it the swap is strictly worse
than today: today's gate at least fires.

### Edit 3 of 3 — concurrency group (line 40)

`labeled` and `unlabeled` must NOT share a concurrency group with code pushes.
`cancel-in-progress: true` plus `ci-gate`'s `cancelled → FAIL` mapping means a
label toggle during an in-flight run would cancel it and report a **false red** —
the precise failure MEH-1653's comment on this same line documents.

```diff
-  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}-${{ github.event.action == 'ready_for_review' }}
+  # MEH-1523 extends MEH-1653's reasoning to the two label actions. Buckets:
+  #   ...-ready_for_review | ...-labeled | ...-unlabeled | ...-code
+  # Each action class cancels only its own kind, so a label toggle can never
+  # cancel a synchronize run (cancelled maps to FAIL in the aggregator).
+  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}-${{ (github.event.action == 'ready_for_review' || github.event.action == 'labeled' || github.event.action == 'unlabeled') && github.event.action || 'code' }}
```

**Residual race, named rather than hidden:** with `labeled` and `unlabeled` in
separate buckets neither cancels the other, so a fast add-then-remove leaves two
runs whose check-runs land in completion order. The alternative — one shared
`label` bucket — introduces cancellation, and a cancelled leg maps to FAIL. Of
the two, a rare last-writer-wins on a gate that a human is actively toggling is
the cheaper failure; a false red on a required check is not. Recorded so the
choice is visible.

---

## 3.1 · The cost Edit 2 imposes — and the option that avoids it

**Found by the different-model adversarial reviewer, not by me.** §5.2 below argues
the swap is cheap, and that argument is only about how often *the gate itself*
fires. It says nothing about the CI blast radius of Edit 2, which is the part that
actually costs money.

**Measured, not reasoned:** `github.event.action` appears in `pr-checks.yml`
**exactly once** — the concurrency group at line 40. None of the 13 job-level
`if:` conditions reference it; they gate on draft state or
`needs.changes.outputs.*`. So a trigger widened to `labeled`/`unlabeled` re-runs
**every job in the workflow**:

```
build · pytest (coverage gate) · lint-backend · env-drift · backend-mypy
frontend-knip · frontend-tsc-strict · frontend-vitest · pip-audit
ai-artifact-scan · … plus the four guard jobs
```

And Edit 3 makes these *additional, uncancellable* runs by design — separate
buckets mean a label toggle neither cancels nor is cancelled by the code bucket.
So the true cost of Edit 2 is **one full pipeline per label add or remove.**

Precedent that softens it: `ready_for_review` already causes a comparable full
re-run, so this is not an unprecedented shape. It roughly doubles the exposure.

### Two ways to have the mechanism, with different bills

| | **Option A** — in place (§3 as written) | **Option B** — its own workflow ⭐ |
|---|---|---|
| Edits | 3, all in `pr-checks.yml` | 1 new file; delete the step from `pr-checks.yml` |
| Ruleset change | **none** — job keeps its name and its place in `ci-gate`'s `needs:` (line 696) | **one** — add the new context to ruleset 15240090 |
| CI cost per label toggle | **a full pipeline** | **one ~10-second job** |
| Edit 3 (concurrency surgery) | required | **unnecessary** — the new workflow owns its own group |

**Recommendation: Option B**, because it removes the cost *and* the concurrency
hazard rather than trading one for the other, and because a gate this small has no
business dragging `pytest` behind it. It is safe against MEH-892 (a
skipped-but-required check reporting *Expected* and blocking docs-only PRs) for a
specific reason: the new job would carry **no paths filter and no draft
condition**, so it never skips — it is exactly the shape a directly-required
context is allowed to have.

**Option A stays fully specified above** and is correct if you would rather not
touch the ruleset. That is a real preference and this doc does not pretend
otherwise; the bill is now stated so the choice is informed.

### A third option, considered and rejected — do NOT do this

Adding `github.event.action != 'labeled'` to each heavy job's `if:` looks like the
cheap fix: keep one workflow, skip the expensive legs on label events. **It would
strand PRs red.** `ci-gate` does not merely map `skipped → pass` any more — since
the MEH-1582 patch it carries `check_ran` / `strict_ok`, and a required leg that
did not run reports as a failure:

```
FAIL Env drift (.env.example): skipped (required job did not run — 'skipped' is not a pass)
```

That is the same mechanic that stranded PR #2794. So the obvious middle path
converts a cost problem into a correctness problem, which is why it is named here
rather than left for someone to discover.

---

## 4 · Measured behaviour

`scripts/checks/dnm-matcher-guard.sh` gains a third mode, `label`, detected by
`DNM_LABEL_RE` in the workflow exactly as `post-patch` is detected by
`DNM_TITLE_RE`. It reads the matcher out of the workflow rather than keeping a
copy, so it tests the real rule.

### 15 label fixtures — every row executed

| Expected | Labels on the PR |
|---|---|
| **TRIP** | `do-not-merge` (the canonical form) |
| **TRIP** | `DO NOT MERGE` (spacing + case) |
| **TRIP** | `do_not_merge` |
| **TRIP** | `don't merge` (normalises to `dontmerge`) |
| **TRIP** | `dnm-lock` |
| **TRIP** | `tooling,do-not-merge,docs` (marker among others) |
| **TRIP** | `docs,Bug,DNM-LOCK` (marker last) |
| PASS | *(no labels)* |
| PASS | `tooling,docs,Bug` |
| PASS | `merge-queue` — mentions merging, is not the marker |
| PASS | `should-not-merge` — near-miss wording |
| PASS | `cc-queue` — the repo's real queue label |
| PASS | `audit-do-not-merge-findings` — compound, **the blocker case** |
| PASS | `explains-do-not-merge-gate` — compound |
| PASS | `blocked-do-not-merge-review` — marker text as a suffix |

### The five strings the swap frees

MEH-1523 acceptance criterion 3 asks for three of these; the two real incidents
are added. In label mode they are **not** evaluated against a regex, because
there is no text path left to evaluate them against:

```
#2121 verbatim   do not merge until Sapir confirms
#2813 verbatim   Do not merge this as complete.
#2637 verbatim   many open days that do NOT merge
commit message   fix(ci): explain why we do not merge on red
fenced code      grep -Eiq 'do[ _-]?not[ _-]?merge'
```

### Why those five are asserted STRUCTURALLY, not behaviourally

This is the part worth reading before trusting the table above.

A label-only gate never reads a body, so all five negative cases pass **by
construction** — they would pass equally against a gate that still scanned text
and merely failed to match these particular strings. That is a green with two
causes, and it is worth nothing (`.claude/rules/testing.md`).

So the negative direction is asserted as an absence: the `do-not-merge-gate` job
block must contain **none** of `PR_BODY`, `PR_TITLE`, `pull_request.title`,
`pull_request.body`. That is what acceptance criterion 1 actually demands — *"the
text-scanning path is DELETED, not left dormant"* — and it is falsifiable by
exactly the change under test.

**Shown discriminating, not asserted to be.** Self-test case (f) feeds the guard
a workflow with the *correct* label matcher **and** a surviving `$PR_BODY` grep.
Every behavioural fixture still passes; only the structural assertion catches it:

```
$ bash scripts/checks/dnm-matcher-guard.sh --self-test
  ok   baseline matcher accepted (exit 0)
  ok   widened matcher rejected (exit 1)
  ok   gutted matcher rejected (exit 1)
  ok   neutered matcher rejected (exit 1)
  ok   label matcher accepted (exit 0)
  ok   unanchored label matcher rejected (substring false positive) (exit 1)
  ok   label matcher WITH a surviving text path rejected (exit 1)
  ok   gutted label matcher rejected (exit 1)
  ok   widened label matcher rejected (exit 1)
  ok   neutered label matcher rejected (exit 1)
  ok   label matcher missing DNM-LOCK rejected (exit 1)
  11/11 self-test cases behaved correctly
```

Each rejection is a matcher a careless edit could plausibly produce:

| Case | Break | Why it must be rejected |
|---|---|---|
| (e2) | matcher **unanchored** — AC2's literal wording | `audit-do-not-merge-findings` blocks the PR; #2637 reborn on the label surface |
| (f) | correct matcher + surviving `$PR_BODY` grep | two markers, and the prose one fires by accident |
| (g) | `do-not-merge` as the literal matcher | labels are normalised before matching, so the hyphenated form never reaches it — blocks **nothing** |
| (h) | `merge` | `merge-queue` blocks the PR — #2637 reincarnated on the label surface |
| (i) | `zzz_never_matches_zzz` | a gate that never blocks |
| (j) | `dono?tmerge` with `dnmlock` dropped | a PR labelled `dnm-lock` sails through; ORDERS §1.4 names **both** markers |

Case (g) is the one that would have shipped: writing the label name itself as the
regex looks obviously right and matches nothing.

**The pre-patch mode is untouched and still green** — the guard was run against
the live workflow after every edit:

```
$ bash scripts/checks/dnm-matcher-guard.sh
DNM matcher guard - mode: pre-patch
dnm-matcher-guard: 19 fixtures pinned, WARNED (see above)
exit=0
```

---

## 5 · Two card requirements this patch deliberately does NOT follow

Both are named here rather than silently dropped, per ORDERS §1.7.

### 5.1 · The gate logic stays in the workflow — NOT in `scripts/`

MEH-1523 `<file_locations>` says *"Deliver logic as a script + tests"*. **That
would be privilege escalation**, and the reasoning is already merged in this
repo: `dnm-gate-regex.patch.md` § *"Why the matcher stays in the workflow"* —
moving the rule into `scripts/checks/` *"would put the DO-NOT-MERGE rule inside a
file CC can edit, letting the agent the gate governs rewrite its own gate. That
is privilege escalation under rule 32."*

A gate whose logic CC can edit is not a gate on CC. So:

- the **rule** lives in the workflow (CC-deny) — 20 lines of inline shell;
- the **fixtures** live in `scripts/checks/` and *read* the rule out of the
  workflow. CC can strengthen the assertions; it cannot weaken the gate.

The card's instruction was written before MEH-1922 landed that reasoning. A label
check is short enough that the script buys nothing anyway.

### 5.2 · No warn-only cycle — ship it blocking

MEH-1523 acceptance criterion 4 asks for *"warn-only for one cycle, then
blocking — the MEH-1379 ratchet."* **Applying that here would remove a live
constraint for a cycle**, which rule 32 forbids in that direction.

The ratchet exists to absorb a wave of new reds when a gate starts enforcing
something previously unenforced. Neither half applies:

- This gate is **already blocking** today. Warn-only is a downgrade, not a
  ramp-up — and during that window **no marker blocks anything**.
- The swap is a strict **narrowing**: strictly fewer PRs trip it (every prose
  false positive stops firing; the only new trip is a label nobody has applied
  yet). There is no red wave to absorb.

**Recommendation: apply blocking, in one step.** If a soak is wanted anyway, soak
the *label* — apply the patch, leave the label uncreated for a cycle, and the
gate is a no-op that cannot false-positive.

---

## 6 · What Sapir does — checklist

1. **Create the label** `do-not-merge` in repo settings (Issues → Labels).
   Suggested colour `#B60205`, description *"Ready, but must not land yet —
   only Sapir removes this (ADR-016 / MEH-1155)."*
   CC deliberately does not create it; see §7.
2. **Apply all three edits** in §3. Dropping edit 2 leaves a gate that cannot
   fire; dropping edit 3 risks false reds on unrelated PRs.
3. **No ruleset change needed.** The job keeps its name
   (`DO-NOT-MERGE marker gate`) and stays in `ci-gate`'s `needs:` at line 696,
   so the required context `CI gate (required)` is unchanged.
4. **Verify, on a real PR** (this is DoD item *"אומת על PR אמיתי"*):
   - add the label → `DO-NOT-MERGE marker gate` goes red within ~30 s, and the
     run is triggered by `labeled`;
   - remove it → a fresh run goes green, triggered by `unlabeled`, **with no
     push**. That "no push" is the whole point: today clearing the block
     requires editing the body, which rule 30 puts out of CC's reach.
5. `bash scripts/checks/dnm-matcher-guard.sh` → expect `mode: label`, no
   `WARNING`, `15 fixtures pinned, all as expected`.
6. **Mark `dnm-gate-regex.patch.md` superseded** so it does not read as pending.
7. **Release #2121** — its body no longer needs rewriting.

---

## 7 · §4's open question — ANSWERED, and the answer constrains the design

MEH-1523 §4 blocks the card on: *"האם ל-CC יש הרשאה להוסיף/להסיר labels
ב-GitHub?"* — and adds *"אם כן — לקבוע מי מסיר, כדי שלא ייווצר מצב שהמסמן והמסיר
הם אותו גורם."*

**Measured, not inferred — see the PR body for the exact tool calls and
responses.** The result is recorded in §7.1 below.

### 7.1 · Result

> **CC CAN add and remove labels on a pull request** via the GitHub MCP tooling
> available in a harness session. Measured on this PR: a label was added, read
> back, and removed again.

**This does not sink the mechanism, and it does not make the label a weaker
marker than what it replaces.** It does mean the label is *not self-enforcing*,
so the honest comparison is:

| | today (prose in the body) | with the label |
|---|---|---|
| Can CC clear it? | yes — edit the body | yes — remove the label |
| Does clearing leave a trace? | **no** — the sentence is simply gone (#2813) | **yes** — "X removed the `do-not-merge` label" is a permanent, attributed timeline event |
| Can it fire by accident? | **yes** — #2637, #2813 | no — nobody labels a PR by accident |

The gain is **attribution and auditability**, not mechanical prevention. Rule 30
is what forbids CC from clearing the marker, and rule 30 is a rule, not a lock —
it was already unenforceable against a PR body. What changes is that a violation
becomes *visible* instead of invisible, which is exactly what #2813 lacked.

**Recommendation on "who removes", per §4's own instruction:** Sapir only, which
is already rule 30's text. Two options to make it mechanical, both Sapir's and
both out of scope here:

- a repo ruleset / branch-protection rule restricting label changes, or
- a small `unlabeled`-triggered check that fails when the actor who removed the
  label is not Sapir — cheap, and it turns rule 30 into a gate rather than a
  norm. Worth its own card if wanted; **not** filed as self-authorised work
  (ORDERS §5).

---

## 8 · Cross-references

| For | Read |
|---|---|
| the narrowing this supersedes | [`dnm-gate-regex.patch.md`](./dnm-gate-regex.patch.md) (MEH-1922) |
| rule 30 — never self-clear a marker | `.claude/rules/workflow.md` rule 30 |
| rule 32 — CC adds constraints, never removes one | `.claude/rules/workflow.md` rule 32 |
| why the fixtures live in `scripts/` but the rule does not | §5.1 above |
| the guard | `scripts/checks/dnm-matcher-guard.sh`, mode `label` |
