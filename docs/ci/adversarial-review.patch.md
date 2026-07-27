# Adversarial review — maker ≠ checker · YAML patch for `claude-review.yml` (MEH-1654)

> **🔴 NOT APPLIED. This file is a patch document, not a change.**
> `.github/workflows/**` is CC-deny (`.claude/settings.json`, MEH-671). CC writes
> the diff here; **Sapir applies it by hand** and updates the ruleset. Same
> pattern as [`e2e-gate.patch.md`](./e2e-gate.patch.md).

**Target file:** `.github/workflows/claude-review.yml`
**Companion docs change (already applied in this PR):** [`docs/CLAUDE-REVIEW.md`](../CLAUDE-REVIEW.md) → NON-GOALS + anti-anchoring + tally read-out.

---

## 1 · What is broken

Two independent defects in the same job.

| Line | Current | Why it fails |
| -- | -- | -- |
| `claude-review.yml:67` | `--model claude-sonnet-4-6` | The reviewer runs **the same model that writes the code**. A model that rationalized a shortcut while implementing rationalizes it again while reviewing. This is self-review with a different job name — no prompt fixes it, only a different model does. Banking's maker-checker rule: the agent that writes a change never approves it. |
| `claude-review.yml:56` | `continue-on-error: true` | The job cannot fail a PR. It is advisory, by design, for the calibration window. |

Observed directly on **MEH-1636**: the CC session reported *"self-reviewed the diff
line by line"* and *"/adversarial-review was not run as a sub-agent."* The
`claude-review.yml` job did run on that PR — and carried no evidentiary weight,
because it was the same model.

### Verbatim "before" (quoted from the live file)

```yaml
# .github/workflows/claude-review.yml
:27      paths-ignore:
:28        - '**/*.md'
:29        - 'docs/**'
:30        - '.changeset/**'
:31        - 'CHANGELOG.md'
...
:45      name: Adversarial review (calibration)
:52      if: github.event.pull_request.draft == false
:56      continue-on-error: true
...
:64      - uses: anthropics/claude-code-action@v1
:65        with:
:66          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
:67          claude_args: "--model claude-sonnet-4-6 --allowed-tools mcp__github__add_issue_comment"
```

---

## 2 · Which model is which — the part that has to be checkable

**The model that produced this patch: `claude-opus-5`.** Stated because the whole
ticket rests on maker ≠ checker being *verifiable* rather than assumed. Note that
this contradicts the ticket's own `Model:` field, which designated Sonnet 4.6 for
this work — the declared maker and the actual maker diverged, on the very ticket
about maker identity. That is the failure mode the declaration requirement below
exists to catch.

**Proposed reviewer model: `claude-opus-5`.**

| | Value |
| -- | -- |
| Maker (today) | `claude-sonnet-4-6` per every ticket's `Model:` field; **`claude-opus-5`** in this session |
| Checker (current YAML) | `claude-sonnet-4-6` — **identical to the maker** |
| Checker (proposed) | `claude-opus-5` — different model, and the stronger side of the pair, which is the correct asymmetry for defect-finding |

**The collision case is real and is not hand-waved.** When a CC session itself runs
Opus 5 — as this one did — pinning the reviewer to Opus 5 restores maker = checker
and the review has **no** evidentiary value. There is no mechanical way to detect
this from inside the workflow: the action knows its own model, not the model that
wrote the diff. So the guarantee is a **declaration**, and it is the reason the
DoD asks for one:

> Every PR body states the model the CC session ran as. If it equals the reviewer
> pin, Sapir treats that PR's adversarial review as **unrun**, not as clean.

**This PR is exactly that case** — Opus 5 wrote it, Opus 5 is the proposed pin — so
its own adversarial review would carry no weight. It is also docs-only, so
`paths-ignore` (`:27-31`) skips the job entirely and the question is moot here.

**No new secret.** `claude_code_oauth_token` authenticates the account; the model
is a CLI argument, not a credential. `secrets.CLAUDE_CODE_OAUTH_TOKEN` covers the
swap **provided the account has Opus 5 access** — if it does not, the step fails at
startup with a model-not-available error, which is loud, not silent. Nothing else
to provision.

