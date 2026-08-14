# Native auto-merge on `staging` — settings, how CC opens PRs, and the 25/03/2026 trap (MEH-1603)

**Status: staged for Sapir. NOTHING APPLIED.** No repository setting was changed
and no workflow was edited by CC. This is layer 2 of the card's three layers —
the highest return per minute of Sapir's time, and the one that stops requiring
her to press *Merge* at all.

**Read [§3 first.](#3--the-25032026-behaviour-change--verify-on-one-pr-before-relying-on-this)**
There is a live, undocumented GitHub behaviour change that breaks the naive
version of this, and it interacts specifically with rulesets and merge queues —
which is exactly the configuration this repo is heading into.

---

## 1 · What layer 2 buys, precisely

Today the loop is: CC pushes → gates go green → **Sapir presses Merge**. Between
those last two steps `staging` can move, and with strict up-to-date checks on
(since 05/08) the green is invalidated and the loop restarts. The card's own
words for the pain: *"אני לא רוצה כל פעם ידנית להוריד, אין לי כוח."*

Native auto-merge removes the *press* — the PR lands by itself the instant every
required condition is satisfied. It does **not** remove the *race*: GitHub
auto-merge deliberately does not update a branch that has fallen behind. That is
what layer 3 (the merge queue) is for, and it is why the card ordered them this
way rather than treating either as sufficient alone.

| | fixes "Sapir must press Merge" | fixes "green goes stale when staging moves" |
|---|---|---|
| **Layer 2 — auto-merge** | ✅ | ❌ |
| **Layer 3 — merge queue** | ✅ (queue merges) | ✅ |

Layer 2 is worth doing first anyway because it is a settings toggle plus a flag
on how CC opens PRs, while layer 3 needs
[`meh-1603-merge-queue.patch.md`](./meh-1603-merge-queue.patch.md) applied first.

---

## 2 · The settings

### 2.1 · Repository setting — one checkbox

**Settings → General → Pull Requests → ☑ Allow auto-merge**

`.claude/rules/workflow.md` rule 21 already documents CC arming auto-merge on
real PRs (#2787, #2781), and MEH-1907 records PR #2592 landing unattended the
moment both gates went green. **So this box is almost certainly already
checked** — confirm rather than assume, but do not expect to be changing
anything here.

Nothing else about auto-merge is repository-level. In particular there is no
setting that makes auto-merge update a stale branch; that behaviour does not
exist.

### 2.2 · What must already be true for it to be safe

Auto-merge lands a PR with **no human in the loop**, so the required-check set
*is* the entire safety envelope. Two properties of this repo's set are worth
naming before switching the flow on, because both are already documented and
both are counter-intuitive:

- **`E2E gate` carries no vote.** Ruleset 15240090 requires exactly `CI gate` and
  `Deploy gate`. A PR lands on one green E2E run, zero E2E runs, or a red one —
  MEH-1907 measured this directly. Any instruction of the form *"wait for two
  green E2E runs"* is enforced **only by not arming auto-merge**, never by the
  merge machinery.
- **A skipped required leg is a FAIL, not a pass** — since MEH-1582, `ci-gate`
  uses `check_ran` for the always-required jobs. This is the property that makes
  unattended merging defensible, and it is also the property the merge-queue
  patch has to preserve (see that doc's §2).

### 2.3 · Squash, and why the method must be re-read rather than assumed

Rule 21 records the measurement: **`enable_auto_merge` on an already-armed PR is
a silent no-op that returns success and keeps the EXISTING merge method.** PR
#2787 sent `mergeMethod: SQUASH`, the response said `method: MERGE`, and the call
reported success. Three other PRs were then found armed with `merge` by another
actor.

That matters here because a merge commit **discards the crafted squash message** —
the reasoning, the `Builder-Model:` trailer, the `Closes MEH-XXXX`. To change the
method you must `disable` then `enable`, and **read the method back out of the
second response**. Never infer it from a successful call.

**Settings → General → Pull Requests** should have *Allow squash merging* on and,
ideally, the other two off — the cheapest way to make the wrong method
unreachable rather than merely discouraged.

---

## 3 · The 25/03/2026 behaviour change — verify on ONE PR before relying on this

The card flags this and it is real. Details, from
[community discussion #190610](https://github.com/orgs/community/discussions/190610):

> **What changed.** As of **2026-03-25**, enabling auto-merge requires the PR's
> requirements — required checks, required approvals — to **already be
> satisfied**. Previously you could arm it on a freshly-opened PR and it would
> merge later, when the conditions were met. That earlier behaviour is what the
> official documentation still describes.
>
> **The symptom.** `HTTP 422 — Failed enabling auto-merge for pull request`.
>
> **Where it bites.** Reported specifically on repositories using **repository
> rulesets** (not classic branch protection), **with a merge queue enabled**,
> `grouping_strategy: ALLGREEN`, required status checks and a required approval.
>
> **GitHub's response.** A maintainer replied *"Thanks for reporting. A fix is
> in the queue."* — acknowledged, not resolved.
>
> **Reported workaround.** Use the synchronous merge endpoint
> (`PUT /repos/{owner}/{repo}/pulls/{n}/merge`) instead of the async auto-merge
> path.

### Why this is not a footnote for us

The affected configuration is a description of where this repo is going: ruleset
15240090 **is** a repository ruleset, and layer 3 **is** a merge queue. The naive
form of layer 2 — *CC opens a PR and immediately arms auto-merge* — is exactly
the call that returns 422 under this change, because at open time the checks have
not run yet.

**Two things follow, and they are the whole practical content of this section.**

1. **Arm auto-merge *after* the gates are green, not at open time.** That is a
   one-line change in how CC works and it sidesteps the bug entirely: by the time
   the checks have passed, the precondition the new behaviour demands is
   satisfied. The cost is that CC must wait and make a second call — which it is
   doing anyway, since it polls the gates.
2. **Do not silently substitute the workaround.** The synchronous merge endpoint
   is *merging*, not *arming* — a different act with different authority, and
   rule 30 plus ADR-032 §3 govern when CC may perform it. It also has its own
   documented failure: rule 21 records that `merge_pull_request` with
   `merge_method: "squash"` has landed as a plain merge commit, confirmed 8/8 on
   MEH-1526's sample via the commit-message template. If it is used, the landed
   commit's message or parent count must be read back.

### The verification the card asks for — one PR, before relying on any of it

Take **one** low-risk PR (a docs-only one is ideal) and walk it:

| # | Do | Expect | If not |
|---|---|---|---|
| 1 | Open the PR **non-draft** | gates start | draft skips the real jobs — rule 21 |
| 2 | Arm auto-merge (squash) **only once both gates are green** | the call succeeds | **422 here = the 25/03 change is live for us.** Record it and stop; do not retry-loop |
| 3 | Re-read the method from the response | `squash` | `disable` → `enable` → re-read. Never infer |
| 4 | Wait | the PR lands with no click | if it sits armed and green, that is the #2125/#2126/#2127 shape — see below |
| 5 | Read the landed commit on `staging` | `<title> (#N)` + body, with the `Builder-Model:` trailer and `Closes MEH-XXXX` intact | `Merge pull request #N from …` means it landed as a merge commit; the crafted message is in branch history, not on `staging` |

**Step 4 has prior art that should temper expectations.** The card records
**#2125 / #2126 / #2127 armed with auto-merge since 05–06/08 and never landed.**
That is unexplained, it predates the strict-up-to-date change, and it was not
fixed by the 08/08 checkbox. If step 4 reproduces it, this doc's guidance is
insufficient and the finding belongs on the card — not worked around.

---

## 4 · How CC should open PRs

The card's phrasing is `gh pr merge --auto`. Two corrections, neither optional.

**First: `gh` is not available in a harness CC session.** There is no `gh` CLI
and no direct GitHub API; GitHub access is via MCP tools. The equivalent is
`enable_pr_auto_merge` with `mergeMethod: SQUASH`. The `gh` form is the right
mental model and the right thing for **Sapir** to type in her own terminal; it is
not the command CC runs.

**Second: not at open time.** Per §3. The sequence:

```
1. push the branch
2. create the PR — non-draft, base staging
   · body must NOT contain the marker phrase (the live gate still scans it)
   · body carries `Closes MEH-XXXX` only when the DoD is genuinely met
3. wait for `CI gate (required)` AND `Deploy gate (required)` == success
4. THEN arm: enable_pr_auto_merge(mergeMethod: SQUASH)
5. read the method back out of the response — not out of the request
6. after it lands: get_issue on every MEH id in the branch name (rule 29b)
```

**Why step 2 says non-draft.** A draft's backend jobs skip; on a `.claude/`-only
or docs-only diff the gate then takes its *"Neither stack touched"* branch, where
the only enforced job is `Env drift` — which is itself draft-skipped. The gate
demands a job the draft guaranteed would not run, and the PR strands red
(measured on #2794). A re-run does not fix it, because a re-run replays the
original `draft: true` payload.

**Why step 6 is not optional.** Rule 29b: the branch slug closes cards
non-deterministically. `Refs <id>` has both closed a card and left one untouched
— 2 of 5 measured — so nothing about the PR text predicts the outcome. Verify
after, in **both** directions: a card wrongly closed, and a card that should have
closed and did not.

### What auto-merge does not authorise

Arming it is not a merge decision that overrides anything else. In particular:

- **A marker on the PR still blocks**, and clearing it is Sapir's alone (rule
  30). Arming auto-merge on a marked PR is not a way to route around that — the
  required check stays red and nothing lands, which is the design working.
- **An explicit per-batch DO-NOT-MERGE / Sapir-merges instruction overrides
  tier-level auto-merge authority** (ADR-016 amendment, 2026-07-12). The
  batch-specific instruction is the specific rule and wins.
- **"Auto-merge unarmed" is a state, not a lock** (rule 32). A parallel lane
  re-armed #2781 within the hour. If something must not land, the marker is what
  holds it; restraint is not.

---

## 5 · Auto-merge **plus** merge queue — what actually happens

Once layer 3 is on, arming auto-merge does not merge the PR. It **enqueues** it:
the PR joins the merge queue, the queue builds a temporary branch containing it
and everything ahead of it, runs the required checks against that branch in
`merge_group` context, and lands it only if they pass. Auto-merge feeds the
queue; it does not bypass it. That is step 3 of the card's execution list and it
is the behaviour to confirm in the runbook's final step.

This is also why the two layers compose rather than compete, and why §1's table
has layer 3 fixing the column layer 2 cannot: the freshness problem is solved by
*what the queue tests*, not by anything auto-merge does.

**Consequence for CC's flow:** nothing changes in §4's sequence. The same call
arms the same thing; only the landing mechanism differs. What does change is that
step 4's "wait" can be materially longer, and a PR sitting in the queue is not a
stuck PR.

---

## 6 · What Sapir does — checklist

1. **Settings → General → Pull Requests** — confirm ☑ *Allow auto-merge*.
   Expect it to be on already (§2.1).
2. Confirm ☑ *Allow squash merging*; ideally turn the other two methods off, so
   the wrong method is unreachable rather than merely discouraged (§2.3).
3. **Run the one-PR verification in §3** on a docs-only PR. This is the step the
   card explicitly asks for and it is cheap. A 422 at step 2 is the answer, not a
   failure — record it on MEH-1603.
4. Only then treat unattended landing as the normal path.

**None of the above is a workflow edit, so none of it is blocked on
[`meh-1603-merge-queue.patch.md`](./meh-1603-merge-queue.patch.md).** Layer 2 can
be verified today, independently, and is worth doing before layer 3 precisely
because it isolates which layer any later surprise came from.

---

## Cross-references

| For | Read |
|---|---|
| what to click, in order, across all three layers | [`meh-1603-runbook.md`](./meh-1603-runbook.md) |
| the `merge_group` triggers layer 3 needs first | [`meh-1603-merge-queue.patch.md`](./meh-1603-merge-queue.patch.md) |
| arming is a silent no-op on an armed PR; squash can land as merge | `.claude/rules/workflow.md` rule 21 |
| never self-clear a marker; unarmed is not a lock | `.claude/rules/workflow.md` rules 30, 32 |
| branch-slug auto-close is non-deterministic — verify after every merge | `.claude/rules/workflow.md` rule 29b |
