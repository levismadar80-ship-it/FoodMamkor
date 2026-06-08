# Phase 0 — availability_state validation + timezone (prep for AUD-039/040)

**Date:** 2026-06-06 · **Mode:** STRICT READ-ONLY discovery — no code changed.
**Purpose:** map every write path to `availability_state` + the UTC-vs-Israel timezone
surfaces, so AUD-039/040 starts from evidence. Options + open questions; nothing locked.

---

## 1. Model — `backend/app/models/models.py`
- `availability_state` — `models.py:138-142` · `String(32)`, `nullable=False`,
  server_default `'accepting_orders'`. **Allowed (enum-like, no DB enum):**
  `accepting_orders | available_today | full_this_week | on_vacation`.
- `vacation_until` — `models.py:143-144` · `Date`, nullable, default NULL. Auto-cleared
  when past (at serialization time — see §3).
- Partial index `idx_producers_availability_state` — `models.py:221-227`
  (`WHERE availability_state != 'accepting_orders'`).
- There is **also a legacy pair** (`is_available_today`, `availability_status` with
  values `available|full|vacation`) kept in 7-day dual-write overlap.

## 2. Write paths + current validation
| # | endpoint / surface | file:line | validation today |
|---|---|---|---|
| 1 | `POST /producers/me/availability-state` (new, canonical) | `producer_me.py:342-376` | ✅ enum via Pydantic `AvailabilityStateUpdate` (`schemas.py:1607-1614`) + field validator `_validate_availability_state` (`schemas.py:452-459`); **requires `vacation_until` when state=`on_vacation`** (`producer_me.py:355`) |
| 2 | `POST /producers/me/availability-status` (legacy) | `producer_me.py:301-335` | manual enum check `:314`; nulls `vacation_until` when status≠vacation |
| 3 | `POST /producers/me/availability` (legacy daily toggle) | `producer_me.py:274-295` | **none** (boolean toggle); dual-writes to state |
| 4 | Admin form via `ProducerUpdate` | `schemas.py:378-486` (fields `:429-430`, validator `:452-459`) | ✅ enum validator, **but NO required-`vacation_until`-when-on_vacation check** (gap vs path 1) |

**Allowed-transitions:** none enforced anywhere — any valid state → any valid state.
There is no transition table; only per-value enum validation.

## 3. Timezone surfaces — UTC vs Israel (the AUD-039/040 core)
| surface | file:line | tz behavior | risk |
|---|---|---|---|
| **Vacation auto-clear** | `schemas.py:586-600` (compare `:591` `vacation_until < date.today()`) | **`date.today()` = system/container TZ, NOT explicit** | ⚠️ **PRIMARY RISK.** Railway container in UTC → boundary is UTC midnight, not Israel midnight. A vacation set to end "today" (Israel) can clear ~? hours early/late at the UTC boundary. |
| Friday strip window | `frontend/lib/friday-mode.js:13-21` (Thu 18:00 → Fri 14:00) | ✅ explicit `Intl.DateTimeFormat(..., {timeZone:"Asia/Jerusalem"})`, DST-safe | OK (client-side) |
| SW Friday notifications | `frontend/worker/index.js:29-52,105-126` | ✅ Asia/Jerusalem | OK |
| `BUSINESS_HOURS_TIMEZONE` | `backend/app/config.py:176-182` = `"Asia/Jerusalem"` | **defined but NOT used by the vacation auto-clear** (used by watchdog/onboarding scheduling) | ⚠️ the correct constant exists; `schemas.py:591` just doesn't use it |
| Dashboard date min | `frontend/.../producer/dashboard/page.js:293` `min=new Date().toISOString().slice(0,10)` | browser TZ | minor — UI min only |
| Admin form date min | `components/admin/ProducerForm.jsx:675-686` | browser TZ | minor |

### Concrete failure scenario (Friday 23:30 Israel, container UTC)
- Israel `Fri 23:30` = UTC `Fri 20:30` (summer, UTC+3). Same calendar date — low risk at that instant.
- The sharp case is **around midnight**: a producer sets `vacation_until = Fri (Israel)`.
  At Israel `Sat 00:30` it's UTC `Fri 21:30` → `date.today()` (UTC) still = Fri →
  vacation **not yet cleared** though the Israel date rolled over. Conversely at Israel
  `Fri 02:00` (UTC `Thu 23:00`) `date.today()` (UTC) = Thu → a Thu-ending vacation
  **already cleared** while still Thu-late in Israel. Net: up to a ~few-hour window where
  a producer shows on/off vacation incorrectly vs their local date.

