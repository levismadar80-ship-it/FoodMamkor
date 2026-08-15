# `railway.json` — point the deploy healthcheck at `/health/readiness` (MEH-1905 §6.1)

**Status:** staged for Sapir. `railway.json` is infra/production-deploy config —
ADR-032 §3.3 ("main / production deploy / release") is a hard stop for CC, and
the card itself marks this step 🔴 RED: *"CC מכינה, ספיר מיישמת."* Nothing below
was applied.

---

## Where the order-gate stands (checked before writing this doc)

The card's own instruction is explicit: **fix `seed()` first, move the probe
second** — flipping the healthcheck while `db_init_status` can still land on
`"failed"` would make Railway refuse deploys (`ON_FAILURE`, 10 retries) instead
of just under-reporting readiness the way `/health`'s hardcoded `"ok"` does today.

- **`MEH-2081` (the seed()/category hardcoded-id bug) — Done.** PR #2938 merged
  2026-08-14T20:43:05Z. Resolves categories by name instead of a hardcoded id;
  the failing-before/passing-after test is `tests/test_meh2081_seed_category_by_name.py`.
- **`startup.py` §6.3 log-line fix — already shipped**, verified live in this repo
  today: `startup.py:174-193`'s `except` block carries the corrected, non-alarming
  message (`"background DB init failed — create_all/seed did not complete..."`)
  with the MEH-1905 §6.3 explanation inline. No action needed here.
- **What is NOT verified from a CC sandbox, and cannot be:** whether a *fresh
  production deploy* has run **since** the MEH-2081 fix landed, and whether that
  deploy's `db_init_status` actually reached `"ready"`. The card's own 14/08
  measurement (`/health/readiness` → `503 db_init_failed` in both envs) predates
  the fix. Railway is unreachable from the CC sandbox (`*.up.railway.app` egress
  blocked — CLAUDE.md "Known Bug Patterns"), so this doc cannot re-check it.

**Recommended sequence, not a change to what the card already said:**

1. Confirm the next production deploy (carrying MEH-2081) actually completed and
   `GET /health/readiness` now returns `200 {"status":"ready",...}` — not `503`.
   If it's still `503`, the root cause the seed fix targeted was not the whole
   story; do **not** apply the patch below until it is `200`.
2. Only then apply the change below.

---

## The change

### Current (`railway.json:8`)

```json
    "healthcheckPath": "/health",
```

### Replacement

```json
    "healthcheckPath": "/health/readiness",
```

One line, one field. Everything else in `railway.json` (`healthcheckTimeout: 300`,
`restartPolicyType: ON_FAILURE`, `restartPolicyMaxRetries: 10`) is unchanged —
those govern how Railway reacts to the healthcheck's answer, not which endpoint
it asks.

### What changes behaviourally

- `/health` (the alias, `backend/app/routers/health.py:138-154`) keeps existing
  exactly as documented in its own docstring — "backwards-compat... preserves
  the pre-MEH-483 shape" — for any caller still hitting it directly. Nothing
  about the alias route itself needs to change; only which path Railway's own
  probe uses.
- Railway's deploy gate starts actually reflecting DB/seed health instead of
  the hardcoded `"ok"`. A future seed regression will show up as a refused
  deploy (loud, at deploy time) instead of a silently-serving app with
  `db_init_status: "failed"` in a log line nobody is watching (quiet, MEH-1905's
  whole finding).

### Rollback

Revert the one line back to `"/health"`. No migration, no data change, no other
file involved.

---

## Related

- MEH-1905 (this card) — full evidence trail, both PRs (#2611 Phase 0 doc,
  #2628 the §6.3 log-line fix)
- MEH-2081 — the seed()-by-name fix this patch's sequencing depends on
- `backend/app/routers/health.py` — the three routes (`/health/liveness`,
  `/health/readiness`, `/health` alias) and their docstrings
