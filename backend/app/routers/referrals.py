"""MEH-49: Referral system endpoints."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.models import ReferralClick, User

router = APIRouter(prefix="/referral", tags=["referral"])


class ClaimReferralRequest(BaseModel):
    code: str


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
