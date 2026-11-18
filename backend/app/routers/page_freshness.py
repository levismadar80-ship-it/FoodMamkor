"""
Module:   page_freshness (router)
Purpose:  POST /page-freshness/confirm — the «כן, הכול נכון» button behind the
          monthly email. The signed token is the authorization, so it works
          without logging in, and only ever stamps its own business.
Touches:  producers.last_confirmed_at (via services/page_freshness.confirm).
Does NOT: send the email (services/page_freshness.send_freshness_emails) or
          change anything on the page itself.
Related:  backend/app/routers/marketing.py unsubscribe_weekly_summary (same
          token-in-body, POST-not-GET shape: a mail scanner that prefetches
          links must not confirm a page nobody looked at).
History:  Page freshness (creation, 18/11/2026).
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.rate_limit import limiter
from app.schemas.site import PageFreshnessConfirmIn, PageFreshnessConfirmOut
from app.services.page_freshness import confirm, decode_confirm_token

router = APIRouter(tags=["page-freshness"])

# Copy DRAFT, pending Sapir's word-for-word approval (rule 22).
_DEAD_LINK = "הקישור הזה כבר לא פעיל. אפשר לעדכן את העמוד מהלוח שלך."


@router.post("/page-freshness/confirm", response_model=PageFreshnessConfirmOut)
@limiter.limit("20/hour")
def confirm_page_freshness(
    request: Request,
    data: PageFreshnessConfirmIn,
    db: Session = Depends(get_db),
) -> PageFreshnessConfirmOut:
    producer_id = decode_confirm_token(data.token)
    row = confirm(db, producer_id) if producer_id is not None else None
    if row is None:
        # One body for every dead link: never reveals whether the business exists.
        raise HTTPException(status_code=404, detail=_DEAD_LINK)
    return PageFreshnessConfirmOut(
        business_name=row.name or "", confirmed_at=row.last_confirmed_at
    )
