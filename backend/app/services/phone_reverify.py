"""
Module:   phone_reverify
Purpose:  A business that changes its WhatsApp number loses its phone
          verification, and any code sent to the old number stops working.
Touches:  producers.phone_verified, phone_otp_tokens.used.
Does NOT: send a new code (POST /producers/me/verify-phone, producer_me.py)
          or decide submit readiness (services/submission_gate.py).
Related:  backend/app/routers/producer_me.py (update_my_producer, confirm —
          which only claims a token issued for the CURRENT number),
          backend/app/routers/admin.py (admin_update_producer),
          backend/app/utils/phone.py canonical_il_msisdn.
History:  Grill B8 (creation) — MEH-745 made the verified number a submit item.
"""

from typing import Any

from sqlalchemy.orm import Session

from app.models.models import PhoneOtpToken, Producer
from app.utils.phone import canonical_il_msisdn


def _same_number(old: str | None, new: str | None) -> bool:
    old_c, new_c = canonical_il_msisdn(old), canonical_il_msisdn(new)
    if old_c is not None and new_c is not None:
        return old_c == new_c
    # Not canonicalizable on either side: fall back to the raw text.
    return (old or "").strip() == (new or "").strip()


def reset_verification_if_phone_changed(
    db: Session, producer: Producer, payload: dict[str, Any], old_phone: str | None
) -> bool:
    """Call after the setattr loop. Returns True when it reset anything."""
    new_phone: str | None = producer.phone  # type: ignore[assignment]
    if "phone" not in payload or _same_number(old_phone, new_phone):
        return False
    db.query(PhoneOtpToken).filter(
        PhoneOtpToken.producer_id == producer.id,
        PhoneOtpToken.used.is_(False),
    ).update({PhoneOtpToken.used: True}, synchronize_session=False)
    # An explicit UPDATE, not only the attribute: if this request loaded the
    # row already unverified, the ORM sees no change and writes nothing, so a
    # confirm that commits in between would leave the new number verified.
    # The statement blocks on that confirm's row lock and lands after it.
    db.query(Producer).filter(Producer.id == producer.id).update(
        {Producer.phone_verified: False}, synchronize_session=False
    )
    producer.phone_verified = False  # type: ignore[assignment]
    return True
