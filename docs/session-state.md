# Session state — MEH-291 Phase 4 (plan only — held for soak)

> Written per workflow rule 14. Phase 4 is the final removal PR. Plan
> approved by Smadar 2026-05-05; **execution held** until preconditions
> below are met.
> Last updated: 2026-05-05, end of Phase 3 merge + Phase 4 planning.

## MEH-291 progress

| Phase | PR | SHA | Status |
|---|---|---|---|
| 1 — Alembic migration + backfill | #469 | `0d90968` | ✅ merged |
| 2 — backend model + endpoint + dual-write | #470 | `5aeef41` | ✅ merged |
| 3 — frontend 5 surfaces + default-hide vacation | #473 | `f686c75` | ✅ merged 2026-05-05 |
| **4 — drop legacy columns + endpoints + helpers** | TBD | TBD | ⏸️ **plan only — held for soak** |

## Phase 4 execution preconditions (ALL must be true before PR opens)

- [ ] **7-day staging soak complete** — earliest 2026-05-12 (Phase 3 merged 2026-05-05).
- [ ] **MEH-408 R2 backup layer live** — Phase 4 drops 2 columns from `producers`; backups are non-negotiable for destructive schema changes.
- [ ] **No dual-write divergence reported during soak** — Smadar spot-checks staging psql periodically; legacy + new columns must stay in sync via the dual-write mirror (Phase 2 helpers).
- [ ] **Producer-traffic check on the new endpoint** — production logs / Vercel preview show real `POST /producers/me/availability-state` writes landing on `availability_state` (i.e., the new endpoint is being exercised by actual producer users).
- [ ] **CI extends to migration+import round-trip** — Phase 4 PR's CI must run `alembic upgrade head` AND `python -c "from app.main import app"` against fresh Postgres in the same job. Catches the migration-success-but-app-import-failure window where DB has columns dropped but new code can't boot. Surfaced by deeper adversarial pass (NEW3); R2 backup is the recovery layer of last resort, this gate is the prevention layer.
- [ ] **Endpoint client audit during soak** — confirm via Railway logs that only the web dashboard hits `POST /producers/me/availability` (toggle) and `POST /producers/me/availability-status`. If any non-web caller appears (mobile app, integration, scraper), route them to deprecation responses (410 Gone) before Phase 4 ships. Surfaced by deeper adversarial pass (NEW7).

When all six preconditions are checked, Smadar issues `go execute` (with explicit override note OR post-soak greenlight). Do not branch, write Alembic revision, or open PR before that.

## Phase 4 scope (plan, frozen)

