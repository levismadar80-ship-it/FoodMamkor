"""
Module:   admin_whatsapp
Purpose:  Admin-only read view of outbound WhatsApp messages that did
          NOT reach the recipient — `failed` (Meta-side error) and
          `window_expired` (24h customer-service window closed). Last
          7 days only. Mounted at `/admin/whatsapp/*`.
Touches:  PostgreSQL outbound_messages (SELECT only; never writes).
Does NOT: send / retry / resend (app/services/whatsapp.py owns the send
          layer), reconcile delivery webhooks (app/routers/whatsapp_webhook
          is MEH-771 Chunk B), expose admin actions on the rows — this
          chunk is list-only by design; resend / retry is intentionally
          out of scope for MEH-771 and would land as a follow-up.
Related:  app/models/models.py:OutboundMessage (MEH-771 Chunk A),
          app/services/whatsapp.py:OUTCOME_* (status convention),
          app/routers/whatsapp_webhook.py:_reconcile_status (Chunk B),
          app/routers/admin_outreach.py (sibling admin-list pattern).
History:  MEH-771 Chunk C (creation — final chunk of the delivery-status
          loop; first admin surface for undelivered sends).
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models.models import OutboundMessage, User
from app.schemas.schemas import OutboundMessageAdminOut
from app.services.whatsapp import (
    OUTCOME_BLOCKED_NON_PROD,
    UNDELIVERED_WINDOW_DAYS,
    undelivered_predicate,
)
from app.utils.clock import utc_now

router = APIRouter(prefix="/admin/whatsapp", tags=["admin"])

# MEH-771 Chunk C — undelivered statuses. Both are terminal-bad states from
# the recipient's perspective: `failed` = Meta reported an error,
# `window_expired` = the 24h customer-service window closed so a free-form
# send can't be delivered. Surfacing both lets admins triage either
# category without flipping a filter. The tuple and the window live in
# services/whatsapp.py (MEH-2359) so the admin-home count uses the same
# predicate as this list.


@router.get("/failed", response_model=list[OutboundMessageAdminOut])
def list_failed_outbound(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[OutboundMessage]:
    """Return undelivered outbound WhatsApp rows from the last 7 days.

    Filter: `undelivered_predicate` — status IN ('failed', 'window_expired'),
    or `accepted` for more than a day with no delivery receipt (MEH-2122
    Chunk E), AND created_at within the last `UNDELIVERED_WINDOW_DAYS`. Ordered newest-first so the freshest
    failures show up at the top of the admin table.

    No pagination — the per-day failure volume is small (single-digit
    typical, two-digit during incidents) and the 7-day window bounds the
    worst case. If the row count ever materially exceeds the page, add
    pagination here; until then, simpler is better.
    """
    return (
        db.query(OutboundMessage)
        .filter(undelivered_predicate(OutboundMessage, utc_now()))
        .order_by(OutboundMessage.created_at.desc())
        .all()
    )


# MEH-3402 follow-up: messages the outbound guard dropped outside production,
# with what they would have said. Never written in production, so there this
# list is always empty.
BLOCKED_LIST_LIMIT = 200


@router.get("/blocked", response_model=list[OutboundMessageAdminOut])
def list_blocked_outbound(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[OutboundMessage]:
    """Return the newest dropped-outside-production rows, last 7 days."""
    since = utc_now() - timedelta(days=UNDELIVERED_WINDOW_DAYS)
    return (
        db.query(OutboundMessage)
        .filter(
            OutboundMessage.status == OUTCOME_BLOCKED_NON_PROD,
            OutboundMessage.created_at >= since,
        )
        .order_by(OutboundMessage.created_at.desc(), OutboundMessage.id.desc())
        .limit(BLOCKED_LIST_LIMIT)
        .all()
    )
