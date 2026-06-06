# WhatsApp delivery handling — Phase 0 (2026-06, AUD-009/010)

Read-only discovery. Batch-4 did not produce a discovery doc, so this was
authored from a direct read of the send layer + every call site.

## Current send layer — `backend/app/services/whatsapp.py`

- `send_text(to, body) -> bool` and `send_template(to, template) -> bool`.
- Both funnel through `_post(payload, kind, to) -> bool` which does
  `httpx.post(...)` then `r.raise_for_status()` and `return True`.
- **Bug class AUD-009/010:** `_post` treats **any** non-error HTTP status
  (including a Graph `200` whose body carries an `error` object, or a
  `200` that only means *accepted/queued* — never *delivered*) as success.
  Meta returns `200 {"messages":[{"id":"wamid..."}]}` the instant the
  message is **queued**; true delivery arrives later via webhook. So
  `True` today means "queued", not "delivered" — the name over-claims.
- The response **body is discarded entirely** — the `wamid` (message id)
  and any `error.code`/`error.message` are never read or logged.

## Call sites (all consume the bool — contract must hold)

| Caller | Line | Uses bool as |
|---|---|---|
| `auto_reply_watchdog.py` | 174 | `ok = send_template(...)` → retry/skip decision |
| `rating_dispatcher.py` | 141 | `if not send_text(...)` → keep retry-eligible |
| `auth_notifications.py` | 77,113,134 | `ok = send_template / send_text` |
| `routers/admin.py` | 801 | admin reply (fire-and-forget) |
| `routers/producer_me.py` | 697 | OTP send (returns bool to caller) |
| `routers/alerts.py` | 212 | alert (fire-and-forget) |

**No existing delivery-status DB column.** The MEH-509 webhook receiver
(`/webhook/whatsapp`, `router_registry.py:78`) is the inbound side; there
is no outbound-status persistence today.

## Largest SCHEMA-FREE slice (this PR)

1. Parse the Graph response body: extract `messages[0].id` (wamid) on
   success; extract `error.code`/`error.message` on failure.
2. Stop equating HTTP-200 with "delivered" — classify into three
   outcomes: `accepted` (queued, ok=True), `failed` (ok=False),
   `window_expired` (ok=False; the 24h customer-service-window codes
   `{470, 131047, 131051}`).
3. Structured per-outcome logging (outcome, wamid, error code, masked
   phone, http status).
4. Keep `send_text`/`send_template` returning **bool** (`result.ok`) so
   every call site above is byte-compatible — failures are *surfaced*
   via the new structured logs + the unchanged bool the watchdog/admin
   path already branches on.

Template-vs-freeform branching is respected: `send_text` (freeform, 24h
window) vs `send_template` (business-initiated) stay separate entry
points; both share the new classifier.

## Sapir-terminal (schema) — NOT in this PR

Persisting delivery status needs a column. The Alembic revision is
written verbatim into the PR body for Sapir to apply (no files created
under `alembic/` this session).
