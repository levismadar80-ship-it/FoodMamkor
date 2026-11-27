"""
Module:   share_links (model)
Purpose:  A short link an admin sends a business (MEH-3896): a random 12-character
          code that opens one draft's preview or claim page, instead of a
          ~250-character JWT that reads like phishing in a WhatsApp message.
Touches:  DB table share_links.
Does NOT: hold the code itself — only its SHA-256 (code_hash), so a database
          read cannot be turned back into a working link (OWASP Forgot
          Password cheat sheet: store a reset token like a password). Does NOT
          decide who may see or claim a draft: the routers still read the
          producer row and refuse anything that is not an ownerless draft.
Related:  app/services/share_links.py (the only writer and reader) ·
          app/routers/producer_draft_preview.py · app/routers/producer_claim.py ·
          app/services/retention_purge.py (deletes rows 90 days past expiry) ·
          backend/alembic/versions/20261126_1500_d2f4b6a8c0e1_meh3896_share_links.py
History:  MEH-3896 (creation).
"""

import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.utils.clock import utc_now

# One scope per kind of link. A preview code never claims, a claim code never
# previews — the same separation the two JWT scopes keep.
SHARE_LINK_SCOPES = ("draft_preview", "producer_claim")


class ShareLink(Base):
    __tablename__ = "share_links"
    __table_args__ = (
        CheckConstraint(
            "scope IN ('draft_preview', 'producer_claim')",
            name="share_links_scope_check",
        ),
        Index("ix_share_links_producer_id", "producer_id"),
        Index("ix_share_links_expires_at", "expires_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # hex SHA-256 of the code. Unique: the lookup is by this column alone.
    code_hash = Column(String(64), nullable=False, unique=True)
    scope = Column(String(20), nullable=False)
    # The link dies with the draft (CASCADE), on top of the routers' own
    # "still an ownerless draft" check.
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Naive UTC, like every other expiry here (utc_now).
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    created_by = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
