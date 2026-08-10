"""
Module:   producer_name_requests
Purpose:  The re-moderated route for changing a business name — owner files a
          request, the public name holds still, an admin approves or rejects.
Touches:  producer_name_change_requests (read/write), producers.name (write,
          ONLY inside an admin approval).
Does NOT: expose `name` on the owner's ordinary edit path. That was removed in
          MEH-1851 and stays removed — see producer_me.py
          `_PRODUCER_WRITABLE_FIELDS`. Nothing here re-opens it.
Related:  app/routers/category_requests.py (the request/review idiom this
          mirrors), app/models/models.py `ProducerNameChangeRequest`.
History:  MEH-1872 (creation) — reopens the gap MEH-1851 left when it closed
          the unmoderated setattr path.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models.models import Producer, ProducerNameChangeRequest, User
from app.rate_limit import limiter
from app.schemas.schemas import (
    ProducerNameChangeRequestCreate,
    ProducerNameChangeRequestOut,
    ProducerNameChangeRequestUpdate,
)

router = APIRouter(tags=["producer-name-requests"])


def _own_producer(user: User, db: Session) -> Producer:
    """The caller's own producer, or 403. Never trusts an id from the body."""
    producer_id = getattr(user, "producer_id", None)
    if producer_id is None:
        raise HTTPException(status_code=403, detail="אין לך בית עסק משויך")
    producer = db.get(Producer, producer_id)
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return producer


@router.post(
    "/producers/me/name-change-requests",
    response_model=ProducerNameChangeRequestOut,
    status_code=201,
)
@limiter.limit("5/hour")
def request_name_change(
    request: Request,
    body: ProducerNameChangeRequestCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """File a name-change request. The public name does not move here."""
    producer = _own_producer(user, db)

    requested = body.requested_name.strip()
    if requested == (producer.name or "").strip():
        raise HTTPException(status_code=400, detail="השם המבוקש זהה לשם הנוכחי")

    # One open request at a time. Without this an owner can queue several and
    # the admin approves them in an order nobody chose — and the audit trail
    # stops saying which change was actually wanted.
    existing = (
        db.query(ProducerNameChangeRequest)
        .filter(
            ProducerNameChangeRequest.producer_id == producer.id,
            ProducerNameChangeRequest.status == "pending",
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="כבר קיימת בקשת שינוי שם שממתינה לאישור"
        )

    row = ProducerNameChangeRequest(
        producer_id=producer.id,
        current_name=producer.name,
        requested_name=requested,
        reason=body.reason,
        status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/producers/me/name-change-requests",
    response_model=list[ProducerNameChangeRequestOut],
)
@limiter.limit("60/minute")
def list_own_name_change_requests(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The owner's own history — so she can see a request is still pending."""
    producer = _own_producer(user, db)
    return (
        db.query(ProducerNameChangeRequest)
        .filter(ProducerNameChangeRequest.producer_id == producer.id)
        .order_by(ProducerNameChangeRequest.created_at.desc())
        .all()
    )


@router.get(
    "/admin/name-change-requests",
    response_model=list[ProducerNameChangeRequestOut],
)
@limiter.limit("60/minute")
def list_name_change_requests(
    request: Request,
    status: str = "pending",
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """The admin queue. Old and new name travel together on every row."""
    return (
        db.query(ProducerNameChangeRequest)
        .filter(ProducerNameChangeRequest.status == status)
        .order_by(ProducerNameChangeRequest.created_at.asc())
        .all()
    )


@router.patch(
    "/admin/name-change-requests/{request_id}",
    response_model=ProducerNameChangeRequestOut,
)
@limiter.limit("60/minute")
def review_name_change_request(
    request: Request,
    request_id: UUID,
    body: ProducerNameChangeRequestUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Approve (the name moves) or reject (it does not). The only writer of
    `producers.name` outside the admin producer form."""
    row = db.get(ProducerNameChangeRequest, request_id)
    if not row:
        raise HTTPException(status_code=404, detail="בקשה לא נמצאה")
    if row.status != "pending":
        # Re-reviewing a decided request would move the public name a second
        # time from a decision already taken.
        raise HTTPException(status_code=409, detail="הבקשה כבר נסקרה")

    if body.status == "approved":
        producer = db.get(Producer, row.producer_id)
        if producer is None:
            raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
        producer.name = row.requested_name

    row.status = body.status
    if body.admin_notes is not None:
        row.admin_notes = body.admin_notes
    row.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
