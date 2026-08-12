# Lane topology — how a parallel drain divides this repo

> **What this file is.** The lane map for a multi-session parallel drain: which
> session owns which paths, who is allowed to write the append-only logs, what a
> session may do to another session's branch, and the two different kinds of
> "empty" a session can report.
>
> **Why it exists.** Every parallel drain so far carried this topology **only in
> the session prompt**. A session that reads `docs/overnight/` from disk — which
> is what [ORDERS.md](./ORDERS.md) and [LOOP-PROMPT.md](./LOOP-PROMPT.md) tell it
> to do — could not learn its own lane, could not learn who owns `CHANGELOG.md`,
> and had no name for "my lane is done but the queue is not". Coordination
> knowledge that lives only in a prompt is knowledge that dies between sessions.
>
> **What this file is NOT.** It is not authority and it does not own any fact
> that another file already owns. ORDERS.md owns the merge authority and the
> ownership protocol; `.claude/rules/workflow.md` owns the queue rules and rule
> 31; LOOP-PROMPT.md owns the turn-end contract. This file states the **lane
> partition** and points at the rest. Where it disagrees with any of them, they
> win — and the correct response is to fix this file.

**As of: 2026-08-12.** Lane assignments are per-drain and are set by the
orchestrator in the session prompt. The *partition scheme* below is stable; the
*specific seed lists* are not, and are never read from here.

---

## 1 · The three lanes

| Lane | Owns | File domain |
|---|---|---|
| **A** | backend | `backend/**` |
| **B** | frontend | `frontend/app/**`, `frontend/components/**`, `frontend/lib/**` |
| **C** | CI · tests · docs | `.github/**`, `scripts/**`, `backend/tests/**`, `frontend/e2e/**`, `frontend/__tests__/**`, `docs/**`, `.claude/**` |

