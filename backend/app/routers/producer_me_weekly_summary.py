"""
Module:   producer_me_weekly_summary
Purpose:  Lets a business turn the weekly summary email back on after it was
          stopped (MEH-3212). Before this, only a database edit could undo an
          unsubscribe — one forwarded email, or a mail scanner, stopped it for
          good. Also the RFC 8058 one-click target of the email's
          List-Unsubscribe header.
Touches:  producers.weekly_summary_opt_out.
Does NOT: send the email (services/weekly_owner_summary.py) or own the
          link-in-body unsubscribe (routers/marketing.py
          unsubscribe_weekly_summary).
Related:  frontend/components/producer/WeeklySummaryToggle.jsx (the switch);
          backend/app/services/weekly_owner_summary.py summary_enabled.
History:  MEH-3212 (creation).
"""

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.config import settings
from app.database import get_db
from app.models import Producer, User
from app.rate_limit import limiter
from app.schemas.schemas import WeeklySummarySettingIn, WeeklySummarySettingOut
from app.services.weekly_owner_summary import (
    ONE_CLICK_PATH,
    UNSUBSCRIBE_PATH,
    decode_unsubscribe_token,
    summary_enabled,
)

router = APIRouter(prefix="/producers/me", tags=["producer-management"])
# The one-click target is reached from a mail client, with no login.
one_click_router = APIRouter(tags=["marketing"])

_MAX_TOKEN = 2048  # = WeeklySummaryUnsubscribeIn.token max_length
_BAD_LINK = "הקישור אינו תקין או שפג תוקפו."


def _own_producer(user: User, db: Session) -> Producer:
    # The row is looked up from the caller's own token, never from a path or
    # body id, so there is no other business's row to reach: the ownership
    # check is structural. REUSES: routers/product_orders.py _own_producer_id.
    producer = (
        db.query(Producer).filter(Producer.id == user.producer_id).first()
        if user.producer_id
        else None
    )
    if producer is None:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    return producer


def _out(producer: Producer) -> WeeklySummarySettingOut:
    return WeeklySummarySettingOut(
        enabled=not bool(producer.weekly_summary_opt_out),
        available=summary_enabled(),
    )


@router.get("/weekly-summary", response_model=WeeklySummarySettingOut)
@limiter.limit("120/minute")
def get_weekly_summary_setting(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> WeeklySummarySettingOut:
    return _out(_own_producer(user, db))


@router.patch("/weekly-summary", response_model=WeeklySummarySettingOut)
@limiter.limit("30/hour")
def set_weekly_summary_setting(
    request: Request,
    body: WeeklySummarySettingIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> WeeklySummarySettingOut:
    producer = _own_producer(user, db)
    producer.weekly_summary_opt_out = not body.enabled  # type: ignore[assignment]
    db.commit()
    return _out(producer)


@one_click_router.post(ONE_CLICK_PATH, status_code=200)
# Higher than the body link's 20/hour: mail providers POST one-click requests
# from shared egress ranges, and a 429 here is an unsubscribe that failed. A
# forged request is already bounded by the token's signature.
@limiter.limit("300/hour")
def one_click_unsubscribe(
    request: Request,
    token: str = Query(..., min_length=1, max_length=_MAX_TOKEN),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """RFC 8058: the mail client POSTs `List-Unsubscribe=One-Click` here.

    The token rides in the query string because the header's URL is all the
    client has. Only a POST changes anything: a scanner that prefetches the
    URL sends a GET, and the GET below changes nothing. The form body is not
    read — the POST itself is the signal, and the token is the authorization.
    """
    # REUSES: routers/marketing.py unsubscribe_weekly_summary — same token,
    # same idempotent 200, same 400, never reveals whether the business exists.
    producer_id = decode_unsubscribe_token(token)
    if producer_id is None:
        raise HTTPException(status_code=400, detail=_BAD_LINK)
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is not None and not producer.weekly_summary_opt_out:
        producer.weekly_summary_opt_out = True  # type: ignore[assignment]
        db.commit()
    return {"detail": "הסיכום השבועי לא יישלח עוד."}


@one_click_router.get(ONE_CLICK_PATH, status_code=303)
@limiter.limit("60/hour")
def one_click_landing(request: Request, token: str = "") -> RedirectResponse:
    """A client that opens the header's URL instead of POSTing lands on the
    same page as the link in the email body, where the page asks nothing
    and POSTs on its own. This GET itself changes nothing. The target is
    always our own page (no open redirect); the token is only quoted into it."""
    base = settings.frontend_url.rstrip("/")
    query = urlencode({"token": token[:_MAX_TOKEN]})
    return RedirectResponse(f"{base}{UNSUBSCRIBE_PATH}?{query}", status_code=303)
