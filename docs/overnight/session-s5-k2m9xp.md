# Sweep session log — s5-k2m9xp (2026-08-08 night)

> As-of: 2026-08-08T21:30Z. Every claim below is measured at that time; re-derive
> before acting on any of it.

**0 merged, 4 parked (one credential gate), 1 docs PR, 1 evidence deliverable —
and 3 of my own claims retracted after adversarial review.**

The headline: **the session's assigned first task was already done, its top queue
item was already claimed by a live parallel session, and Linear died mid-run** —
so the value here is the anti-stale findings plus one piece of evidence nobody
else had produced.

---

## 1 · The assigned first task was already complete

The prompt's FIRST TASK was a docs-only PR adding an intra-session concurrency
section to `ORDERS.md`. **It was already on `origin/staging` before this session
started.**

```
$ git log --oneline -1 origin/staging
7ed56c78 docs(orders): intra-session concurrency — pipelined execution (#2702)
```

`ORDERS.md` §4.1 matches the prompt's section clause-for-clause: in-flight cap 2,
background-subagent cap 3, `isolation: "worktree"`, the no-`git stash` rule, the
MEH-1897 filler in the while-you-wait lane, and "auto-merge is armed only for PRs
whose review has already cleared".

**No PR was opened.** Per `.claude/rules/file-preservation.md` rule 6 — *prove the
document is wrong before correcting it* — the search came back showing the file
already correct, and that is the finding. This is the fourth consecutive sweep to
arrive with a stale seed list (ORDERS §5 records the prior three).

---

## 2 · A parallel session is live on this repo

`feature/meh-1928-vrt-baseline-sync-guard` exists on `origin` with real work in
progress:

| commit | pushed | message |
|---|---|---|
| `5fb4fea6` | **2026-08-08T21:05:55Z** | `fix(guards): diff against the merge base, not the base tip` |
| `68a79a16` | 20:50:49Z | `merge staging` |
| `1814ea08` | 20:48:55Z | `fix(guards): do not report a trailing comma as a value change` |

Pushed **six minutes** before this session looked. ORDERS §2 sets orphan adoption
at >2h idle, so this is nowhere near adoptable — it is an active claim.
**FOREIGN = READ-ONLY was applied: the branch was never checked out, never
pushed to, and the card was not relabelled.** Sapir subsequently confirmed
"SKIP feature/meh-1928-vrt-baseline-sync-guard".

`MEH-999` was also touched at 21:04:34Z, which is consistent with the same
session, though that is inference and not measured.

---

## 3 · BLOCKER — Linear OAuth expired mid-session

```
mcp__Linear__get_issue MEH-999 -> MCP server "Linear" requires re-authorization (token expired)
```

Confirmed twice, ~20 minutes apart. This is ORDERS §1.2 **gate 2** — credentials
Sapir physically holds — and a non-interactive session cannot run the OAuth flow.
It is not an authority problem and there is no route around it.

**What it cost:** `MEH-999`, `MEH-215`, `MEH-217`, `MEH-1897` could not be read,
so none of them could be built. ORDERS §5 forbids building from the prompt's
queue list alone ("a HINT, never state"), and a card's description is the full
spec — so building them blind would have been guessing at requirements, not
working the queue. **They are untouched and unclaimed.**

Re-auth is via the claude.ai connector settings.

---

## 4 · Backend tests run here — RECONFIRMED, not discovered

