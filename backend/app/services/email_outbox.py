"""
Module:   email_outbox
Purpose:  The durable email queue. A caller writes the email with
          `enqueue_email` in the same transaction as the thing that caused it;
          `dispatch_due` sends it later, with retries. A deploy, a crash or a
          Resend error between the commit and the send no longer loses it, and
          a rolled-back cause sends nothing.
Touches:  DB table email_outbox (insert; then outcome/attempts, and the content
          cleared when the row is finished). Sends through
          email.send_email_result, which never raises.
Does NOT: commit in `enqueue_email` — the caller's commit is the point. Does
          NOT carry an order's messages (product_order_outbox.py). Does NOT
          decide where it runs: app/worker.py (the Railway worker) or the web
          scheduler (app/startup.py) call `dispatch_due`, per
          OUTBOX_EXTERNAL_WORKER.
Related:  app/models/email_outbox.py; app/services/product_order_outbox.py
          (the pattern, MEH-3296); app/services/retention_purge.py (deletes
          finished rows after 30 days).
History:  MEH-3535 (creation)

Delivery is at least once: a row is locked (SKIP LOCKED), sent, marked and
committed one at a time, so a crash between the send and the commit sends
that one email again on the next tick. Two dispatchers (the web scheduler and
the worker during a switch-over) never take the same row.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.email_outbox import EmailOutbox
from app.services import email as email_service
from app.utils.clock import utc_now

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
# 2, 4, 8, 16 minutes: Resend's own incidents are minutes long.
RETRY_BASE = timedelta(minutes=2)
# An email this late (a long outage) is dropped, not sent. Two days, not hours:
# unlike an order update, «your business is live» is still true and useful.
STALE_AFTER = timedelta(days=2)
BATCH = 25

# REUSES: app/services/email.py `send_email_result` outcomes. "failed" is worth
# another try. "unconfigured" (no RESEND_API_KEY in this process) is not the
# email's fault: the row waits, burning no attempt, so a dispatcher started
# without the key never eats the queue. Every other answer is final.
_RETRY = "failed"
_WAIT = "unconfigured"


def enqueue_email(  # noqa: PLR0913 — the same fields send_email takes, + kind
    db: Session,
    kind: str,
    to: str | None,
    subject: str,
    body: str,
    html: str | None = None,
    reply_to: str | None = None,
    test_cause: bool = False,
) -> None:
    """Owe one email. Adds the row to the caller's transaction; never commits.

    MEH-2952: an email caused by a test row is not queued at all — the same
    "nothing is sent" as `send_email(test_cause=True)`, logged the same way.
    """
    if test_cause:
        log.info("[EMAIL-OUTBOX] not queued: caused by a test row (kind=%s)", kind)
        return
    if not to:
        log.info("[EMAIL-OUTBOX] not queued: no address (kind=%s)", kind)
        return
    db.add(
        EmailOutbox(
            kind=kind,
            to_email=to,
            subject=subject,
            body=body,
            html=html,
            reply_to=reply_to,
            send_after=utc_now(),
        )
    )


def _clear(row: EmailOutbox) -> None:
    """A finished row keeps its kind, outcome and times — never the address or
    the words."""
    row.to_email = row.subject = row.body = row.html = row.reply_to = None  # type: ignore[assignment]


def _finish(row: EmailOutbox, outcome: str, now: datetime) -> None:
    if outcome == "sent":
        row.outcome, row.sent_at, row.last_error = "sent", now, None  # type: ignore[assignment]
        _clear(row)
        return
    if outcome == _WAIT:
        row.last_error = _WAIT  # type: ignore[assignment]
        row.send_after = now + RETRY_BASE  # type: ignore[assignment]
        return
    if outcome != _RETRY:
        row.outcome, row.last_error = "skipped", outcome[:20]  # type: ignore[assignment]
        _clear(row)
        return
    row.attempts = int(row.attempts) + 1  # type: ignore[assignment]
    row.last_error = "provider"  # type: ignore[assignment]
    if int(row.attempts) >= MAX_ATTEMPTS:
        row.outcome = "failed"  # type: ignore[assignment]
        _clear(row)
    else:
        row.send_after = now + RETRY_BASE * (2 ** (int(row.attempts) - 1))


def _handle(row: EmailOutbox, now: datetime) -> None:
    if row.created_at < now - STALE_AFTER:
        _finish(row, "stale", now)
        return
    outcome = email_service.send_email_result(
        str(row.to_email),
        str(row.subject or ""),
        str(row.body or ""),
        html=str(row.html) if row.html else None,
        reply_to=str(row.reply_to) if row.reply_to else None,
    )
    _finish(row, outcome, now)


def dispatch_due(db: Session, now: datetime | None = None, limit: int = BATCH) -> int:
    """Send up to `limit` due emails, one short transaction each. Returns how
    many rows were handled (sent, retried later, or closed)."""
    now = now or utc_now()
    handled = 0
    while handled < limit:
        row = (
            db.query(EmailOutbox)
            .filter(EmailOutbox.outcome == "pending", EmailOutbox.send_after <= now)
            .order_by(EmailOutbox.send_after)
            .with_for_update(skip_locked=True)
            .first()
        )
        if row is None:
            break
        row_id = row.id
        try:
            _handle(row, now)
            db.commit()
        except Exception:  # noqa: BLE001 — one bad row must not stop the batch
            db.rollback()
            log.exception("[EMAIL-OUTBOX] row failed (id=%s)", row_id)
            # Only while still pending: after the rollback another dispatcher
            # may have taken and sent the row, and "sent" must not become
            # "failed".
            failed = (
                db.query(EmailOutbox)
                .filter_by(id=row_id, outcome="pending")
                .with_for_update()
                .first()
            )
            if failed is not None:
                failed.outcome, failed.last_error = "failed", "error"  # type: ignore[assignment]
                _clear(failed)
            db.commit()
        handled += 1
    return handled
