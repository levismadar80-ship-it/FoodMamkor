# Overnight sweep v2 — done-conditions ledger

> One row per task **before** any code is touched (no_stall_architecture §1).
> A task with no extractable done-condition fails the eligibility gate and is
> skipped, never improvised.

Session start: 2026-08-07 (branch cut off `origin/staging` @ `f2c9524`).

---

## Pre-flight reconciliation — seed list vs Linear live

`queue_rule` says Linear live wins. **Four of the eight seed items were already
finished** by the time the sweep started. The seed was accurate when written and
is not now; this is the single most important thing in tonight's report.

| # | Seed said | Linear live (2026-08-07) | Outcome |
|---|---|---|---|
| 1 | MEH-1911 — attack first, LOW-RISK, auto-merge | **archived 07/08; PR #2633 merged by Sapir 07/08 10:41Z** | **NO-OP.** Its one open DoD item (apply the CI patch) is PR #2661 — a `.github/workflows` change, Sapir's. |
| 2 | MEH-1853 — full autonomy, auto-merge | live, `cc-queue`, In Progress | **WORKED → merged (PR #2676).** |
| 3 | MEH-1935 — prep `[preview]` only | live, stop-point intact | **PREPPED.** `[preview]` commit pushed; not merged. |
| 4 | MEH-1764 — implement via scripts/checks | **archived 29/07; PR #2430 landed** | **NO-OP.** `docs/ci/vrt-label-trigger.patch.md` (19 KB) exists and is cited at `.claude/rules/testing.md:149`. Rest is Sapir's (apply YAML + create the `vrt-regen` label). |
| 5 | MEH-1868 — prep patch + non-workflow PR | live, `cc-queue`, Backlog | **ALREADY PREPPED** as PR #2614 (chunk 0, 04/08). RED-partial → not mine to merge. Chunks 2–3 unbuilt. |
| 6 | MEH-1746 — run Phase 0 | **Phase 0 completed by CC 04/08**; description opens `✅ PHASE 0 DONE` | **NO-OP.** §9 locked pending Sapir's explicit copy approval (rule 22). |
| 7 | MEH-1934 — prep only | In Progress, **no `cc-queue` label** | Lane A is opt-in → not mine. PR #2673 exists anyway. |
| 8 | MEH-1909 — prep artifacts | In Progress, **no `cc-queue` label**, RED | Not mine by opt-in. PR #2480 already open. |
| — | (absent from seed) | **MEH-1939** — In Progress, `cc-queue`, High | Newer than the seed. PR #2675 already open. |

MEH-1911's and MEH-1764's absence from the `cc-queue` label query was an
**archived-filter artifact**, not evidence they were unlabelled. Both were
checked directly per the presence/absence rule rather than inferred from the
listing — which is exactly how "it isn't in the list" would have become "it was
never done".

---

## Done-conditions

### MEH-1853 — CLS on producer detail [YELLOW · cc-queue · full autonomy]

The card was **rewritten 07/08** after its previous root cause was disproved
twice. §5 is explicit and Sapir-approved: **the next step is measurement, not a
fix**, with a ⛔ forbidding any footer change until the pusher is identified.

Done-condition, DoD item 1 verbatim:

> **the block that grows after render is identified by name.**

That splits into two observable halves:

- **1a — the instrument.** `qa-meh1853-cls.mjs` records `previousRect.height`
  per shift source and separates growers from movers.
  **DONE — PR #2676, merged to staging as `1992b34e`.** Self-test green and
  shown failing under three separate breaks, one of which reproduces the exact
  pre-change behaviour.
- **1b — the reading.** A dispatched run emits a height-delta ranking naming the
  block. **Dispatched** on `staging` against
  `/producer/0208cb12-dac4-474e-a640-8d308c074c93` (the same path as baseline run
  `31164974787`, recovered from that run's log so the numbers are comparable).

Explicitly **NOT** in scope: DoD items 2–5, the fix itself. Those unlock only
once 1b names the block. Attempting the fix now repeats the error that cost
PRs #2626 → #2632.

### MEH-1935 — diet landing pages [`cc-queue`, STOP-POINT governs]

Done-condition for tonight is **not** the ticket's DoD — the description's
stop-point overrides the label:

> a Vercel preview URL exists for Sapir's morning mobile QA, and the branch's
> gates are still green.

**DONE.** `[preview]` commit `0f19a05c`; build exit 0, vitest 2514 passed / 3
skipped, both re-verified *after* syncing the 2-commit staging drift. Not merged
— copy approval (rule 22) and the mobile pass are both hers.
