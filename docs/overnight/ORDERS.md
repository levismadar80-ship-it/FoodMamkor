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

### 1.5 · Mobile / manual QA is CC's — Sapir does not test on device

**Added 2026-08-08 as a direct instruction from Sapir. This section fills a gap:
the 08/08 ruling had a QA half that never reached this file** — the transcription
above carried only the merge-authority half, so a session reading these orders had
no way to learn that manual QA had moved.

**Verified against Linear, not taken on trust** (re-checked after the MCP server
reconnected). MEH-215's description carries the ruling verbatim under
`## 🔒 Ruling ספיר 08/08/2026 — הסבה מ-QA ידני ל-CC`:

> *"כל המשימות שכתובות QA ידני — אני לא עושה, רק קלוד קוד עושה QA."*

**MOBILE/MANUAL QA = CC.** The DoD item **"נבדק בנייד"** is satisfied by **CC
evidence**, not by Sapir picking up a handset. The evidence spec is already
defined in **§3 item 3** — emulation at 390×844 + Pixel-class, `he-IL`, RTL
asserted, full-page screenshots of changed surfaces in the PR body, no-horizontal-
scroll **measured**, CLS via the #2676 harness where layout moves. **That spec is
not restated here on purpose**: two owners for one fact is the smell
`workflow.md` names, and §3 is the owner.

**BOUNDARY — unchanged and load-bearing.** Emulation is **Chromium-only**: layout
evidence, not engine evidence. A PR touching **storage / hydration / sticky /
safe-area / date / touch** marks that class explicitly and **does NOT claim
"נבדק בנייד"**. §3 already words this as *"do not write נבדק בנייד"*; read the two
together as **the claim is earned for ordinary layout work and withheld for the
excepted classes**, not as a blanket ban.

**Cards converted from manual QA to CC suites** (titles on all three now read
`הוסב מ-QA ידני, ruling 08/08`):

| Card | Scope | State as measured 08/08 22:1x |
|---|---|---|
| **MEH-215** | registration journey — full Playwright suite | Backlog, `[CC, tests-only]` |
| **MEH-217** | admin panel, 6 tabs | Backlog, `[CC, tests-only]` |
| **MEH-999** | producer dogfood audit | In Progress, `cc-queue` |

**For MEH-215 specifically:** a real inbox and a live Google consent screen are
**not automatable in CI**. Use a **captured test inbox** and a **mocked OAuth
callback**, and mark those cases **`covered-by-stub`**.

> **Two things about that label, because they are easy to get wrong.**
>
> **It is a NEW convention with no existing pattern in this repo.**
> `grep -rniE "covered-by-stub|mocked oauth|test inbox"` over every `*.md` returned
> **nothing** on 08/08. Its exact form is still open — settle it before assertions
> start carrying it, or it will drift into three spellings.
>
> **`covered-by-stub` is a label, not a coverage claim, and MEH-215's own ruling
> block is stricter than it sounds.** That block says device-only classes are
> *"מסומנות במפורש ב-spec **ולא נספרות כמכוסות**"* — marked, and **not counted as
> covered**. The two reconcile only if the label means *"exercised against a stub,
> and therefore not evidence about the real dependency."* A stubbed case counted
> toward a coverage number would contradict the ruling it came from. This is the
> same line §1.2 gate 2 draws: *"say so plainly and route around, **never to
> simulate the step**"* — a stub reported as a stub is routing around; the same run
> reported as real coverage is simulating it. **An unlabelled stub-backed assertion
> is a defect even when it passes.**

**Framework for the conversions:** MEH-1249's MANUAL_TESTING → suites pattern.
`tests-only` is an auto-merge path.

**Known inconsistency, reported and not edited (ORDERS §5 — a finding is not
self-authorised work):** MEH-215 still carries its original
`## 📋 Note: Manual QA checklist (not a Claude task)` and `## למה ידני ולא
Playwright` sections **above** the ruling block that reverses them. The card is
internally contradictory; the ruling block is the later text and governs. Cleaning
the card is Sapir's.

