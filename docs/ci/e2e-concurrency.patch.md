# `e2e.yml` concurrency — workflow patch (MEH-1601)

`.github/workflows/**` is CC-deny (**MEH-671**), so Claude Code cannot apply
this. This doc is the exact YAML for **Sapir** to apply to
`.github/workflows/e2e.yml`.

Same shape as [`docs/ci/repo-guards.patch.md`](./repo-guards.patch.md).

> ## ✅ STATUS 2026-07-31 — mechanism 1 is APPLIED. Do not re-apply.
>
> `207b9894` (2026-07-27) already made the one-line change this doc prescribes.
> The live file (`e2e.yml:56-58`) reads
> `group: e2e-${{ github.head_ref || github.run_id }}` — **not** the
> `|| github.ref` form quoted throughout the sections below. Everything under
> "The problem" describing mechanism 1 is now **history, not the current state**;
> it is preserved because Step 3's acceptance test and the MEH-999 evidence table
> still document what the fix was for.
>
> **Mechanism 2 is not fixed, and it is no longer "harmless once 1 is fixed."**
> §"The problem" below asserts that mechanism 2 "needs no change" once the group
> is fixed. That was reasoning about *cancellation*, and it is correct about
> cancellation. It misses a second effect that survives the fix: because
> `e2e-gate` maps `skipped → pass`, a docs-only push publishes a fresh
> **`success`** on the branch tip. The last run that actually executed the suite
> may have been red, and nothing on the tip says so.
>
> Observed on `staging` the same day: tip `5343955b` reported E2E `success`
> (docs-only → skipped), while the newest real execution — `0799e3c6`, run
> `30645351152` — was **red**. Reading the tip is what produced
> [MEH-1791](https://linear.app/mehamakor/issue/MEH-1791)'s incorrect conclusion
> that the suite "never ran" on two code commits; it had run, on both, and gone
> red on one.
>
> That residual is a **decision for Sapir**, not a patch CC can stage: it is a
> question of what a skipped leg should publish as the branch's E2E verdict, and
> it lives in a CC-deny file (MEH-671). Full write-up:
> [`docs/audits/meh-1791-vrt-baseline-review.md`](../audits/meh-1791-vrt-baseline-review.md) §5.
>
> _The original pre-application note is kept below for the record._

> **Nothing in this ticket is verifiable until you apply it.** The change is one
> line in a CC-deny file, and its effect — two consecutive staging pushes both
> running to completion — can only be observed on `staging` after the merge.
> There is no green CI on the MEH-1601 PRs that demonstrates the fix works;
> those PRs carry docs only. The acceptance test is in
> [Step 3](#step-3--how-to-verify-after-applying), and it is yours to run.

---

## The problem

E2E coverage on `staging` evaporates silently. The suite really only runs on PR
heads; what actually merges is usually never verified there.

Two mechanisms compound.

**1. One shared concurrency group for every staging push.** `e2e.yml:48-50`:

```yaml
concurrency:
  group: e2e-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

On a `push` event `github.head_ref` is empty, so the group collapses to
`e2e-refs/heads/staging` — **identical for every merge**. With
`cancel-in-progress: true`, each merge cancels the previous merge's run.

**2. The paths-filter is positive-only** (`e2e.yml:65-70`: `frontend/**`,
`public/**`, `package.json`, `package-lock.json`), so a docs-only push skips the
suite. That is correct behaviour on its own — but a docs push landing after a
code push **cancels the code run and puts nothing in its place**.

Mechanism 2 is only harmful *because* of mechanism 1. Fix the group and a docs
push can no longer cancel anything; the skip becomes what it should be — a cheap
no-op — and mechanism 2 needs no change.

### Evidence (MEH-999, 26/07)

| Commit | Run | Outcome |
|---|---|---|
| `cf44738b` | 30219726661 | **cancelled** by the next push |
| `866ba0e` | 30220254424 | **cancelled** by the next push |
| `a22c4a8` | 30220292367 | **cancelled** by the next push |
| `80d5c62` | 30220080416 | `success` — while the E2E job itself reported **`skipped`** |

`a22c4a8` is the one that stings: it carried the **regenerated `map` VRT
baseline**, and that baseline has still never been verified on `staging`.

The last row is the inverse failure — a docs-only push whose run concluded
`success` with nothing executed. Skip-green reads identically to pass-green in
the checks UI.

---

## Step 1 — the change

Replace `e2e.yml:48-50` with:

```yaml
concurrency:
  # MEH-1601: on a push, github.head_ref is empty, so `|| github.ref` collapsed
  # EVERY staging merge into one group and each merge cancelled the previous
  # one's run. Falling back to github.run_id instead gives every staging push a
  # group of its own — there is nothing to cancel, so merges never contend.
  # PR heads still carry head_ref and still cancel their own superseded runs,
  # which is the behaviour we want there (a new push obsoletes the old result).
  group: e2e-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```

One line changes: `github.ref` → `github.run_id`. `cancel-in-progress` stays
`true`.

### Why not `cancel-in-progress: false`

It is the more obvious fix and it is the wrong one. **A concurrency group holds
at most two runs — one running, one pending.** A third arrival evicts the
pending one, which is cancelled. Under `false`, three merges inside one E2E
window mean the middle one is dropped — the same lost coverage, now with added
queueing latency, because merges 2 and 3 also wait for merge 1's full run
instead of starting immediately.

The unique group takes `staging` **out of the contest** rather than putting it
in a queue. No waiting, no eviction, every merge verified.

### Why not `cancel-in-progress: ${{ github.ref != 'refs/heads/staging' }}`

The other formulation named in the ticket, and the one GitHub's own docs
illustrate (their example is `!contains(github.ref, 'release/')`). It works, but
it lands in the same two-slot queue as `false` for staging pushes — it just
arrives there by a different route. Prefer the unique group.

### Repo precedent

`deploy.yml` already made this exact call, twice — `:189` (production) and
`:277` (staging) both run `cancel-in-progress: false`, because a deploy must not
be killed mid-flight. Serialising is right for *deploys*, where you want one at
a time. It is wrong for *tests*, where you want all of them. Hence the different
shape here. `pr-checks.yml:36-38` keeps plain `cancel-in-progress: true` and
should stay that way — the required gates are PR-scoped.

---

## Step 2 — nothing else changes

No new job, no `needs:` edit, no aggregator leg, **no ruleset change**. The E2E
job is not a required context (per `.claude/rules/testing.md` and MEH-716), and
this patch does not make it one — that is
[`docs/ci/e2e-gate.patch.md`](./e2e-gate.patch.md)'s job, and it stays blocked on
its own two preconditions. This patch only stops staging runs from cancelling
each other.

The paths-filter (`e2e.yml:62-70`) is **not** modified. It is correct as written
and it does skip docs-only pushes — verified under MEH-999 on run 30220080416,
where the `Playwright E2E (Vercel preview)` job reported `skipped` for the
docs-only commit `80d5c62`.

---

## Step 3 — how to verify after applying

The acceptance test is behavioural and needs two merges close together:

1. Merge a **frontend** PR to `staging`. Note the E2E run id.
2. Within the first run's window (~4–5 min), merge a **second** PR — docs-only
   is fine, and is the exact case that used to destroy coverage.
3. `Actions → E2E Tests`, filter to branch `staging`. **Expected:** run 1 is
   `success` or `failure` — **never `cancelled`** — and run 2 either runs (if it
   touched frontend paths) or reports the E2E job `skipped` (if docs-only),
   without disturbing run 1.

Before the patch, step 3 shows run 1 `cancelled`.

**Then close the loop MEH-999 left open:** with staging runs surviving, the next
frontend merge finally verifies `a22c4a8`'s regenerated `map` baseline. If
`parity.spec.ts` `map` is green there, that thread is done; if it is red, the
regen did not take and it needs its own ticket.

---

## Line numbers

Verified against `origin/staging` at **`980c85c`** (26/07). If `e2e.yml` has
moved since, anchor on the literal `group: e2e-` string rather than the number —
there is exactly one occurrence in the file.

| Anchor | Line |
|---|---|
| `concurrency:` | `e2e.yml:48` |
| `group: e2e-${{ github.head_ref \|\| github.ref }}` | `e2e.yml:49` |
| `cancel-in-progress: true` | `e2e.yml:50` |
| paths-filter `filters:` block (unchanged, for orientation) | `e2e.yml:65-70` |
