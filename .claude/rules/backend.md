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
`producer_locations.lat` / `producer_locations.lng` float columns — the
nearest row per business (`producer_queries.py::haversine_min_km`, MEH-1402),
with **no fallback** to the legacy `producers.lat/lng` mirror since MEH-1938
chunk 5a (the mirror carries `LEGACY(2026-10-15)` ahead of its drop). PostGIS is not
installed on Railway's stock PostgreSQL — adding it would break the
deploy. **Never add PostGIS.** `scripts/checks/prose-rules-guard.sh` (R4) fails a geoalchemy2 import,
a postgis `CREATE EXTENSION` or a postgis/geoalchemy dependency. _(Platform claim,
as of 2026-08-03 and unverifiable from the sandbox, which cannot reach Railway.)_

---

## Anthropic client init

**Always pass `http_client=anthropic.DefaultHttpxClient()`.** Enforced by
`tests/test_anthropic_http_client.py`, which holds the full set of call sites
and builds each client for real. Since anthropic 1.0 the SDK runs on httpx2
and raises `TypeError` at construction on a plain `httpx.Client` (the bump to
2.10, #5154). `DefaultHttpxClient` is the SDK's own re-export, so it follows
whatever HTTP package the SDK uses. Pass `timeout=` to it, not to httpx.

```python
anthropic.Anthropic(
    api_key=settings.anthropic_api_key,
    http_client=anthropic.DefaultHttpxClient(),
)
```

Don't "clean up" the
kwarg — AI features silently break (the error is caught by the fail-open
path, so there's no 5xx warning you). Full trap:
[docs/LOCKED_DECISIONS.md](../../docs/LOCKED_DECISIONS.md).

---

## AI fail-open

If `ANTHROPIC_API_KEY` is missing or any Anthropic call raises:
- moderation lets the item through as if `APPROVED` (a review stores no
  verdict, NULL, so its next save re-checks — MEH-2390)
- chat returns a friendly Hebrew "offline" message

Never crash the user flow on AI failure. This is the mechanism that
masks the Anthropic `http_client` bug above — be careful when modifying
either surface.

---

## Email via Resend (not SMTP)

Railway blocks outbound SMTP (`25`/`465`/`587`; as of 2026-08-03, unverifiable
from the sandbox). All email goes through
`backend/app/services/email.py` → `send_email()` → Resend HTTP API.
Fail-open if `RESEND_API_KEY` is unset. **Never revert to `smtplib`.** An `import smtplib` in `backend/app` fails
`scripts/checks/prose-rules-guard.sh` (R4).

---

## Docs update rule (workflow rule 12)

Which doc a backend PR updates is the one table in workflow.md rule 11
(DATA.md, `.ai/diagrams/`, STATE_MACHINES, SYSTEM_MAP).