### 1.6 · An instruction carries premises — verify them before executing it

**Editing a correct card, or a correct file, is a regression that looks like
diligence.** It reads as thorough work in the diff, it passes review, and it
replaces a true statement with whatever the mistaken reading was. It is strictly
worse than doing nothing, and **nothing in CI can catch it.**

A correction instruction — *"fix the wrong claim about X on card Y"* — asserts
**two** things:

1. the claim is wrong, and
2. **the claim lives in Y.**

The second is the one that goes unverified, because instructions arrive with
their certainty already attached and only the first sounds like something to
check. **Verify both before editing anything.**

**The test:** `grep` for the **claim itself** — the actual wording — not for the
topic. And when the search comes back empty, **that is the finding.** Say so and
stop; do not proceed to edit the nearest plausible target.

**This applies to instructions from the orchestrator exactly as it applies to
cards and files.** `meta-patterns.md` §1 already establishes that orchestrator
claims can be wrong and that Phase 0 evidence beats them; this is the same
principle one step earlier — *before* running the instruction, not only when a
contradiction surfaces mid-task.

> **Worked example, 09/08.** The instruction was *"update MEH-1961: the '31 vulns
> in 9 packages' premise is stale, correct it with the evidence."* The card was
> read first: **MEH-1961 does not contain that claim.** It is in MEH-1585's title.
> Executing the instruction literally would have written a "correction" into a
> card that was not wrong, while leaving the card that *was* wrong untouched.
> What shipped instead: the audit's own findings table on MEH-1961, the evidence
> on MEH-1585 where the claim actually lives, and a sentence naming the mismatch.

**Cross-refs, not duplicated here:** `file-preservation.md` §6 owns the file case
and its MEH-1801 precedent; `meta-patterns.md` §1 owns orchestrator-claim
verification. This section exists because neither is phrased about *instructions*
or *cards*, and ORDERS is the file a sweep session actually reads.

---

## 2 · Ownership protocol

**CLAIM = BRANCH.** Pushing `feature/meh-<N>-<slug>` to `origin` is the claim.
There is no other signal, and no claim exists before the push.

**CLAIM AT INTENT TIME, NOT BUILD TIME.** The moment a card enters your *next
work* plan, push the claim branch — **before Phase 0, before reading the card
deeply**. An empty branch pointing at `origin/staging` is a valid claim; you are
not claiming a design, you are claiming the card. Everything else about the card
can wait, because nothing else about it is visible to another session.

**COROLLARY — a card named without a branch is UNCLAIMED and grabbable.** Naming
it in a check-in note, a plan, or a session log confers nothing: another session
that pushes a branch first has claimed it, correctly, and owes you no deference.
So **do not list next work you have not claimed** — the listing is not a
reservation and reads as one.

_Source: MEH-1872, 09/08. At 19:39Z the frontend lane's check-in note listed it
as next work; at 19:40Z — one minute later — another session opened PR #2745 on
it. **Both sessions were following this section correctly**: no branch existed,
so the card was unclaimed and takeable. What prevented a duplicate
implementation was one session's courtesy comment, not any mechanism. The rule
above closes the minute, and the corollary closes the expectation that produced
it._

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
8. **Changing how a SHARED data source is read means enumerating EVERY reader
   before the merge — by grep on the table or field name, not from memory.**
   Then state, per reader, whether it changed and why. A partial conversion is
   not a smaller version of the change; it is a **new inconsistency**, and it
   ships looking finished.

   The enumeration is the deliverable, so write it into the PR body as a table:
   `file:line` · what it computes · converted / deliberately not · one line of
   why. A reader you cannot classify is a reader you have not read.

   _Source: MEH-160, 09/08. `producer_page_views` feeds **six** metrics that all
   render on one dashboard screen. Round one deduped three. The result was not
   "three fixed" — `weekly_trend` compared a deduped `last_7d` against a raw
   `prev_7d_views` and read **"down" on perfectly flat traffic**, permanently;
   `conversion_rate` divided raw clicks by deduped views and returned **200%**,
   which MEH-1118's `clampPercent` silently rendered as a healthy-looking 100._

   **What made it survive self-check is the part worth carrying:** the session
   ran the two obviously-related test files, saw green, and read that as
   coverage. Those files could not have failed — they exercise the readers that
   *were* converted. **Running the probe that cannot fail is not evidence**, and
   it is the same error as item 7 wearing work clothes: the green had a second
   cause (the untouched readers were untested), and nobody asked what else would
   produce it. The full suite caught it — after CI did, not before.

   The grep is cheap and the failure is not. One command, before the diff is
   final: `grep -rn "<TableOrColumnName>" --include=*.py --include=*.js .`

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

