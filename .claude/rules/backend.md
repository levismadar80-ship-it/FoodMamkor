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
_(Platform claim — **as of 2026-08-03, unverified**. Railway is unreachable from
a CC session: `*.up.railway.app` egress returns `CONNECT tunnel failed, 403`
(re-confirmed 2026-08-03), so no session can re-derive what the stock image
ships. Re-check from Sapir's terminal, not from here.)_

---

## Anthropic client init

**Always pass `http_client=httpx.Client()`.** *(The instruction is unchanged and
still binding — see the dated note below before quoting its rationale.)*
Historically: the anthropic **0.39** SDK called `httpx.Client(proxies=...)`
internally, which raises `TypeError` against httpx **0.28+** (kwarg renamed from
`proxies=` to `proxy=`).

> **Rationale re-checked 2026-08-03 (MEH-1861) — both version numbers above are
> stale.** Measured from `backend/pyproject.toml`: **`anthropic==0.107.1`** (not
> 0.39) and **`httpx==0.27.2`** — which is *below* 0.28, so the version pairing
> the paragraph describes is **not the pairing this repo currently runs**. The
> failure it names cannot fire against today's pins.
>
> **This is not a reason to drop the kwarg.** It means the guard has shifted from
> reactive to pre-emptive, and that **the `httpx==0.27.2` pin is now the thing
> holding the line** — a Dependabot bump to 0.28+ is exactly the change that
> would re-arm the original bug, and the explicit `http_client` is what makes
> that bump survivable. Treat both the pin and the kwarg as load-bearing, and do
> not "clean up" either. Whether anthropic 0.107.1 still constructs its default
> client the same way was **not** verified (no network from the CC sandbox to
> re-derive SDK internals) — **unverified as of 2026-08-03**.

```python
anthropic.Anthropic(
    api_key=settings.anthropic_api_key,
    http_client=httpx.Client(),
)
```

Used at **6 call sites** (enumerated 2026-08-03, MEH-1861 — this listed 2):
`routers/chat.py:173`, `routers/reviews.py:60`,
`services/home_product_moderation.py:70`, `services/experience_moderation.py:69`,
`services/producer_recipe_moderation.py:65`, `services/bio_generator.py:39`.
All six comply. Don't "clean up" the
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

Railway blocks outbound SMTP (`25`/`465`/`587`) — **as of 2026-08-03,
unverified**, same reason as the PostGIS note above: no CC session can reach
Railway to test a port. All email goes through
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
