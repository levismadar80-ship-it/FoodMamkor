"""
Module:   billing (router)
Purpose:  Read-only billing summaries (MEH-3181): a business sees what it got
          through the site this month; the admin sees who passed the results
          threshold. Nothing here charges anyone.
Touches:  billable_events, producers (read only, via services/billing_summary).
Does NOT: write the ledger (services/billing_ledger.py), take payment, or
          return personal data — counts and amounts only.
Related:  app/schemas/billing.py · app/services/billing_summary.py
History:  MEH-3181 (creation, 2026-11-14).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.auth import require_admin, require_producer
from app.database import get_db
from app.models import User
from app.rate_limit import limiter
from app.schemas.billing import BillingOverviewOut, BillingSummaryOut
from app.services import billing_summary
from app.services.billing_summary import Month

router = APIRouter(tags=["billing"])

_MONTH = Query(None, pattern=r"^\d{4}-\d{2}$", description="YYYY-MM (Israel month)")


def _month(text: str | None) -> Month:
    if text is None:
        return Month.current()
    try:
        return Month.parse(text)
    except ValueError:
        raise HTTPException(status_code=422, detail="חודש לא תקין") from None


@router.get("/producers/me/billing/summary", response_model=BillingSummaryOut)
@limiter.limit("60/minute")
def my_billing_summary(
    request: Request,
    month: str | None = _MONTH,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """The caller's own business only — the id comes from the session, never the URL."""
    producer_id: UUID | None = user.producer_id  # type: ignore[assignment]  # Column at type level, UUID on a loaded row
    if producer_id is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return billing_summary.summarize(db, producer_id, _month(month))


@router.get("/admin/billing/overview", response_model=BillingOverviewOut)
@limiter.limit("60/minute")
def admin_billing_overview(
    request: Request,
    month: str | None = _MONTH,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return billing_summary.overview(db, _month(month))
