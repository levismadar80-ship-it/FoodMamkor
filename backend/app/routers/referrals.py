"""MEH-49: Referral system endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.models import ReferralClick, User

# MEH-460 Pkg 5 (FINAL): ClaimReferralRequest relocated to app.schemas.schemas per ADR-006 R1.
from app.schemas.schemas import ClaimReferralRequest

router = APIRouter(prefix="/referral", tags=["referral"])


@router.post("/claim", status_code=200)
def claim_referral(
    data: ClaimReferralRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Link the current user (referee) to the referrer identified by code.
    Idempotent — calling twice for the same user is a no-op.
    """
    referrer = db.query(User).filter(User.referral_code == data.code).first()
    if not referrer:
        raise HTTPException(status_code=404, detail="קוד הפניה לא נמצא")
    if referrer.id == current_user.id:
        raise HTTPException(status_code=400, detail="לא ניתן להפנות את עצמך")

    already = (
        db.query(ReferralClick)
        .filter(ReferralClick.referee_id == current_user.id)
        .first()
    )
    if already:
        return {"detail": "referral already claimed"}

    click = ReferralClick(
        referrer_id=referrer.id,
        referee_id=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(click)
    db.commit()
    return {"detail": "referral claimed", "referrer": referrer.name}
