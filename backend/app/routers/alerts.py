"""MEH-54: Favorite alert preferences + push notification triggers.

Endpoints (all require auth):
  GET  /users/me/favorites/{producer_id}/alerts  — get current prefs
  PUT  /users/me/favorites/{producer_id}/alerts  — upsert prefs + optional push sub

Exported helper:
  fire_alerts(db, producer_id, alert_type, content, target_cities=None)
    alert_type: "new_event" | "new_product" | "delivery_area"
    content: AlertContent(title, body, url)
    target_cities: optional list[str] — when provided (delivery_area), only
      users whose User.city normalizes to one of them receive the alert
      (MEH-1360); "{cities}" in content.body is replaced per-recipient with
      their matched cities only.
    Called from events.py + producer_me.py via FastAPI BackgroundTasks.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import AlertLog, Favorite, FavoriteAlert, User
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

# MEH-1338: frequency cap — at most one message per (user, producer, channel)
# in a rolling 24h window (a producer adding 5 products in a row sends ONE
# message per channel, not 5). alert_type is not part of the cap key. Blocked
# alerts are dropped in v1 — a digest is a follow-up.
_CAP_WINDOW = timedelta(hours=24)
_CHANNEL_PUSH = "push"
_CHANNEL_WHATSAPP = "whatsapp"


def _recently_sent(db: Session, user_id: UUID, producer_id: UUID, channel: str) -> bool:
    """True if `channel` already delivered to (user, producer) within 24h."""
    cutoff = datetime.utcnow() - _CAP_WINDOW
    return db.query(
        db.query(AlertLog)
        .filter(
            AlertLog.user_id == user_id,
            AlertLog.producer_id == producer_id,
            AlertLog.channel == channel,
            AlertLog.sent_at >= cutoff,
        )
        .exists()
    ).scalar()


def _record_alert_send(
    db: Session, user_id: UUID, producer_id: UUID, channel: str, alert_type: str
) -> None:
    """Append an AlertLog row so the next same-channel event within 24h is capped."""
    db.add(
        AlertLog(
            user_id=user_id,
            producer_id=producer_id,
            channel=channel,
            alert_type=alert_type,
        )
    )
    db.commit()


# MEH-1360: geographic targeting for delivery_area alerts. City strings come
# from two unvalidated sources (User.city free text vs the producer's city
# picker), so equality must survive the notation drift the cities data already
# carries: surrounding whitespace, letter case (latin entries), and the
# hyphen/maqaf/en-dash family ("תל אביב-יפו" vs "תל אביב – יפו"). Hebrew
# geresh/gershayim are mapped to their ASCII lookalikes for the same reason.
_CITY_SEPARATORS = re.compile(r"[-־–—]")  # hyphen, maqaf, en/em dash
_CITY_QUOTE_MAP = str.maketrans({"׳": "'", "״": '"'})  # geresh, gershayim


def _normalize_city(value: str | None) -> str:
    """Collapse a city string to a comparison form; "" when unusable."""
    if not value:
        return ""
    text = _CITY_SEPARATORS.sub(" ", value.translate(_CITY_QUOTE_MAP))
    return re.sub(r"\s+", " ", text).strip().casefold()


def _matched_target_cities(
    user: User | None, targets: list[tuple[str, str]]
) -> list[str]:
    """The original target-city strings whose normalized form equals the
    user's normalized city; [] when the user has no usable city or no match."""
    norm = _normalize_city(user.city if user else None)
    if not norm:
        return []
    return [orig for norm_t, orig in targets if norm_t == norm]


def _normalize_targets(target_cities: list[str] | None) -> list[tuple[str, str]] | None:
    """(normalized, original) pairs; None passes through (targeting off).
    Entries that normalize to "" are dropped — they can never match a city."""
    if target_cities is None:
        return None
    return [(_normalize_city(c), c) for c in target_cities if _normalize_city(c)]


def _recipient_body(
    alert: FavoriteAlert, content: AlertContent, targets: list[tuple[str, str]] | None
) -> str | None:
    """The per-recipient push body, or None when the recipient is geo-filtered.

    MEH-1360: with targeting on, a non-matching (or city-less) user returns
    None — the caller skips them BEFORE the MEH-1338 cap check, so a
    suppressed alert never writes an AlertLog row (which would silently cap
    a future, genuinely relevant one). "{cities}" is filled with only the
    recipient's matched cities.
    """
    if targets is None:
        return content.body
    matched = _matched_target_cities(alert.user, targets)
    if not matched:
        return None
    return content.body.replace("{cities}", ", ".join(matched))


def fire_alerts(
    db: Session,
    producer_id: UUID,
    alert_type: str,
    content: AlertContent,
    target_cities: list[str] | None = None,
) -> None:
    """Fan-out notifications to all users who opted in for alert_type on producer_id.

    Sends:
      - Web Push (if push_subscription set and VAPID configured)
      - WhatsApp (if whatsapp_opt_in and user.phone set)

    MEH-1338: each channel is frequency-capped to at most one message per
    (user, producer, channel) in a rolling 24h window (AlertLog ledger).

    MEH-1360: when target_cities is provided, only users whose User.city
    normalizes to one of them are considered at all — a geo-filtered user is
    skipped BEFORE the cap check, so no AlertLog row is written for an alert
    that was never sent. "{cities}" in content.body is replaced per recipient
    with only THEIR matched cities. target_cities=None → behavior unchanged.

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

    producer_name = alerts[0].producer.name if alerts and alerts[0].producer else ""

    targets = _normalize_targets(target_cities)

    for alert in alerts:
        # MEH-1360: None → geo-filtered, skip this recipient entirely (before
        # the cap check — rationale in _recipient_body).
        body = _recipient_body(alert, content, targets)
        if body is None:
            continue

        # MEH-1338: each channel is capped independently — skip a channel that
        # already delivered to this (user, producer) within the last 24h. The
        # AlertLog row is written only after a non-raising send, so a failed
        # send doesn't suppress the next attempt.
        if alert.push_subscription and not _recently_sent(
            db, alert.user_id, producer_id, _CHANNEL_PUSH
        ):
            try:
                send_push_notification(
                    alert.push_subscription,
                    title=content.title,
                    body=body,
                    url=content.url,
                )
                _record_alert_send(
                    db, alert.user_id, producer_id, _CHANNEL_PUSH, alert_type
                )
            except Exception as exc:
                log.warning("push failed for user %s: %s", alert.user_id, exc)

        if (
            alert.whatsapp_opt_in
            and alert.user
            and alert.user.phone
            and not _recently_sent(db, alert.user_id, producer_id, _CHANNEL_WHATSAPP)
        ):
            try:
                # MEH-1329: business-initiated favorite alerts must go out as the
                # approved utility template favorite_alert_he_v1 — a free-form
                # text message only delivers inside the 24h service window, which
                # a favoriting customer almost never has open → Meta 131047
                # window_expired and the alert vanishes silently.
                _send_whatsapp_alert(alert.user.phone, producer_name, content)
                _record_alert_send(
                    db, alert.user_id, producer_id, _CHANNEL_WHATSAPP, alert_type
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