---

## 3 · Calibration tally — READ, not inferred

Required by the ticket before any blocking flip. Both places the tally was
supposed to live were checked directly:

| Source | Expected | Actual |
| -- | -- | -- |
| `docs/CLAUDE-REVIEW.md` → the table under `## Calibration plan` | rows per PR | **5 empty placeholder rows.** The only non-blank cell is `(this PR) \| _ \| _ \| _ \| first run — wires the action` — the row MEH-487 shipped with. Zero data. |
| `HANDOFF.md` → a "Claude Review calibration" subsection, per the pointer MEH-487 left in `CLAUDE-REVIEW.md` and `CHANGELOG.md` | the live tally | **The subsection does not exist.** `grep -c "Claude Review calibration" HANDOFF.md` → `0`. The dangling pointer is retired in this PR; the table above is now the single owner. |

> **No line numbers in the two rows above, deliberately.** The first draft cited
> `CLAUDE-REVIEW.md:111-117` and `:132` — and **this PR's own edit to that file
> pushed the table from 111 to 189**, so both citations were stale before the
> branch was pushed. Section headings and quoted strings survive edits that line
> numbers do not (MEH-1642). The same reasoning applies to `CHANGELOG.md`, where
> entries are prepended and every line number below the top drifts on each merge.

**Read-out:**

* **PRs tallied: 0.**
* **Useful rate: unknown — not 0%, *unmeasured*.** The job has run on many PRs since
  2026-05-07 and HANDOFF records individual outcomes in prose (clean runs, addressed
  rounds, declined suggestions), but nobody ever scored a PR into the table. There is
  no denominator.
* **`>70% useful` threshold: NOT MET**, and not currently *meetable* — a threshold
  cannot be crossed by an empty dataset.

**Consequence, per the ticket:** the **model swap (§4) lands now**; the **blocking
flip (§5) is PENDING the threshold** and must not be applied until the tally exists
and clears 70%. The tally was never kept for eleven weeks, so "resume the tally" is
itself the open work — flagged, not silently assumed.

---

## 4 · Patch A — model swap + fresh context. **Apply now.**

Not gated on the tally. Replace the `anthropics/claude-code-action@v1` step
(`claude-review.yml:64-91`, from `- uses:` to end of file) with this block
verbatim. Indentation is 6 spaces for `- uses:`, matching the existing step.

```yaml
      # MEH-1654 — maker ≠ checker. The reviewer model MUST differ from the
      # model the CC session used to write the diff. Same-model review is
      # self-review: a model that rationalized a shortcut while implementing
      # rationalizes it again while reviewing. Not fixable by prompt.
      #
      # Maker: declared per ticket (`Model:` field) and restated in the PR body.
      # Checker: pinned here. If a PR body declares the maker as claude-opus-5,
      # this run is maker == checker → treat the review as UNRUN, not clean.
      #
      # No new secret: claude_code_oauth_token authenticates the account; the
      # model is a CLI arg. Requires the account to have Opus 5 access.
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          claude_args: "--model claude-opus-5 --allowed-tools mcp__github__add_issue_comment"
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}

            You are reviewing this pull request for the mehamakor.online repo.

            FRESH CONTEXT (MEH-1654, anti-anchoring). Your inputs are the diff,
            the tests inside the diff, and the repo rule files listed below.
            Do NOT read, and do NOT let your findings be shaped by:
              - the PR title beyond the MEH-XXXX identifier in it
              - the PR body / description / narrative
              - existing PR comments, including earlier reviews of your own
              - commit messages
            The author's reasoning is exactly what a fresh reviewer must not
            inherit. Judge the diff on what it does, not on what it claims.

            Read these files from the checked-out repo before commenting:
            - CLAUDE.md (project standards, locked decisions, RTL rules)
            - docs/CLAUDE-REVIEW.md (the full review prompt + output contract)

            Follow docs/CLAUDE-REVIEW.md exactly: focus areas, output format,
            the NON-GOALS section, and the "always post a comment" rule (post
            even when every section is empty — empty sections must read "None.").

            To post your review, you MUST call:
              mcp__github__add_issue_comment(
                owner=<owner from REPO above>,
                repo=<repo from REPO above>,
                issue_number=<PR NUMBER above>,
                body=<your review in the format from docs/CLAUDE-REVIEW.md>
              )
            This is the only mechanism that makes the review appear on the
            PR. Skipping the tool call = silent no-op (MEH-506 root cause).
```

