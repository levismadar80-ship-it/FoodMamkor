# Runbook — turning on auto-merge and the merge queue, in the only safe order (MEH-1603)

**For Sapir. Every step here is hers** — repository settings, ruleset changes and
`.github/workflows/**` edits are all outside what CC may touch (MEH-671, rule 32).
CC produced the two patch docs and this runbook; CC applied nothing and changed
no setting.

**The order is load-bearing, not a preference.** Step 4 before step 3 blocks
every merge on the repository until it is undone. The reason is in
[`meh-1603-merge-queue.patch.md`](./meh-1603-merge-queue.patch.md) §2: without a
`merge_group` trigger the required check is never reported in queue context, so
the queue waits forever for a check that does not exist there.

Rough budget: **step 1 ≈ 5 min · step 2 ≈ 10 min · step 3 ≈ 15 min + CI ·
step 4 ≈ 2 min · step 5 ≈ one PR's wall-clock.**

---

## The order at a glance

| # | What | Where | Blocked on |
|---|---|---|---|
| **0** | Read the application trap (§Trap) | — | nothing — read it before you start |
| **1** | Apply the marker-label patch (MEH-1523) | workflow YAML + a label | — |
| **2** | Verify + arm native auto-merge on one PR | Settings + one PR | — (independent of 1) |
| **3** | Apply the `merge_group` triggers | workflow YAML | **1** (see below) |
| **4** | Enable the merge queue | Settings → Rules | **3** |
| **5** | Confirm one PR lands through the queue unattended | one PR | 4 |

**Why 3 depends on 1.** The label gate that step 1 installs **hard-fails in
merge-group context** — `jq` is handed a null label array under `set -euo
pipefail`. If step 3 lands first and step 1 later, the day step 1 lands the queue
jams. Doing 1 first means step 3's hunk 4, which fixes it, is written against a
file that already has the label gate in it. Detail:
[`meh-1603-merge-queue.patch.md`](./meh-1603-merge-queue.patch.md) §2.4.

Step 2 is genuinely independent and can be done any time. Doing it before 3 and 4
is recommended, because it isolates which layer any later surprise came from.

---

## ⚠️ Trap — open PRs hang on "Expected — Waiting for status to be reported"

**Read this before step 1. There are open PRs right now, so this will happen.**

**What it looks like.** A required check on an already-open PR sits on
*"Expected — Waiting for status to be reported"* and never resolves. The PR is
not red and not green; it is stuck, and the merge button stays disabled.

**When it fires.** When a **new required context is added to the ruleset** while
PRs are already open. GitHub starts demanding a check that those PRs' existing
runs never produced, and nothing re-runs on its own. It is the same mechanic as
the draft-strand documented under rule 21 and as MEH-892.

**Which steps here can trigger it — be precise, because most cannot:**

| Step | Adds a required context? | Trap applies? |
|---|---|---|
| 1, **Option A** (in-place, MEH-1523 §3) | no — the job keeps its name inside `ci-gate`'s `needs:` | **no** |
| 1, **Option B** (own workflow, MEH-1523 §3.1 — the *recommended* option) | **yes** — a new context on ruleset 15240090 | **YES** |
| 3 (`merge_group` triggers) | no — adds a trigger, not a context | no |
| 4 (enable the queue) | no | no |

So the trap is live **only if you take MEH-1523's Option B** — which that doc
recommends, on cost grounds, so this is the likely path rather than the exotic
one.

**The fix — nudge GitHub into re-running, on each stuck PR:**

1. **Add the `do-not-merge` label, then remove it.** This is the card's stated
   remedy and it is the cheapest. **It only works on workflows whose trigger
   `types:` include `labeled` and `unlabeled`** — which is precisely MEH-1523's
   Edit 2, and another reason step 1 comes first. Note what it does *not* reach:
   `deploy.yml` has no label trigger, so a label nudge re-fires `CI gate` and
   **not** `Deploy gate`.
2. **Or: Actions tab → the workflow → Run workflow → pick the PR's branch.**
   Both `pr-checks.yml` and `deploy.yml` carry `workflow_dispatch`. This reaches
   both gates. It only works once the workflow with the dispatch trigger is on
   the default branch — `pr-checks.yml:20-25` documents exactly this.
3. **Or: push any commit to the branch.** Fires `synchronize` on everything and
   always works. This is the remedy the upstream community thread records for the
   same symptom, and it is the heaviest.

> **Option 3 is Sapir's, not CC's.** Rule 30 forbids CC from pushing a commit
> whose purpose is to re-trigger a gate it is blocked on. A human doing it to
> clear a platform artefact is a different act from the agent under the gate
> doing it. If CC hits this state, the correct CC behaviour is to surface it and
> stop.

**Do not "fix" a stuck check by editing the ruleset to drop the requirement.**
That is removing a constraint (rule 32) and it fixes the symptom in the one
direction that cannot be undone quietly.

---

## Step 1 — the marker-label patch (MEH-1523)

Source of truth: [`meh-1523-dnm-label-gate.patch.md`](./meh-1523-dnm-label-gate.patch.md) §6.
Summarised here only so the ordering is legible; **follow that doc, not this
summary.**

1. Create the label `do-not-merge` (Issues → Labels). Suggested `#B60205`.
2. Choose **Option A** (three edits in `pr-checks.yml`, no ruleset change) or
   **Option B** (its own workflow, one ruleset addition — recommended there on
   cost grounds, and the option that triggers the trap above).
