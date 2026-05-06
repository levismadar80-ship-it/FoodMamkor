---
paths:
  - "backend/**/*.py"
---

# Backend rules

FastAPI + SQLAlchemy + Pydantic patterns. Deeper decisions (why no
PostGIS, why Resend, why the Anthropic `http_client`) live in
[docs/LOCKED_DECISIONS.md](../../docs/LOCKED_DECISIONS.md). Full schema
and endpoint reference: [docs/DATA.md](../../docs/DATA.md).

---

## Stack

FastAPI + SQLAlchemy ORM + Pydantic v2 + PostgreSQL on Railway.

---

## No PostGIS

Distance queries use the **Haversine formula in raw SQL** against
`producers.lat` / `producers.lng` float columns. PostGIS is not
installed on Railway's stock PostgreSQL — adding it would break the
deploy. **Never add PostGIS.**

---

## Anthropic client init

**Always pass `http_client=httpx.Client()`.** The anthropic 0.39 SDK
calls `httpx.Client(proxies=...)` internally, which raises `TypeError`
against httpx 0.28+ (kwarg renamed from `proxies=` to `proxy=`).

```python
anthropic.Anthropic(
    api_key=settings.anthropic_api_key,
    http_client=httpx.Client(),
)
```

Used in `backend/app/routers/chat.py` and
`backend/app/services/home_product_moderation.py`. Don't "clean up" the
kwarg — AI features silently break (the error is caught by the fail-open
path, so there's no 5xx warning you). Full trap:
[docs/LOCKED_DECISIONS.md](../../docs/LOCKED_DECISIONS.md).

---

## AI fail-open

If `ANTHROPIC_API_KEY` is missing or any Anthropic call raises:
- moderation returns `APPROVED`
- chat returns a friendly Hebrew "offline" message

Never crash the user flow on AI failure. This is the mechanism that
masks the Anthropic `http_client` bug above — be careful when modifying
either surface.

---

## Email via Resend (not SMTP)

Railway blocks outbound SMTP (`25`/`465`/`587`). All email goes through
`backend/app/services/email.py` → `send_email()` → Resend HTTP API.
Fail-open if `RESEND_API_KEY` is unset. **Never revert to `smtplib`.**

---

## Docs update rule (workflow rule 12)

After any PR touching `backend/app/routers/**`, `backend/app/models/**`,
or `backend/app/auth.py` — update:

- [docs/DATA.md](../../docs/DATA.md) — schema + endpoint reference
- [.ai/diagrams/](../../.ai/diagrams/) — `auth-flow.md`, `db-schema.md`,
  `api-routes.md`

Keep them in sync. Drifted diagrams are actively misleading.