**Two honest limits on the fresh-context clause.**

1. **It is prompt-enforced, not mechanically enforced.** `claude-code-action@v1`
   assembles PR context for the agent; the directive tells the reviewer to ignore
   the narrative, it does not prevent the narrative from being placed in context.
   Anti-anchoring here is a strong instruction, not a sandbox. Do not claim more
   than that.
2. **It narrows focus area 4.** `docs/CLAUDE-REVIEW.md` focus area 4 (scope creep)
   currently instructs the reviewer to compare changed files against *"that
   ticket's stated scope"* — read from the PR body. That is the anchoring the
   clause forbids. Resolved in `CLAUDE-REVIEW.md`: the reviewer takes the
   `MEH-XXXX` identifier only and judges scope from the diff's internal coherence.
   Both files must land together or focus area 4 and the prompt contradict.

**Session recycling** — the other half of the anchoring rule (*never recycle a
critic session*) is already satisfied: each `claude-code-action@v1` invocation is a
fresh process with no carried state, and the `concurrency` block (`:39-41`) cancels
rather than resumes. Nothing to change; recorded so a future edit does not
introduce reuse.

---

## 5 · Patch B — the blocking flip. **PENDING the tally (§3). Do not apply yet.**

```yaml
# claude-review.yml:53-56 — replace the calibration comment + the flag
    # MEH-1654: blocking. Scope comes from the ruleset, not from here — the
    # check is required on `main` (staging → main) and merely reported on
    # `staging` (feature → staging), because only protect-main lists it.
    continue-on-error: false
```

That single flag is the whole code change. **The scoping is done entirely in the
ruleset**, and this is worth being explicit about because it is easy to over-build:

* The check **already reports red today** when the job fails — job-level
  `continue-on-error: true` stops the *workflow run* from being marked failed, it
  does not mask the check's conclusion. Repo evidence: HANDOFF records merges with
  *"only the non-required `Adversarial review (calibration)` red"* and *"two
  non-blocking reds at merge … (continue-on-error by design)"*, with
  `mergeable_state: unstable`, not `blocked` (PR #793). So the flag is **not** what
  makes the check visible; it is what stops a red review from leaving a green
  workflow run.
* A failing check blocks **only** where a ruleset requires it.
* Listing the check on `protect-main` **and not** on `protect-staging` gives exactly
  the ticket's split: **blocking on `staging → main`, advisory (red but harmless,
  `unstable`) on `feature → staging`.**

No `if:` expression, no per-branch conditional, no second job. Patch A and Patch B
touch disjoint line ranges (the step at the tail vs. the flag at `:56`), so they can
be applied in either order.

### 🔴 The gap that decides whether any of this blocks anything

**Findings do not fail the job. Nothing in the current YAML converts a non-empty
"Must Fix" section into a failed step.** The action succeeds whenever the agent runs
and posts its comment — an all-clear review and a review listing six Must Fix items
produce the *same* green check. Confirmed against the action's own documentation:

> **Submit PR Reviews**: Claude cannot submit formal GitHub PR reviews
> **Approve PRs**: For security reasons, Claude cannot approve pull requests
> — `anthropics/claude-code-action` → `docs/capabilities-and-limitations.md`

The docs describe no input, flag, or tool by which the agent's conclusions set the
step's exit code. The action is **advisory by construction**; enforcement is
explicitly left to branch protection — and branch protection can only enforce on the
signal it is given, which here is "did the action run," not "was the diff clean."

**Consequence for MEH-1654 as written:** applying Patch B and adding the ruleset
entry produces a gate that blocks on **action infrastructure failure** — a timeout,
an API error, budget exhaustion, a bad model string — and **not** on review findings.
That is a real gate for "the reviewer didn't run," which is worth having (it closes
the MEH-506 silent-no-op class). It is **not** the gate the ticket describes.

