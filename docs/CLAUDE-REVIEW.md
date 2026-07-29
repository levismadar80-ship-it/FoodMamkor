# Claude PR Review — prompt + calibration plan

**Workflow:** `.github/workflows/claude-review.yml`
**Action:** `anthropics/claude-code-action@v1`
**Status:** calibration (`continue-on-error: true`, informational only)
**Source ticket:** MEH-487

---

## When it runs

`pull_request: [opened, synchronize]` against any base branch. Concurrency
key is `${{ github.workflow }}-${{ github.head_ref || github.ref }}` —
force-pushes to the same PR cancel the in-flight review (MEH-485 pattern).

The job is intentionally **NOT** a required check during calibration.
Branch-protection wiring lives in [DEPLOYMENT.md](./DEPLOYMENT.md) §C.

---

## NON-GOALS (MEH-1654) — what this reviewer must never be asked

The reviewer answers exactly one question: **"what is broken in this diff?"**

It must never be asked, and its output must never be read as an answer to:

- **"are we ready to launch?"**
- **"what is missing?"**
- **"is this feature complete?"**
- **"is the spec fully covered?"**

**This is a measured limit, not a stylistic preference.** TriAdReview (75
experiments) measured **+27.6%** on security review and **+20.8%** on code
generation — and **−7.5% on completeness-oriented tasks**, because adversarial
review carries a structural bias toward simplification. Pointed at "what is
missing," it does not merely underperform; it makes the answer *worse* than not
asking. A reviewer optimized to attack what exists is the wrong instrument for
judging what does not exist.

**Where completeness lives instead:** with Sapir, and with the Definition of Done
(`.claude/rules/testing.md`, `bash .claude/skills/mehamakor-dod/check.sh`). Neither
is delegated to this job, and a green adversarial review is never evidence that a
ticket's `acceptance_criteria` are met.

This is also why the gate is scoped to `staging → main` rather than used as a
launch gate: it blocks on defects found, and stays silent on scope.

---

## Fresh context — anti-anchoring (MEH-1654)

Two structural requirements, both from the same finding: a reviewer that inherits
the author's reasoning re-derives the author's conclusions.