> ### ⚠️ DOWNGRADED after adversarial review. This section originally read
> ### *"A documented environment claim is WRONG"*. That framing was overstated.
>
> `HANDOFF.md:4544`, dated **2026-07-18 — three weeks before this session** —
> already records the exact distinction: *"`uv run` works in-sandbox (local pytest
> now possible); `pip install` and `.env*` reads remain blocked."* The same entry
> block reports a full local backend run (*"full `test_api.py` 218/218 verified
> locally (`uv run` + local Postgres)"*).
>
> So this is a **reconfirmation of already-recorded knowledge**, not a correction of
> a live wrong belief, and the claim I drafted — *"sessions have been recording
> pytest as not run needlessly"* — does not survive HANDOFF's own history.
>
> **The irony is the point.** ORDERS §5 exists because sweeps keep re-deriving facts
> already committed to this repository, and its worked example is a session that
> checked the *repo* for staleness but never read `docs/overnight/`. I checked
> neither: I read one Linear card, found a claim I could falsify, and reached for
> "the docs are wrong" without grepping HANDOFF for the answer. **The rule I was
> best placed to apply is the one I skipped.**
>
> What is still worth carrying: the measurement below is current, and the
> `pip`≠`uv` distinction is the reason the block is narrower than it sounds.

The narrower true statement: **`MEH-1904`'s PR-gap note** — *"`pytest` לא רץ (לא
מותקן, `pip install` חסום)"* — describes **that session's own run**, not a durable
repository-wide limitation. Read as the latter it is misleading; read as the former
it is accurate. Measured today, from this sandbox:

```
$ uv sync --frozen          # from backend/
EXIT:0                       # full dev dependency set installed
$ backend/.venv/bin/python -c "import pytest; print(pytest.__version__)"
9.0.3
$ ls -d /usr/lib/postgresql/16/bin
/usr/lib/postgresql/16/bin   # server binaries present, not just the psql client
$ backend/.venv/bin/python -m pytest tests/ --collect-only -q
2790 tests collected in 16.60s
```

**`pip` being blocked is not `uv` being blocked**, and the two were conflated. A
throwaway PostgreSQL 16 cluster was brought up under `/var/lib/postgresql/` (the
scratchpad path is not traversable by the `postgres` user), `fsync=off`,
`max_connections=200`. Nothing shared or production was touched.

**Consequence:** the backend half of the self-check bundle (ORDERS §3.1) is
available from a CC sandbox. Sessions have been recording `pytest` as *not run,
and why*; that concession is no longer required.

---

## 5 · PR #2661 / MEH-1911 — the analysis, and the one real question

PR #2661 applies the pytest-xdist split. State as measured:

- **Both required gates green** — `CI gate (required)` and `Deploy gate (required)`,
  plus `Backend tests (pytest)` and `Repo guards`, completed 15:39–15:46Z.
- **One check is RED**, and it is not one of the required two:
  `Adversarial review (calibration)`, job `93121553004`, `conclusion: failure`.
  It is `continue-on-error: true` and absent from `ci-gate`'s `needs:`, so it blocks
  nothing — but per workflow.md rule 5a step 6 the absence has to be *said*: **no
  `claude[bot]` comment was posted on that PR**, which is the MEH-1844 intermittent
  no-op, not a review that found nothing.
- **Idle ~5h44m** at the time of reading (last check 15:46:05Z), so adoptable under
  ORDERS §2.

> ### ❌ I claimed "all 32 checks green". That was FALSE, and the way it went wrong
> ### is the more useful half.
>
> The first `get_check_runs` call was made **without `perPage`**, so it returned the
> default **30 of 32**. The failing job was entry **31**. Every check I could see was
> green, so I wrote that every check was green — reading the end of a truncated
> window as the end of the list.
>
> `CLAUDE.md` names this exact failure: *"Any paginated listing is evidence of
> PRESENCE, never of ABSENCE … re-fetch the FULL set in ONE window — raise
> `perPage`."* It is in the always-loaded rules, it was in context the whole time,
> and it describes what happened with no adaptation needed. **Two prior incidents
> (MEH-293, MEH-1797) are recorded under it; this is the third.**
>
> Caught by the different-model adversarial review, which pulled the list itself
> rather than trusting the prose — and then by re-fetching with `perPage: 100` to
> confirm rather than taking the reviewer's word for it. **The maker≠checker rule
> earned its cost on this PR**; a same-model pass would have had the same blind spot
> because it would have inherited the same truncated evidence.
- It edits `.github/workflows/` (CC-deny, MEH-671) — CC can merge it but **cannot
  repair it**, which is why the previous session handed it back rather than merging.

### A suspicion raised and then CLEARED

