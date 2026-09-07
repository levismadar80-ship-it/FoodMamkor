# `datetime.utcnow()` / naive `datetime.now()` — per-site classification (MEH-1890)

**Date:** 2026-09-03 · **Base:** `origin/staging` @ `186adfd8` · **Scope:** `backend/**/*.py`, excluding `backend/alembic/versions/` · **Runtime:** Python 3.11.15 (venv), SQLAlchemy + psycopg2 on Postgres

The card (MEH-1890, post-launch, GREEN) asks for a *classified* modernisation, not a sweep: the
per-site table comes first, because a naive/aware comparison against a DB-loaded value is exactly
where a blind `utcnow()` → `now(timezone.utc)` replacement breaks. This document is that table.
Every count below is derived from a grep whose command and output are shown — none is stated by hand.

## 1. Inventory (derived)

```
$ grep -rn "utcnow(" backend --include="*.py" | grep -v "alembic/versions" | wc -l
55          # 53 in backend/app (48 call sites + 5 comment lines) + 2 in backend/scripts

$ grep -rn "utcnow(" backend/app | grep -v "^.*#" | wc -l          # the card's absence-assertion formula
48          # BEFORE Phase 1 — call sites in backend/app, comment lines excluded

$ grep -rnE "datetime\.now\(\s*\)" backend --include="*.py" | grep -v "alembic/versions" | wc -l
0           # no naive datetime.now() anywhere — every datetime.now( carries a tz argument

$ grep -rnE "import datetime as|^import datetime$" backend/app --include="*.py" | wc -l
0           # no module-style/alias imports, so the two regexes above have no blind spot

$ grep -rnE "datetime\.utcnow\b" backend --include="*.py" | grep -v "alembic/versions" | grep -v "utcnow(" | cut -d: -f1 | sort | uniq -c
     45 backend/app/models/models.py          # default=datetime.utcnow / onupdate=datetime.utcnow (callable refs — NOT matched by "utcnow(")
      1 backend/app/services/pending_nudge.py  # :256, a docstring

$ grep -rnE "datetime\.utcnow\b" backend --include="*.py" | grep -v "alembic/versions" | grep -v "utcnow(" | grep -c "timezone=True"
0           # every column default sits on a naive DateTime column

$ grep -n "DateTime" backend/app/models/models.py | grep -c "timezone=True"   →  15   # tz-aware columns
$ grep -n "DateTime" backend/app/models/models.py | grep -vc "timezone=True"  →  61   # naive columns (incl. the import line)
```

**Total addressable sites: 48 call sites in `backend/app` + 2 in `backend/scripts` + 45 column-default
callable references in `models.py` = 95.** The card's "~50" matches the `utcnow(` call sites only; the
45 `default=datetime.utcnow` references are a second population the card's grep does not see.

## 2. Why the classes are what they are — the driver semantics that decide safety

The 15 aware columns (`DateTime(timezone=True)`, e.g. `submitted_for_review_at`, `password_changed_at`,
`verified_at`) are already written with `datetime.now(timezone.utc)` and are not in this table. Every
site below touches one of the **61 naive** `DateTime` columns, and for those:

| Path | naive `utcnow()` (today) | aware `now(timezone.utc)` (proposed) |
|---|---|---|
| Python compare vs ORM-loaded value (`col < now`) | works — both naive | **`TypeError: can't compare offset-naive and offset-aware datetimes`** → 500 |
| Python write (`row.col = now`) | stored as-is | psycopg2 sends `'…+00:00'::timestamptz`; Postgres casts to `timestamp` **through the session `TimeZone`** and drops the offset. Byte-identical only if the session TZ is UTC. Railway's PG `TimeZone` is **not verifiable from this sandbox** (MEH-2090) — so it is a per-column, per-environment check, not a safe default. |
| SQL compare (`Model.col >= cutoff`) | works | same server-side cast as the write; same session-TZ dependence |
| Log / response field only | naive ISO string | aware ISO string with `+00:00` — parsed differently by `new Date()` on the client |

Only a value that is **never compared with a naive loaded value, never written to a naive column, and
never serialised beside naive sibling values** is safe to flip. That is the "UTC-instant (modernise)"
class, and it turns out to be very small.

**Class key:** `UTC` = UTC-instant (modernise) · `UTC-left` = UTC-instant semantically but left, reason given ·
`ISR` = Israel-day (MEH-1883 family — flag only) · `COL` = write into a naive storage column ·
`CMP-py` = Python comparison against a DB-loaded naive value · `CMP-sql` = SQL comparison against a naive column ·
`DEF` = SQLAlchemy `default=`/`onupdate=` callable.

## 3. The table — `backend/app` call sites (48)