1. **Different model.** The reviewer runs a model **different from the one that
   wrote the diff** (maker ≠ checker, the banking rule: the agent that writes a
   change never approves it). A model that rationalized a shortcut while
   implementing rationalizes it again while reviewing — not a limitation a better
   prompt repairs. Current state, the swap, and the collision case (a CC session
   that itself ran the reviewer's model) are in
   [`docs/ci/adversarial-review.patch.md`](./ci/adversarial-review.patch.md) §2.
2. **No inherited narrative.** The reviewer's inputs are the **diff, the tests in
   the diff, and the repo rule files** — never the PR body, existing PR comments,
   or commit messages. Never recycle a critic session; anchoring bias is real in
   models too. Each `claude-code-action@v1` run is already a fresh process with no
   carried state — keep it that way.

Every PR body states the model the CC session ran as. **If it equals the reviewer's
model, that PR's adversarial review is treated as unrun, not as clean** — there is
no way for the workflow to detect this on its own, so the declaration is the
guarantee.

---

## The review prompt (canonical)

> Use the full text below. The workflow YAML carries a thin pointer; this
> file is the source of truth. Tuning = edit this file, commit, ship.

You are an adversarial reviewer for the מהמקור (mehamakor.online) repo —
a fresh-eyes safety net catching what the author CC session missed.

**Read first:**
- `CLAUDE.md` — locked decisions, RTL rules, branch strategy
- `.claude/rules/security.md` — security invariants
- `.claude/rules/rtl.md` — RTL discipline
- `docs/decisions/ADR-006-schema-parity-discipline.md` — Pydantic↔DB↔frontend parity
- `docs/decisions/ADR-007-expand-contract-schema-changes.md` — expand-contract pattern <!-- TODO: ADR-007 path lands when MEH-486 merges to staging -->

**Focus areas (review the diff against these, in order):**

1. **Security.** Auth changes (JWT, OAuth, refresh), rate-limit edits, XSS
   (unsafe innerHTML / dangerouslySetInnerHTML), hardcoded secrets, raw
   SQL in route handlers, IDOR (mutation routes lacking
   `resource.owner_id == current_user.id` OR admin override), magic-byte
   upload validation regressions.
2. **RTL discipline.** Any new `left-`, `right-`, `ml-`, `mr-`, `pl-`,
   `pr-` Tailwind class without an inline exception comment (`// LTR
   exception: <reason>`). Logical properties (`start-`, `end-`, `ms-`,
   `me-`, `ps-`, `pe-`) are the rule. Reference: `.claude/rules/rtl.md`.
3. **Schema drift.** Any edit to `backend/app/models/*.py` MUST be
   accompanied by a new `backend/alembic/versions/*.py` revision (per
   ADR-003). Any new column MUST appear in the matching `*Out` schema in
   `backend/app/schemas/` (per ADR-006 R1+R2). Schema-changing PRs should
   follow expand-contract (per ADR-007 once it lands).
4. **Scope creep.** Take the `MEH-XXXX` identifier from the PR title and
   **nothing else from the PR narrative** (MEH-1654 anti-anchoring — reading
   the body to learn "the ticket's stated scope" is exactly the inherited
   reasoning the fresh-context rule forbids). Judge scope from the diff's own
   coherence: does every changed file serve one logical change? Flag files that
   do not, even if the change is otherwise good — they belong in their own PR
   (CLAUDE.md workflow rule "One PR = one logical change"). Note this is a
   narrower question than "does this match the spec" — completeness against a
   spec is a NON-GOAL (see above).
5. **Hebrew copy in code.** Hebrew strings in JS/TS/Python source (not
   JSX user-facing text — that's expected) — flag. Hebrew belongs in
   Linear descriptions, code comments stay English.
6. **Test coverage.** New API endpoint or React component without a
   matching test = WARN (not BLOCK during calibration). Reference:
   `docs/TESTING.md`.

**Output format contract:**

Always post a single PR comment with these three sections, in this exact
order:

```
### Must Fix
1. <file:line> — <one-sentence finding> — <one-sentence fix>
2. ...

### Should Consider
1. <file:line> — <finding> — <suggested change>
2. ...

### Minor
- <file:line> — <nit>
- ...
```

**Always post a comment, even when all 3 sections are empty. Empty
sections must read `None.`** This gives us confirmation the action fired
(vs silent no-op anxiety during calibration).

> **This rule is permanent — it does NOT relax after the blocking flip
> (MEH-1668).** Until now this paragraph ended with *"After calibration flips
> to blocking, we may relax to 'post only when findings exist.'"* That clause
> is **deleted**, because a gate that parses this contract has to treat silence
> as failure: if "no comment" were a legitimate way to say "clean", then an
> action that crashed, timed out, hit a budget cap, or never called the posting
> tool would be indistinguishable from a clean review — and would merge. That
> is the MEH-506 silent-no-op class exactly, and it is the failure mode the
> contract was written to close in the first place. **Silence must never read
> as clean.** A blocking gate makes the clause dangerous, not obsolete.

**Which comment is the review (MEH-1668 — author + shape).** A parser needs to
identify the review unambiguously, and "the comment containing `### Must Fix`"
is not enough: a human quoting the format in discussion would match, and so
would this very document if it were ever pasted into a thread. **Both** rules
must hold:

1. **Author** — the comment is authored by the identity the action posts under
   (the `claude-code-action` bot). A comment from any human account is never
   the review, regardless of its shape.
2. **Shape** — the body contains all three headings, `### Must Fix`,
   `### Should Consider` and `### Minor`, each exactly once, in that order.

Where several comments satisfy both, the **most recent** wins — re-review after
a push is the normal case, and the latest verdict is the operative one. Where
**none** does, a parser must treat that as "the reviewer did not speak" and
fail; it must not fall back to a looser match.

> The two rules are `AND`, deliberately. An `||` between them would let either
> cue carry the whole identification, so losing the other becomes undetectable —
> the pass-condition shape `.claude/rules/testing.md` calls out as how a probe
> signs off on a broken state.

**Posting the comment (MEH-506 fix).** The action does NOT auto-post.
You MUST call the GitHub MCP tool explicitly:

```
mcp__github__add_issue_comment(
  owner=<from REPO context var>,
  repo=<from REPO context var>,
  issue_number=<from PR NUMBER context var>,
  body=<the three-section review above>
)
```

`REPO` and `PR NUMBER` are provided at the top of the workflow prompt
(`.github/workflows/claude-review.yml`). Skipping the tool call = silent
no-op — the original MEH-506 failure mode (5 PRs with `conclusion=success`
and 0 PR comments).

**Tone:** terse, file:line evidence, no ceremony. No headers beyond the
three above. No greeting, no summary, no "great work" filler.

---

## Calibration plan

> ### ⚠️ Tally read-out, 2026-07-27 (MEH-1654) — **the tally was never kept**
>
> Read directly, not inferred, because MEH-1654 gates a blocking flip on it:
>
> | Source | Expected | Actual |
> | -- | -- | -- |
> | the table below | one row per PR | **5 empty placeholder rows** — the only non-blank cell is the `(this PR)` row MEH-487 shipped with |
> | `HANDOFF.md` → "Claude Review calibration" (the pointer this file used to carry, now retired below) | the live tally | **the subsection does not exist** — `grep -c "Claude Review calibration" HANDOFF.md` → `0` |
>
> **PRs tallied: 0. Useful rate: unknown — unmeasured, not zero. `>70% useful`:
> NOT MET**, and not currently meetable: an empty dataset cannot cross a
> threshold. The job has run on many PRs since 2026-05-07 and HANDOFF records
> outcomes in prose, but no PR was ever scored, so there is no denominator.
>
> **Consequence:** the MEH-1654 **model swap lands regardless** (it is not
> tally-gated); the **blocking flip stays PENDING** this threshold. Resuming the
> tally — five scored rows in the table below — is now itself the open work.
> Full patch + order of application: [`docs/ci/adversarial-review.patch.md`](./ci/adversarial-review.patch.md).

| PR # | Useful findings | Noise findings | Verdict | Notes |
|---|---|---|---|---|
| (this PR) | _ | _ | _ | first run — wires the action |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

After the 5th PR run:

- **Signal:noise > 70% useful** → file follow-up to flip
  `continue-on-error: false` (blocking). Update DEPLOYMENT.md branch
  protection table to add `Adversarial review (calibration)` (renamed)
  as a required check. **MEH-1654 scopes this: the check goes on
  `protect-main` only** — required on `staging → main`, advisory on
  `feature → staging` — and the trigger-level `paths-ignore` must be
  deleted first, or the check becomes absent on docs-only PRs and blocks
  `main` forever (`DEPLOYMENT.md:252`, MEH-892). Exact YAML + order of
  application: [`docs/ci/adversarial-review.patch.md`](./ci/adversarial-review.patch.md).
- **30–70%** → tune the prompt in this file, run another 5 PRs. Each
  tuning commit must touch only this file + (optionally) the workflow
  YAML if a structural fix is needed.
- **< 30%** → revert (delete the workflow + this doc) and file a
  follow-up "investigate why review quality is poor on mehamakor diffs"
  before retrying.

**The tally lives in the table above — one owner, and this file is it.** Every PR
gets a row before merge.

> Until MEH-1654 this line pointed at a "Claude Review calibration" subsection in
> `HANDOFF.md`. **That subsection was never created**, so the pointer sent every
> reader to an empty place while the table here sat unfilled — two owners for one
> fact, neither holding it (MEH-271 smell #1). The pointer is retired rather than
> repaired: a tally split across two files is how this one went eleven weeks
> unrecorded.

---

## Tuning protocol

Edit this file, commit with `docs(MEH-487): tune review prompt — <reason>`,
ship. The workflow re-reads the prompt on the next PR. Never edit the
prompt inline in `claude-review.yml` — keeping it here means the
calibration history shows up in `git log docs/CLAUDE-REVIEW.md`.

---

## References

- [CLAUDE.md](../CLAUDE.md)
- [ADR-006](./decisions/ADR-006-schema-parity-discipline.md)
- ADR-007 — `docs/decisions/ADR-007-expand-contract-schema-changes.md` (lands when MEH-486 merges)
- [anthropics/claude-code-action README](https://github.com/anthropics/claude-code-action)
- [docs/ci/adversarial-review.patch.md](./ci/adversarial-review.patch.md) — MEH-1654 maker ≠ checker patch (model swap + scoped blocking flip)
- MEH-487 (this file's source ticket)
- MEH-1654 (NON-GOALS + fresh context + the tally read-out above)
