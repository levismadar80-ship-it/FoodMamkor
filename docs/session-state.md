# Session state — MEH-291 Phase 2 (BLOCKED)

> Written per workflow rule 14 + Phase 2 step 14. Resume with `/session-resume`.
> Last updated: 2026-05-04, end of Phase 2 partial session.

## Branch + PR

- **Branch:** `feature/meh-291-phase-2-backend` (off `staging` HEAD `0d90968`)
- **HEAD commit:** `7fd3efc` — `WIP feat(meh-291): Phase 2 backend partial — model + schemas + producer_me (BLOCKED)`
- **Draft PR:** https://github.com/levismadar80-ship-it/FoodMamkor/pull/470 — **DO NOT MERGE**
- **Predecessor PR (Phase 1):** #469 merged to staging at `0d90968` on 2026-05-04. Smadar verified backfill on staging psql:
  ```
  availability_state | count
  --------------------+-------
  accepting_orders   |    13
  available_today    |     1
  on_vacation        |     1
  (15 producers, 0 NULLs)
  ```

## Active blocker

PostToolUse lint-feedback hook (MEH-445) blocked further edits to `backend/app/routers/producer_me.py` after attempt #3. Cause: 4 PRE-EXISTING ruff findings documented in MEH-447 CHANGELOG as "Known baseline pollution, out of scope, will be filed as separate ticket".

```
F401 producer_me.py:31   — `HomeProductWhatsAppClick` imported but unused
F401 producer_me.py:139  — `app.models.Category` imported but unused
E712 producer_me.py:628  — `PhoneOtpToken.used == False`
E712 producer_me.py:662  — `PhoneOtpToken.used == False`
```

These were NOT introduced by Phase 2 work. The hook counter resets next session.

## Phase 2 deliverables — status

| # | Step | Status |
|---|---|---|
| 1 | Plan summary | ✅ Done |
| 2 | `models.py` add `availability_state` column | ✅ Done in `7fd3efc` |
| 3 | `schemas.py` field + validator + auto-clear | ✅ Done in `7fd3efc` |
| 4a | `producer_me.py` AVAILABILITY_STATES import | ✅ Done in `7fd3efc` |
| 4b | `producer_me.py` `_state_to_legacy` + `_legacy_to_state` helpers | ✅ Done in `7fd3efc` |
| 4c | `producer_me.py` toggle endpoint mirror | ✅ Done in `7fd3efc` |
| 4d | `producer_me.py` set-status endpoint mirror | ✅ Done in `7fd3efc` |
| 4e | `producer_me.py` NEW `POST /availability-state` endpoint | ✅ Done in `7fd3efc` |
| 4f | `producer_me.py` dashboard response (`~lines 248-258`) | 🛑 BLOCKED — needs `availability_state` field added to the `producer` dict |
| 5 | `producers.py` optional `?availability_state=` filter | ⏸️ Not started |
| 6 | `tests/test_api.py` 11 new test cases | ⏸️ Not started |
| 7 | `/adversarial-review` on 4 code files | ⏸️ Not started |
| 8 | `pytest tests/test_api.py` | ⏸️ Not started |
| 9 | `docs/DATA.md` update | ⏸️ Not started |
| 10 | `.ai/diagrams/db-schema.md` update | ⏸️ Not started |
| 11 | `docs/CHANGELOG.md` Phase 2 entry | ⏸️ Not started |
| 12 | Final commit | ⏸️ Pending lint resolution |
| 13 | PR ready-for-review | ⏸️ Pending |

## Decisions made this session (Smadar-approved Q1-Q5)

- **Q1 sequencing:** Option A — branched `feature/meh-291-phase-2-backend` off staging after Phase 1 merged.
- **Q2 enum location:** inline `Literal[...]` + module-level tuple `AVAILABILITY_STATES` in `schemas.py` (no new file). Tuple lives just before `ProducerUpdate` class.
- **Q3 Hebrew error:** `"תאריך חזרה לחופשה נדרש"` (verbatim) when `state='on_vacation'` without `vacation_until`.
- **Q4 default list filter:** Q4b — Phase 2 only adds the optional `?availability_state=` query param. Default `/producers` listing behavior UNCHANGED. Default-hide-`on_vacation` deferred to Phase 3 alongside frontend.
- **Q5 test file:** extend existing `tests/test_api.py` (no new file) to match the CI gate's `pytest tests/test_api.py` invocation.

## Recommended unblock — Option A

Per the PR #470 body: clean up the 4 baseline lint items inside this PR. Same precedent as MEH-447's `aac7ffe` baseline cleanup commit. Concrete fixes:

1. `producer_me.py:31` — drop `HomeProductWhatsAppClick` from the import.
2. `producer_me.py:139` — drop the in-function `from app.models import Category` (the import is unused; ProducerCategory is what's actually used on line 140).
3. `producer_me.py:628` — `PhoneOtpToken.used == False` → `PhoneOtpToken.used.is_(False)`.
4. `producer_me.py:662` — same as above.

Then resume Phase 2 step 4f (dashboard response) and continue through steps 5-13.

## Forbidden (still in effect)

- ✗ Editing `main.py` for schema (MEH-267 regression)
- ✗ Touching frontend (Phase 3)
- ✗ Touching column drops (Phase 4)
- ✗ Changing default `/producers` list behavior (Q4b decision)
- ✗ Adding new files beyond `tests/test_api.py` extension
- ✗ Combining Phase 1 migration with this PR (already merged separately)
- ✗ Skipping `/adversarial-review` on the 4 changed code files
- ✗ Pushing without `/adversarial-review` verdicts resolved

## Resume entry-point for next session

1. `/session-resume` → reads this file.
2. Confirm Smadar's unblock decision (Option A / B / C from PR #470 body).
3. If Option A: apply the 4 lint fixes to `producer_me.py`, then resume Phase 2 at step 4f.
4. Run `/adversarial-review` on all 4 code files before committing the completion.
5. Mark PR #470 ready for review only after `/adversarial-review` clean + `pytest tests/test_api.py` passes.