Line numbers are as of `origin/staging` @ `186adfd8` (pre-change). Column flag = the `timezone=` setting of the naive column the value meets.

| # | file:line | used for | column(s) it meets · flag | class | verdict |
|---|---|---|---|---|---|
| 1 | `app/auth.py:44` | JWT access-token `exp` claim | none — joserfc `convert_claims` (`_rfc7519/claims.py:21`) turns any `datetime` into `calendar.timegm(claim.utctimetuple())`, which is offset-correct for aware and UTC-correct for naive | **UTC** | **modernised** (now `:44-46`) |
| 2 | `app/auth.py:68` | JWT refresh-token `exp` claim | none — same path as #1 | **UTC** | **modernised** (now `:70-72`) |
| 3 | `app/auth.py:122` | `_maybe_bump_last_active` throttle: `now - user.last_active_at`, then `user.last_active_at = now` | `users.last_active_at` · `DateTime` naive (`models.py:669`) | CMP-py + COL | left: Python compare against loaded naive + write to naive column |
| 4 | `app/services/producer_queries.py:217` | "new business" badge age: `utcnow() - producer.created_at` | `producers.created_at` · naive (`:440`) | CMP-py | left: subtraction against loaded naive |
| 5 | `app/services/auto_reply_watchdog.py:121` | watchdog `now` default → `cutoff` for `InboundMessage.received_at >= cutoff` | `inbound_messages.received_at` · naive (`:2197`) | CMP-sql | left: server-side cast, session-TZ dependent; tests pass `now=` explicitly |
| 6 | `app/services/producer_listing.py:463` | `?kosher=` filter: `kashrut_expires_at > utcnow()` | `producers.kashrut_expires_at` · naive (`:455`) | CMP-sql | left: the card's own worked example — self-consistent on the UTC axis with #45 |
| 7 | `app/services/producer_listing.py:470` | same, expired arm `<=` | same | CMP-sql | left: as #6 |
| 8 | `app/services/rating_dispatcher.py:57` | `now or utcnow()` → `clicked_at <= cutoff` | `home_product_whatsapp_clicks.clicked_at` · naive (`:1824`) | CMP-sql | left: server-side cast; tests inject `now=` |
| 9 | `app/routers/producers.py:685` | `_servable_kashrut_certs`: `expires_at <= utcnow()` | `producers.kashrut_expires_at` · naive | CMP-py | left: Python compare against loaded naive |
| 10 | `app/routers/admin_outreach.py:158` | `lead.prefill_token_expires_at = utcnow() + 7d` | `outreach_leads.prefill_token_expires_at` · naive (`:789`) | COL | left: naive column write |
| 11 | `app/routers/admin_outreach.py:225` | `lead.prefill_token_expires_at < utcnow()` | same | CMP-py | left: pairs with #10 |
| 12 | `app/routers/auth.py:307` | register: `verify_expires` → `email_verify_expires` | `users.email_verify_expires` · naive (`:733`) | COL | left: naive column write |
| 13 | `app/routers/auth.py:805` | producer register: same as #12 | same | COL | left |
| 14 | `app/routers/auth.py:1370` | forgot-password: `reset_token_expires_at = utcnow() + 1h` | `users.reset_token_expires_at` · naive (`:682`) | COL | left |
| 15 | `app/routers/auth.py:1399` | reset: `reset_token_expires_at < utcnow()` | same | CMP-py | left: pairs with #14 |
| 16 | `app/routers/auth.py:1405` | `[RESET] token_expired … now=%s` log argument | none | UTC-left | left: log-only mirror of #15 two lines above — an aware `now=` beside a naive `expires=` would make the log misstate which clock decided the 410; moves with the column |
| 17 | `app/routers/auth.py:1448` | verify-email: `email_verify_expires < utcnow()` | `users.email_verify_expires` · naive | CMP-py | left: pairs with #12/#13 |
| 18 | `app/routers/auth.py:1454` | `[VERIFY-EMAIL] token_expired … now=%s` log argument | none | UTC-left | left: same reasoning as #16, mirrors #17 |
| 19 | `app/routers/auth.py:1476` | resend-verify: `expires = utcnow() + 24h` | `users.email_verify_expires` · naive | COL | left |
| 20 | `app/routers/referrals.py:45` | `Referral(created_at=utcnow())` | `referrals.created_at` · naive | COL | left |
| 21 | `app/routers/admin_whatsapp.py:61` | undelivered window: `OutboundMessage.created_at >= cutoff` | `outbound_messages.created_at` · naive (`:2254`) | CMP-sql | left |
| 22 | `app/routers/reviews.py:402` | `review.reply_at = utcnow()` | `reviews.reply_at` · naive (`:1667`, comment there says naive on purpose) | COL | left |
| 23 | `app/routers/category_requests.py:119` | `row.reviewed_at = utcnow()` | `category_requests.reviewed_at` · naive (`:2007`) | COL | left |
| 24 | `app/routers/producer_name_requests.py:165` | `row.reviewed_at = utcnow()` | `producer_name_requests.reviewed_at` · naive (`:2049`) | COL | left |
| 25 | `app/routers/group_buys.py:129` | `gb.funded_notified_at = utcnow()` (comment at `:128` says aware breaks comparisons) | `group_buys.funded_notified_at` · naive (`:1891`) | COL | left |
| 26 | `app/routers/group_buys.py:159` | join: `gb.deadline < utcnow()` | `group_buys.deadline` · naive (`:1877`) | CMP-py | left |
| 27 | `app/routers/group_buys.py:218` | cancel/leave: `gb.deadline < utcnow()` | same | CMP-py | left |
| 28 | `app/routers/group_buys.py:266` | create: `data.deadline <= utcnow()` — `schemas.py:3663` strips tz from the request value **because** this compare is naive | request value, naive by validator | CMP-py | left: validator + endpoint are a matched naive pair |
| 29 | `app/routers/producer_me.py:898` | `producer.last_active_at = utcnow()` | `producers.last_active_at` · naive (`:441`) | COL | left |
| 30 | `app/routers/producer_me.py:945` | same | same | COL | left |
| 31 | `app/routers/producer_me.py:995` | same | same | COL | left |
| 32 | `app/routers/producer_me.py:1026` | dashboard: `ProducerWhatsAppClick.clicked_at >= week_ago` | `producer_whatsapp_clicks.clicked_at` · naive (`:1789`) | CMP-sql | left |
| 33 | `app/routers/producer_me.py:1077` | city rank: `ProducerPageView.created_at >= cutoff_30d` (rolling 30d; the day-dedup uses `israel_day` separately) | `producer_page_views.created_at` · naive (`:1757`) | CMP-sql | left |
| 34 | `app/routers/producer_me.py:1141` | `_count_in_window`: `time_col >= cutoff` | several naive analytics columns | CMP-sql | left |
| 35 | `app/routers/producer_me.py:1214` | new followers: `Favorite.created_at >= week_ago` | `favorites.created_at` · naive | CMP-sql | left |
| 36 | `app/routers/producer_me.py:1375` | weekly trend: `created_at >= prev_start`, `< prev_end` | `producer_page_views.created_at` · naive | CMP-sql | left |
| 37 | `app/routers/producer_me.py:1459` | OTP: `expires = utcnow() + 10m` → `PhoneOtpToken.expires_at` | `phone_otp_tokens.expires_at` · naive (`:1944`) | COL | left |
| 38 | `app/routers/producer_me.py:1537` | OTP confirm: `PhoneOtpToken.expires_at > utcnow()` | same | CMP-sql | left: pairs with #37 |
| 39 | `app/routers/admin_extra.py:116` | `AdminUserOut(created_at=u.created_at or utcnow())` — response fallback | none written; serialised beside naive sibling rows | UTC-left | left: an aware fallback would serialise with `+00:00` while every real row is naive — one list, two clock formats; the fallback only fires on a NULL `created_at` |
| 40 | `app/routers/admin_extra.py:426` | admin analytics: `now.replace(day=1)` **calendar-month buckets** + `created_at >= ref` | `producers.created_at`, `users.created_at` · naive | **ISR** (+ CMP-sql) | flag only — month boundaries taken from the UTC clock; same family DATA.md's MEH-1883 note deliberately left unswept (`admin_extra.py` 30-day windows) |
| 41 | `app/routers/admin_extra.py:685` | dashboard `week_ago` vs several naive `created_at` columns | naive | CMP-sql | left |
| 42 | `app/routers/reports.py:141` | `report.resolved_at = utcnow()` | `reports.resolved_at` · naive (`:1446`) | COL | left |
| 43 | `app/routers/events.py:65` | `EventOut(created_at=event.created_at or utcnow())` — response fallback | none written | UTC-left | left: same reasoning as #39 |
| 44 | `app/routers/admin_kashrut.py:84` | approve badge: `kashrut_expires_at < now`, then writes `kashrut_verified_at`/`kashrut_expires_at` | `producers.kashrut_verified_at`, `kashrut_expires_at` · naive (`:454-455`) | CMP-py + COL | left: the writer half of the #6/#7 pair — must move together |
| 45 | `app/routers/admin_kashrut.py:178` | expiry reminders: `kashrut_expires_at >= now`, `<= horizon` | same | CMP-sql | left |
| 46 | `app/routers/whatsapp_webhook.py:627` | status callback: `{"updated_at": utcnow()}` bulk update | `outbound_messages.updated_at` · naive (`:2259`) | COL | left |
| 47 | `app/routers/whatsapp_webhook.py:633` | same, other branch | same | COL | left |
| 48 | `app/routers/alerts.py:182` | 24h cap: `AlertLog.sent_at >= cutoff` | `alert_log.sent_at` · naive (`:1319`) | CMP-sql | left |

