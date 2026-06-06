# Availability validation + tz — Phase 0 (2026-06, AUD-039/040)

Read-only discovery. No batch-4 doc existed, so authored from a direct
read of every `availability_state` write path + the tz surfaces.

## Write paths for `availability_state` / `vacation_until`

| Path | File:line | Pre-AUD validation |
|---|---|---|
| New unified endpoint `POST /producers/me/availability-state` | `producer_me.py:344` | state ∈ enum (400); `on_vacation` requires `vacation_until` (422) |
| Legacy `POST /producers/me/availability-status` | `producer_me.py:306` | status ∈ {available,full,vacation} (400) |
| Legacy toggle `POST /producers/me/availability` | `producer_me.py:271` | none (boolean toggle, no date) |
| Admin `ProducerUpdate` (PATCH) | `schemas.py:378` | field-validators for state/status membership |

**Gap (AUD-039):** none of these rejected a **past** `vacation_until`. A
producer could set yesterday as the return date — it persists and then
immediately auto-clears, a confusing no-op.

**Gap (AUD-040 / tz):** "past" was nowhere determined in Israel time. The
server runs UTC on Railway, so any naive `date.today()` comparison drifts
from the producer's local date in the late-UTC window (UTC Fri 22:00 is
already Sat in Israel).

## Allowed-transition table (authored here)

The 4 states (`schemas.py:370`): `accepting_orders`, `available_today`,
`full_this_week`, `on_vacation`. A producer **owns** their availability,
so the domain permits **every** transition between the four — the matrix
is fully permissive **by design**:

| from \ to | accepting | available_today | full_this_week | on_vacation |
|---|---|---|---|---|
| accepting_orders | ✓ | ✓ | ✓ | ✓* |
| available_today | ✓ | ✓ | ✓ | ✓* |
| full_this_week | ✓ | ✓ | ✓ | ✓* |
| on_vacation | ✓ | ✓ | ✓ | ✓* |

\* `→ on_vacation` additionally requires a non-past `vacation_until`.

The matrix is **encoded explicitly** (`availability_validation.ALLOWED_TRANSITIONS`)
rather than left implicit so (a) a producer row carrying a state outside
the enum can't silently pass and (b) any future restriction is a one-line
edit, not a scattered router change. The teeth this PR adds are the
return-date invariants, not transition narrowing.

## tz decision — read vs write path

- **Write path** (this PR): "past return date" is computed with
  `israel_today()` (Asia/Jerusalem) — `app/utils/clock.py`, reusing the
  watchdog's `BUSINESS_HOURS_TIMEZONE`.
- **Read path auto-clear** (`schemas.py:591`, `vacation_until < date.today()`,
  boundary `<`): **intentionally LEFT on `date.today()`.** The merged
  mutation suite's `test_vacation_ending_today_is_not_auto_cleared`
  (AV-3) pins this boundary to `date.today()`; because Israel is *ahead*
  of UTC, switching it to `israel_today()` would flakily break that
  immovable test whenever CI runs in the late-UTC window. The safety net
  is not weakened — the tz correctness lands on the write path, where no
  conflicting test exists. Full read-path tz alignment is a follow-up that
  must ship together with an update to the (then-merged) expansion test.

## Friday strip / banner

`frontend/lib/friday-mode.js` already uses `Intl.DateTimeFormat({timeZone:
"Asia/Jerusalem"})` — DST-correct, no bug, and out of this session's
scope (frontend sweeps = batch-3). The backend listing exclusion
(`producer_listing.py:177-179`) is **state-based** (`!= "on_vacation"`),
not date/tz-based — nothing to fix. The tz boundary covered by the new
tests is the `israel_now()`/`israel_today()` primitive at Fri-23:30 Israel.
