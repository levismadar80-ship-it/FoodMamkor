"""
Module:   staff_membership
Purpose:  End a person's active order-staff membership when the same account
          becomes a business owner, so the old business's team list and its
          5 seats stop counting someone who now runs a business of their own.
Touches:  producer_staff (UPDATE, caller commits).
Does NOT: decide who may handle orders (services/order_access.py), or invite
          and remove staff (routers/producer_staff.py). Does not commit.
Related:  routers/producer_claim.py, routers/producer_owner_invite_existing.py,
          routers/auth_register_producer.py (the three places a consumer
          account becomes an owner).
History:  MEH-3526 (rule-5a review finding: the reverse of the accept-time
          owner refusal).
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.producer_staff import ProducerStaff


def end_staff_membership(db: Session, user_id: Any) -> int:
    """Revoke the account's active membership, if any. Returns rows changed."""
    return (
        db.query(ProducerStaff)
        .filter(ProducerStaff.user_id == user_id, ProducerStaff.status == "active")
        .update(
            {
                ProducerStaff.status: "revoked",
                ProducerStaff.token_hash: None,
                ProducerStaff.revoked_at: datetime.now(timezone.utc),
            },
            synchronize_session=False,
        )
    )
