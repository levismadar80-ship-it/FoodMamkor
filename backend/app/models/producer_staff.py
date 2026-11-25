"""
Module:    models/producer_staff
Purpose:   Who besides the owner may handle a business's orders. One row per
           invite; an accepted invite is the staff member's access.
Touches:   producer_staff.
Does NOT:  Put anything on the staff member's `users` row. `users.producer_id`
           still means «owner» everywhere (`_has_owner`, the order-email
           recipient, `_own_producer_id`), and this table is what keeps that
           true. Decide what a staff member may do: that is
           services/order_access.py.
Related:   alembic/versions/*_meh3526_producer_staff.py (the schema),
           routers/producer_staff.py (invite, accept, revoke, leave).
History:   MEH-3526 (creation — Sapir 20/11: «עובד להזמנות בלבד»; schema
           approved 21/11).
"""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base

STAFF_ROLES = ("orders",)
STAFF_STATUSES = ("pending", "active", "revoked")


class ProducerStaff(Base):
    """One invite to handle a business's orders.

    pending → active (the invited person accepted) → revoked (the owner
    removed them, or they left). pending → revoked (the owner withdrew the
    invite). An expired pending row is not moved; it simply stops counting
    and stops matching. `token_hash` is the sha256 of the link's secret and
    is cleared the moment the link is used or withdrawn.
    """

    __tablename__ = "producer_staff"
    __table_args__ = (
        CheckConstraint("role IN ('orders')", name="ck_producer_staff_role"),
        CheckConstraint(
            "status IN ('pending', 'active', 'revoked')",
            name="ck_producer_staff_status",
        ),
        Index(
            "uq_producer_staff_active_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index(
            "uq_producer_staff_live_email",
            "producer_id",
            text("lower(invited_email)"),
            unique=True,
            postgresql_where=text("status IN ('pending', 'active')"),
        ),
        Index(
            "uq_producer_staff_token_hash",
            "token_hash",
            unique=True,
            postgresql_where=text("token_hash IS NOT NULL"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    invited_email = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="orders", server_default="orders")
    token_hash = Column(String(64), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    invited_by = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status = Column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
