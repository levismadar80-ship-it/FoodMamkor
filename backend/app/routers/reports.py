from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models import Producer, Report, User
from app.rate_limit import limiter
from app.schemas.schemas import ReportCreate

router = APIRouter(tags=["reports"])


@router.post("/producers/{producer_id}/report", status_code=201)
@limiter.limit("5/hour")
def report_producer(
    request: Request,
    producer_id: UUID,
    data: ReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # Check if user already reported this producer
    existing = (
        db.query(Report)
        .filter(
            Report.reporter_id == user.id,
            Report.producer_id == producer_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="You already reported this producer"
        )

    report = Report(
        reporter_id=user.id,
        producer_id=producer_id,
        reason=data.reason,
    )
    db.add(report)
    db.commit()

    # Check if 3+ reports — auto-flag
    count = (
        db.query(func.count(Report.id))
        .filter(Report.producer_id == producer_id)
        .scalar()
    )
    flagged = count >= 3

    return {"detail": "Report submitted", "flagged_for_review": flagged}


@router.get("/admin/reports", response_model=list[dict])
def get_flagged_producers(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get producers with 3+ reports."""
    results = (
        db.query(
            Report.producer_id,
            func.count(Report.id).label("report_count"),
        )
        .group_by(Report.producer_id)
        .having(func.count(Report.id) >= 3)
        .all()
    )
    flagged = []
    for producer_id, report_count in results:
        producer = db.query(Producer).filter(Producer.id == producer_id).first()
        reports = (
            db.query(Report)
            .filter(Report.producer_id == producer_id)
            .order_by(Report.created_at.desc())
            .all()
        )
        flagged.append(
            {
                "producer_id": str(producer_id),
                "producer_name": producer.name if producer else None,
                "report_count": report_count,
                "reports": [
                    {
                        "id": str(r.id),
                        "reason": r.reason,
                        "created_at": r.created_at.isoformat(),
                    }
                    for r in reports
                ],
            }
        )
    return flagged
