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
| **A** | backend | `backend/**`, and `tests/**` — see the boundary note below |
| **B** | frontend | `frontend/app/**`, `frontend/components/**`, `frontend/lib/**` |
| **C** | CI · tests · docs | `.github/**`, `scripts/**`, `frontend/e2e/**`, `frontend/__tests__/**`, `docs/**`, `.claude/**` |

**The domains are exclusive, and the boundary is the point.** Two lanes editing
one file is the parallel-writer failure this repo has already hit (workflow rule
1; PRs #71/#72/#77). The partition is what makes concurrent sessions safe without
a merge queue — [MEH-1603](https://linear.app/mehamakor/issue/MEH-1603) is the
open card for the mechanical version, and until it lands the partition is the
only thing enforcing this.

### ⚠️ `tests/**` — a real boundary disagreement, recorded rather than papered over

The Lane C brief this file was written from listed **`backend/tests/**`**. **That
path does not exist.** Measured 2026-08-12: `git cat-file -e
origin/staging:backend/tests` → `fatal: path 'backend/tests' does not exist`. The
backend pytest suite is at **repo-root `tests/**`** (`tests/conftest.py`,
`tests/test_api.py` — which is also the path `workflow.md`'s own DoD line cites).

That typo was not cosmetic. Lane A owns `backend/**` and Lane C was given a path
that matches nothing, so the **actual** suite fell inside **no lane's domain at
all** — the precise condition this document exists to prevent.

**Resolved toward Lane A**, because a lane's own committed practice outranks a
brief written about it: `session-a-9d5pkj.md:64` records *"`tests/` treated as
lane A. It is the backend's own pytest suite."* A Lane C session that needs a
change under `tests/**` raises it with Lane A rather than editing it.

_This entry is kept as a worked example, not tidied away: the phantom path came
from the session brief and was transcribed into a coordination doc without being
checked, which is exactly the premise-verification failure ORDERS §1.6 describes.
It was caught by adversarial review, not by the author._

### Paths no lane owns are read-only until a lane claims one

The three domains above do **not** cover the repo. Measured on `origin/staging`,
`frontend/` alone also contains `messages/`, `i18n/`, `hooks/`, `data/`,
`public/`, `scripts/`, and the `*.config.*` files; `.ai/diagrams/` is unowned
too, and `session-a-9d5pkj.md` already flagged `.ai/diagrams/api-routes.md` as an
open boundary question it had to defer.

**`frontend/messages/{he,en}.json` is the one to watch** — the Bug Protocol's
i18n-sibling sweep (§2a) sends nearly every copy change through it, so it is both
unowned and high-traffic.

> **Default for any path not in the table: treat it as read-only, and claim it
> explicitly in the session log or on the card before editing.** An exclusivity
> guarantee that quietly omits routinely-edited directories is worse than no
> guarantee, because it is believed.

### The one sanctioned crossing

**Lane C may read and import from `backend/app/**` and `frontend/app|components|lib/**`
— never edit them.** A test must import the thing it tests. What Lane C may not
do is change production code *to make a test pass*: that inverts the test's
purpose and is explicitly out of scope in the pytest-parallel card's own prompt
block — *"production code must not change to accommodate tests; if a test fails
under xdist because of app-level shared state — STOP and report, don't patch the
app"*. That card scoped the sentence to xdist; the principle is general, and the
quote is given in full rather than trimmed to look general.

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

**[ORDERS.md](./ORDERS.md) §2 owns this rule in full — foreign branches are
read-only, `CLAIM = BRANCH`, and orphan adoption after a stated no-push window
requires a PR comment first. Read it there; it is deliberately not restated
here.**

The original draft of this section copied ORDERS §2 almost verbatim, **including
its numeric orphan-adoption threshold**. That was wrong on this file's own
stated terms: a parameter Sapir may plausibly tune would then live in two files
with nothing forcing the second to follow, and no guard to catch the drift — the
Smell #1 pattern in substance. ORDERS §5 models the correct move one section
earlier in that same file, declining to restate workflow.md's queue gates for
exactly this reason. Caught in adversarial review.

**What this file adds, which ORDERS does not say:** the lane partition makes
foreign branches *routine* rather than exceptional. At any moment the other two
lanes have live branches you can see, so "is this mine?" is a question you answer
many times a session rather than once — and the answer is a `git ls-remote`, not
a memory.

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
**docs-only** PR behind its own carrier card. The precedent for *this exact
pattern* is **MEH-2008** — a card whose body opens *"carrier card for a docs-only
PR that lands `docs/overnight/session-a-9d5pkj.md`"* — and MEH-2024 for this
file. (An earlier draft also cited MEH-2011 and MEH-2019 here. **Both are
mis-cited:** they are rules cards whose PRs edit `.claude/rules/workflow.md`, not
session-log carriers. They are precedent for docs-only carrier cards *in
general*, which is a weaker and different claim.) The carrier card exists because
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

> **⚠️ Note on the word "lane" — both senses are already live in this very
> directory.** `workflow.md` uses *Lane A / Lane B* for the two **queue** tracks
> (`In Progress` opt-in vs `Todo`/`Backlog` opt-out). This file uses *Lane A / B
> / C* for **file-domain partitions across sessions**. They are unrelated axes
> that share a word: a Lane C session still works both queue tracks.
>
> **Do not disambiguate by asking which file you are in — that heuristic fails.**
> Measured 2026-08-12, inside `docs/overnight/` itself:
>
> | File | Sense used |
> |---|---|
> | `session-s8-r9k3mt.md:105-106` — *"Lane A = `In Progress` **and** `cc-queue`"* | **queue track** |
> | `PROGRESS.md:25` — *"Lane A is opt-in → not mine"* | **queue track** |
> | `session-a-9d5pkj.md`, `session-c-wsl6fq.md`, `session-lb-pa6vyo.md` | **file domain** |
>
> Disambiguate by what follows the word: a state name (`In Progress`, `Backlog`)
> means queue track; a path glob means file domain. The collision is documented
> rather than renamed, because renaming either sense would break the other's
> existing references — but an earlier draft of this note implied a clean
> this-file/that-file split, which the table above disproves.
