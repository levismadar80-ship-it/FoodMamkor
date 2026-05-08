"""MEH-54: Favorite alert preferences + push notification triggers.

Endpoints (all require auth):
  GET  /users/me/favorites/{producer_id}/alerts  — get current prefs
  PUT  /users/me/favorites/{producer_id}/alerts  — upsert prefs + optional push sub

Exported helper:
  fire_alerts(db, producer_id, alert_type, content)
    alert_type: "new_event" | "new_product" | "delivery_area"
    content: AlertContent(title, body, url)
    Called from events.py + producer_me.py via FastAPI BackgroundTasks.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.config import settings

from app.auth import get_current_user
from app.database import get_db
from app.models import Favorite, FavoriteAlert, User
from app.services.whatsapp import send_text

# MEH-460 Pkg 4: schemas relocated to app.schemas.schemas per ADR-006 R1.
# AlertContent is re-exported here so existing
# `from app.routers.alerts import AlertContent` callers
# (events.py, producer_me.py) keep working without scope creep.
from app.schemas.schemas import AlertContent, AlertPrefsIn, AlertPrefsOut

log = logging.getLogger(__name__)

router = APIRouter(prefix="/users/me/favorites", tags=["alerts"])


# ============================================================
# Endpoints
# ============================================================


@router.get("/{producer_id}/alerts", response_model=AlertPrefsOut)
def get_alert_prefs(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alert = (
        db.query(FavoriteAlert)
        .filter(
            FavoriteAlert.user_id == user.id,
            FavoriteAlert.producer_id == producer_id,
        )
        .first()
    )
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
    fav = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == user.id,
            Favorite.producer_id == producer_id,
        )
        .first()
    )
    if not fav:
        raise HTTPException(
            status_code=400, detail="יש לשמור את בית העסק במועדפים תחילה"
        )

    alert = (
        db.query(FavoriteAlert)
        .filter(
            FavoriteAlert.user_id == user.id,
            FavoriteAlert.producer_id == producer_id,
        )
        .first()
    )

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


def fire_alerts(
    db: Session, producer_id: UUID, alert_type: str, content: AlertContent
) -> None:
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
                send_push_notification(
                    alert.push_subscription,
                    title=content.title,
                    body=content.body,
                    url=content.url,
                )
            except Exception as exc:
                log.warning("push failed for user %s: %s", alert.user_id, exc)

        if alert.whatsapp_opt_in and alert.user and alert.user.phone:
            try:
                # MEH-453: use canonical from settings.frontend_url. Bonus —
                # old prefix lacked https://, so WhatsApp link previews were
                # flaky; settings.frontend_url is fully-qualified.
                _send_whatsapp_alert(
                    alert.user.phone,
                    f"{content.title}\n{content.body}\n{settings.frontend_url}{content.url}",
                )
            except Exception as exc:
                log.warning("whatsapp alert failed for user %s: %s", alert.user_id, exc)


def _send_whatsapp_alert(to: str, body: str) -> None:
    # MEH-508: WhatsApp via Meta Cloud API. send_text fail-opens on missing
    # config / HTTP errors, so the local guard + try/except collapse here.
    # fire_alerts() above still wraps this in its own try/except so a
    # transient failure can't break the alert dispatch loop.
    send_text(to, body)