**The domains are exclusive, and the boundary is the point.** Two lanes editing
one file is the parallel-writer failure this repo has already hit (workflow rule
1; PRs #71/#72/#77). The partition is what makes concurrent sessions safe without
a merge queue — [MEH-1603](https://linear.app/mehamakor/issue/MEH-1603) is the
open card for the mechanical version, and until it lands the partition is the
only thing enforcing this.

### The one sanctioned crossing

**Lane C may read and import from `backend/app/**` and `frontend/app|components|lib/**`
— never edit them.** A test must import the thing it tests. What Lane C may not
do is change production code *to make a test pass*: that inverts the test's
purpose and is explicitly out of scope in MEH-1911's own prompt block
(*"production code must not change to accommodate tests; if a test fails
because of app-level shared state — STOP and report, don't patch the app"*).

If a Lane C task genuinely requires a production-code change, that is a finding
for Lane A or B, not a crossing. Report it; do not reach across.

### Where Lane C's domain is narrower than it looks

`.github/**` is in Lane C's domain **and is hard-denied to Claude Code anyway.**
`.claude/settings.json` `permissions.deny` carries `Edit(.github/workflows/**)`,
`Write(.github/workflows/**)`, `MultiEdit(.github/workflows/**)` — verified
2026-08-12 by reading the deny list, not inferred. `pyproject.toml` and `uv.lock`
are denied on the same list.

So the lane domain grants Lane C **the topic**, not the file. The house pattern
for a workflow change is a staged patch under `docs/ci/` for Sapir to apply —
precedent: `docs/ci/e2e-gate.patch.md`, `docs/ci/vrt-label-trigger.patch.md`,
`docs/ci/meh-1911-pytest-parallel.patch.md`. A deny is a decision, not an
obstacle to route around (workflow rule 32).

---

## 2 · Single-writer logs

**Only Lane C writes `docs/CHANGELOG.md`, `HANDOFF.md`, and
`docs/overnight/ORDERS.md`.**

These three are append-only or authority-bearing, so every concurrent edit is a
conflict and every concurrent *authority* edit is worse than a conflict — two
lanes amending the orders in the same window produce a file neither of them
wrote.

**This is a lane rule stacked on top of an existing repo rule, not a replacement
for it.** Workflow rule 31 already forbids `CHANGELOG.md` and `HANDOFF.md` from
riding **any** code branch, and it is mechanically enforced by
`scripts/checks/changelog-branch-guard.sh` under the required *Repo guards* job.
Both hold at once:

- rule 31 says *which branch* they may ride (a docs-only one, never a code one);
- this section says *which lane* may write them at all (C).

A Lane A or B session that has a CHANGELOG entry to make **writes it into its own
session log** (`docs/overnight/session-<lane>-<id>.md`) and lets Lane C backfill.
That is how the existing logs were produced — see `session-a-9d5pkj.md`, which
carries a *Landed / open* section precisely so the backfill has a source.

ORDERS.md is the sharper case: it is the standing authority a session reads to
learn what it may merge. Amending it from two lanes at once is how a session ends
up operating under orders nobody issued.

---

## 3 · Foreign branches are read-only

**A branch or PR this session did not create is read-only.** Read it, cite it,
work around it — never push to it. This is ORDERS §2 verbatim and is restated
here because the lane partition makes foreign branches *routine* rather than
exceptional: at any moment two other lanes have live branches you can see.

**CLAIM = BRANCH.** Pushing `feature/meh-<N>-<slug>` to `origin` is the claim,
and there is no other signal. A card named in a session log, a check-in note, or
a plan is **unclaimed and grabbable** — the listing is not a reservation and
reads as one. Claim at *intent* time, not build time: an empty branch pointing at
`origin/staging` is a valid claim.

**The one exception — orphan adoption.** A PR or branch with **no push for more
than 2 hours** may be adopted by exactly one session, and adopting means saying
so in a PR comment **first**, so a returning owner sees a handover rather than a
surprise force-push.

**Reading a foreign branch is encouraged.** The failure this rule prevents is
concurrent writes, not awareness. `git log origin/feature/...`, the PR diff, and
another lane's session log are all legitimate inputs — and per ORDERS §5, reading
the most recent `session-*.md` before re-deriving anything is a procedure, not a
courtesy.

---

## 4 · LANE-EMPTY is not QUEUE-EMPTY

These are two different claims with two different evidence bars, and conflating
them ends a drain early.

| Promise | Means | Who may say it | Ends the loop? |
|---|---|---|---|
| **LANE-EMPTY** (`LANE-A-EMPTY`, `LANE-C-EMPTY`, …) | *This lane's* eligible, unclaimed work is exhausted. Other lanes may still have hours of work. | any lane, about itself | **No** |
| **QUEUE-EMPTY** | The **whole** queue is exhausted, across every lane. | only after the verified-empty ritual | **Yes** |

**QUEUE-EMPTY is defined by [LOOP-PROMPT.md](./LOOP-PROMPT.md) §3 and this file
does not redefine it.** It is the completion promise: saying it ends the loop, so
it must be earned by the three-step ritual (fresh `list_issues` sweep on both
tracks → opportunistic lanes exhausted → only then the promise).

**LANE-EMPTY is the new half**, and it exists because in a partitioned drain the
per-lane condition is reached long before the global one. The bar for it is the
*same* sweep restricted to the lane's file domain:

1. Fresh `list_issues` on both tracks (Lane A `cc-queue` opt-in; Lane B/`Todo`/`Backlog`
   opt-out then content-gated by workflow.md B1–B4).
2. Every remaining eligible card's work falls **outside this lane's file domain**,
   or is already claimed by a branch on `origin`.
3. The lane's opportunistic list is exhausted too.

**A paginated listing is evidence of presence, never of absence** — before
reporting either promise, re-fetch the full set in one window rather than
inferring emptiness from a short page.

**What a lane does after LANE-EMPTY is the orchestrator's call, not the
session's.** A prompt may chain lanes (`LANE-A-EMPTY → LANE-C-EMPTY`), meaning:
when lane A reports empty, this session continues as lane C rather than stopping.
Absent such a chain, LANE-EMPTY is reported and the session takes the next
instruction — it is **not** a licence to start editing another lane's files.

---

## 5 · Session logs

One per session, at `docs/overnight/session-<lane>-<id>.md`, landing in a
**docs-only** PR behind its own carrier card (precedent: MEH-2008, MEH-2011,
MEH-2019 — and MEH-2024 for this file). The carrier card exists because
`Branch name gate` requires `^(feature|levismadar80)/meh-[0-9]+(-[a-z0-9]+)*$`,
so every legal branch name needs some ticket's identifier.

The log is not a diary. Its job is to be **the thing the next session reads
instead of re-deriving**, so it carries: the in-flight ledger, what landed with
PR numbers, what was parked and why, and the residual findings that are outside
the lane. ORDERS §5 records a session that re-derived a fact ~6 hours after a
predecessor had committed it to `staging` in a file named for the same sweep;
that is the cost this section exists to avoid.

---

## 6 · Cross-references

| For | Read |
|---|---|
| merge authority, self-check bundle, ownership protocol | [ORDERS.md](./ORDERS.md) |
| turn-end contract, verified-empty ritual, QUEUE-EMPTY | [LOOP-PROMPT.md](./LOOP-PROMPT.md) |
| queue lanes A/B, eligibility gates B1–B4, `cc-queue` | [`.claude/rules/workflow.md`](../../.claude/rules/workflow.md) → *Working the queue* |
| rule 31 (logs never ride a code branch) | [`.claude/rules/workflow.md`](../../.claude/rules/workflow.md) |
| what is parked and why | [PARKED.md](./PARKED.md) |

> **Note on the word "lane".** `workflow.md` uses *Lane A / Lane B* for the two
> **queue** tracks (`In Progress` opt-in vs `Todo`/`Backlog` opt-out). This file
> uses *Lane A / B / C* for **file-domain partitions across sessions**. They are
> unrelated axes that share a word: a Lane C session still works both queue
> tracks. The collision is noted rather than renamed, because renaming either
> would break the other's existing references.