#### `unstable` is not `blocked` — read the field before you hold a merge

GitHub already computes this distinction and hands it to you in
`mergeable_state`. Use it instead of eyeballing a wall of red check marks:

| `mergeable_state` | Means | What you do |
|---|---|---|
| `blocked` | **A required check is failing or missing.** | Do not merge. This is the only value that means "not yet". |
| `unstable` | Mergeable. One or more **non-required** checks are red. | Merge, once the bar below is met. |
| `behind` | Not blocked — the branch is behind the base. | `git fetch origin staging && git merge origin/staging`, push, let CI re-run (workflow rule 25). |
| `clean` | Nothing red at all. | Merge. |
| `dirty` | Real merge conflict. | Resolve it (§ resolve-conflicts skill), push. |

**The bar, stated positively.** A PR is merge-ready when **both** hold:

1. **Both required gates are `success`, and the jobs that matter actually
   ran** — `conclusion: success`, not `skipped`. A skipped leg passes the
   aggregator, so this half is what keeps the rule from being satisfied by a
   green mask (see *"A green that came from a skip is not a pass"* below).
2. **Every red non-required check has a named cause with evidence**, written
   on the PR.

**"Documented" is not "known".** A named cause states *which* fault, *what*
evidence, and *whose* it is. `"it's the known Cloudinary thing"` is not a
documented cause — it is the exact posture §3.2 retired, and it reads
identically whether or not anyone checked. If you cannot name the cause, the
red is undocumented and you do not merge past it; you investigate or you say
plainly that it is unexplained.

**How to actually establish that a red is inherited — run a control.**
Arguing from mechanism ("a lockfile cannot reach a Cloudinary 401") is only as
good as your imagination. The measurement is cheaper: find a **contemporaneous
run on an unrelated branch** and compare the failure sets.

