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
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Favorite, FavoriteAlert, User
from app.services.whatsapp import send_template
from app.services.whatsapp_templates import FavoriteAlertHeV1

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

    # MEH-1191: defense-in-depth. Refuse to persist whatsapp_opt_in=true when the
    # user has no phone on file — otherwise fire_alerts (:194) skips the WhatsApp
    # branch silently and the toggle promises a delivery it can never make. The
    # :194 guard STAYS (correct last-line defense); this is the first line.
    if data.whatsapp_opt_in and not (user.phone and user.phone.strip()):
        raise HTTPException(
            status_code=422,
            detail="יש להזין מספר טלפון כדי להפעיל עדכונים בוואטסאפ",
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
            .options(
                joinedload(FavoriteAlert.user),
                joinedload(FavoriteAlert.producer),
            )
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
                # MEH-1329: business-initiated favorite alerts must go out as the
                # approved utility template favorite_alert_he_v1 — a free-form
                # text message only delivers inside the 24h service window, which
                # a favoriting customer almost never has open → Meta 131047
                # window_expired and the alert vanishes silently.
                _send_whatsapp_alert(
                    alert.user.phone,
                    alert.producer.name if alert.producer else "",
                    content,
                )
            except Exception as exc:
                log.warning("whatsapp alert failed for user %s: %s", alert.user_id, exc)


# MEH-1329: Meta template parameters reject newline / tab / 4+ consecutive
# spaces, and a leading emoji weakens the UTILITY-category classification.
# Strip a leading emoji/symbol run, then collapse every whitespace run to a
# single space.
_LEADING_EMOJI = re.compile(
    "^[\\s‍️"  # whitespace + ZWJ (U+200D) + variation-selector-16 (U+FE0F)
    "\U0001f300-\U0001faff"
    "\U00002600-\U000027bf"
    "\U0001f1e6-\U0001f1ff"
    "]+"
)


def _sanitize_wa_param(text: str) -> str:
    """Emoji-strip + single-line a WhatsApp template body parameter."""
    return re.sub(r"\s+", " ", _LEADING_EMOJI.sub("", text)).strip()


def _send_whatsapp_alert(to: str, producer_name: str, content: AlertContent) -> None:
    # MEH-1329: business-initiated, so send the approved utility template
    # favorite_alert_he_v1 (not a free-form text message). {{1}} = business name,
    # {{2}} = the sanitized headline; content.body carries a newline and is
    # NOT sent over WhatsApp (Meta rejects newline params) — the push channel
    # still gets title+body unchanged. url_path is the leading-"/" path; the
    # domain lives on the Meta template button, not concatenated here.
    # send_template fail-opens on missing config / HTTP errors; fire_alerts()
    # also wraps this call so a transient failure can't break the loop.
    #
    # Both body params run through the sanitizer — a producer name/title with a
    # newline / tab / 4+ spaces (both are unvalidated free text) would otherwise
    # trip Meta 131008. Sanitizing can also collapse an all-emoji value to "" —
    # an empty Meta param is itself a 131008. Skip loudly rather than fire a
    # doomed template (which would only be generically logged by the transport).
    name = _sanitize_wa_param(producer_name)
    update_line = _sanitize_wa_param(content.title)
    if not name or not update_line:
        log.warning(
            "whatsapp alert skipped — empty template param after sanitize "
            "(producer_name=%r, title=%r)",
            producer_name,
            content.title,
        )
        return
    send_template(
        to,
        FavoriteAlertHeV1(
            producer_name=name,
            update_line=update_line,
            url_path=content.url,
        ),
    )
