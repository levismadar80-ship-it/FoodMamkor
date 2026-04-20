"""MEH-51: Admin endpoints for kashrut badge review + ambassador toggle."""

from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.database import get_db
from app.models.models import KashrutBadgeRequest, Producer
from app.models import User
from app.schemas.schemas import (
    KashrutRequestOut,
    KashrutRejectIn,
    SetAmbassadorIn,
)

router = APIRouter(prefix="/admin", tags=["admin-kashrut"])


@router.get("/kashrut", response_model=list[KashrutRequestOut])
def list_kashrut_requests(
    status: str = "pending",
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(KashrutBadgeRequest)
        .options(joinedload(KashrutBadgeRequest.producer))
        .filter(KashrutBadgeRequest.status == status)
        .order_by(KashrutBadgeRequest.created_at.asc())
        .all()
    )
    return [
        {**r.__dict__, "producer_name": r.producer.name if r.producer else None}
        for r in rows
    ]


@router.post("/kashrut/{request_id}/approve")
def approve_kashrut_request(
    request_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    req = db.query(KashrutBadgeRequest).filter(KashrutBadgeRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="בקשה לא נמצאה")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="הבקשה כבר טופלה")

    producer = db.query(Producer).filter(Producer.id == req.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    badges = list(producer.kashrut_badges or [])
    if req.badge_code not in badges:
        badges.append(req.badge_code)
        producer.kashrut_badges = badges

    now = datetime.utcnow()
    producer.kashrut_verified_at = now
    producer.kashrut_expires_at = now + timedelta(days=365)

    req.status = "approved"
    req.reviewed_by = user.id
    db.commit()
    return {"detail": "badge אושר"}


@router.post("/kashrut/{request_id}/reject")
def reject_kashrut_request(
    request_id: UUID,
    body: KashrutRejectIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    req = db.query(KashrutBadgeRequest).filter(KashrutBadgeRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="בקשה לא נמצאה")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="הבקשה כבר טופלה")

    req.status = "rejected"
    req.reviewed_by = user.id
    req.notes = body.notes
    db.commit()
    return {"detail": "בקשה נדחתה"}


@router.post("/producers/{producer_id}/set-ambassador")
def set_ambassador(
    producer_id: UUID,
    body: SetAmbassadorIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.ambassador = body.ambassador
    db.commit()
    return {"detail": "עודכן", "ambassador": producer.ambassador}