### `backend/scripts` (2)

| # | file:line | used for | column · flag | class | verdict |
|---|---|---|---|---|---|
| S1 | `scripts/seed_demo_business.py:744` | demo group-buy `deadline=` | `group_buys.deadline` · naive | COL | left |
| S2 | `scripts/seed_demo_business.py:1002` | demo review `reply_at=` | `reviews.reply_at` · naive | COL | left |

### Column defaults — `models.py` (45 callable references)

All 45 `default=datetime.utcnow` / `onupdate=datetime.utcnow` references sit on `DateTime` columns
**without** `timezone=True` (derived: 0 of 45 match `timezone=True`). Class **DEF — column-default:
needs per-column check.** Not touched: changing a default to an aware callable is a write into a
naive column on every INSERT, i.e. the COL row above multiplied by every table. Several of these
columns also carry `server_default=text("now()")` (`:1050`, `:1162`, `:2157`, `:2160`, `:2197`, `:2254`),
which is Postgres session-time — a third clock the modernisation would need to reconcile.

## 4. Counts (derived from the table above — one row per site)

| class | `backend/app` | `scripts` | `models.py` refs |
|---|---|---|---|
| UTC-instant — **modernised** | **2** | 0 | – |
| UTC-instant — left (log mirror ×2, response fallback ×2) | 4 | 0 | – |
| Israel-day (MEH-1883 family, flag only) | 1 | 0 | – |
| COL — naive column write | 17 | 2 | – |
| CMP-py — Python compare vs loaded naive (incl. 2 that also write) | 10 | 0 | – |
| CMP-sql — SQL compare vs naive column | 14 | 0 | – |
| DEF — column default, needs per-column check | – | – | 45 |
| **total** | **48** | **2** | **45** |