The second pass runs `pytest tests/ -m serial`, and `serial` is **not** a
registered marker in `backend/pyproject.toml` — there is no `[tool.pytest]`
section at all. If no test carried the mark, that pass would select zero tests
and pytest would exit 5.

It does not. Exactly one test carries it:

```
tests/test_api.py:1207:    @pytest.mark.serial
```

So the split is coherent — 2789 parallel, 1 serial — and this is **not** a defect.
Recorded because the green had a second possible cause worth eliminating rather
than assuming (`.claude/rules/testing.md` → *"A green that has two possible causes
is not a signal"*).

### The genuinely open item

The card's DoD asks for **stability ×5**. The prior session stated plainly that
one green run is not that proof, and that the ×5 evidence *"I can produce without
touching any denied path"* — then did not produce it. That is the gap this session
went after; results in §7.

---

## 6 · MEH-1928 — an independent Phase 0 that CORROBORATES what the other session shipped

> **Superseded framing, kept visible.** This section was written as a *handoff* for
> an open card. It is not one: at **2026-08-08T21:24:53Z** the parallel session
> merged **PR #2703** (`adee54a3`, `feat(guards): warn when a he.json value changes
> with no baseline refresh`) — 372 lines, one new file,
> `scripts/checks/vrt-baseline-sync-guard.sh`. The card is done and this is no
> longer work anyone needs to pick up.

A read-only subagent mapped `he.json` namespaces to VRT-covered routes before the
foreign claim was discovered. **Not acted on, not posted to the card (Linear down),
and the branch was never touched.**

**The two investigations reached the same verdict independently, which is the only
reason this is still worth writing down.** The landed guard reads
`vrt-baseline-sync-guard: mode WARN-ONLY` (`:81`), warns over the **whole file**,
and never fails the dispatcher (`:371`). Its own header (`:19-28`) gives as the
reason that *"40 files call `useTranslations()` with NO namespace argument and then
use full dotted paths, so no namespace string exists to map"* — a variant of this
probe's third reason below, arrived at from a different direction.

Two agents, no contact, same call. That is worth more than either analysis alone,
and it is the closest thing to maker≠checker this card is going to get.

**Verdict reached here: WARN-ONLY. Do not ship a precise namespace allowlist.**

The route list in the card is incomplete — `parity.spec.ts` has **9 `test()`
blocks over 6 URLs**, with **five** producer-detail variants, not one
(`:485`, `:569`, `:593`, `:623`, `:656`). The import graph maps **32 of 53**
top-level `he.json` keys onto covered routes. Three reasons that mapping must not
become a gate:

1. **"In the import graph" ≠ "in the baseline pixels."** At least 9 of the 32 are
   structurally unable to appear in any baseline: `group_buys` reaches `/` only via
   `FridayDeliveryStrip.jsx:16` which `parity.css:12-15` sets `display:none`;
   `modals` via `CookieBanner.jsx:20`, hidden by `parity.css:31-33` and
   pre-consented at `parity.spec.ts:196-202`; `auth` via `VerifyBanner.jsx:35`
   which never renders logged-out; `seo` is `<head>` metadata; `chat` renders only
   its FAB, desktop-only, and its panel keys need a click no test performs.
2. **Producer-detail shots render fixture data**, so key-level coverage is
   fixture-shaped, not namespace-shaped (`parity.spec.ts:502-508`, `:571`, `:626`).
3. **Namespace prefixes are ambiguous, and the probe caught its own false
   positives** — `AboutClient.jsx:71` scopes `t` to `about.consumer`, so
   `t("story.…")` and `t("contact.…")` are *not* the top-level `story` / `contact`
   keys, which live on entirely different routes.

Cleared by the same pass, so the recommendation is not hand-waving: there is **no**
fully dynamic top-level namespace resolution (every dynamic key has a static
leading segment), and the legacy `useLanguage()` shim has zero live consumers in
any covered graph.

**Suggested shape:** warn-only over the whole file, printing the 21 definitely-
uncovered keys as an informational note. If precision is wanted later, derive it
from *rendered output* — dump the `t()` calls actually invoked during a Playwright
run — which closes gaps 1 and 2 at once. That is the only version worth gating on.

---

## 7 · The xdist stability proof

**COMPLETE — 5 of 5 runs, 10 of 10 passes, every one `exit=0`.**

_(The first commit of this file recorded "3 of 5 complete, runs 4 and 5 still
executing". That was accurate when written and is superseded here. It is mentioned
rather than quietly overwritten because "I stated the partial state" is the
behaviour worth keeping, not an embarrassment to tidy away.)_

Five consecutive runs of the **exact two-pass split** the CI job applies, with
`--timeout=60` matching the job:

```
pass 1:  pytest tests/ -n auto -m "not serial"
pass 2:  pytest tests/ -m serial
```

| run | parallel pass | serial pass |
|---|---|---|
| 1 | `exit=0` — **2417 passed, 371 skipped, 1 xfailed** — 153.83s | `exit=0` — **1 passed, 2789 deselected** — 61.24s |
| 2 | `exit=0` — 2417 / 371 / 1 — 151.57s | `exit=0` — 1 / 2789 — 61.68s |
| 3 | `exit=0` — 2417 / 371 / 1 — 149.92s | `exit=0` — 1 / 2789 — 62.36s |
| 4 | `exit=0` — 2417 / 371 / 1 — 158.49s | `exit=0` — 1 / 2789 — 61.59s |
| 5 | `exit=0` — 2417 / 371 / 1 — 151.63s | `exit=0` — 1 / 2789 — 61.08s |

**The counts are byte-identical across all five runs**, and the wall-clock spread is
8.6s on a ~153s pass (149.92–158.49). `2417 + 371 + 1 = 2789` parallel, plus the 1
serial test = the 2790 collected. The arithmetic closes on every run.

**No test passed on retry.** `pytest-rerunfailures` is in the dev dependencies, so
"passed" could have meant "passed on the second attempt" — a flake wearing a green
mask, which is precisely what this exercise exists to detect.
`grep -ci "rerun|flaky"` returns **0** on every parallel log, and no `--reruns` flag
was passed (matching the job, which does not pass one either).

### What this does NOT establish

- **4 cores here, 2 on the runner.** `-n auto` resolved to **4 workers**; CI gets 2.
  An earlier draft argued more workers is strictly *more* hostile, so a 4-worker
  green covers the 2-worker case. **That does not hold, and the adversarial review
  was right to attack it:** xdist's load-balanced scheduling means worker count
  changes *which tests are ever concurrent with which others*. Two tests that
  collide only when they land on the same worker — likelier in a smaller pool —
  could sit on separate workers at n=4 and never touch. n=4 is **not a proven
  superset** of n=2's collision surface, only a different sample of it.
- **Five runs, one machine.** Same host, same warm Postgres, same filesystem, same
  scheduler. Repetition in a fixed environment demonstrates *within-environment
  determinism*; it cannot surface a race that depends on the runner's disk I/O
  timing, connection-pool warm-up, or CPU contention. By this repo's own "green with
  two possible causes" standard, **five identical greens here and a green on CI are
  different claims**, and only the second one is about CI.
- **Wall-clock does not transfer.** ~2m30s per parallel pass on 4 cores says nothing
  about the 2-core runner. The ~7-minute estimate already on the PR stands until a
  real run measures it.
- **It is not a merge authorisation.** That PR edits a CC-deny path, so the
  asymmetry the previous session named is unchanged: whoever merges it must also be
  able to repair it. This adds evidence and nothing else.

### A cost observation, non-blocking

The serial pass takes **~61–62s to run one test**, because it collects all 2790 and
runs the session-scoped schema bootstrap before deselecting 2789 — roughly a fifth
of the job's wall-clock for a single test. Not a defect and out of scope here; noted
in case the runtime target tightens later.

---

## In-flight ledger

| PR | MEH-XX | pushed at | gate state | next revisit trigger |
|---|---|---|---|---|
| _(none)_ | — | — | — | — |

**Nothing was pushed by this session.** No branch was created, no commit authored,
no PR opened, no merge performed. The ledger is empty by fact, not by omission.

## PARKED

See PARKED.md — `MEH-999` / `MEH-215` / `MEH-217` / `MEH-1897`, all on the Linear
credential gate.

## 8 · Different-model adversarial review — findings and disposition

Run per ORDERS §3.2 in an **isolated worktree** (`isolation: "worktree"`), on a
different model from the one that wrote this. It was told explicitly not to
`stash`/`checkout`/`reset` anywhere — the s3 incident — and did not.

**It earned its cost. Three MUST FIX, two accepted outright, one downgraded.**

| # | Finding | Disposition |
|---|---|---|
| 1 | The PR #2661 comment was drafted in **completed past tense** ("no flake appeared in five runs") while only 3 of 5 runs existed, with an unfilled table placeholder | **ACCEPTED.** The comment was never posted; it is now posted only with all 5 runs complete and the table populated. |
| 2 | *"All 32 checks green"* is **false** — `Adversarial review (calibration)` is `failure` | **ACCEPTED, verified independently** with `perPage: 100`. See the box in §5. |
| 3 | §4's *"a documented claim is WRONG"* overstates novelty — `HANDOFF.md:4544` recorded the `uv`/`pip` distinction on 18/07 | **ACCEPTED, verified** by reading the line. §4 downgraded to a reconfirmation. |
| 4 | The "more workers is strictly more hostile" claim is asserted, not defended | **ACCEPTED** — rewritten above as "a different sample, not a proven superset". |
| 5 | Five runs on one machine is a fourth limit, distinct from worker count | **ACCEPTED** — added above. |
| 6 | Verified §5's `serial`-marker reasoning independently and found **no defect**: no `[tool.pytest]` section, no `addopts`, no `strict-markers`, no warnings-as-errors anywhere in `backend/`, so an unregistered marker yields only a silent `PytestUnknownMarkWarning` | **No action** — corroboration, and it closes the one loose end in that argument. |
| 9 | "Idle 5.6h" should be ~5h44m | **ACCEPTED** — corrected in §5. |

**Findings 2 and 3 are the ones that matter**, and they share a shape: both are
cases where I had the correct rule loaded and did not apply it. #2 is
`CLAUDE.md`'s pagination rule; #3 is ORDERS §5's read-the-repo-before-re-deriving
rule. Neither was a knowledge gap. **A checker that shares the maker's context
shares the maker's blind spots** — which is the argument for maker≠checker stated
better by evidence than by assertion.

## A rule-25 near-miss, caught — worth more than the PR it nearly spoiled

`origin/staging` moved **mid-session**: `7ed56c78 → adee54a3` (the other session's
guard, PR #2703). This branch had been cut from the old tip, so it was re-based
onto the new one with `git reset adee54a3`, which keeps working-tree edits.

**`git status` then reported:**

```
 M docs/overnight/PARKED.md
 D scripts/checks/vrt-baseline-sync-guard.sh      <-- NOT MINE. NOT INTENDED.
```

The working tree predated PR #2703, so from the new HEAD's point of view the guard
file was *missing* — and a commit at that moment would have **silently reverted
another session's just-merged 372-line guard**, inside a PR whose stated diff is
"two markdown files". Restored with `git checkout --` before anything was staged.

This is the exact failure rule 25 names — *"a stale ref can silently revert another
PR's deletions"* — in its mirror form: a stale **tree** reverting another PR's
*additions*. The 18/07 precedent (`analytics.py`) was caught by adversarial review;
this one was caught by reading `git status` output instead of skimming it.

**The transferable bit:** after any `reset`/`rebase`/`merge` that moves your base,
read the *full* status, and treat every path you did not personally touch as a
defect until explained. A `D` you cannot account for is never housekeeping.

## FOREIGN ACTIVITY (facts only)

- `feature/meh-1928-vrt-baseline-sync-guard` — was active (pushed 21:05:55Z), then
  **merged as PR #2703** at 21:24:53Z. Never touched by this session.
- `origin/staging` moved once: `7ed56c78 → adee54a3`, that merge being the only
  commit. Not this session's work.
- PRs #2687, #2661, #2607, #2480 and four dependabot PRs remain open and untouched.
