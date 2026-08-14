# MEH-1844 — CI adversarial reviewer outage, full investigation history (2026-08-02 → 2026-08-08)

> **Archived 2026-08-13.** This is the full text of the "⏳ TEMPORARY — local
> adversarial review" section previously carried in
> [`.claude/rules/workflow.md`](../../.claude/rules/workflow.md), moved here
> once the ticket resolved so the rules file (loaded into every session's
> context) stops paying for history that no longer shapes a decision — per
> `.claude/rules/frontend.md`'s own maintenance guidance ("incident history
> no longer shaping a decision → move to an audit doc and leave a link").
> `workflow.md` now carries a short resolution note in its place. Kept here
> verbatim (not summarized) so a future recurrence of reviewer intermittency
> can compare against the exact prior investigation rather than re-derive it
> from zero.

---

## ⏳ TEMPORARY — local adversarial review · ACTION DUE 2026-08-01

> **⚠️ This section is the ONLY surviving record.** MEH-1734 and MEH-1735 —
> which tracked the broken reviewer — were **cancelled on 29/07**. Nothing else
> in Linear or the repo carries the three actions below. Delete this section
> only when all three are done, not when the date passes.
>
> **The due date has passed (today > 2026-08-01) and the section is still here —
> that is the "expiry nobody actions" case this file warns about, now live.**
> (a) is satisfied, (b)/(c) are not. Per this section's own terms that is a
> decision for Sapir, not a silent extension. Surfaced 2026-08-03 under MEH-1861.

### 📅 2026-08-01 — three actions

**Status as of 2026-08-08 (MEH-1844):** **(a) DONE** — the reviewer
authenticates and posts reviews. **(b) DONE** — the action is pinned to a full
SHA at `claude-review.yml:68`; the "staged on PR #2511" reading below is stale
and PR #2511 is no longer where to look. **(c) is OPEN** and is now unblocked.
The reviewer itself is **intermittent** — see the re-corrected subsection below
for the five-head measurement, and do not read (a)+(b) DONE as "it fires on
every push", because on 08/08 it did not.