3. Apply. If Option B, register the new context on ruleset 15240090 and expect
   the trap on every already-open PR.
4. Verify on a real PR: label on → red within ~30 s; label off → green **with no
   push**.
5. Run `bash scripts/checks/dnm-matcher-guard.sh` → expect `mode: label`,
   `15 fixtures pinned, all as expected`.
6. Mark [`dnm-gate-regex.patch.md`](./dnm-gate-regex.patch.md) superseded.

---

## Step 2 — native auto-merge, verified on one PR

Source of truth: [`meh-1603-automerge.patch.md`](./meh-1603-automerge.patch.md) §3, §6.

1. Settings → General → Pull Requests → confirm ☑ *Allow auto-merge* and
   ☑ *Allow squash merging*. Both are probably already on.
2. Run the five-row verification table in that doc on **one docs-only PR**.
3. **The one thing to watch for: `HTTP 422 — Failed enabling auto-merge`.** That
   is the undocumented 2026-03-25 behaviour change, which specifically affects
   ruleset + merge-queue repositories — i.e. exactly what this repo is becoming.
   If it appears, record it on MEH-1603 and do not retry-loop; the remedy is to
   arm auto-merge **after** the gates are green rather than at PR-open time.

---

## Step 3 — apply the `merge_group` triggers

Source of truth: [`meh-1603-merge-queue.patch.md`](./meh-1603-merge-queue.patch.md) §3–§4.

Six hunks: four in `pr-checks.yml`, two in `deploy.yml`. All six are on a
docs-and-YAML level; none change behaviour on a normal PR (each is written so the
`pull_request` path is byte-identical to today).

1. Apply hunks 1–6.
2. **Re-derive the line numbers first.** They were read at `7cddbb8`. If staging
   has moved, the anchors may have shifted — the same drift that this batch found
   in the MEH-1523 doc.
3. Merge to `staging`.
4. **Verify the gates are still green on a normal PR before going near step 4.**
   This is the checkpoint the card's own ordering block calls for, and it is the
   last cheap moment to find a mistake: at this point the queue is still off, so
   a broken gate blocks one PR rather than the repository.

---

## Step 4 — enable the merge queue

**Settings → Rules → `protect-staging` (ruleset 15240090) → Require merge queue.**

Only after step 3 is merged and verified green.

While you are in the ruleset:

- **Confirm the required-context list is still exactly `CI gate (required)` +
  `Deploy gate (required)`.** CC cannot read the ruleset — no admin scope — so
  this is the one fact in the whole chain that is inherited from a 2026-07-04
  verification rather than re-measured.
- **Leave `strict_required_status_checks_policy` alone for now.** The card is
  right that a queue makes it redundant — GitHub's own docs say the queue
  *"provides the same benefits as 'Require branches to be up to date'"* — but
  redundant is not harmful, and removing a live constraint before its replacement
  is proven is the wrong direction (rule 32). Drop it after step 5 passes, if at
  all.
- **Note the queue's grouping strategy.** `ALLGREEN` is the configuration named
  in the auto-merge 422 report; if you hit that error later, this is the setting
  the upstream thread points at.

---

## Step 5 — confirm one PR lands unattended

1. Open a normal PR. Do **not** press Merge.
2. Arm auto-merge once both gates are green.
3. Expect: the PR **enters the queue**, a `merge_group` run appears with both
   gates reporting, and it lands with no click and no manual sync.
4. **Read the landed commit on `staging`.** `<title> (#N)` + body = squash, which
   is what you want. `Merge pull request #N from …` = it landed as a merge commit
   and the crafted message went to branch history.
5. **`get_issue` every MEH identifier in the branch name** and check both
   directions — closed when it should not have been, and not closed when it
   should have (rule 29b).

### If the queue jams, look here first, in this order

Predicted failure modes with their mechanisms — none of these has been observed,
because CC cannot run a workflow. This is a diagnostic ordering, not a record.

| Symptom | Likely cause | Where |
|---|---|---|
| `CI gate` never appears in queue context | hunk 1 not applied / not on `staging` yet | merge-queue doc §2 |
| `FAIL Env drift … (required job did not run)` | hunk 3 not applied — draft guard skipped it | §2.2 + hunk 3 |
| `Paths-filter job did not succeed` | hunk 2 not applied — no history to diff | §2.3 |
| `DO-NOT-MERGE marker gate` red on every merge group | hunk 4 not applied after step 1 | §2.4 |
| Everything green, PR still does not land | not the trigger patch — check auto-merge arming and §3 of the auto-merge doc | automerge doc §3 |

---

## What is NOT in this runbook, on purpose

- **`E2E gate`.** Not a required context today, so the queue does not wait on it.
  If it is ever promoted, it needs a `merge_group` trigger **in the same change**
  or the queue jams. Tripwire recorded in the merge-queue doc §6.
- **Rule 1's parallel-session rewrite.** The card's DoD includes it; the 08/08
  ruling already replaced stop-on-parallel with the ownership protocol. Not
  re-opened here.
- **Any decision about `mheap/github-action-required-labels`.** CC evaluated it
  and recommends keeping the in-house gate — the action has an open, unfixed
  merge-queue incompatibility, which is disqualifying for this card specifically.
  Reasoning in the merge-queue doc, Appendix A. **Sapir decides; nothing was
  swapped.**
