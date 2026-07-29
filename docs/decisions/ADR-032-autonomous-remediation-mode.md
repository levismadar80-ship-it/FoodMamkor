# ADR-032: Autonomous remediation mode — CC finds → fixes → proves → merges; Sapir sees exceptions only

**Status:** Accepted
**Date:** 2026-07-28
**Deciders:** Sapir Levi
**Source:** MEH-1741 · Sapir's decision 28/07: *"אני לא רוצה שיצטברו משימות… שיתקן את כל מה שהוא מוצא בעצמו, יבדוק את עצמו, יעשה QA ו-merge."*

> **⚠️ Previously cited (incorrectly) as ADR-017.** ADR-017 is
> *JWT access token in localStorage* (Accepted 2026-05-23, MEH-686) — an
> unrelated security decision. The autonomous-remediation decision was taken on
> 2026-07-28 in MEH-1741 but was **never written to `docs/decisions/`**, so both
> live citations resolved to an occupied number. Ported here under the next free
> number (MEH-1761). `docs/decisions/ADR-017-jwt-access-token-localStorage.md` is
> unchanged.

## Context

The bottleneck was Sapir: every finding became a card, then a wait, then a `go`,
then a merge. The industry pattern is **management by exception** — the agent
operates inside a defined policy envelope, a human sees only the exceptions, and
review moves from before-merge to after-merge.

Research anchors: policy-as-code envelopes (OPA-style — an action is permitted or
forbidden by policy, not by per-action approval); autonomy thresholds by
risk domain (low-risk fully autonomous, high-risk with additional verification);
and the critical lesson that **a green build and passing tests are not sufficient
proof for an agent** — what is required is a test that demonstrates the problem is
closed (fails-before / passes-after), not an empty one.

## Decision

### 1 · Autonomy envelope

| Domain | Authority |
|---|---|
| 🟢🟡 GREEN/YELLOW (frontend, copy, docs, tests, single-file) | **Fully autonomous** — find → fix → QA → merge (already the case: ADR-016 v2) |
| 🔴 RED (auth, security, business logic, additive Alembic) | **Fully autonomous — new**, subject to the proof obligations in §2 and the hard stops in §3. Sapir's review happens **after** merge, on staging |
| ⛔ Hard stops (§3) | Never autonomous |

### 2 · Proof obligations for RED

These replace Sapir's eyes before merge.

1. **Exploit-proving test** — a test that demonstrates the problem: fails before
   the fix, passes after. Without it there is no merge, however green everything
   else is.
2. **Industry-standard only** — when unsure, research (OWASP cheat sheets,
   official framework docs, major-platform engineering blogs), adopt the standard
   solution, and cite the source in the PR body as
   `Decision: <what> — Source: <link>`. No clear standard → hard stop.
3. **Additive Alembic only** — the revision is shown in the PR body and the
   downgrade is tested. Additive means new constraint / index / column.
4. **One PR per RED fix** — never mixed with cosmetics.

#### §2.5 — RED stops before merge until the adversarial reviewer runs

A RED item **stops before merge** until the adversarial reviewer has actually
run. Green CI is not a substitute: the reviewer is the layer that checks the
reasoning, not the syntax.

#### §2.6 — The proving test asserts behaviour, not compliance

**The exploit-proving test verifies the behaviour, not that the prescribed change
was applied.**

A test that checks *compliance* (*"`text-start` is present in the class list"*)
passes an inert diff **by construction**. A test that checks *behaviour*
(*"`/en` renders these fields left-aligned"*) cannot.

This is what makes autonomous mode safe: when the queue is worked alone,
**nobody stands between a card's prescription and its merge.** The property does
not depend on anyone's diligence.

_Precedent: MEH-1721 P7 F-1 — the prescribed `text-right` → `text-start` swap was
**inert at 6 of 7** sites, because each carried a hardcoded `dir="rtl"` on the
same element. The diff would have applied, CI gone green, the card closed Done —
and `/en` stayed broken._

### 3 · Hard stops (closed list — everything else is autonomous)

1. **LOCK** (magazine-not-marketplace · zero commissions · manual approval ·
   licensing only · the forbidden phrases) — never, not even indirectly
2. **Destructive data** — `DROP`, deleting/rewriting rows, running a downgrade
   on staging
3. **`main` / production deploy / release**
4. **New env vars / secrets**
5. The same failure ×3, or a finding implying the scope is wrong at its base
6. Vercel red on a diff touching **code** (docs-only → merge)

On a hard stop: record the state on the card, **move to the next item** — never
idle.

### 4 · Reporting

Linear is the channel; there is no relay.

- **Every fix:** a line in `docs/audits/2026-07-full/remediation-log.md` (same PR)
  plus `Decision:` in the PR body
- **End of each batch:** the consolidated SYNC is written as a **comment on the
  card**
- **Finished item:** state → **Done**, batch summary as a comment on that card
- **Blocked item:** state → back to **Backlog**, a comment explaining **why** in
  one paragraph, then straight to the next item
- **Needs Sapir's hands** (secrets · `.github/` · Railway · GitHub settings · VRT
  baselines): label **`not-cc`**, comment **exactly** what she must do, move on
- Sapir checks staging when she checks. **Her revert is final**, and the pattern
  enters never-again
- Linear cards are opened **only for exceptions** (hard stops) — not for routine
  work. A blocked item returns to Backlog rather than becoming a new card

Queue selection itself is defined in
[`.claude/rules/workflow.md`](../../.claude/rules/workflow.md) → *"Working the
queue"*: `state = In Progress · team = Mehamakor · labeled cc-queue`, in priority
order. **Opt-in, not opt-out** (MEH-1760) — forgetting to label must cause
inaction, never unintended work.

## Consequences

**What this buys:** findings stop queuing behind a human. GREEN/YELLOW work
merges as it is found; RED work merges once it has proved itself.

**What it costs:** review moves after the fact. A wrong merge reaches staging
before anyone looks at it — which is why §3's hard stops are a closed list and
why §2.6 exists, since an author writing both a fix and its proof will otherwise
write a proof his fix satisfies.

**What it does not cover:** the `.claude/autonomy-cache.json` mechanism, whose
entries stop at MEH-545 and classify nothing currently in flight. Whether it is
superseded by this ADR or retained with a staleness guard is an open decision
(MEH-1761 §4 item 2, MEH-1756) and is deliberately **not** settled here.

## Related

- **MEH-1741** — the decision this ports; **MEH-1761** — the renumbering, and the
  evidence that the citation resolved to the wrong file silently
- **ADR-016 v2** / MEH-1074 — the GREEN/YELLOW baseline this extends
- **ADR-028** — QA gates per tier
- **ADR-017** — *JWT access token in localStorage*. Unrelated; named here only
  because it is the number this decision was wrongly cited as
- **MEH-1030** — the same class: a registry that stops matching and disables
  itself with no error
