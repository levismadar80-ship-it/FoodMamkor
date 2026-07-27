"""Email delivery via Resend HTTP API.

Resend uses HTTPS (port 443) — works on Railway without any egress
firewall exceptions. The previous smtplib path failed silently on Railway
because ports 25/465/587 are blocked (Network is unreachable, errno 101).

Fail-open contract (UNCHANGED by MEH-1613 — returns None on every path,
never raises, and no caller inspects the result):
  - If RESEND_API_KEY is not configured → no send.
  - If Resend raises → no exception propagates.
  - Empty `to` address → no send.

MEH-1613: fail-open is not the same as invisible. Every path above was
silent or near-silent — the key-missing case logged at DEBUG and the
Resend failure at WARNING, so an expired key meant zero emails, zero
alerts, and users waiting for verification links that never arrived.
Each swallow point now reports to Sentry and logs at ERROR.

What did NOT change: the signature, the return type, and all 20 call
sites (16 direct + 4 via experience_notifications._send_email). None of
them inspected the return value before this change and none does now —
verified by AST walk, not grep. Making a caller REACT to a failure is a
separate product decision (MEH-1613 §7), deliberately not taken here.
"""

from __future__ import annotations

import logging

from app.config import settings
from app.sentry import capture_background_exception

logger = logging.getLogger(__name__)

# MEH-1613: Sentry task tag for every event this module reports, so email
# delivery failures are one filterable stream (`background_task:email_send`).
_SENTRY_TASK = "email_send"

# MEH-1613: the missing-key condition is STATIC config, not a per-send event —
# it is either configured for the whole process or it is not. Reporting it on
# every send would emit one Sentry event per email and drown the signal in the
# exact outage it exists to surface. This latch reports it ONCE per process;
# the ERROR log below still fires every time, so nothing becomes invisible.
_missing_key_reported = False


def _mask(to: str | None) -> str:
    """Domain-only rendering of a recipient, for logs and Sentry.

    MEH-1613 privacy bar: presence and domain, never the full address and
    never the local part (local parts are frequently a person's full name).
    This is deliberately stricter than the pre-MEH-1613 lines it replaces —
    :28 and :55 logged the address in FULL, and the success line rendered
    the local part with the DOMAIN masked, which is the wrong half.
    """
    if not to:
        return "<no-recipient>"
    _, _, domain = to.rpartition("@")
    return f"***@{domain}" if domain else "***"


class _EmailNotSent(RuntimeError):
    """Sentry payload for a non-exception swallow point. NEVER RAISED.

    `capture_background_exception` (sentry.py:73) takes a BaseException, and
    two of the three swallow points here are config states rather than
    exceptions. Constructing one gives those states a typed, filterable
    Sentry event without inventing a second reporting mechanism.

    DO NOT raise this — send_email is fail-open and every caller relies on
    that. It is constructed and handed to the reporter, never propagated.
    """


def _report(exc: BaseException, *, to: str | None, subject: str, stage: str) -> None:
    """Report a swallowed send failure. Must never raise.

    Sentry capture goes BEFORE the log line: sentry.py:91-93 documents that
    a capture FOLLOWING a logging call can be dropped by event deduplication
    (getsentry/sentry-python#1468).

    `capture_background_exception` is already fail-open and non-raising by
    construction (sentry.py:100-103 swallows an absent SDK, :121-122 swallows
    everything else). The extra try/except here is not redundant defence of
    that helper — it also covers the logging call and this function's own
    string formatting. A reporting path that raised would convert a silent
    failure into a loud outage, which is strictly worse than the bug.
    """
    try:
        capture_background_exception(exc, task=_SENTRY_TASK)
        logger.error(
            "[EMAIL] NOT SENT (%s) to %s — subject=%r — %s: %s",
            stage,
            _mask(to),
            subject[:80],
            type(exc).__name__,
            exc,
        )
    except Exception:  # noqa: BLE001 — reporting must never break the caller
        pass


def send_email(to: str, subject: str, body: str, html: str | None = None) -> None:
    """Send a plain-text (+ optional HTML) email via Resend. Always fail-open."""
    # MEH-1613 swallow point 1/3 — empty recipient. Was a bare `return` with
    # ZERO logging: a caller passing an unset settings.admin_email produced no
    # trace anywhere. Almost always a config or caller bug, so it is reported
    # every time (it is rare by nature — no flood risk).
    if not to:
        _report(
            _EmailNotSent("empty recipient address"),
            to=to,
            subject=subject,
            stage="empty-recipient",
        )
        return

    # MEH-1613 swallow point 2/3 — no API key. THE headline outage: this was
    # logger.debug, invisible at the INFO default, so an unset/rotated key
    # meant every email silently vanished. ERROR every time; Sentry once per
    # process (see _missing_key_reported).
    if not settings.resend_api_key:
        global _missing_key_reported
        if not _missing_key_reported:
            _missing_key_reported = True
            _report(
                _EmailNotSent("RESEND_API_KEY not configured"),
                to=to,
                subject=subject,
                stage="no-api-key",
            )
        else:
            logger.error(
                "[EMAIL] NOT SENT (no-api-key) to %s — subject=%r "
                "(Sentry already notified once this process)",
                _mask(to),
                subject[:80],
            )
        return
    try:
        import resend  # lazy import — only installed when key is configured

        resend.api_key = settings.resend_api_key
        params: dict = {
            "from": settings.email_from_address,
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
        # MEH-1613: was `to.split("@")[0] + "***"` — that masks the DOMAIN and
        # prints the local part, the wrong half. _mask does the inverse.
        logger.info("[EMAIL] Sent to %s", _mask(to))
    except Exception as e:  # noqa: BLE001 — fail-open by design
        # MEH-1613 swallow point 3/3 — the real delivery failure (expired key,
        # Resend 5xx, network). Was logger.warning WITH THE FULL ADDRESS and no
        # Sentry event. Reported every time: it fires only on actual failures,
        # so there is no flood to latch against.
        _report(e, to=to, subject=subject, stage="send-failed")
