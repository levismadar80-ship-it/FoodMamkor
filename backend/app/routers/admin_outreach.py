"""Admin outreach lead management (MEH-22).

Lets admins maintain a list of prospective businesses they're courting,
move each lead through a status pipeline, and mint a single-use prefill
token so the prospect can register with one click.

Q1 of the plan was answered (b) — no Claude web search. Leads are added
manually by the admin. The Claude-search route was scoped out; if added
later it would be a single new POST endpoint here.
"""
import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models.models import OutreachLead, User
from app.schemas.schemas import (
    OutreachLeadCreate,
    OutreachLeadOut,
    OutreachLeadUpdate,
    OutreachPrefillResponse,
)

router = APIRouter(prefix="/admin/outreach", tags=["admin"])

VALID_STATUSES = {"new", "contacted", "replied", "registered", "declined"}
PREFILL_TTL_DAYS = 30


def _norm(s: str | None) -> str:
    """Trim + lowercase for soft uniqueness checks."""
    return (s or "").strip().lower()


@router.get("", response_model=list[OutreachLeadOut])
def list_leads(
    status: str | None = None,
    city: str | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List leads, newest first. Optional filters: status, city
    (case-insensitive contains)."""
    q = db.query(OutreachLead)
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        q = q.filter(OutreachLead.status == status)
    if city:
        q = q.filter(func.lower(OutreachLead.city).contains(city.strip().lower()))
    return q.order_by(OutreachLead.updated_at.desc()).all()


@router.post("", response_model=OutreachLeadOut, status_code=201)
def create_lead(
    data: OutreachLeadCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a lead. Soft-unique on (lower(name), lower(city)) — returns
    409 with the existing lead's id when a duplicate is detected so the
    admin can navigate to it instead of creating a near-duplicate."""
    name_n = _norm(data.name)
    city_n = _norm(data.city)
    if name_n:
        existing = (
            db.query(OutreachLead)
            .filter(func.lower(OutreachLead.name) == name_n)
            .filter(func.lower(func.coalesce(OutreachLead.city, "")) == city_n)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "duplicate_lead",
                    "existing_id": str(existing.id),
                    "message": "ליד עם שם + עיר זה כבר קיים",
                },
            )

    lead = OutreachLead(
        name=data.name.strip(),
        phone=(data.phone or "").strip() or None,
        instagram=(data.instagram or "").strip().lstrip("@") or None,
        website=(data.website or "").strip() or None,
        city=(data.city or "").strip() or None,
        category=(data.category or "").strip() or None,
        notes=data.notes,
        source="manual",
        status="new",
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.patch("/{lead_id}", response_model=OutreachLeadOut)
def update_lead(
    lead_id: UUID,
    data: OutreachLeadUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lead = db.query(OutreachLead).filter(OutreachLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if data.status is not None:
        if data.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")

    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(lead, field, value)

    db.commit()
    db.refresh(lead)
    return lead


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    lead_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lead = db.query(OutreachLead).filter(OutreachLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    db.delete(lead)
    db.commit()
    return None


@router.post("/{lead_id}/prefill-token", response_model=OutreachLeadOut)
def mint_prefill_token(
    lead_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Generate (or rotate) the prefill token for a lead. Returns the
    full lead so the admin UI can read `prefill_token` directly."""
    lead = db.query(OutreachLead).filter(OutreachLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # secrets.token_urlsafe(32) → ~43 chars URL-safe base64.
    lead.prefill_token = secrets.token_urlsafe(32)
    lead.prefill_token_expires_at = datetime.utcnow() + timedelta(days=PREFILL_TTL_DAYS)
    db.commit()
    db.refresh(lead)
    return lead


# --- Aggregate metrics ---


@router.get("/metrics/summary")
def metrics_summary(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Counters for the admin outreach page header.

    Naming maps to the spec wording:
      total      = all leads
      contacted  = פניתי
      replied    = ענו
      registered = נרשמו
    """

    def _count(predicate=None):
        q = db.query(func.count(OutreachLead.id))
        if predicate is not None:
            q = q.filter(predicate)
        return int(q.scalar() or 0)

    return {
        "total": _count(),
        "new": _count(OutreachLead.status == "new"),
        "contacted": _count(OutreachLead.status == "contacted"),
        "replied": _count(OutreachLead.status == "replied"),
        "registered": _count(OutreachLead.status == "registered"),
        "declined": _count(OutreachLead.status == "declined"),
    }


# --- Public prefill lookup ---
# Lives on a separate router so it can be mounted under /register/producer
# without dragging the require_admin dep in.

prefill_router = APIRouter(prefix="/register/producer/prefill", tags=["auth"])


@prefill_router.get("/{token}", response_model=OutreachPrefillResponse)
def get_prefill(token: str, db: Session = Depends(get_db)):
    """Public lookup — the token IS the auth. Returns 404 for invalid /
    expired tokens so the registration form just renders empty (no leak).
    """
    if not token or len(token) < 16:
        raise HTTPException(status_code=404, detail="Token not found")

    lead = (
        db.query(OutreachLead)
        .filter(OutreachLead.prefill_token == token)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Token not found")
    if (
        lead.prefill_token_expires_at is None
        or lead.prefill_token_expires_at < datetime.utcnow()
    ):
        raise HTTPException(status_code=404, detail="Token expired")

    return OutreachPrefillResponse(
        name=lead.name,
        phone=lead.phone,
        instagram=lead.instagram,
        website=lead.website,
        city=lead.city,
        category=lead.category,
    )
