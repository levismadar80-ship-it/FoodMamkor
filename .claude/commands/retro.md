---
description: End-of-session behavior retro — EXTRACT corrections/preferences/self-critique from the session, CLASSIFY each to a source-of-truth file, OUTPUT as str_replace blocks, WAIT for per-finding approval.
---

Run at the end of a session, **after** Rule 13's HANDOFF.md update (see [.claude/rules/workflow.md](../rules/workflow.md)). The retro is NOT a free-form journal — it is an extraction bound to the project's source-of-truth files. Every finding must be applicable by `str_replace` without further drafting.

Execute the 5 steps below in order. Do not skip steps, do not invent extra buckets, do not write free-form prose sections.

---

## STEP 1 — EXTRACT

Scan the current session transcript (user turns + tool results + your own messages) for findings in exactly three buckets. Skip anything outside these three:

1. **Corrections** — moments Smadar explicitly corrected behavior. Trigger phrases: *"don't do X"*, *"לא ככה"*, *"use Y instead"*, *"you missed Z"*, *"STOP"*, *"זה לא מה שביקשתי"*. One correction = one finding.
2. **Preferences** — stated stylistic / process preferences that should apply to future sessions, not just this one. Trigger phrases: *"I prefer …"*, *"תמיד …"*, *"מעכשיו …"*, *"when X happens, do Y"*, *"by default …"*. Reject one-off context.
3. **Self-critique** — moments you (Claude) noticed your own miss: wrong file edited, scope creep, skipped a rule, hallucinated a path, ran the wrong tool, ignored a STOP condition, drifted from spec. Be honest — if you noticed it mid-session, surface it; if you didn't notice but the diff/output proves it, surface it.

For each finding, capture: the bucket, a one-line summary, and the originating session moment (quote ≤1 sentence from the transcript).

---

## STEP 2 — CLASSIFY

Route each finding to **exactly one** source-of-truth target. If two targets seem plausible, pick the more specific one (rule file over CLAUDE.md, rtl.md over workflow.md).

| Target | What lands here |
|---|---|
| `CLAUDE.md` | Structural / cross-cutting decisions only. Hard cap ≤80 lines — prefer a rule file unless the finding is truly cross-cutting. |
| `.claude/rules/workflow.md` | Workflow rules, branch flow, PR discipline, DoD, custom commands, retro patterns, risk-tiering, session lifecycle. |
| `.claude/rules/rtl.md` | RTL / Hebrew direction, logical vs physical Tailwind properties, bidi text, Hebrew-specific gotchas. |
| `templates/01-07` | Recurring prompt templates (the 7 numbered Caveman specs). Use this when the finding is a reusable spec pattern, not a project rule. |
| `DROP` | One-off context with no durable lesson. Discard. Do not emit output for DROP findings. |

If a finding doesn't fit any non-DROP target → it's DROP. Don't force a fit.

---

## STEP 3 — OUTPUT (str_replace style)

For every non-DROP finding, emit exactly this block — no free-form prose, no markdown section bodies, no "consider doing X" suggestions:

```
### Finding N — <bucket>: <one-line summary>
**Target:** <file path>
**old_str:**
<exact existing text from the target file, with enough surrounding context to be unique>
**new_str:**
<proposed replacement text>
**Rationale:** <≤2 sentences linking the edit to the originating session moment>
```

Rules for the block:
- `old_str` must be **verbatim** from the target file as it exists on the current branch. Read the file first; do not edit from memory.
- `old_str` must be unique within the target file — include 2–3 lines of surrounding context if the literal text appears more than once.
- `new_str` must be the full replacement — not a diff, not a patch, not "add X here". The block must be directly applicable by the `Edit` tool.
- One finding = one block. If a finding requires edits to two files, split it into two findings.
- Number findings sequentially across all buckets (Finding 1, 2, 3, …) — do not restart numbering per bucket.

---

## STEP 4 — WAIT

After emitting all blocks, print exactly this line and stop:

> *"Retro extracted N findings across <comma-separated target files>. Waiting for `go <N>` to apply, `skip <N>` to drop, or `edit <N>` to revise."*

Do **not** apply any edits autonomously. The retro proposes; Smadar approves per finding. On `go <N>`, run the matching `Edit` call. On `skip <N>`, drop the finding. On `edit <N>`, revise the block and re-emit it, then return to WAIT.

`go all` applies every emitted finding in order. `skip all` drops everything and ends the retro.

---

## STEP 5 — EMPTY CASE

If after CLASSIFY there are zero non-DROP findings (all corrections/preferences/self-critique surfaced were one-off context, or none surfaced at all), print exactly:

> *"No retro findings — clean session."*

and exit. Do not emit empty blocks, do not invent placeholder findings, do not apply edits.

---

The retro output stays in chat. It is not committed. Approved findings land via subsequent `Edit` calls on the targeted source-of-truth files, in their own commits per Rule 6 (one logical change = one commit).
