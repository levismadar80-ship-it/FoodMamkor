"""
Module:   email_events (model)
Purpose:  One delivery event Resend reported for an email we sent (delivered,
          bounced, marked as spam, suppressed, clicked), so we can see which
          emails reach people and which ones they act on, per kind of email.
Touches:  DB table email_events.
Does NOT: hold the address or the words of the email — only the recipient's
          domain and, when the address belongs to an account, its user id.
          Does NOT suppress anything: Resend keeps its own suppression list
          and skips a hard-bounced or complained address itself (it reports
          that as `email.suppressed`, which lands here too).
Related:  app/routers/resend_webhook.py (the only writer),
          app/services/email.py `send_email(kind=…)` (the tag read back here),
          app/services/retention_purge.py (30-day purge, as the privacy page says),
          backend/alembic/versions/20261125_0100_e1a3c5b7d9f2_meh3839_email_events.py
History:  MEH-3839 (creation)
"""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.utils.clock import utc_now

# The Resend event types we keep. Anything else Resend sends (email.sent,
# email.opened, contact.*, domain.*) is acknowledged and dropped: opens are
# not a reliable signal (Apple Mail loads every image on delivery).
EMAIL_EVENT_TYPES = (
    "email.delivered",
    "email.delivery_delayed",
    "email.bounced",
    "email.complained",
    "email.suppressed",
    "email.failed",
    "email.clicked",
)


class EmailEvent(Base):
    __tablename__ = "email_events"
    __table_args__ = (
        Index("ix_email_events_kind_created_at", "kind", "created_at"),
        Index("ix_email_events_user_id", "user_id"),
        Index("ix_email_events_created_at", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Svix delivery id: Resend retries a delivery with the same id, so the
    # unique constraint is what makes a retry a no-op.
    svix_id = Column(String(64), nullable=False, unique=True)
    event_type = Column(String(40), nullable=False)
    # The `kind` tag send_email put on the email ("order_new_order", ...), or
    # "other" for an untagged one.
    kind = Column(String(40), nullable=False, default="other")
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    recipient_domain = Column(String(255), nullable=True)
    resend_email_id = Column(String(64), nullable=True)
    # Bounce "type/subType" or the suppression type — short, no text
    # from the receiving server (it can quote the address).
    detail = Column(String(80), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
