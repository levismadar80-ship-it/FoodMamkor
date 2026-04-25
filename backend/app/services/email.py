"""Email delivery via Resend HTTP API.

Resend uses HTTPS (port 443) — works on Railway without any egress
firewall exceptions. The previous smtplib path failed silently on Railway
because ports 25/465/587 are blocked (Network is unreachable, errno 101).

Fail-open contract (same as the SMTP path it replaces):
  - If RESEND_API_KEY is not configured → debug log, no send.
  - If Resend raises → warning log, no exception propagates.
  - Empty `to` address → silent no-op.
"""
from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)

_FROM_ADDRESS = "מהמקור <noreply@mehamakor.online>"


def send_email(to: str, subject: str, body: str, html: str | None = None) -> None:
    """Send a plain-text (+ optional HTML) email via Resend. Always fail-open."""
    if not to:
        return
    if not settings.resend_api_key:
        logger.debug(
            "[EMAIL] RESEND_API_KEY not set — skipping send to %s (%s)", to, subject
        )
        return
    try:
        import resend  # lazy import — only installed when key is configured
        resend.api_key = settings.resend_api_key
        params: dict = {
            "from": _FROM_ADDRESS,
            "to": to,
            "subject": subject,
            "text": body,
        }
        if html:
            params["html"] = html
            # MEH-331 attempt #2: ask Resend's MTA to use base64 (not the
            # default quoted-printable) for the HTML part. QP wraps lines
            # at 76 chars by inserting "=\r\n", which truncates URLs in
            # href values mid-token. PR #347 (HTML <a href> body) didn't
            # fix it — QP encoding happens AFTER our HTML construction,
            # at the MTA layer. Untested whether Resend honors a
            # top-level CTE header for the HTML part; if not, fall back
            # to a short-code redirect (Option 1).
            params["headers"] = {"Content-Transfer-Encoding": "base64"}
        resend.Emails.send(params)
        logger.info("[EMAIL] Sent to %s", to.split("@")[0] + "***")
    except Exception as e:  # noqa: BLE001 — fail-open by design
        logger.warning("[EMAIL] Failed to send to %s: %s", to, e)
