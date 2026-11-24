# Locked Decisions

> **Status:** Being migrated to `docs/decisions/`. Entries here remain authoritative until each is promoted to an ADR. See [`docs/decisions/README.md`](./decisions/README.md).

Decisions locked after debugging pain — do not revert without opening a
new issue and getting explicit approval. The "why" and "the trap" sections
exist so future sessions don't accidentally re-introduce the original bug
during what looks like a harmless cleanup.

The one-line summaries in `CLAUDE.md` point here for full context.

---

## Railway runtime port = 8080 (not 8000)

**Decision:** Railway runtime port is `8080`, not `8000`.

**Why:** Railway injects `$PORT=8080` into the container. The Dockerfile
binds uvicorn to `${PORT:-8000}`, so it listens on `8080` in Railway and
`8000` locally. Both values are correct in their own context.

**Railway config:** service → **Settings → Networking → Target Port** must
be `8080`.

**The trap:** the `EXPOSE 8000` line in the Dockerfile is
documentation-only and misleading. **Do not copy it into Railway's port
settings.** A mismatch results in `502` errors with
`X-Railway-Fallback: true` on every request despite a healthy container —
the container is up, Railway just can't reach it.

**Full setup:** [docs/DEPLOYMENT.md](./DEPLOYMENT.md) §2.5 + §6 gotchas.

---

## Anthropic client: always pass `http_client=anthropic.DefaultHttpxClient()`

**Decision:** always initialize the Anthropic client with
`http_client=anthropic.DefaultHttpxClient()` (updated 22/11/2026, the
anthropic 0.107 → 2.10 bump, PR #5154; before that, `httpx.Client()`).

**Why:** originally, the anthropic 0.39 SDK called `httpx.Client(proxies=...)`
internally, which raises `TypeError` against httpx 0.28+, and passing our own
client bypassed that. Since anthropic 1.0 the SDK runs on httpx2 and raises
`TypeError` at construction when handed a plain `httpx.Client`, so the old
pattern now breaks the client it was meant to protect. `DefaultHttpxClient`
is the SDK's own re-export: it always matches the SDK's HTTP package.

**Pattern:**

```python
anthropic.Anthropic(
    api_key=settings.anthropic_api_key,
    http_client=anthropic.DefaultHttpxClient(),
)
```

**Files:** `backend/app/routers/chat.py`,
`backend/app/services/moderation_common.py` (`make_anthropic_client`, MEH-3619).

**The trap:** the `TypeError` is caught by the AI fail-open mechanism —
no user-facing 5xx, just a silent Hebrew "offline" message. A wrong client
appears to "work" in tests that mock the SDK but silently disables AI
features in production. `tests/test_anthropic_http_client.py` builds every
client for real so this reds in CI.

---

## Email via Resend (not SMTP)

**Decision:** all email goes through Resend HTTP API, not SMTP. `smtplib`
was removed entirely.

**Why:** Railway blocks outbound SMTP ports (`25`/`465`/`587`) — the only
way to send mail from a Railway worker is via an HTTP provider.

**Pattern:** `backend/app/services/email.py` → `send_email()` → Resend
HTTP API (HTTPS/443).

**Fail-open:** if `RESEND_API_KEY` is unset, sends are silently skipped
(logged, never raised). A broken notification must never break the
underlying flow.

**Never revert to `smtplib`.**

---

## No PostGIS

**Decision:** PostgreSQL on Railway without PostGIS. Distance via the
Haversine formula in raw SQL.

**Why:** Railway's stock PostgreSQL does not include the PostGIS
extension. Adding it would require a custom Dockerfile or a different
database service and would break the current Railway deployment.

**Pattern:** `producers.lat float`, `producers.lng float` + Haversine
in `backend/app/routers/producers.py`.

---

## AI fail-open

**Decision:** all Anthropic SDK calls must fail open — never crash the
user flow on AI failure.

**Pattern:**
- Missing `ANTHROPIC_API_KEY` → moderation lets the item through as if
  `APPROVED`; chat returns a friendly Hebrew "offline" message. (Reviews,
  MEH-2390: the review publishes, but its stored `ai_moderation_status` is
  NULL, not `APPROVED`, so an unchanged re-save is checked again. The user
  flow is identical.)
- Any `anthropic.*Error` → same fallback; log the error, return a
  graceful response.

**Why:** Anthropic API outages are external. Users should never see a
5xx because the AI is down. This pairs with the `http_client` kwarg
trap above — the fail-open path is what hides that bug, so be
especially careful with Anthropic client init changes.
