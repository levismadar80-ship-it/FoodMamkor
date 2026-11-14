"""
Module:   rescue_no_show_tombstone
Purpose:  MEH-3225 (D5 of the 14/11 grill retro) — the two-no-shows block
          survives account deletion. When a buyer deletes her account (or an
          admin does), each no-show still counting against her is kept here
          as an HMAC of her email + the bag's pickup_end, and nothing else. A
          new account with the same email starts with those no-shows.
Touches:  table `rescue_no_show_tombstones` (migration
          20261114_2300_f6c2a8d4e1b7).
Does NOT: hold the email, a name, the business or the order — only the
          keyed hash and a time. Does not decide the rule (services/
          rescue_no_show.py) or the purge (services/retention_purge.py).
History:  MEH-3225 (creation)
"""

import uuid

from sqlalchemy import Column, DateTime, Index, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.utils.clock import utc_now


class RescueNoShowTombstone(Base):
    """One no-show of a deleted account. Kept 30 days from ``pickup_end``
    (the rule's own window), then deleted by the retention purge."""

    __tablename__ = "rescue_no_show_tombstones"
    __table_args__ = (
        Index("ix_rescue_no_show_tombstones_email_hash", "email_hash"),
        Index("ix_rescue_no_show_tombstones_pickup_end", "pickup_end"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # hex HMAC-SHA256 of the normalised email, keyed with settings.secret_key
    email_hash = Column(String(64), nullable=False)
    pickup_end = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
