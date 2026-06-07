# Phase 0 — WhatsApp delivery status (P1 prep for AUD-009/010 + survived mutants)

**Date:** 2026-06-06 · **Mode:** STRICT READ-ONLY discovery — no code changed.
**Purpose:** map the current send path so tomorrow's delivery-status work starts from
evidence, not assumptions. **No recommendation locked** — options for Sapir's morning call.

Cross-ref: PR #975 (mutation test-expansion) logged `whatsapp.py` Graph-200-undelivered
and outbound delivery-status persistence as **SURVIVED mutants / real holes** — there's
no behavior to test until a fix lands. This doc scopes that fix.

---

## 1. Current-state map (file:line)

### Transport layer — `backend/app/services/whatsapp.py`
| fn | lines | sends | response handling |
|---|---|---|---|
| `_post()` | `whatsapp.py:43-52` | generic POST → `graph.facebook.com/{ver}/{phone_number_id}/messages`, Bearer token, 10s timeout | `r.raise_for_status()`; catches `httpx.HTTPError` → logs masked warning → **returns `False`**. **Response body discarded.** |
| `send_text()` | `whatsapp.py:55-70` | free-form text (24h window only) | → `_post()` → bool only |
| `send_template()` | `whatsapp.py:73-98` | pre-approved template + components | → `_post()` → bool only |

**Meta's success body (currently thrown away):** `messages[0].id` = `wamid.…` — the
outbound message ID, the anchor for any delivery tracking. Captured nowhere.

### Call sites (callers)
| caller | file:line | type |
|---|---|---|
| `notify_producer_registered` | `auth_notifications.py:60-87` | template ProducerWelcomeV1 |
| `notify_producer_approved` | `auth_notifications.py:90-123` | template ProducerApprovedV1 |
| `notify_admin_new_producer` | `auth_notifications.py:126-141` | `send_text` to admin |
| `run_watchdog` | `auto_reply_watchdog.py:164-198` (send `:174`) | template Vacation/AfterHours |
| `_dispatch_rating_reminder` | `rating_dispatcher.py:99-144` | `send_text`; re-raises on `False` → retry next cycle |
| `_send_phone_otp` | `producer_me.py:682-697` | template OtpCodeV1 (MEH-754 switched from text) |
| `_send_whatsapp` (admin) | `admin.py:794-801` | `send_text` (`/admin/broadcast-whatsapp`) |
| `_send_whatsapp_alert` | `alerts.py:207-212` | `send_text` (favorite-alert push fallback) |

### Where a delivery-status field would live (NO schema change proposed — identification only)
- **No outbound-message table exists.** `InboundMessage` (`models.py:1199-1246`) is for
  *incoming* msgs (has `meta_message_id`, `bot_replied…`) — wrong semantic for outbound.
- Domain-owned candidates that already track a send: `HomeProductWhatsAppClick`
  (`models.py:613-632`, has `rating_sent`), `FavoriteAlert`.
- Greenfield option: a new `OutboundWhatsAppMessage` (anchor on `wamid`).

### 24h-window branch points
- **Everything business-initiated is template-based by design** (welcome/approval/OTP/
  watchdog). `send_text()` is free-form and documented as "24h window only"
  (`whatsapp.py:55-63`) but performs **no runtime window check** — relies on caller
  discipline. Remaining `send_text` users: rating prompts, admin notify, alert fallback.
- MEH-754 (`producer_me.py:688-696`) is the canonical lesson: text OTP never delivered to
  brand-new producers (never in a 24h session) → switched to template.

### Webhook / status-callback support
- Receiver **exists**: `whatsapp_webhook.py` — `GET /webhook/whatsapp` challenge
  (`:103-139`), `POST /webhook/whatsapp` (`:145-224`) with `X-Hub-Signature-256` HMAC.
- **Status events are received but intentionally NOT persisted** (`whatsapp_webhook.py:293-296`
  counts `value.statuses[]` then discards; header comment line 9: "Does NOT handle
  status/delivered/read receipts … no persistence in v1"). **Meta DOES send delivery
  webhooks** — the plumbing (signature verify, parse loop) is already there; only the
  `statuses[]` branch + a row to update is missing.

### Retry / queue
- **No durable queue / Celery.** FastAPI `BackgroundTasks` (one-shot, e.g.
  `auth.py:1086`), APScheduler periodic (`auto_reply_watchdog`), manual re-raise retry
  (`rating_dispatcher.py:140-144`). Watchdog sets `bot_replied=True` *before* send
  (`auto_reply_watchdog.py:165-171`) → fail-open, one-shot, no retry. Transient send
  failures are lost.

---

## 2. Gap list

1. `wamid` from Meta's success body is discarded → no key to correlate a status webhook to a send.
2. No outbound-message persistence → no audit trail; the `statuses[]` webhook branch has nothing to update.
3. `statuses[]` webhook payload parsed-then-dropped (`whatsapp_webhook.py:293-296`).
4. `send_text()` has no 24h-window guard → silent non-delivery class (the MEH-754 family) can recur for rating/admin/alert sends.
5. No retry on transient 5xx; no durable queue.

---

## 3. Implementation options (effort / risk — NO recommendation locked)

### Option A — parse response body only (capture `wamid`, log delivery intent)
- **Do:** in `_post()`, on success read `r.json()`, return the `wamid` (change signature `bool → str|None`); callers log it. No DB, no webhook.
- **Effort:** S (~half day). **Risk:** Low — central `whatsapp.py` signature change ripples to 8 callers (mutation tests in PR #975 cover the send-layer contract → update them).
- **Gives:** correlation id in logs; foundation for B/C. **Doesn't give:** queryable status.

### Option B — A + persist outbound status (new table or column)
- **Do:** A, plus persist each send (`OutboundWhatsAppMessage` on `wamid`, or extend domain models) with `status='sent'`. **Requires Alembic migration** (Expand-Contract per ADR-007).
- **Effort:** M (1–2 days). **Risk:** Med — schema change (RED-tier path, migration review), 8 call sites write rows.
- **Gives:** queryable "did we send X to producer Y" audit trail.

### Option C — B + consume delivery webhooks (sent/delivered/read/failed)
- **Do:** B, plus implement the `statuses[]` branch in `whatsapp_webhook.py:293-296`: look up by `wamid`, update `delivered_at/read_at/failed_at/failure_reason`.
- **Effort:** L (2–4 days). **Risk:** Med-High — Meta webhook contract + idempotency + signature already handled, but new state machine; needs Meta webhook subscription to `messages` field for statuses in the Meta app config (infra/Sapir).
- **Gives:** true delivery/read confirmation + failure forensics (closes the PR #975 SURVIVED holes properly).

---

## 4. Open questions for Sapir

1. Scope target for AUD-009/010 — is the goal **observability** (did it send / fail) or **delivery confirmation** (did the recipient receive/read)? That picks A/B vs C.
2. New table `OutboundWhatsAppMessage` vs extend existing domain models (per-caller columns)? Greenfield table is cleaner for a cross-cutting audit trail.
3. Is enabling Meta's **status webhook subscription** (app-config change) in scope, or infra-gated?
4. Should `send_text()` get a **runtime 24h-window guard** (or a "must be template" assertion for business-initiated paths) as a separate hardening item (MEH-754 follow-through)?
5. Retry/durability — out of scope for delivery-status, or bundled?

_No recommendation locked — these are for the morning decision._