## 4. Default-listing exclusion
- `backend/app/services/producer_listing.py` — `_apply_scalar_filters()` `:145-217`;
  the default-hide is `:172-179`: when no explicit `?availability_state=` filter,
  `q.filter(Producer.availability_state != "on_vacation")`. (MEH-291 Phase 3.) No tz
  logic — pure enum. Still reachable via slug/favorites/explicit filter.
- `FridayDeliveryStrip.jsx:49-50` fetches with `availability_state=available_today`.

## 5. Frontend read/write
- Self-service write: `producer/dashboard/page.js:109-132` (`setAvailabilityState`, POSTs path 1).
- Admin write: `components/admin/ProducerForm.jsx:655-686` (radios, no Zod; clears date when not on_vacation `:254`).
- Display: `AvailabilityBadge.jsx:30-84` (maps legacy+new states → color+key; normalizes unknown→available); `ProducerDetail.jsx:70-73` reads vacation; `lib/producer-format.js:17-20` formats `vacation_until`.

## 6. Allowed-transitions table — proposal (NOT locked)
Today: any→any. A minimal sane table (for discussion):
| from \ to | accepting_orders | available_today | full_this_week | on_vacation |
|---|---|---|---|---|
| accepting_orders | – | ✅ | ✅ | ✅ (needs date) |
| available_today | ✅ | – | ✅ | ✅ (needs date) |
| full_this_week | ✅ | ✅ | – | ✅ (needs date) |
| on_vacation | ✅ | ✅ | ✅ | – (or extend date) |
All transitions arguably valid → a transition table may be **over-engineering**; the
higher-value fix is (a) the timezone bug and (b) closing the admin-form
required-`vacation_until` gap. Flag for Sapir.

## 7. Options (effort / risk)
- **Option A — timezone fix only.** Replace `date.today()` at `schemas.py:591` with
  Israel-local "today" via `BUSINESS_HOURS_TIMEZONE` (zoneinfo). **S effort, Low-Med
  risk** (touches `ProducerDetailOut`/`ProducerListOut` serialization — a central
  schema; covered by `tests/test_api.py:1672-1874`). Highest value-per-risk.
- **Option B — A + close admin-form gap.** Add required-`vacation_until`-when-`on_vacation`
  to `ProducerUpdate` (parity with path 1). **S effort, Low risk.**
- **Option C — A + B + allowed-transitions enforcement.** Adds a transition guard on the
  write endpoints. **M effort, Med risk**; may be unnecessary (see §6).

## 8. Open questions for Sapir
1. Confirm container TZ on Railway (UTC assumed). If UTC, `schemas.py:591` is a real bug.
2. Is the auto-clear semantics "clear when Israel date > vacation_until"? (assumed yes)
3. Admin-form required-date gap (path 4) — fix in this scope?
4. Allowed-transitions — needed, or is any→any acceptable (§6)?
5. Should the legacy toggle/status endpoints (paths 2/3) be deprecated as part of this, or left in the dual-write window?

_Zero edits made. Nothing locked — for the morning decision._

---

## 9. Implementation decisions — AUD-039/040 (what shipped)

Resolves §7/§8 against the immovable merged mutation suite
(`tests/test_expansion_availability.py`, PR #975):

- **Option chosen ≈ B, tz on the WRITE path only.** §7 Option A (change
  `schemas.py:591` read-path auto-clear to Israel tz) was **rejected**:
  the expansion suite's `test_vacation_ending_today_is_not_auto_cleared`
  (AV-3) pins that boundary to `date.today()`, and since Israel is *ahead*
  of UTC, swapping to `israel_today()` would flakily break it in the
  late-UTC window. tz correctness therefore lands on the write path
  (reject a **past** `vacation_until` via `israel_today()`), where no test
  conflicts. Full read-path alignment = follow-up shipped together with an
  expansion-test update.
- **Transition table = fully permissive** (§6 verdict — "any→any
  acceptable"). Encoded explicitly in
  `availability_validation.ALLOWED_TRANSITIONS` (self-transitions allowed,
  unlike the §6 sketch's `–` diagonal) so an out-of-enum current state
  can't silently pass and future narrowing is one line.
- **Admin required-`vacation_until`-when-`on_vacation` (§8 Q3 / Option B
  gap, path 4): DEFERRED.** This PR adds only the narrow past-date guard
  to `ProducerUpdate`; the required-date parity with path 1 is left for a
  follow-up to avoid touching untested admin on_vacation flows.
- Helper: `app/utils/clock.py` reuses `config.BUSINESS_HOURS_TIMEZONE`
  (§3's "correct constant exists but unused" — now used).
