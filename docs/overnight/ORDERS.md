# Sweep orders — the standing authority a session reads from disk

> **What this file is.** The operating orders for an autonomous Claude Code sweep
> session on this repo: what it may merge, what it must prove before merging, what
> it must never touch, and how it is forbidden from stalling.
>
> **What this file is NOT.** It does not *grant* authority. The grant is Sapir's
> ruling of 08/08/2026, recorded on
> [MEH-1756](https://linear.app/mehamakor/issue/MEH-1756). This file is a
> transcription so that a session which never saw that conversation still operates
> under the same terms. **Where the two disagree, the ruling wins** — and the
> correct response is to fix this file, not to act on it.
>
> It is also **not the ADR**. MEH-1756's own DoD asks for a formal ADR under
> `docs/decisions/` plus a sync of ADR-016 and workflow rule 23. That card is
> labelled `not-cc` and stays Sapir's. Nothing here substitutes for it.

**As of: 2026-08-08.** Every empirical claim below has that date attached. See
§7 for what makes this file expire.

---

## 1 · Authority

**Sapir's ruling, 08/08/2026** — *"תמזג לבד ותבדוק את עצמך על כל המשימות"*:

> Implement, self-check, and **merge to `staging` yourself, on every task** —
> GREEN, YELLOW, HIGH-RISK, unclassified alike. No PR waits for Sapir.

The three-rung autonomy ladder MEH-1756 proposed collapsed to two rungs. What
replaced *prevention by human gate* is **detect-and-revert**: merge, verify
immediately, revert on breakage. That model is only as good as the verification,
which is why §3 is the longest section in this file and is not optional.

Decisions that would previously have waited for Sapir — an א/ב/ג choice, a spec
that contradicts a merged decision, an ambiguous scope — are **decided by the
session, with the rationale written into the PR body** and posted to the card
*before* the code is written where the decision changes what ships.

### 1.1 · The grant is conditional and self-expiring

It is tied to **pre-launch** status. Sapir's stated reason, recorded verbatim on
MEH-1756: *"אני עוד לפני השקה ואין לי סיכון ממשי — רוצה לסגור כמה שיותר מהר."*
No real users are exposed, so the cost of a bad merge is a revert.

**It expires automatically at Release #2**
([MEH-1909](https://linear.app/mehamakor/issue/MEH-1909)) — the first
`staging → main` promotion. Before the first sweep after that promotion, the
model is re-opened for discussion. **A session running after Release #2 has
landed does not hold this authority** and must not assume it from this file's
presence on disk. Check MEH-1909's state.

### 1.2 · Three gates remain Sapir's

Each is deletable by a word from her; none may be assumed away by a session.

| # | Gate | Why it is hers |
|---|---|---|
| 1 | **`staging → main`** — the production release | Real users. Not a competence question. |
| 2 | **Access she physically holds** — env vars, the Railway / Vercel / Sentry / Cloudinary consoles, the harness auto-mode classifier | **Credentials, not authority.** A session blocked here is blocked by a missing key, and the correct move is to say so plainly and route around, never to simulate the step. |
| 3 | **DNA-LOCK** | See §2. |

### 1.3 · DNA-LOCK is a HARD FAIL, never a wait

A PR containing any of the following **does not merge — ever**, and is not
parked pending review:

- forbidden marketing lexicon (see [docs/BRAND.md](../BRAND.md))
- transaction fees of any kind
- unlicensed businesses surfaced as licensed
- auto-approval of businesses

This is the one category where "escalate and wait" is the wrong answer. The
answer is: **do not build it.**

### 1.4 · NEVER (unchanged by the ruling)

- merge to `main`
- **apply** an Alembic migration (`upgrade` / `downgrade` / `stamp`). Writing a
  revision **file** is fine.
- add environment variables (regression rule 8 — and the `Env drift` gate scans
  file *text*, so even a comment naming one reds it)
- recreate `_migrate_columns()` — [MEH-267](https://linear.app/mehamakor/issue/MEH-267)
- clear a `DO-NOT-MERGE` / `DNM-LOCK` marker, or push a commit whose purpose is
  to neutralise a gate (workflow rule 30)
- touch a card labelled `needs-sapir` / `not-cc` / `blocked-needs-sapir` beyond
  what its own description explicitly allows
- violate DNA-LOCK

---

## 2 · Ownership protocol

**CLAIM = BRANCH.** Pushing `feature/meh-<N>-<slug>` to `origin` is the claim.
There is no other signal, and no claim exists before the push.

**FOREIGN = READ-ONLY.** A branch or PR this session did not create is read-only.
Read it, cite it, work around it — never push to it.

**ORPHAN ADOPTION.** A PR or branch with **no push for more than 2 hours** may be
adopted by exactly one session. Adopting means saying so in a PR comment first,
so a returning owner sees the handover rather than a surprise force-push.

**SINGLE-WRITER LOGS.** `docs/CHANGELOG.md` and `HANDOFF.md` have one writer at a
time and never ride a code branch (workflow rule 31, mechanically enforced by
`scripts/checks/changelog-branch-guard.sh`). Backfill them in a separate
docs-only PR.

**MERGE HYGIENE.** `git fetch origin staging && git merge origin/staging`
immediately before every push (rule 25). Not from an earlier fetch — a stale ref
can silently revert another PR's deletions.

**HALT = CORRUPTION ONLY.** The session does not stop for a red check, an
ambiguous spec, or an empty queue. It stops for repository corruption or a
credential gate it cannot pass — and it says which.

---

## 3 · The self-check bundle — mandatory before ANY merge

This is what replaced Sapir's eyes. A merge without it is not authorised by the
ruling; the ruling traded the human gate **for this bundle**, not for nothing.

**Every claim in a PR body is pasted terminal output or a `file:line`.**
*"Should pass"* is not evidence. *"I haven't verified X"* beats *"X probably
works"* (exec §9).

1. **Green, and pasted:** `npm run build` · `npm run lint` · `npx vitest run` ·
   `pytest`. A suite that does not apply — no backend file touched — is recorded
   as *not run, and why*, never silently omitted.
2. **Adversarial review, locally, in a DIFFERENT MODEL than the one that wrote
   the code** (maker ≠ checker,
   [MEH-1756](https://linear.app/mehamakor/issue/MEH-1756) §3.1). Run the
   matching `/adversarial-review-*` variant for the diff class.
   **This is load-bearing, not ceremony.** Measured on 08/08: on MEH-1921 the
   same-model pass signed the diff off *twice*, and the different-model checker
   found an entire missed code path (`admin.py`'s create route). On MEH-1862 it
   found a comparator that sorted untracked keys first — contradicting the
   maker's own comment two lines above it.

   **The reviewer runs READ-ONLY, in its own git worktree — never in the
   session's working tree.** Spawn it with `isolation: "worktree"`, or give it a
   clone; then diff your tree against expectation immediately before every
   `git commit` regardless.

   **"Do not edit any files" does NOT cover `git stash` or `git checkout`, and a
   reviewer will reach for both.** Measured on 08/08 (s3, PR #2695): the reviewer
   was told not to edit files, obeyed that literally, and then — entirely
   reasonably, to check that the new guard tests actually fail on the old code —
   `stash`ed the component back to its pre-change state. The restore left the
   file at `HEAD`. **The fix silently vanished from the working tree while the
   tests and the harness that prove it stayed.** It was caught only because the
   component was missing from a `git status` where it was expected; the commit
   would otherwise have shipped the guards without the thing they guard.

   Two properties make this worth a rule rather than a war story: the mutation is
   **invisible in the reviewer's own report** (it reported a clean review, and the
   review *was* clean), and the reviewer correctly read its own symptom as a
   parallel-session incident under workflow rule 1 — it had no way to know the
   other writer was its parent. A subagent sharing a working tree **is** a
   concurrent writer; instructions do not change that, isolation does.
3. **Evidence bundle.** For any UI change: emulation screenshots at **390×844**
   and **Pixel 5**, `he-IL`, RTL asserted, and **no horizontal scroll** measured
   (not eyeballed). Where layout moves, CLS via the #2676 harness.
   **State the boundary:** Chromium emulation is *layout* evidence, not *engine*
   evidence — it says nothing about iOS Safari's `dvh` or safe-area handling. Do
   not write "נבדק בנייד".
   Compress before committing — `node scripts/compress-qa-screenshots.mjs
   qa-artifacts/MEH-XXXX/` — the 2 MB `qa-artifacts size cap` job is real.
4. **Schema PRs:** alembic `upgrade` **and** `downgrade` tested locally, the
   migration chain checked, `EXPECTED_TABLES` updated. (Writing the revision file
   is permitted; applying it to any shared database is not — §1.4.)
5. **Copy PRs:** every Hebrew string verified against the brand hub and the
   forbidden lexicon.
6. **Guard tests are shown failing by construction** (MEH-1619), and the
   construction must **discriminate** — would the *previous* assertion also have
   gone red on it? If you cannot answer yes, the run is not evidence.
7. **Name another world in which this check is green.** If you can name one, the
   check does not yet discriminate. This is the rule that catches the expensive
   mistakes; see `.claude/rules/testing.md` → *"A green that has two possible
   causes is not a signal"*.

### 3.1 · Merge, then verify — immediately

Post-merge, without waiting for a check-in:

- check runs on the **merge commit** (not the PR head)
- staging deploy health

**Breakage → revert first, investigate second.** A green `staging` outranks a
completed task. This is the entire safety mechanism of the detect-and-revert
model; a session that merges and moves on has not implemented it.

### 3.2 · What blocks a merge, and what does not

**Required (the only two contexts `protect-staging` gates on):**
`CI gate (required)` · `Deploy gate (required)`.

**Does not block, as of 2026-08-08 — verify before relying on any of these:**

| Signal | Status |
|---|---|
| `E2E gate` / `Playwright E2E` red | Not a required check, so it does not block a merge. **Do NOT attribute it to "the known Cloudinary thing" — that attribution is retired.** [MEH-1948](https://linear.app/mehamakor/issue/MEH-1948) owns the diagnosis; correlate the red against it and add your run to its evidence. **Still read which specs failed** — if a failing spec covers the surface you changed, the environmental explanation does not cover it and it is yours. |
| `Adversarial review (calibration)` red | `continue-on-error: true`, absent from `ci-gate`'s `needs:`. Its *result* gates nothing — but **read its comment before merging**; since 02/08 it posts real findings. |
| Vercel `Ignored` | Feature-branch previews are opt-in — no `[preview]` token in the commit message (MEH-1900). The configured behaviour, not a fault. |
| Vercel rate-limited | `api-deployments-free-per-day`, an account quota. **No commit fixes it**; it resets daily. |

**Why the Cloudinary attribution was retired — and why the first replacement for
it was also wrong (measured 08/08, corrected same day).**

This file used to say the E2E red *was* the documented Cloudinary-401 issue. That
was retired because the 401s appear in the green runs too, and a constant cannot
explain a variable.

**The replacement claim — "the suite is flaky, it alternates pass/fail" — lasted
about twenty minutes and was also wrong.** Checking the paths-filter against all
**30** `e2e.yml` staging runs on 07–08/08 gives a **30/30 perfect** split:

| Run conclusion | e2e-relevant files in the push | Count |
|---|---|---|
| `success` | **0** — the Playwright job `skipped`, nothing ran | **16 / 16** |
| `failure` | **≥1** — the job actually executed | **14 / 14** |

There is no alternation. **The suite fails every single time it runs**, and
"passes" only when the paths-filter (`frontend/**`, `public/**`, `package.json`,
`package-lock.json`) skips it entirely. A skipped leg passes the aggregator, so
the run reports `success`. Verified directly on `6a758f35`: `Playwright E2E
(Vercel preview)` = `skipped`, run = `success`.

So the honest statement is not "flaky" but **"a 100%-failing suite wearing a
green mask"**, which is a considerably worse problem and a different fix.

**Two lessons, and the second is the expensive one:**

- A standing excuse is self-perpetuating. Every red read as "the known thing", so
  nobody looked, so it stayed unknown. **An explanation that covers every
  observation equally well is not an explanation.**
- **The correction itself repeated the mistake it was correcting.** "Alternating
  pass/fail" was inferred from run-level conclusions without asking what else
  produces a green — the exact question `.claude/rules/testing.md` § *"A green
  that has two possible causes is not a signal"* exists to force, and it was in
  context the whole time. Before treating any run conclusion as a result, confirm
  the job **ran**: `conclusion: success` on the aggregate is not `conclusion:
  success` on the thing you care about.

Full per-run matrix and the four-suspect correlation:
[MEH-1948](https://linear.app/mehamakor/issue/MEH-1948).

**A green that came from a skip is not a pass.** A skipped leg passes the
aggregator, so both required gates can report `success` while nothing ran.
Confirm the jobs that matter show `conclusion: success`, not `skipped`.

**A `cancelled` leg maps to FAIL, and the remedy inverts.** Supersession (a newer
run exists for the head SHA) → **wait**. An infra hang (job stuck in its own
setup, no newer run) → **re-run**. Read the log before choosing; applying "wait"
to a hang stalls forever.

---

## 4 · No-stall architecture

**Never idle on a gate.** When PR N is waiting on CI, arm a check-in and start
task N+1 in parallel. Waiting is not work.

**PARK after 30 minutes or 2 failed attempts on the same problem** — whichever
comes first. Parking is: write what was learned to
`docs/overnight/PARKED.md`, comment the blocker on the card in one paragraph,
move the card back to Backlog, take the next item. A parked task is a finished
turn, not a failure.

**An empty queue is a result, not an error.** Say so and run the verified-empty
ritual in [LOOP-PROMPT.md](./LOOP-PROMPT.md) — never invent work to avoid
reporting it.

---

## 5 · Queue discipline

Lanes, eligibility gates B1–B4, and the `cc-queue` label protocol are defined in
[`.claude/rules/workflow.md`](../../.claude/rules/workflow.md) → *"Working the
queue"*. **That file is authoritative; this one does not restate it**, because
two owners for one fact is the smell workflow.md itself names (Smell #1).

Three points that are easy to lose and are worth the duplication:

- **Label a card `cc-queue` before the first edit**, in either lane. That is the
  live audit trail — Sapir can pull a card back mid-run.
- **Do not put `cc-queue` on a card you opened yourself.** Findings are not
  self-authorised work.
- **Any queue list written into a prompt — including the one below in this file —
  is a HINT, never state.** Live Linear plus `git`/the GitHub API are the only
  queue state. Run the anti-stale gate on **every** item before building: a fresh
  `get_issue`, plus a search for the identifier in merged commits and open PRs.

  This is not hypothetical caution. **Both sweeps so far have arrived with a stale
  seed list**, and the second was worse than the first:

  | Sweep | What the prompt said | What was true |
  |---|---|---|
  | night 1 | 8 seed items | **4 of 8 already done** |
  | s3 (08/08) | "clear the immediate backlog first: #2677, #2683, #2665, #2680" | **all four already merged** — #2665 at 11:08:29Z, #2680 at 10:26:44Z |

  In the s3 case staging had already moved **four commits past the very commit
  that landed this file**. A prompt is a photograph of a moving repository, and
  the interval between writing it and reading it is unbounded. The failure mode
  is not wasted effort — it is *redoing finished work on top of itself*, which
  is how a duplicate merge happens.

  **The tell is cheap:** if an instruction says "merge PR #N", the first action
  is to fetch #N's state, not to open it. Same for "run the ×5 proof on MEH-XX" —
  s3 skipped that one correctly because the card's own DoD already showed the
  proof complete and checked off.

---

## 6 · Constraints that bite in practice

- **Branch from `origin/staging`, never `main`.** The harness routinely starts a
  session on a `claude/*` branch; that is not a branch to develop on — the hook
  blocks the push and the `Branch name gate` reds the PR. Re-cut per ticket:
  `git checkout -B feature/meh-<N>-<slug> origin/staging`.
- **PR body ends with `Closes MEH-XX`** for the card the PR actually closes.
- **Never write a bare `MEH-XXXX` of an already-Done issue** in a branch name, PR
  title, or PR body — the Linear integration auto-links on identifier match and
  flips it back to In Progress (rule 29). Check the body *before* opening:
  `bash .claude/scripts/check-linear-mentions.sh <title-file> <body-file>`. The
  CI job cannot save you; by the time it runs, the auto-link has already fired.
- **`Builder-Model: claude-opus-5`** as a git trailer on every commit, stating
  what the session **actually ran as**. This conflicts with the CC harness's own
  instruction; the conflict is decided in favour of the repo (MEH-1718).
- **The CC sandbox cannot reach `*.up.railway.app`** and **staging sits behind
  Vercel SSO** from here. Never fetch either and never claim smoke verification
  from this sandbox — say *"deferred to user (CC sandbox limitation)"*.
- **Never run `playwright install`.** Chromium is preinstalled at
  `/opt/pw-browsers`.
- **No Sentry or Vercel MCP tools exist** in harness sessions. Do not plan around
  them.
- **RTL: logical properties only** — `start-` / `end-` / `ms-` / `me-` / `ps-` /
  `pe-`. In RTL, `start` is the **right**.
- Brand primary `#2e6853`, background `#F5F0E8`.

---

## 7 · What makes this file wrong

Written down because a stale orders file is more dangerous than none — it carries
the authority of the original ruling with none of its currency, which is the
staleness class `.claude/rules/testing.md` documents at length.

This file is void, or needs re-derivation, when **any** of these is true:

1. **Release #2 (MEH-1909) has landed.** §1.1 expires the grant automatically.
2. **Sapir says otherwise anywhere** — a Linear comment, a chat message, a card
   description. The ruling is the source; this is a transcription.
3. **The required-check set changed.** §3.2's two-gate claim was measured on
   2026-08-08 against ruleset 15240090. Re-derive it rather than quoting it.
4. **A red listed in §3.2 as environmental turns out to cover your diff.** The
   environmental explanation is scoped to routes and specs your change does not
   touch. It is not a blanket dismissal, and treating it as one is how a real
   regression ships behind a familiar red.

Ask of any line here the question the repo asks of every artifact: **as of when
was this true, and what has changed since?**
