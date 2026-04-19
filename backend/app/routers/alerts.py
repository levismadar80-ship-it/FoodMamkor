"""MEH-54: Favorite alert preferences + push notification triggers.

Endpoints (all require auth):
  GET  /users/me/favorites/{producer_id}/alerts  — get current prefs
  PUT  /users/me/favorites/{producer_id}/alerts  — upsert prefs + optional push sub

Exported helper:
  fire_alerts(db, producer_id, alert_type, title, body, url)
    alert_type: "new_event" | "new_product" | "delivery_area"
    Called from events.py + producer_me.py via FastAPI BackgroundTasks.
"""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Favorite, FavoriteAlert, User

log = logging.getLogger(__name__)

router = APIRouter(prefix="/users/me/favorites", tags=["alerts"])


# ============================================================
# Schemas
# ============================================================


class AlertPrefsIn(BaseModel):
    notify_new_product: bool = True
    notify_new_event: bool = True
    notify_delivery_area: bool = True
    whatsapp_opt_in: bool = False
    push_subscription: dict | None = None


class AlertPrefsOut(BaseModel):
    enabled: bool
    notify_new_product: bool
    notify_new_event: bool
    notify_delivery_area: bool
    whatsapp_opt_in: bool
    has_push: bool


# ============================================================
# Endpoints
# ============================================================


@router.get("/{producer_id}/alerts", response_model=AlertPrefsOut)
def get_alert_prefs(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alert = db.query(FavoriteAlert).filter(
        FavoriteAlert.user_id == user.id,
        FavoriteAlert.producer_id == producer_id,
    ).first()
    if not alert:
        return AlertPrefsOut(
            enabled=False,
            notify_new_product=False,
            notify_new_event=False,
            notify_delivery_area=False,
            whatsapp_opt_in=False,
            has_push=False,
        )
    return AlertPrefsOut(
        enabled=True,
        notify_new_product=bool(alert.notify_new_product),
        notify_new_event=bool(alert.notify_new_event),
        notify_delivery_area=bool(alert.notify_delivery_area),
        whatsapp_opt_in=bool(alert.whatsapp_opt_in),
        has_push=bool(alert.push_subscription),
    )


@router.put("/{producer_id}/alerts", response_model=AlertPrefsOut)
def upsert_alert_prefs(
    producer_id: UUID,
    data: AlertPrefsIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fav = db.query(Favorite).filter(
        Favorite.user_id == user.id,
        Favorite.producer_id == producer_id,
    ).first()
    if not fav:
        raise HTTPException(status_code=400, detail="יש לשמור את בית העסק במועדפים תחילה")

    alert = db.query(FavoriteAlert).filter(
        FavoriteAlert.user_id == user.id,
        FavoriteAlert.producer_id == producer_id,
    ).first()

    if alert:
        alert.notify_new_product = data.notify_new_product
        alert.notify_new_event = data.notify_new_event
        alert.notify_delivery_area = data.notify_delivery_area
        alert.whatsapp_opt_in = data.whatsapp_opt_in
        if data.push_subscription is not None:
            alert.push_subscription = data.push_subscription
    else:
        alert = FavoriteAlert(
            user_id=user.id,
            producer_id=producer_id,
            notify_new_product=data.notify_new_product,
            notify_new_event=data.notify_new_event,
            notify_delivery_area=data.notify_delivery_area,
            whatsapp_opt_in=data.whatsapp_opt_in,
            push_subscription=data.push_subscription,
        )
        db.add(alert)

    db.commit()
    db.refresh(alert)
    return AlertPrefsOut(
        enabled=True,
        notify_new_product=bool(alert.notify_new_product),
        notify_new_event=bool(alert.notify_new_event),
        notify_delivery_area=bool(alert.notify_delivery_area),
        whatsapp_opt_in=bool(alert.whatsapp_opt_in),
        has_push=bool(alert.push_subscription),
    )


# ============================================================
# Alert firing helper (called via BackgroundTasks from other routers)
# ============================================================

_ALERT_COL = {
    "new_event": "notify_new_event",
    "new_product": "notify_new_product",
    "delivery_area": "notify_delivery_area",
}


def fire_alerts(db: Session, producer_id: UUID, alert_type: str, title: str, body: str, url: str = "/") -> None:
    """Fan-out notifications to all users who opted in for alert_type on producer_id.

    Sends:
      - Web Push (if push_subscription set and VAPID configured)
      - WhatsApp (if whatsapp_opt_in and user.phone set)

    Fail-open: exceptions are logged but never re-raised so the background
    task never crashes the request that triggered it.
    """
    col_name = _ALERT_COL.get(alert_type)
    if not col_name:
        log.warning("fire_alerts: unknown alert_type=%s", alert_type)
        return

    try:
        alerts = (
            db.query(FavoriteAlert)
            .options(joinedload(FavoriteAlert.user))
            .filter(
                FavoriteAlert.producer_id == producer_id,
                getattr(FavoriteAlert, col_name).is_(True),
            )
            .all()
        )
    except Exception as exc:
        log.error("fire_alerts: DB query failed: %s", exc)
        return

    from app.services.push import send_push_notification

    for alert in alerts:
        if alert.push_subscription:
            try:
                send_push_notification(alert.push_subscription, title=title, body=body, url=url)
            except Exception as exc:
                log.warning("push failed for user %s: %s", alert.user_id, exc)

        if alert.whatsapp_opt_in and alert.user and alert.user.phone:
            try:
                _send_whatsapp_alert(alert.user.phone, f"{title}\n{body}\nmehamakor.online{url}")
            except Exception as exc:
                log.warning("whatsapp alert failed for user %s: %s", alert.user_id, exc)


def _send_whatsapp_alert(to: str, body: str) -> None:
    from app.config import settings

    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        log.debug("[ALERT-WA] Would send to %s: %s", to, body)
        return
    from twilio.rest import Client

    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    client.messages.create(
        body=body,
        from_=f"whatsapp:{settings.twilio_whatsapp_from}",
        to=f"whatsapp:{to}",
    )
