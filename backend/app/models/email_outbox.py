"""
Module:   email_outbox (model)
Purpose:  One email the site owes someone, written in the same transaction as
          the thing that caused it (a business approved, a sign-up taken), so
          a deploy, a crash or a Resend hiccup between the commit and the send
          no longer loses it.
Touches:  DB table email_outbox.
Does NOT: send anything — app/services/email_outbox.py does. Does NOT hold an
          order's messages: those live in product_order_notifications
          (app/models/product_orders.py), composed at send time.
Related:  app/services/email_outbox.py (enqueue_email, dispatch_due),
          app/worker.py (the loop that runs the dispatcher),
          backend/alembic/versions/20261120_2300_c5e7a9b1d3f6_meh3535_email_outbox.py
History:  MEH-3535 (creation)
"""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.utils.clock import utc_now

# DO NOT edit these without the matching literals in the MEH-3535 revision —
# tests/test_meh3535_email_outbox.py compares the two.
EMAIL_OUTBOX_OUTCOMES = ("pending", "sent", "failed", "skipped")


def _check_in(column: str, values: tuple[str, ...]) -> str:
    # REUSES: app/models/product_orders.py `_check_in` (three lines, repeated
    # so this module imports nothing from models.py).
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class EmailOutbox(Base):
    """A row is the promise; the dispatcher keeps it.

    The address and the content are stored because, unlike an order's
    messages, these emails are rendered from the moment they describe (the
    approval, the sign-up) and cannot be rebuilt later. They are cleared the
    moment the row is finished (sent, skipped or failed), and the bare row is
    deleted by the retention purge after 30 days.
    """

    __tablename__ = "email_outbox"
    __table_args__ = (
        CheckConstraint(
            _check_in("outcome", EMAIL_OUTBOX_OUTCOMES),
            name="email_outbox_outcome_check",
        ),
        Index(
            "ix_email_outbox_due",
            "send_after",
            postgresql_where=text("outcome = 'pending'"),
        ),
        Index("ix_email_outbox_created_at", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # What the email is, as a short code ("producer_approved", ...): the only
    # thing an admin needs to read a row once its content is cleared.
    kind = Column(String(40), nullable=False)
    to_email = Column(String(320), nullable=True)
    # Text, not a bounded string: a subject wraps a title of up to 300
    # characters, and an overflow would fail the sign-up that queued it.
    subject = Column(Text, nullable=True)
    body = Column(Text, nullable=True)
    html = Column(Text, nullable=True)
    reply_to = Column(String(320), nullable=True)
    # Named `outcome`, like product_order_notifications: a row is not a
    # status machine anyone else moves.
    outcome = Column(
        String(10), default="pending", nullable=False, server_default=text("'pending'")
    )
    send_after = Column(DateTime, nullable=False, default=utc_now)
    attempts = Column(Integer, default=0, nullable=False, server_default=text("0"))
    # A short code, never a message body or an address.
    last_error = Column(String(20), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
