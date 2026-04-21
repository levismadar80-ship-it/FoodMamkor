"""MEH-141: Category request flow — public submit + admin review."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models.models import CategoryRequest
from app.rate_limit import limiter
from app.schemas.schemas import CategoryRequestCreate, CategoryRequestOut, CategoryRequestUpdate

router = APIRouter(tags=["category-requests"])


@router.post("/category-requests", response_model=CategoryRequestOut, status_code=201)
@limiter.limit("5/hour")
def submit_category_request(
    request: Request,
    body: CategoryRequestCreate,
    db: Session = Depends(get_db),
):
    row = CategoryRequest(
        requested_name=body.requested_name.strip(),
        examples=body.examples.strip() if body.examples else None,
        producer_id=body.producer_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/admin/category-requests")
@limiter.limit("120/minute")
def list_category_requests(
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    rows = (
        db.query(CategoryRequest)
        .order_by(CategoryRequest.created_at.desc())
        .all()
    )
    # Group by normalised requested_name (case-insensitive, trimmed).
    grouped: dict[str, dict] = {}
    for r in rows:
        key = r.requested_name.strip().lower()
        if key not in grouped:
            grouped[key] = {
                "requested_name": r.requested_name,
                "count": 0,
                "examples": [],
                "requests": [],
            }
        grouped[key]["count"] += 1
        if r.examples and r.examples not in grouped[key]["examples"]:
            grouped[key]["examples"].append(r.examples)
        grouped[key]["requests"].append(
            {
                "id": str(r.id),
                "producer_id": str(r.producer_id) if r.producer_id else None,
                "status": r.status,
                "admin_notes": r.admin_notes,
                "created_at": r.created_at.isoformat(),
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
            }
        )
    return sorted(grouped.values(), key=lambda g: g["count"], reverse=True)


@router.patch("/admin/category-requests/{request_id}", response_model=CategoryRequestOut)
@limiter.limit("60/minute")
def review_category_request(
    request: Request,
    request_id: UUID,
    body: CategoryRequestUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    row = db.get(CategoryRequest, request_id)
    if not row:
        raise HTTPException(status_code=404, detail="בקשה לא נמצאה")
    row.status = body.status
    # Only overwrite notes when the caller explicitly provides them.
    if body.admin_notes is not None:
        row.admin_notes = body.admin_notes
    row.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