## 5. Phase 1 — what changed

`backend/app/auth.py` only: the two JWT `exp` computations (`create_access_token`, `create_refresh_token`)
now read `datetime.now(timezone.utc) + timedelta(...)`. `timezone` was already imported (`auth.py:3`) —
the `iat` claim on the next line has used `datetime.now(timezone.utc)` since MEH-326. Ruff check + format clean.

**Behaviour-neutral, proven on the serialiser rather than assumed:** a probe encoding an `exp` 15 minutes
out with both forms, decoding, and subtracting `int(time.time()) + 900`, printed `0 / 0` under `TZ=UTC`
and `0 / 0` under `TZ=Asia/Jerusalem` — joserfc's `utctimetuple()` path makes the two forms identical
in every TZ. Nothing in `backend/app` reads `exp` back as a datetime (`grep -rnE '\["exp"\]|\.get\("exp"' backend/app` → 0).

**Absence assertion (the card's formula, derived):**

```
$ grep -rn "utcnow(" backend/app | grep -v "^.*#" | wc -l
48    # before
46    # after
```

**Tests** (`PYTHONPATH=backend … -m pytest tests/test_api.py tests/test_auth.py tests/test_auth_email_notify.py
tests/test_expansion_auth_jwt.py tests/test_optional_auth_contract.py tests/test_expansion_admin_authz.py -q -p no:warnings`):

- before: `357 passed, 4 skipped, 1 rerun in 309.86s`
- after: `357 passed, 4 skipped in 194.25s` (run on an isolated DB, `PYTEST_XDIST_WORKER=gw62` → `mehamakor_test_gw62`, after a first attempt on the shared `mehamakor_test` deadlocked behind a foreign `idle in transaction` session — no failures introduced, 0 sites reverted)

## 6. What this leaves, and the shape of the follow-up (not done here)

46 call sites + 45 defaults stay naive **on purpose**. They are internally consistent on the UTC axis
(the card's own finding for `kashrut_expires_at`), and every one of them meets a naive column, so
modernising any single site in isolation is the bug this table exists to prevent. The deprecation
pressure (`utcnow()` is deprecated from Python 3.12; this venv is 3.11) can be answered without touching
the columns by the naive-preserving spelling `datetime.now(timezone.utc).replace(tzinfo=None)` — same
bytes, no column, no compare change. That is a mechanical sweep with a different target expression than
the card prescribes, so it is recorded here as the option and not applied. Converting the columns
themselves (`timezone=True`, Expand-Contract per ADR-007) is the real modernisation and is its own ticket,
table-by-table, with #6/#7/#44/#45 (`kashrut_expires_at`) and #12–#19 (`users.*_expires`) as the two
matched read/write pairs that must move atomically.