### Migration
- NEW: `backend/alembic/versions/<DATE>_<HHMM>_<NEW_REV>_meh_291_drop_legacy_availability.py`
- `down_revision='2a74fa41ceb1'` (Phase 1 head — staging now uses Phase 1's migration as the EXPECTED_REV, since Phases 2/3 added no new revisions).
- Bump `EXPECTED_REV` at `.github/workflows/pr-checks.yml:107` from `"2a74fa41ceb1"` → new SHA. `EXPECTED_TABLES=34` unchanged.
- Migration full content captured in chat-only code block (not on disk per Smadar's plan-only directive). Reverse-backfill on downgrade restores legacy columns + populates from `availability_state` via inverse CASE-WHEN tree.

### Backend code removals
| File | Lines | Action |
|---|---|---|
| `backend/app/models/models.py` | 84-91 | Drop `is_available_today` + `availability_status` columns |
| `backend/app/schemas/schemas.py` | 307, 320, 336-342, 403, 405, 454-466 | Drop legacy fields, validator, simplify auto-clear |
| `backend/app/routers/producer_me.py` | 115, 162-187, 190-216, 217-228, 230-258, 284-298, 337, 339 | Drop writable-field, helpers, legacy endpoints, dual-write block, dashboard fields |
| `backend/app/routers/producers.py` | 53-56, 86 | Drop `is_available_today` query param + kwarg |
| `backend/app/services/producer_listing.py` | 51, 294 | Drop `_SIMPLE_FILTERS` legacy entry + docstring mention |

### Frontend code removals / simplifications
| File | Action |
|---|---|
| `frontend/components/ProducerCard.jsx` | Simplify `availabilityDotColor` to read only `availability_state`; switch Friday-strip ribbon (`:347`) to new field |
| `frontend/components/AvailabilityBadge.jsx` | Drop legacy 3 keys from `STATUS_CONFIG`; reduce `CARD_HIDDEN_STATES` to `{accepting_orders}`; flip fallback to `accepting_orders` |
| `frontend/components/admin/ProducerForm.jsx` | Drop legacy-fallback ternary in form-init useEffect |
| `frontend/app/producer/[id]/ProducerDetail.jsx` | Simplify `isVacation` derivation |
| `frontend/app/producer/[id]/components/ProducerHeader.jsx` | Drop `||` fallback on AvailabilityBadge status prop |
| `frontend/app/producer/dashboard/page.js` | Drop legacy comment block |
| `frontend/lib/map-chips.js` | Drop obsolete comment line `:30` |

### Test cleanup
| File | Action |
|---|---|
| `tests/test_api.py` | Rewrite `TestVacationBadgeClear` (4 tests) to new state; drop `test_old_toggle_mirrors_to_state`, `test_old_status_mirrors_full_to_full_this_week`, `test_legacy_is_available_today_filter_still_works`; drop legacy assertions inside remaining `TestAvailabilityState` tests |
| `frontend/__tests__/ProducerCard.test.jsx` | Drop `is_available_today` from fixtures |
| `frontend/__tests__/ProducerStatusBanners.test.jsx` | Drop legacy fields from fixture |
| `frontend/__tests__/SettingsPage.test.jsx` | Drop legacy field from fixture |

### Docs
| File | Action |
|---|---|
| `docs/DATA.md` | Drop legacy endpoint + column rows |
| `.ai/diagrams/db-schema.md` | Drop legacy column rows from producers node |
| `docs/CHANGELOG.md` | Phase 4 entry — closes MEH-291 |
| `docs/MANUAL_TESTING.md` | Drop overlap-period test cases |
| `HANDOFF.md` | Closure bullet |

## Adversarial-review-style risk pass (12 candidates → 0 hard blockers)

Verified at plan time:
- F1 — slug routes / favorites / direct lookups consume `ProducerListOut` → `availability_state` only; no legacy reads.
- F2 — `?availability_state=` filter unchanged in Phase 4.
- F3 — analytics + admin + webhook surfaces grep clean of legacy refs.
- F11 — no CI gate hardcodes test count.

Advisory items (verify at execution):
- F4 — stale client caches (mitigated by 7-day soak).
- F8 — orphan `vacation_until` on non-vacation rows (benign; auto-clear handles).
- F10 — Friday-strip semantic shift from per-day boolean to durable enum (Smadar verifies on staging during soak).
- F12 — MEH-408 R2 backup must be live (precondition above).

## Resume entry-point for next session

1. `/session-resume` → reads this file.
2. Verify all 4 execution preconditions are checked.
3. If all green: branch `feature/meh-291-phase-4-drop-legacy` off staging, write the Alembic revision file (using the chat-block content as template, with fresh SHA from `secrets.token_hex(6)`), execute the file removals per the §1.2-1.9 plan, run `/adversarial-review`, push, open PR (NOT draft).
4. If any precondition is unmet: stop and report which one is blocking.

## Constraint reminders

- ✗ Do not skip the soak window without explicit override (`go execute`).
- ✗ Do not open Phase 4 PR before MEH-408 R2 backups are live.
- ✗ Do not bundle Phase 4 with any other ticket (MEH-291 closure scope only).
- ✗ Do not preserve "during overlap" comments in Phase 4 — the overlap is over.
