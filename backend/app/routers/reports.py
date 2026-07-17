from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models import Producer, Report, User
from app.rate_limit import limiter
from app.schemas.schemas import ReportCreate

router = APIRouter(tags=["reports"])

# MEH-1266: reports that admins still need to act on. Closed reports
# (resolved|dismissed) drop out of /admin/reports and every dashboard counter.
OPEN_STATUS = "open"
# >=3 open reports auto-flags a producer for the red "3+" treatment.
AUTO_FLAG_THRESHOLD = 3


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
        # MEH-773: 409 + Hebrew, unified with the IntegrityError race
        # backstop below so a duplicate report has one behavior.
        raise HTTPException(status_code=409, detail="כבר דיווחת על בית עסק זה")

    report = Report(
        reporter_id=user.id,
        producer_id=producer_id,
        reason=data.reason,
    )
    db.add(report)
    # MEH-773: uq_report_reporter_producer backstops the check-then-act
    # race above — a concurrent duplicate raises IntegrityError instead of
    # inserting a second row; convert it to the same 409 the pre-check uses.
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="כבר דיווחת על בית עסק זה")

    # Check if 3+ OPEN reports — auto-flag (MEH-1266: closed reports no
    # longer inflate the flag).
    count = (
        db.query(func.count(Report.id))
        .filter(
            Report.producer_id == producer_id,
            Report.status == OPEN_STATUS,
        )
        .scalar()
    )
    flagged = count >= AUTO_FLAG_THRESHOLD

    return {"detail": "Report submitted", "flagged_for_review": flagged}


@router.get("/admin/reports", response_model=list[dict])
def get_flagged_producers(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """MEH-1266: every producer with >=1 OPEN report (not only 3+).

    Each group carries `report_count` (open only) and `auto_flagged`
    (>=3 open reports). Closed reports (resolved|dismissed) are excluded.
    """
    results = (
        db.query(
            Report.producer_id,
            func.count(Report.id).label("report_count"),
        )
        .filter(Report.status == OPEN_STATUS)
        .group_by(Report.producer_id)
        .having(func.count(Report.id) >= 1)
        .all()
    )
    flagged = []
    for producer_id, report_count in results:
        producer = db.query(Producer).filter(Producer.id == producer_id).first()
        reports = (
            db.query(Report)
            .filter(
                Report.producer_id == producer_id,
                Report.status == OPEN_STATUS,
            )
            .order_by(Report.created_at.desc())
            .all()
        )
        flagged.append(
            {
                "producer_id": str(producer_id),
                "producer_name": producer.name if producer else None,
                "report_count": report_count,
                "auto_flagged": report_count >= AUTO_FLAG_THRESHOLD,
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


def _close_report(report_id: UUID, new_status: str, admin: User, db: Session) -> dict:
    """Shared resolve/dismiss transition. 404 if missing, 409 if already
    closed (idempotency guard against a double-close race)."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="דיווח לא נמצא")
    if report.status != OPEN_STATUS:
        raise HTTPException(status_code=409, detail="הדיווח כבר טופל")
    report.status = new_status
    report.resolved_at = datetime.utcnow()
    report.resolved_by = admin.id
    db.commit()
    return {"detail": "Report closed", "status": new_status}


@router.post("/admin/reports/{report_id}/resolve")
def resolve_report(
    report_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Mark a report resolved (action taken)."""
    return _close_report(report_id, "resolved", user, db)


@router.post("/admin/reports/{report_id}/dismiss")
def dismiss_report(
    report_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Dismiss a report (no action needed / false alarm)."""
    return _close_report(report_id, "dismissed", user, db)