**The missing piece, stated so nobody discovers it after the flip:** a step, after
the action, that reads back the posted comment and exits 1 when its `### Must Fix`
section is anything other than `None.` — using the same `mcp__github__` credentials
already present, adding a *step*, not a job:

```yaml
      # MEH-1654 gap-closer: the action is advisory by construction, so findings
      # must be turned into an exit code here or the required check gates on
      # nothing but infrastructure. Reads back the review comment the step above
      # posted and fails when its Must Fix section is non-empty.
      #
      # NOT YET SPECIFIED IN DETAIL — needs the comment-identification rule
      # decided first (latest comment by the action's bot identity on this PR,
      # matching the three-section contract in docs/CLAUDE-REVIEW.md). Writing it
      # blind risks a step that silently passes on a missed match, which is the
      # same silent-no-op class as MEH-506.
```

**This is Sapir's call, and it is a scope question, not a detail.** The ticket's
`over_engineering_guard` forbids new machinery, and this is machinery. Three honest
options:

1. **Flip anyway, accept the narrower gate.** Blocks "the reviewer didn't run."
   Cheapest, honest, and the DoD line about blocking must be reworded to say so.
2. **Specify the gap-closer step properly** (its own ticket — it needs a comment-
   identification rule and a demonstrated fail→pass run per `.claude/rules/testing.md`
   "Every new guard test must be shown failing").
3. **Leave Patch B unapplied** and keep the reviewer advisory, as ADR-028 § amendment
   27/07 concluded for the E2E gate on comparable grounds.

Recommending **(2) as a follow-up ticket with (1) in the interim** — the model swap
in Patch A is the change that actually removes the same-model defect, and it does not
depend on any of this.

### ⚠️ Hard precondition — `paths-ignore` must go first, or `main` locks forever

`claude-review.yml:27-31` puts `paths-ignore` on the **trigger**. On a docs-only PR
the workflow never starts, so no check reports. This repo has already written down
what that does to a required check:

> **NEVER** apply `paths-ignore` to a *required* check: the check becomes
> **absent** and branch protection blocks the PR forever.
> — `docs/DEPLOYMENT.md:252`

And under Rulesets a check that never reports reads as `Expected` and blocks — the
real 405 from MEH-892. `main` also has *"Do not allow bypassing… (applies to
admins too)"* (`DEPLOYMENT.md:271`), so a docs-only `staging → main` PR would have
**no** escape hatch. Rare — a release PR usually carries code — but unrecoverable
when it happens.

**Recommended fix: delete `claude-review.yml:27-31` outright.**

```yaml
# claude-review.yml:16-31 — the whole trigger, after deleting paths-ignore
on:
  pull_request:
    # MEH-925: `ready_for_review` is required so a PR opened as a draft still
    # gets reviewed the moment it flips to ready — without it the draft→ready
    # transition emits no event the `draft == false` job guard would let run.
    types: [opened, synchronize, ready_for_review]
    # MEH-1654: the F3 (May 2026) docs-only `paths-ignore` was REMOVED here.
    # It was safe only while this job was non-required. Once the check is
    # required on `main`, a trigger-level skip makes the check ABSENT, and an
    # absent required check blocks merge forever (docs/DEPLOYMENT.md:252,
    # MEH-892). Cost of removal: the review now runs on docs-only PRs too.
```

**The cost is real and is Sapir's call.** F3 added that filter to cut ~11% of
monthly Actions minutes plus API spend. Removing it gives that back. Two ways out,
both worse:

* **Keep `paths-ignore` and accept the risk.** A docs-only release PR to `main`
  becomes unmergeable with admin bypass disabled. Not recommended.
