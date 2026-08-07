# Staged correction — the adversarial reviewer's status in `.claude/rules/workflow.md`

> **Why this is a staged patch and not an edit.** The claim needing correction lives in
> `.claude/rules/workflow.md`, which is **Sapir-only** for CC. Same pattern as every other
> file in `docs/ci/`: CC measures and drafts, Sapir applies. **This document changes
> nothing on its own.**
>
> **Apply this and the correction is live. Until then `workflow.md` promises a second pair
> of eyes that, as of 2026-08-07, is not there.**

---

## The contradiction, in one line

`.claude/rules/workflow.md:255` says **"✅ CORRECTED 2026-08-03 — the reviewer works. It
reads diffs."** On 2026-08-07 the reviewer posted **zero** reviews across four PRs while
producing the no-op signature that same section describes as historical.

Rule 5a leans on that claim, and `workflow.md:342-344` instructs sessions **not** to
describe the reviewer as non-functional. So a session reading the file today is told it has
independent review that it does not have.

## The measurement (2026-08-07)

`Adversarial review (calibration)` → `conclusion: failure` on **four** PRs, 08:38–10:41Z:

| PR | run / job | result |
|---|---|---|
| #2641 | `31162540675/job/92815931251` | failure |
| #2648 | `31162570782/job/92816028025` | failure |
| #2637 | — | failure |
| #2653 | `31166282013/job/92827732352` | failure |
| #2480 | `31171064311/job/92842759972` | failure |

Examined in full on **#2653**:

- **zero reviews posted** — `pull_request_read(get_reviews)` returned `[]`
- action step ran **`duration_ms=237`**
- last line before teardown: `curl … ${GITHUB_API_URL:-https://api.github.com}/installation/token || true`, and curl transferred **0 bytes**

237 ms + a zero-byte installation-token fetch + zero reviews = the signature the section
itself records as the pre-02/08 failure mode (`num_turns: 1`, ~500–600 ms, every commit).

## What is NOT being claimed

**The cause is not established, and the correction below must not assert one.** "The
credential expired" and "the floating `@v1` tag shipped a breaking change" produce an
identical symptom, and GitHub masks an unset secret and an expired one the same way. Until
`show_full_output: true` is on the step (action **(a)** in MEH-1844), the two cannot be
separated.

The wording deliberately avoids **"uncredentialed"** — that is a cause, and it is exactly
the unverified-diagnosis-becoming-fact failure that produced the *previous* wrong version of
this section.

---

## The patch

### Replace the header at `workflow.md:255`

```diff
-> ## ✅ CORRECTED 2026-08-03 (MEH-1861) — the reviewer works. It reads diffs.
+> ## ⚠️ STATUS IS A DATED CLAIM — re-measure before relying on it
+>
+> **As of 2026-08-07 the reviewer is producing the no-op signature again:** zero reviews
+> posted across five PRs (#2641, #2648, #2637, #2653, #2480), action step ~237 ms, and a
+> zero-byte `installation/token` fetch. **Do not treat its silence as approval, and do not
+> count it as the independent review rule 5a describes.**
+>
+> **The cause is NOT established** — a missing credential and a breaking change on the
+> floating `@v1` tag are indistinguishable until `show_full_output: true` is on the step
+> (MEH-1844 action (a)). Do not write a cause into a PR body.
+>
+> The 02–03/08 measurements below were correct when taken — the reviewer genuinely worked
+> then, including a real finding on #2541. Both readings are true of their own date, which
+> is the point: **this section states an observation with an as-of, never a standing fact.**
+>
+> ### What was measured on 2026-08-03 (kept — accurate for its date)
```

### Amend step 4 at `workflow.md:342-344`

```diff
-   opened"* — cite **this section**, not a ticket. MEH-1734/1735 are cancelled
-   and a reader following them lands on nothing. **Do NOT write "CI reviewer
-   uncredentialed"** — that was this file's wording until 2026-08-03 and it is
-   false (see the corrected subsection above).
+   opened"* — cite **this section**, not a ticket. MEH-1734/1735 are cancelled
+   and a reader following them lands on nothing. **Do NOT write a CAUSE** —
+   "uncredentialed", "expired secret", "upstream broke" are all unverified and
+   one of them was already stated as fact once and turned out wrong. State the
+   observation with its date: *"as of <date> the reviewer posted no review."*
```

### Amend step 6 at `workflow.md:349-353`

```diff
-6. **Read the `claude-review` comment before merging** (verified 2026-08-03: the
-   job posts one on every non-draft, non-docs-only PR).
+6. **Look for the `claude-review` comment before merging — and check whether one
+   exists at all.** It posted reliably on 02–03/08 and posted nothing on 07/08.
+   **An absent comment is not an approval**; it means the reviewer produced no
+   output, which is the same as having no second reader. Say which of the two you
+   observed in the PR body.
```

---

## Why this correction is the audit's own thesis

`docs/audits/2026-08-unenforced-rules-audit.md` argues that a documented claim with no
mechanism behind it decays silently, and that the repo carries nine such rules. **This is a
tenth instance, and the sharpest one**, because the decayed claim is load-bearing for
`rule 5a` — the rule that is supposed to catch exactly this class.

The 03/08 correction was careful, measured, and right. It still went stale in four days,
because **nothing re-measures it and nothing notices when it stops being true.** That is not
a criticism of whoever wrote it; it is the argument for why the fix has to be a date-stamped
observation rather than a verdict.

**The general form, worth more than this instance:** a doc that records *"X works"* is a
claim about a moment. Without an as-of and a re-measure trigger it will eventually assert
something false, and the more carefully it was verified the more confidently it will be
believed. Prefer *"as of `<date>`, measured `<how>`"* over *"X works"* — everywhere, not
just here.

## Related

MEH-1844 (the reviewer's three open actions — (a) `show_full_output`, (b) pin the action to
a SHA, (c) delete the temporary policy) · PR #2511 stages (b) ·
`docs/audits/2026-08-unenforced-rules-audit.md` · `.claude/rules/workflow.md`
§ *TEMPORARY — local adversarial review*.