_(Superseded line, kept so the drift is visible: "**Status as of 2026-08-03
(MEH-1861):** (a) appears DONE … **(b) is OPEN**, staged on PR #2511. **(c) is
OPEN** and blocked on (b).")_

**(a) Restore `CLAUDE_CODE_OAUTH_TOKEN` as a repository (or organization)
secret.** ✅ *Satisfied — verified 2026-08-03 from posted reviews on PRs #2494
and #2541. Not verified from the secret itself: repository secrets are not
readable from a CC session, so this is inferred from the action succeeding
where an auth failure would have exited early.* `claude-review.yml:66` reads
`claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` — **not**
`ANTHROPIC_API_KEY`, which the action also accepts but this workflow never
reads. The job declares no `environment:`, so an *environment* secret resolves
to empty and cannot work here; it must be repo- or org-scoped.

> While you are in the file, add `show_full_output: true` to the step. The key
> is **absent today** (verified 29/07 — not set to `false`, as MEH-1734's body
> claimed), so the action's default applies and its own error text never
> surfaces. GitHub additionally masks an **unset** secret and an **expired** one
> identically. Without that output you cannot tell which of the two causes below
> you are actually looking at, nor confirm the fix took.

**(b) Pin `anthropics/claude-code-action` to a full commit SHA.** ✅ **DONE —
verified 2026-08-08.** `claude-review.yml:68` now reads
`anthropics/claude-code-action@be7b93b1907a4abad570368f3c74b6fe3807510b # v1.0.183`,
and the file's own note at `:67` records the re-pin as deliberate. This
paragraph previously said *"`claude-review.yml:64` is on the floating `@v1`
tag"* — that citation is stale in both the line number and the fact.
(`actions/checkout@v7` at `:59` still floats; out of scope here, worth the same
treatment.)

**Consequence worth carrying forward:** the 08/08 no-ops occurred **on the
pinned SHA**, so whatever causes them, it is not an unreviewed upstream change
arriving on a floating tag. That eliminates candidate 2 below.

**(c) Delete this temporary policy** — this whole section, plus rule 5a's
pointer to it.

**If (a) has not happened by 2026-08-01, that is a decision for Sapir — not a
silent extension.** An expiry nobody actions is a promise, and this repo already
has the empty MEH-487 calibration tally to show for that class.

### Why the substitution existed — and what is true now

> ## ⚠️ RE-CORRECTED 2026-08-08 (MEH-1844) — the reviewer is **INTERMITTENT**. Neither fixed nor down.
>
> **Read this before quoting anything below it.** This block has now been wrong
> in *both* directions, and the second error was caused by the first one's
> wording. Sequence, dated:
>
> | Date | What the file said | What was true |
> |---|---|---|
> | ≤ 02/08 | "has never read a diff" | **false** — it was reviewing |
> | 03/08 | "✅ the reviewer works. It reads diffs." | true *that day*, and it read as permanent |
> | **08/08** | — | **both, on the same day, on the same pin** |
>
> ### Measured 2026-08-08 — five heads, one day, one action pin
>
> | Head | Result | Evidence |
> |---|---|---|
> | PR #2681 `0c497b54` | ✅ **real review** | comment `08:51:49Z`; run `31249203315`, action step `08:49:01Z → 08:52:03Z` = **3 m 02 s**; a genuine finding with file:line (`producer_me.py:1422–1429`) |
> | PR #2685 (first head) | ✅ **real review** | comment `09:25:48Z`, all three sections `None.` — the `docs/CLAUDE-REVIEW.md` contract honoured on a clean diff |
> | PR #2685 (later head `30c2c6d6`) | ❌ **no-op** | `num_turns: 1`, `total_cost_usd: 0`, `is_error: true`, **356 ms** |
> | PR #2688 `450fb5a2` | ❌ **no-op** | job `93097369635`, **730 ms**, same four fields |
> | PR #2690 `35b76717` | ❌ **no-op** | job `93116123580`, action step `failure` at `14:47` |
>
> **The sharpest datum is PR #2685: it reviewed one head and no-op'd the next,
> on the same PR, hours apart.** So the variable is not the repo, not the
> credential, and not the pin — all three were constant across every row. It
> varies **per head**. That is what "intermittent" means here, and it is why
> neither "works" nor "down" is a usable summary.
>
> ### What this means for rule 5a — the practical part
>
> - **You cannot assume a review will appear**, and you cannot assume one will
>   not. **Check the PR before merging.** If a `claude[bot]` comment is there,
>   read it; rule 5a §6 is satisfied.
> - **Silence is not approval, and it is not a blocker either.** The job is
>   `continue-on-error: true` (`claude-review.yml:56`) and outside `ci-gate`'s
>   `needs:`, so its red blocks nothing. **State the absence in the PR body**
>   rather than leaving it unmentioned — an unremarked silence is
>   indistinguishable from a review that found nothing.
> - **Do not write "the CI reviewer is down" or "uncredentialed" into a PR
>   body.** Both were written this way before and both were false. Say what you
>   measured on *your* PR, with the run id.
> - The local `/adversarial-review` substitution below stays the baseline
>   precisely *because* the CI one cannot be relied on to fire.
>
> **Open diagnosis: MEH-1844.** The cause of the per-head variance is not
> established. Do not infer one from the shape — `show_full_output` was removed
> on 05/08 (deliberately, it is a live exposure on a public repo), so no cause
> string is available, and "no cause string" is exactly the condition that
> produced the two previous wrong entries in the table above.
>
> ### Status of the three actions — (b) has LANDED
>
> - **(a) credential** — satisfied. The action authenticates; a rejected
>   credential could not produce the 3 m 02 s review on #2681.
> - **(b) SHA pin — DONE**, and this block previously said otherwise.
>   `claude-review.yml:68` reads
>   `anthropics/claude-code-action@be7b93b1907a4abad570368f3c74b6fe3807510b # v1.0.183`.
>   It is no longer on the floating `@v1` tag and PR #2511 is no longer the
>   place to look. **Note what this rules out:** the no-ops above happened on a
>   *pinned* action, so "a breaking change arrived on the floating tag" —
>   candidate 2 in the table below — **cannot** explain them.
> - **(c) delete this temporary section** — now unblocked by (b), still open,
>   and still Sapir's call rather than a silent expiry.
>
> ### Preserved: what was measured on 2026-08-03 (MEH-1861)
>
> Still accurate *for its date*, and the reason the 02/08 "never read a diff"
> claim was retired:
>
> | Evidence (verified 2026-08-03) | Value |
> |---|---|
> | `claude[bot]` review on PR #2494 | posted `2026-08-02T08:34:53Z` — all three sections `None.` |
> | `claude[bot]` review on PR #2541 | posted `2026-08-02T21:20:02Z` — a **real, correct finding**: `scripts/checks/legacy-expiry-check.sh:102` called `grep -InE` without `-H`, so a single-file `xargs` batch drops the filename prefix and `cut -d: -f1` silently misparses every marker. Confirmed and fixed in `d369fe2d` |
> | Job runtime, run `30767745811` | action step `21:22:55Z → 21:23:42Z` = **47 s** |
> | Recent run conclusions | `success` across the 02–03/08 runs of `claude-review.yml` |
>
> **Why that evidence did not entitle the "✅ works" heading it carried.** Every
> row is a *positive* observation, and no number of successes establishes that
> failures stopped — the 03/08 sample simply contained no no-op. The heading
> generalised a run of greens into a property, which is the same move as reading
> a green check as "the code is correct" without asking what else produces it.
> **A claim about a flaky system needs its negative cases counted, or it needs
> an as-of date and no verb like "works".**
>
> ⚠️ **`success` at the run level is not evidence the reviewer ran.**
> `continue-on-error: true` means the *workflow run* reports `success` while the
> *job* check-run reports `failure`. Measured on #2688: run `31255166729` =
> `success`, job `93097369635` = `failure`, `is_error: true`. The "Recent run
> conclusions" row above is this artefact and proves nothing on its own —
> read the **job**, or better, look for the comment.

**Historical record — the state that produced the substitution (observed up to
2026-07-29).** _The parenthetical here used to read "no longer true"; as of
2026-08-08 that is wrong — the identical four-field symptom recurs, just not on
every commit. What has changed since 07/29 is the **frequency**, from
"repo-wide, every commit" to "some heads and not others". The description below
is still an accurate description of a no-op run._ The reviewer exited before
doing any work:
`num_turns: 1`, `total_cost_usd: 0`, `is_error: true`, ~500–600 ms, on **every
commit**, repo-wide (reproduced on an unrelated PR, run `30358905937`). The
cause was never established; two candidates produced that identical symptom:

| # | Candidate | What pointed at it | Status (re-verified 2026-08-08) |
|---|---|---|---|
| 1 | Credential missing/expired | `:66` reads a secret; auth rejection would exit before the first API call | **eliminated** — a rejected credential cannot produce the 3 m 02 s review posted on PR #2681 on 08/08, hours from the no-ops |
| 2 | **Breaking change on the floating `@v1` tag** | the failure appeared *suddenly and repo-wide*, which a static config cannot explain — this was judged the **more likely** of the two | **eliminated as the cause** — the 08/08 no-ops ran on the **pinned SHA** (`:68`). The pin was still worth doing; it just is not the explanation. _(This cell previously read "unresolved as a risk — `:64` still floats"; both halves are now stale.)_ |

**Both original candidates are now eliminated, and no third one has been
established.** That is a worse position than the table used to imply, not a
better one: the symptom is live, both leading explanations are dead, and
`show_full_output` was removed on 05/08 (deliberately — it is a live exposure on
a public repo), so the action's own error text is unavailable to whoever picks
this up.

**What would actually discriminate**, for whoever takes MEH-1844: the two 08/08
reviews and the three no-ops differ by *head*, not by repo, credential, pin, or
workflow file — all five were constant. So the next probe belongs on what varies
per head (diff size, changed paths, base-branch state, event payload), and it
needs `show_full_output: true` turned on **for that run only** and off again in
the same session. Do not infer a cause from the four-field shape alone; that
shape is what produced the two wrong entries in the dated table above.

It is `continue-on-error: true` (`claude-review.yml:56` — MEH-1734's body and
the 29/07 instruction both said `:57`; line 57 is blank, the key is on `:56`
— **re-verified 2026-08-03**) and it is **not** in `ci-gate`'s `needs:` list,
so its red blocks nothing. That is deliberate calibration mode, not an accident.
**This paragraph used to end "so rule 5a currently buys nothing" — that no
longer holds** (verified 2026-08-03): the job runs and posts findings, so rule
5a now buys a genuine independent review; what it still does not buy is a
*blocking* one. The `Builder-Model` guard (MEH-1668) was built to keep builder
and reviewer distinct around a reviewer that never ran, and now has a running
reviewer to be distinct from.

### Do NOT "fix" it by making it required

Sequence, decided under MEH-1734 §6 and preserved here because that ticket is
gone: fix the credential → let it run **non-required** → collect a real tally
(>70% useful) → **only then** promote it via an aggregator that maps
`skipped → pass`, the approved `E2E gate` pattern. **Never** add the context to
the ruleset directly — `claude-review.yml:27-31` has `paths-ignore`, so it
skips docs-only PRs, and a skipped-but-required check reads as *Expected* and
blocks them (MEH-892; tried on E2E 13/07 and reverted the same day).

**A further decision died with MEH-1735 and is recorded here for Sapir only —
not acted on:** that ticket concluded the reviewer should return to *advisory*
(neutral conclusion, findings posted as a PR comment rather than mapped to an
exit code, softening MEH-1668), and that the calibration audit **MEH-569**
should be pulled forward from post-launch to now, since the gate was armed
before the calibration meant to justify it ever ran. Both tickets are cancelled;
neither change has been made. Flagged, not implemented — it is outside what this
section was asked to carry.

**Substitute, per PR:**

1. Implement per the ticket's prompt block.
2. Push and open the PR **non-draft**. A draft reports zero gates — and since
   the MEH-1582 patch went live (`pr-checks.yml` `check_ran`/`strict_ok`) a
   draft's required jobs are suppressed and the gate now goes **red**, not
   falsely green.
3. Run `/adversarial-review` **locally in the session** on the diff. Fix every
   finding. Re-run if the fix changed anything.
4. In the PR body, paste the verdict and note *"local review, run before the PR
   opened"* — cite **this section**, not a ticket. MEH-1734/1735 are cancelled
   and a reader following them lands on nothing. **Do NOT write "CI reviewer
   uncredentialed"** — that was this file's wording until 2026-08-03 and it is
   false (see the re-corrected subsection above). **And do not write the
   opposite** — "the CI reviewer reviewed this PR" — unless you looked and found
   the comment on *this* PR. Both directions have already been asserted from the
   file rather than from the PR, and both were wrong. Describe what you
   observed, not what the rules file says the reviewer generally does.
5. Merge when **CI gate** + **Deploy gate** are green **and** the required jobs
   actually ran — `conclusion: success`, not `skipped`.
6. **Look for the `claude-review` comment before merging, and say what you
   found.** This step used to read *"(verified 2026-08-03: the job posts one on
   every non-draft, non-docs-only PR)"* — **that is false as of 2026-08-08**: it
   posted on two heads and no-op'd on three others the same day (see the
   re-corrected subsection above). So:
   - **Comment present** → read it, act on it, note it. It is real review output.
   - **Comment absent** → **not** a pass and **not** a blocker. Write one line in
     the PR body saying it did not appear, with the job id you checked. An
     unremarked silence is indistinguishable from a clean review, and that
     ambiguity is the whole reason this step exists.

   Its check result gates nothing either way — `continue-on-error: true`, absent
   from `ci-gate`'s `needs:`. **Never edit `claude-review.yml`** (CC-deny,
   MEH-671).

> **State the limitation plainly in the PR — do not dress it up.** The maker and
> the checker are the same session, so this is a self-review and carries none of
> the independence the CI reviewer was there to provide. It is a stopgap that is
> strictly better than the current no-op, and strictly worse than a second pair
> of eyes. Never present it as independent review.
>
> This is the same trap MEH-1757 §3 names for self-authored VEX: *"a VEX written
> internally that nobody reviews becomes a quiet way to disappear findings."*
> Writing the limitation into the PR body is what keeps it visible.
