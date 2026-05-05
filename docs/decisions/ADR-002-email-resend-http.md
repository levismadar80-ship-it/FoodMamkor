# ADR-002: Email via Resend HTTP API, not SMTP

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Smadar Levi
**Source:** Railway egress firewall; CHANGELOG.md:643 (initial cutover), CHANGELOG.md:615 (MEH-150 cleanup), docs/LOCKED_DECISIONS.md:62-78

## Context
Producer registration was hanging on `שולחת...` because outbound SMTP
from Railway workers timed out. Railway blocks ports 25/465/587
(LOCKED_DECISIONS.md:67). `smtplib` worked locally and silently failed
in production — the worst combination for a notification path.

## Decision
All email goes through `backend/app/services/email.py` →
`send_email()` → Resend HTTP API over HTTPS/443. `smtplib` was removed
entirely; `SMTP_HOST/PORT/USER/PASSWORD` env vars deleted from
`.env.example` (CHANGELOG.md:615).

## Consequences
**Positive:** Works inside Railway's firewall; single HTTP path is easier to mock in tests; Resend dashboard provides delivery observability that SMTP didn't.
**Negative:** Hard dependency on Resend (single vendor); HTML body encoding edge cases — Resend's MTA applied quoted-printable wrapping that broke verify-email URLs at 76 chars (MEH-331, CHANGELOG.md:597).
**Mitigations:** Fail-open if `RESEND_API_KEY` is unset — sends are logged, never raised, so a broken notification never breaks the underlying flow (LOCKED_DECISIONS.md:73-75). `Content-Transfer-Encoding: base64` header on HTML parts to avoid QP line-wrapping (CHANGELOG.md:597).

## Alternatives considered
- Keep `smtplib` with Mailgun/SendGrid SMTP relay — rejected: Railway blocks the ports regardless of provider.
- Run a separate worker on a non-Railway host for mail — rejected: ops overhead + new failure mode for a feature that has a fail-open contract.