> _Worked example, 09/08 (PR #2733, lockfile-only)._ E2E failed 13 specs. An
> unrelated branch five minutes later failed **33** — a strict **superset**,
> with nothing failing on the lockfile branch that passed on the other. The
> fingerprint was tighter still: `register-mobile` reported the **identical
> 60,379-pixel diff on both heads**. Diffs caused by a diff do not agree to
> the pixel across unrelated branches; a shared missing asset does. That is a
> measurement, and it is what "documented" means here.

**This licenses merging past an *inherited or external* red — never your own.**
§3.3 below is unchanged and takes precedence: if a non-required gate is red
*because of what you merged*, you fix it in the same stretch. This rule is for
reds you walked into, not reds you created.

**Does not block, as of 2026-08-08 — verify before relying on any of these:**

| Signal | Status |
|---|---|
| `E2E gate` / `Playwright E2E` red | Not a required check, so it does not block a merge. **Do NOT attribute it to "the known Cloudinary thing" — that attribution is retired.** [MEH-1948](https://linear.app/mehamakor/issue/MEH-1948) owns the diagnosis; correlate the red against it and add your run to its evidence. **Still read which specs failed** — if a failing spec covers the surface you changed, the environmental explanation does not cover it and it is yours. |
| `Adversarial review (calibration)` red | `continue-on-error: true`, absent from `ci-gate`'s `needs:`. Its *result* gates nothing — but **read its comment before merging**; since 02/08 it posts real findings. |
| Vercel `Ignored` | Feature-branch previews are opt-in — no `[preview]` token in the commit message (MEH-1900). The configured behaviour, not a fault. |
| Vercel rate-limited | `api-deployments-free-per-day`, an account quota. **No commit fixes it**; it resets daily. |

**Why the Cloudinary attribution was retired — and why the first replacement for
it was also wrong (measured 08/08, corrected same day).**

This file used to say the E2E red *was* the documented Cloudinary-401 issue. The
first attempt to retire that reasoned "the 401s appear in the green runs too, so
a constant cannot explain a variable." **Both halves of that were wrong**, and the
second one is instructive: the green runs never ran, so they have no server log
and can say nothing at all about Cloudinary. The comparison was not weak evidence
— it was *no* evidence, dressed as a refutation.

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

**And note where that leaves Cloudinary: not refuted — possibly promoted.** A live
401 breaking every image is exactly the shape of a defect that fails a suite
*consistently*, which is what the data now shows. The thing this file bans is the
**posture**, not the hypothesis: "it's the known Cloudinary thing, carry on" waves
through a suite failing 14 out of 14 executions. Whether it is the cause is open,
and [MEH-1948](https://linear.app/mehamakor/issue/MEH-1948) owns deciding it —
which needs the per-spec breakdown from the `playwright-report` artifact, not
another inference from run conclusions.

> **Do not read any of this as "Cloudinary is handled."**
> [MEH-1925](https://linear.app/mehamakor/issue/MEH-1925) is a **live, Urgent,
> unresolved production incident** — 401s on the catalog, the home hero and OG
> images — and it is **gate 2** (access Sapir physically holds: the Cloudinary
> console). Nothing in this section touches it. What changed is only that an
> E2E red may no longer be *attributed* to it without evidence; the incident
> itself is untouched, still open, and still hers. An earlier draft of this
> amendment removed the file's only mention of MEH-1925 while re-scoping the
> attribution, which would have left a session reading these orders with no way
> to learn the incident exists. Caught in review.

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

### 3.3 · A non-required gate that goes red on staging is fixed in the SAME stretch

"Does not block a merge" is a statement about the ruleset, not a permission to
leave it red. **If a non-required gate goes red on `staging` because of work you
merged, you fix it before moving to the next card** — same stretch, not a
follow-up ticket, not "someone will notice".

The reason is the table two sections up. Every entry in the "does not block" list
is one a session is entitled to merge past, and every one of them is also how the
E2E suite reached **14 consecutive failing executions** while the file said "not
required, carry on". A red that blocks nothing decays into a red nobody reads,
and a red nobody reads is indistinguishable from no signal at all. The gate does
not have to be required to be *informative* — it stops being informative the
moment standing red is normal.

**Worked example, 09/08 (MEH-1960 groom).** Merging the `backlog-groom` skill
(PR #2717) turned the **Skills audit** job red on `staging`: the new skill
directory had no `.claude/skills-allowlist.json` entry, which is a coverage-drift
failure by design. Skills audit is not a required check, so #2717 merged green on
both required gates with the audit red behind it. It was fixed the same stretch
in PR #2718 rather than filed. That is the standard.

**The one legitimate exception, and it is narrow:** the red reproduces on
`staging` **without** your change — i.e. you inherited it. Then say so in one
line with the run id, and either fix it anyway or file it; what you may not do is
merge, notice, and move on silently.

**Distinguish "red" from "warned".** `scripts/checks/run-all.sh` emits warnings
that are deadlines with the date still ahead of them. A warning is not this rule;
a red is.

---

## 4 · No-stall architecture

**Never idle on a gate.** When PR N is waiting on CI, arm a check-in and start
task N+1 in parallel. Waiting is not work.

**ONE CHECK-IN PER PR, EVER.** Arming a new check-in for a PR **requires deleting
the existing one in the same action** — not afterwards, not once a duplicate is
confirmed. `list_triggers` is the ledger; read it before arming, not instead of
arming.

The failure is quiet and self-inflicted: two live check-ins on one PR wake the
session twice, produce two independent readings of the same state, and read like
two events rather than one. Nothing goes red. _Source: 09/08 — PR #2745 carried
check-ins at 21:05Z **and** 21:27Z, because one turn concluded "the old one is
still live, nothing to do" and the next armed a second without deleting it. It
surfaced only because `list_triggers` was called for an unrelated reason. The
rule is written as *delete-and-arm is one action* precisely because the two-step
version is what failed._

**PARK after 30 minutes or 2 failed attempts on the same problem** — whichever
comes first. Parking is: write what was learned to
`docs/overnight/PARKED.md`, comment the blocker on the card in one paragraph,
move the card back to Backlog, take the next item. A parked task is a finished
turn, not a failure.

**An empty queue is a result, not an error.** Say so and run the verified-empty
ritual in [LOOP-PROMPT.md](./LOOP-PROMPT.md) — never invent work to avoid
reporting it.

**Groom the backlog once a week** — or whenever Sapir asks — as an ordinary queue
task, using the `backlog-groom` skill (`.claude/skills/backlog-groom/`). It carries
the five verdicts, the house rules, the 30/90-day thresholds and the first run's
lessons, so no session has to re-invent the method. A grooming pass is not optional
maintenance: the first run found that roughly a quarter of open cards named a blocker
that had already shipped, and that a card can be born stale on the day it is written.

---

## 4.1 · Pipelined execution — intra-session concurrency

**Added by Sapir, 08/08.** Applies *inside* a single session. It does not change
the ownership protocol (§2), the self-check bundle (§3), or the turn-end
contract — only the ordering.

**PRINCIPLE: the bottleneck is wall-clock waiting, not thinking.** CI runs
~10–20 min; a merge gate can take longer. Idling through that is the single
largest waste in a session. Work is **pipelined, never serial**: at any moment
you may have **one task in BUILD** and **up to two tasks in FLIGHT** (pushed,
awaiting gates/merge).

### Forbidden states — none of these may ever be your current activity

- *"Waiting for gates to complete"* as a foreground action.
- *"Waiting and retrying once"* as the whole turn. The wait itself is fine;
  being idle during it is not.
- Ending a turn with an open PR awaiting gates and **no new task started**.

### The loop

1. Finish a task's build + self-check → push → arm auto-merge (or a timed
   check-in) → **record it in the in-flight ledger**.
2. **Immediately claim and start the next task.** Do not read gate logs, do not
   poll, do not narrate waiting.
3. Revisit in-flight PRs only at **natural pause points**: after the next task's
   build completes, after a long test run, or when a background shell returns.
   **Batch the revisit** — check all in-flight PRs in one pass, not one at a time.
4. **In-flight cap = 2.** At the cap, resolve the oldest before claiming another.
   That bounds the blast radius and keeps the ledger reviewable.

### In-flight ledger — maintain in the session log, update on every state change

| PR | MEH-XX | pushed at | gate state | next revisit trigger |
|---|---|---|---|---|

**A PR without a ledger row does not exist.** If context is about to run out,
every in-flight row must be resolved or handed off explicitly in the log.

### Task selection for pipelining

Prefer a next task touching **different files** than the in-flight one.
Same-file follow-ups wait until the first merges — pipelining must never create
a self-conflict. If the only remaining eligible task overlaps, do it as a
**stacked branch** off the in-flight branch and say so in the PR body.

### Background delegation — convert dead time into work

- **Long commands** (full pytest, full vitest, Playwright suites, builds) →
  `run_in_background`, then keep reasoning or building while they run. Never sit
  on a foreground run you could background.
- **Review subagent** (already mandated, different model): launch it in the
  **background** with `isolation: "worktree"` and keep working on the next task.
  Its findings arrive as a revisit trigger. It stays read-only-ish: **no
  `git stash` / `checkout` / branch switching on the main working tree** (the s3
  incident, §3.2).
- **Parallel read-only work**: independent investigations — Phase 0 discovery,
  log/artifact analysis, field classification, flake matrices — can run as
  concurrent background subagents while you build. They return findings; you
  decide. **Cap: 3 concurrent background jobs**; beyond that, tracing failures
  costs more than the parallelism saves.
- **HARD RULE: exactly ONE agent writes to the main working tree at a time —
  you.** Everything concurrent is read-only or worktree-isolated. Two writers on
  one tree is the failure mode this repo has already hit.

### While-you-wait lane

When a revisit is not due yet and the next build task needs a decision you do
not have, pick up a no-conflict filler: update the session log, verify a prior
merge landed correctly on `origin/staging`, append evidence to a Linear card,
classify a batch of MEH-1897 fields, download and parse an artifact.
**Never "wait" as an activity.**

### Interaction with the self-check bundle

**Pipelining changes ordering, never rigor.** Every PR still gets: build + lint
+ tests green with outputs pasted · different-model adversarial review with
findings addressed · full evidence bundle for UI · post-merge verification read
back off `origin/staging` (not the merge event) · instant revert on breakage.

If an in-flight PR's review returns findings while you are mid-build on the next
task: **finish the current atomic edit, then handle the findings.** Never leave a
flagged PR to auto-merge with unaddressed findings — **auto-merge is armed only
for PRs whose review has already cleared.**

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

  | # | Sweep | What the prompt said | What was true |
  |---|---|---|---|
  | 1 | night 1 | 8 seed items | **4 of 8 already done** |
  | 2 | s3, morning | "clear the immediate backlog first: #2677, #2683, #2665, #2680" | **all four already merged** — #2683 10:17Z, #2680 10:26:44Z, #2677 10:37Z, #2665 11:08:29Z. Recorded in `session-s3-4j6llv.md`, committed to staging **11:39:43Z** |
  | 3 | s3, evening | *the same prompt, unchanged* | **rediscovered the identical fact from scratch ~6h later**, via fresh API calls, never having read the log from hit 2 |

  **Hit 3 is the one that should sting**, and it is why this bullet is worded as a
  procedure and not a warning. The answer was already committed to `staging` in a
  file named for the same sweep; the session re-derived it anyway because it
  checked the *repository* for staleness and never checked `docs/overnight/` for
  a predecessor. **Read the most recent `session-*.md` before re-deriving
  anything** — the anti-stale gate applies to your own prior sessions too, and
  they are cheaper to read than the API is to query.

  In the s3 case staging had already moved **four commits past the very commit
  that landed this file**. A prompt is a photograph of a moving repository, and
  the interval between writing it and reading it is unbounded. The failure mode
  is not wasted effort — it is *redoing finished work on top of itself*, which
  is how a duplicate merge happens.

  **The tell is cheap:** if an instruction says "merge PR #N", the first action
  is to fetch #N's state, not to open it. Same for "run the ×5 proof on MEH-XX" —
  s3 skipped that one correctly because the card's own DoD already showed the
  proof complete and checked off.

- **The anti-stale gate applies to a card's PREMISES, not only its status
  (added 09/08, MEH-1973 — third occurrence in one day earned the codification).**
  Before building anything a card asks for, check the **repo** for the
  capability — grep/read the code the card describes — not just Linear for a
  duplicate card. A card asserting "X is missing" is an empirical claim with an
  as-of date, and the card's author typically searched for a *card*, never for
  *code*. Three cards on 09/08 claimed "missing" for things already shipped:

  | Card | Claimed missing | What the repo held |
  |---|---|---|
  | MEH-1955 | sitemap/robots "חסר לגמרי" | both existed; the real diff was a one-line robots fix (PR #2720) |
  | MEH-1956 | JSON-LD + OG cards | richer than requested, since MEH-9/172/452/1062 (`seo.js:213`, `seo.js:412`) — closed with zero diff |
  | MEH-160 | (blockers named as open) | the named blockers had shipped; the real work was elsewhere |

  The cost of skipping this check is not wasted effort — it is **writing new
  code on top of existing code**, a second parallel mechanism for one job
  (workflow.md Smell #1) that then needs its own ticket to unwind. The
  `file-preservation` §6 discipline ("prove the document is wrong before
  correcting it") is the same rule pointed at cards: prove the capability is
  absent before building it.

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
