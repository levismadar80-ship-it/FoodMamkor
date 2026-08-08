# LOOP-PROMPT — the message every drain iteration reads

> **How this is used.** Each iteration of the continuous-drain loop starts with a
> fresh context and is fed this file. The filesystem is the memory; the loop is
> the persistence. The everything-else — authority, gates, what may be merged —
> lives in [ORDERS.md](./ORDERS.md), which this file tells the iteration to read
> first.
>
> **Why a loop at all.** The failure mode has a name: **"Premature Exit"** — the
> model stops when it *feels* finished rather than when a verified condition
> holds. The industry answer is a loop whose stop-hook intercepts every attempt to
> end and hands the work back, until the model emits a **completion promise** — an
> agreed word it is permitted to say only after mechanical verification. Here that
> word is `QUEUE-EMPTY`, and §3 is what earns it.

**Launching it** (one-time, from the user's terminal — not from inside a session):

```
# A — the official plugin (recommended)
/plugin install ralph-wiggum@claude-plugins-official
/ralph-loop "$(cat docs/overnight/LOOP-PROMPT.md)" --max-iterations 25 --completion-promise "QUEUE-EMPTY"

# B — the built-in primitive, no plugin
/goal no eligible unclaimed Linear issues remain per docs/overnight/ORDERS.md two-track rule; every completed task has a merged PR or a parked entry

# C — the classic bash loop (separate worktree!)
while :; do cat docs/overnight/LOOP-PROMPT.md | claude -p; done
```

---

## The prompt

**MEHAMAKOR CONTINUOUS DRAIN — every iteration, fresh context, filesystem is
memory.**

**BOOTSTRAP:** if `docs/overnight/ORDERS.md` does not exist, create it from the
full session-orders Sapir pasted (session3 authority: full self-merge to staging
pre-launch, ownership protocol, self-check bundle, no-stall architecture) and
commit it in a **docs-only** PR — every future iteration reads it from disk.

Then, **every iteration**: read `docs/overnight/ORDERS.md` +
`docs/overnight/session-state.md` + `git log --oneline -15`. **Linear live is
truth for queue state** — not this file, not session-state.md, not memory.

---

## 1 · TURN-END CONTRACT

A turn may end in **exactly one** of three states. Nothing else is a valid ending.

1. **NEXT TASK CLAIMED AND STARTED.** Finishing a task is not a stopping point —
   claim the next one (branch-claim per ORDERS §2) and begin it. **Never end a
   turn "reporting and awaiting instructions."**
2. **CLEAN CYCLE EXIT after 5 tasks.** Write state to `session-state.md` + a
   heartbeat, then exit; the loop restarts you fresh. **A planned exit beats
   context rot** — this is a success state, not a giving-up state.
3. **`QUEUE-EMPTY`.** Permitted **only** after the verified-empty ritual in §3.
   This is the completion promise: saying it ends the loop, so it must be
   *earned*, not felt.

**The one exception:** a corruption halt per ORDERS §2 — write `BATCH-STOP` plus
the reason and exit **without** the promise. A halt is not a completion.

---

## 2 · PIPELINE OVERLAP

**Never idle on a gate.** When PR N is waiting on CI, arm a check-in to merge it
on green and **start task N+1 in parallel**.

**Waiting is not a task.** A turn that consists of watching a check run is a turn
that ended in none of the three permitted states.

---

## 3 · VERIFIED-EMPTY RITUAL

The precondition for the promise. All three steps, in order.

**a. Fresh `list_issues` sweep — both tracks.** `In Progress` is `cc-queue`
opt-in; `Todo` / `Backlog` is opt-out then content-gated (workflow.md B1–B4). Run
an anti-stale check on anything ambiguous — a paginated listing is evidence of
presence, never of absence.

**b. Zero eligible unclaimed build tasks → opportunistic lanes, in this order:**

1. **Flaky specs** — start with `EventExperienceAddress.test.jsx`. Reproduce
   under full-suite conditions (not in isolation), then fix, or quarantine **and
   file a ticket**. A quarantine with no ticket is a silent deletion.
2. **[MEH-1897](https://linear.app/mehamakor/issue/MEH-1897)** — the 47-field
   classification.
3. **MEH-215 / MEH-217** — suite build-out continuation.
4. **Docs consolidation PR** — CHANGELOG / HANDOFF backfilled from the session
   logs, per the MEH-1372 pattern (docs-only branch, never riding code).

**c. Only when (a) AND (b) are both exhausted** → output `QUEUE-EMPTY`.

---

## 4 · PER-TASK — unchanged from ORDERS

- **Done-condition written before code.** Not after, and not inferred from the
  diff.
- **30 min / 2 attempts on the same problem → park and continue.** Whichever comes
  first.
- **Transient failure = 1 retry. Permanent failure = straight to park.** Telling
  them apart is part of the work: read the log rather than retrying hopefully.
- **10-minute research fallback** before parking on an unknown. *"I don't know"*
  is an acceptable answer; a confident wrong one is not.
- **Different-model adversarial review before merge** (maker ≠ checker).
- **Full evidence bundle** — ORDERS §3.
- **Post-merge verify + instant revert** on breakage. Green staging outranks a
  completed task.
