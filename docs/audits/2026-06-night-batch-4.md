# Overnight batch #4 — 2026-06-06 (night)

Autonomous batch: 2 small issues + 2 read-only Phase 0 discovery packages.
Sequential, each branch off fresh `staging`. No human input — blockers logged here, not paused on.

Sibling sessions running tonight (conflict-guard, untouched): map chunk 3 (PR #987
ChipScrollRow / map/**), test-expansion (PR #975), batch-2 (PRs #978/#980/#982/…).

---

## Ledger

| Item | Branch | PR | Trailer | Result |
|---|---|---|---|---|
| **MEH-692** auto-close forensics | `feature/meh-692-autoclose-forensics` | **#989** (draft) | `Closes` | ✅ Solved — root cause found |
| **MEH-688** he.json emoji LOCK v2 | `feature/meh-688-hejson-emoji-lock` | **#990** (draft) | `Refs` | ⚠️ **Sweep BLOCKED** — Discovery delivered |
| **Phase 0 A** WhatsApp delivery | this branch (`feature/night-batch-4-phase0`) | **this PR** (draft) | — | ✅ Discovery map delivered |
| **Phase 0 B** availability + tz | this branch | **this PR** (draft) | — | ✅ Discovery map delivered |

---

## MEH-692 — RESOLVED (PR #989)

All 5 PRs (#831–835) used the `Refs MEH-686` trailer correctly. The epic auto-closed
because the **literal magic-word string appeared inside the "Note on CHANGELOG entry"
prose** of #832/#833/#834/#835 — Linear parses the whole PR **body**, not just the
trailer. Decisive trigger **PR #834** (merge `13:32:02Z` → close `13:32:04Z`).
`git log --grep` confirms commit messages were clean. Rule 26/27 don't cover it →
proposed a new workflow-rule note (Sapir review). Detail:
`docs/audits/2026-06-meh692-forensics.md`.

## MEH-688 — SWEEP BLOCKED, Discovery delivered (PR #990)

**Why blocked, not skipped-silently:** the night-batch framed this as a small
strip-and-close. The full Linear spec + current file show otherwise. Parent
**MEH-657 (LOCK v2) already shipped** (PR #818, Done 2026-06-06): it swept A+B+D4+E
and **deferred the rest to dedicated tickets** — C→MEH-683, D1=KEEP, D2→MEH-685, and
flagged functional indicators (🟢🟠⏸ / ✡️ / ⚠️) + A/C-boundary badges as
**Sapir/ADR-gated** (Decision #7). A scan of the current `he.json` (65 emoji lines,
fully classified) finds **nothing un-gated left to strip losslessly**. A unilateral
delete would contradict MEH-657's locked semantic→Phosphor methodology. Closing the
epic would repeat the MEH-692 bug class. → `Refs MEH-688`, no he.json change.
**Unblock path for Sapir** in `docs/audits/2026-06-meh688-emoji-inventory.md`.

## Phase 0 A — WhatsApp delivery (this PR)

`docs/discovery/2026-06-whatsapp-delivery-phase0.md`. Current send path returns bool
only and discards Meta's `wamid`; webhook receiver exists but `statuses[]` are
parsed-then-dropped (`whatsapp_webhook.py:293-296`); no outbound table; no durable
retry. 3 options (A parse body / B + persist / C + delivery webhooks) with effort+risk;
5 open questions. Closes the PR #975 SURVIVED-mutant context (Graph-200-undelivered).
**No recommendation locked.**

## Phase 0 B — availability + timezone (this PR)

`docs/discovery/2026-06-availability-phase0.md`. **Primary risk: `schemas.py:591`
vacation auto-clear uses `date.today()` (container TZ) not Asia/Jerusalem** — the
correct constant `BUSINESS_HOURS_TIMEZONE` (`config.py:176-182`) exists but isn't used.
4 write paths mapped (admin form missing the required-`vacation_until` check that the
canonical endpoint has). Allowed-transitions: none enforced; proposal included but may
be over-engineering. 3 options + 5 open questions. **Zero edits.**

---

## Notes / deviations from the task brief

- **MEH-688 deviation:** brief said "strip … Closes MEH-688"; delivered Discovery +
  `Refs` instead. Rationale above — surfaced prominently in PR #990 and here for the
  morning review. Sapir can redirect (the draft makes no he.json change, so nothing to
  revert).
- All 4 deliverables turned out **docs-only** (MEH-688 sweep blocked; MEH-692 is
  forensics; Phase 0 are read-only). 3 branches / 3 draft PRs (#989, #990, this).
- Pre-push staging sync (Rule 25): each branch cut from `origin/staging` at batch start
  (HEAD == origin/staging, divergence 0); no append-log conflicts expected.