* **Aggregator job** (`if: always()` + `needs:`), the repo's sanctioned pattern for
  `ci-gate` / `deploy-gate` / `e2e-gate`. **It does not work here.** Those
  aggregators absorb a *skipped job* inside a workflow that still runs.
  `paths-ignore` stops the **workflow**, so the aggregator would not report either.
  Making it work needs `paths-ignore` removed *and* a `dorny/paths-filter` job *and*
  the aggregator — three additions to replace one deletion. Recorded so nobody
  reaches for the familiar pattern and finds out the hard way.

> **Scope note.** The ticket's `over_engineering_guard` says "no new CI job," and
> the recommendation above adds none — but the guard cannot be honoured *and* the
> blocking flip shipped unless `paths-ignore` is removed. Surfacing the tension
> rather than silently picking a side.

### The ruleset entry — exactly what Sapir adds, and where

| Field | Value |
| -- | -- |
| Ruleset | **`protect-main`** (the `main` rule — `docs/DEPLOYMENT.md` §C "Rule 1: `main`") |
| Add | `Adversarial review (calibration)` as a **required status check** |
| Do **NOT** add to | `protect-staging` (ID 15240090) — leaving it off is what keeps `feature → staging` advisory |

Two things to verify at the terminal before touching it, because both have burned
this repo:

1. **The check name is the job's `name:` field**, not the job key —
   `Adversarial review (calibration)` (`claude-review.yml:45`). If the flip also
   renames the job (e.g. dropping "(calibration)"), the ruleset must carry the
   **new** string; renaming without updating the ruleset makes the check go missing
   and blocks `main` forever (`DEPLOYMENT.md:242-244`).
2. **Read the live `protect-main` required-check list from the API first.**
   `DEPLOYMENT.md` §C's table is dated 2026-05-23 and its own caveat admits only
   `protect-main` was screenshotted. For `protect-staging` that table is now known
   stale — `.claude/rules/testing.md` verified against the ruleset API (2026-07-04)
   that staging requires **2 aggregators**, not the 6 individual jobs listed. Do not
   assume the `main` table is accurate either.
3. GitHub only offers a check name in the ruleset picker **after it has reported
   once on the target branch**. Merge Patch A first, let one PR run, then add the
   context.

---

## 6 · Order of application

| # | Step | Owner | Gate |
| -- | -- | -- | -- |
| 1 | Merge this docs PR | CC | green CI |
| 2 | Apply **Patch A** (model swap + fresh context) to `claude-review.yml` | **Sapir** | none — not tally-gated |
| 3 | Confirm one PR run posts a review comment under `claude-opus-5` | Sapir | — |
| 4 | Resume the tally: score each PR into `docs/CLAUDE-REVIEW.md` "Calibration plan" | Sapir | 5 PRs |
| 5 | If `>70% useful` — delete `paths-ignore` (`:27-31`) | **Sapir** | step 4 |
| 5b | **Decide the §5 gap**: findings do not fail the job, so a required check here gates on "did the reviewer run", not "was the diff clean" | **Sapir** | before 6 — it changes what step 7 buys |
| 6 | Apply **Patch B** (`continue-on-error: false`) | **Sapir** | steps 5 + 5b |
| 7 | Add `Adversarial review (calibration)` to **`protect-main`** only | **Sapir** | step 6 + one reported run |

Steps 5–7 are a single decision point. If the tally lands at 30–70%, the
`CLAUDE-REVIEW.md` decision matrix says tune the prompt and run another 5 — the
model swap from step 2 stays either way.

---

## 7 · Cross-references

* [`docs/CLAUDE-REVIEW.md`](../CLAUDE-REVIEW.md) — review prompt, NON-GOALS, calibration plan
* [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) §C — required checks, `paths-ignore` rule (`:252`), ruleset tables
* [`docs/ci/e2e-gate.patch.md`](./e2e-gate.patch.md) — patch-doc format precedent; MEH-892 skipped-required-check evidence
* `.claude/rules/testing.md` → "Required status checks + docs-only merge (MEH-716)" — the API-verified staging ruleset contents
* MEH-487 — wired the job in calibration mode; this ticket closes the loop it left open
* MEH-1636 — the PR where "self-reviewed line by line" was what was available
* MEH-1590 — E2E gating. A blocking adversarial gate does not replace E2E; both matter before `main`.
