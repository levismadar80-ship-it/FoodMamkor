"""
Module:   product_orders
Purpose:  A business's on-site ordering settings: the owner reads and saves
          them, and an admin marks a business as licensed to sell alcohol.
Touches:  DB table producer_order_settings (one row per business, created on
          the first save). No outbound message.
Does NOT: create, list or change an order — no route here touches
          product_orders. Those arrive in the next stages of MEH-3216; the
          status rules they will use already exist in
          services/product_order_state.py. Does NOT let the owner set
          `alcohol_licensed`.
Related:  app/schemas/product_orders.py (the shapes),
          app/models/product_orders.py (the table)
History:  MEH-3218 (creation; stage 1 of MEH-3216)

REUSES: backend/app/routers/rescue.py:137-183 — the flag read through getattr
and the 404 gate, so a switched-off feature looks like a route that was never
deployed.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_admin, require_producer
from app.config import settings
from app.database import get_db
from app.models.models import Producer, User
from app.models.product_orders import (
    PRODUCT_ORDER_DEFAULT_CUTOFF_HOURS,
    ProducerOrderSettings,
)
from app.rate_limit import limiter
from app.schemas.product_orders import (
    ProducerOrderAlcoholIn,
    ProducerOrderSettingsIn,
    ProducerOrderSettingsOut,
)

me_router = APIRouter(tags=["product-orders"])
admin_router = APIRouter(prefix="/admin", tags=["product-orders"])

NO_BUSINESS_DETAIL = "בית עסק לא נמצא"


def product_orders_enabled() -> bool:
    """Whether on-site ordering is switched on at all.

    `getattr` with a False default: `backend/app/config.py` is denied to Claude
    Code, so the `product_orders_enabled` field (env PRODUCT_ORDERS_ENABLED) is
    added by Sapir — the patch is in the PR description. Until it lands this
    returns False and every route here answers 404: the feature stays dark
    rather than opening without a switch.
    """
    return bool(getattr(settings, "product_orders_enabled", False))


def require_product_orders_enabled() -> None:
    """404, not 403, so the feature's existence is not advertised while off."""
    if not product_orders_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="לא נמצא")


def _defaults(producer_id: Any) -> dict[str, Any]:
    """What a business that never saved settings has: ordering off."""
    return {
        "producer_id": producer_id,
        "enabled": False,
        "auto_confirm": False,
        "auto_confirm_slot_cap": None,
        "cancel_cutoff_hours": PRODUCT_ORDER_DEFAULT_CUTOFF_HOURS,
        "shabbat_observant": False,
        "min_order_agorot": None,
        "alcohol_licensed": False,
    }


def _settings_row(db: Session, producer_id: Any) -> ProducerOrderSettings | None:
    return (
        db.query(ProducerOrderSettings)
        .filter(ProducerOrderSettings.producer_id == producer_id)
        .first()
    )


def _settings_row_for_write(db: Session, producer_id: Any) -> ProducerOrderSettings:
    """The business's row, created if it is the first save.

    Two first saves can race — a double-tapped save, or the admin's alcohol
    mark landing with the owner's first save. The loser's INSERT hits the
    primary key; it then reads the winner's row and writes onto that, instead
    of answering 500. The savepoint keeps the outer transaction usable.
    """
    row = _settings_row(db, producer_id)
    if row is not None:
        return row
    try:
        with db.begin_nested():
            row = ProducerOrderSettings(producer_id=producer_id)
            db.add(row)
            db.flush()
        return row
    except IntegrityError:
        existing = _settings_row(db, producer_id)
        if existing is None:
            raise
        return existing


def _own_producer_id(user: User) -> Any:
    """The caller's own business. There is no producer id in the path, so there
    is no other business's row to reach — the ownership check is structural."""
    if not user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NO_BUSINESS_DETAIL
        )
    return user.producer_id


@me_router.get(
    "/producers/me/order-settings",
    response_model=ProducerOrderSettingsOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("120/minute")
def get_my_order_settings(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    """The business's ordering settings; the defaults (off) if never saved."""
    producer_id = _own_producer_id(user)
    return _settings_row(db, producer_id) or _defaults(producer_id)


@me_router.put(
    "/producers/me/order-settings",
    response_model=ProducerOrderSettingsOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("30/hour")
def put_my_order_settings(
    request: Request,
    body: ProducerOrderSettingsIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    """Save the whole settings form. `alcohol_licensed` is not in the body and
    is never touched here — only the admin route writes it."""
    producer_id = _own_producer_id(user)
    row = _settings_row_for_write(db, producer_id)
    for field, value in body.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@admin_router.put(
    "/producers/{producer_id}/order-settings/alcohol",
    response_model=ProducerOrderSettingsOut,
    dependencies=[Depends(require_product_orders_enabled)],
)
@limiter.limit("60/minute")
def set_alcohol_licensed(
    request: Request,
    producer_id: UUID,
    body: ProducerOrderAlcoholIn,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Any:
    """Mark a business as licensed to sell alcohol (or take the mark away).

    Sapir's decision of 14/11: alcohol can be ordered only from a business an
    admin has marked. The mark does not switch ordering on — `enabled` is the
    owner's own choice and a row created here starts with it off.
    """
    if not db.query(Producer.id).filter(Producer.id == producer_id).first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NO_BUSINESS_DETAIL
        )
    row = _settings_row_for_write(db, producer_id)
    row.alcohol_licensed = body.alcohol_licensed  # type: ignore[assignment]
    db.commit()
    db.refresh(row)
    return row
