from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.limits import enforce_cap
from app.auth import require_producer
from app.database import get_db
from app.rate_limit import limiter
from app.routers.product_describe import _business_key as _ai_business_key  # MEH-3497
from app.services.availability_validation import (
    AvailabilityValidationError,
    resolve_vacation_until,
    validate_transition,
)
from app.utils.clock import utc_now
from app.models import (
    Favorite,
    Producer,
    Product,
    ProducerOffer,  # noqa: F401 — test_producer_offers reads pm.ProducerOffer (MEH-3569)
    ProducerWhatsAppClick,
    User,
)
import logging

from app.schemas.schemas import (
    WRITABLE_AVAILABILITY_STATES,
    AvailabilityStateUpdate,
    BioGenerateIn,
    ProducerOwnerOut,
    ProducerUpdate,
    ProductCreate,
    ProductOut,
    ProductUpdate,
)
from app.services import approved_edit_moderation as approved_edit  # MEH-3261
from app.services.owner_attention import owner_attention  # MEH-3108
from app.services.image_ownership import assert_own_new_images  # MEH-3247
from app.services.submission_gate import (
    attach_owner_email_verified,
    attach_upcoming_events_count,
)
from app.services.producer_me_writes import (  # noqa: F401 — MEH-3569: moved; tests and admin.py import these names from here
    LAST_PHOTO_GUARDED_STATUSES,
    LAST_PHOTO_REMOVAL_CODE,
    LAST_PHOTO_REMOVAL_MESSAGE,
    _PRODUCER_UPDATE_LOCK_NAMESPACE,
    _apply_delivery_cities,
    _apply_delivery_rows,
    _apply_organizer_city,
    _assert_gallery_rules,
    _assert_keeps_a_photo,
    _lock_producer_updates,
    _replace_city_rows,
    _resolve_top_product,
    _sync_active_offer,
    _sync_delivery_areas,
    reconcile_secondary_phone,
)
from app.services.producer_owner_update import (  # noqa: F401 — MEH-3841: moved; producer_me_locations / _review / google_profile and tests import these names from here
    SENSITIVE_FIELDS,
    _fire_sensitive_edit,
    _is_approvable,
    _maybe_fire_review_ready,
    _maybe_fire_sensitive_edit,
    _pending_and_approvable,
    _sensitive_edit_task,
    _snapshot_sensitive,
    _test_cause,
    update_owner_producer,
)
from app.services.owner_products import (  # MEH-3569
    apply_product_update,
    own_product_or_404,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/producers/me", tags=["producer-management"])


@router.get("", response_model=ProducerOwnerOut)
def get_my_producer(
    user: User = Depends(require_producer), db: Session = Depends(get_db)
) -> ProducerOwnerOut | Producer:
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.id == user.producer_id)
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    attach_upcoming_events_count(producer)  # MEH-2460
    attach_owner_email_verified(producer)  # MEH-3660
    return producer


# MEH-1938 follow-up (Sapir, 02/09) — the single-primary invariant speaks with
# ONE voice. Both the demote arm and the delete arm of the locations CRUD are
# the same rule seen from two sides, so they share this exact string; a second
# wording (or a second status code) would read to a client as a second rule.
# Hebrew in `detail=` is required — backend/app/routers/CLAUDE.md.
ONE_PRIMARY_REQUIRED = "חובה מיקום ראשי אחד"

# Promotion is branch-only. `pickup` and `market_stand` are the secondary
# layer (MEH-1412) and cannot answer "where is the business".
#
# The second sentence is load-bearing and was added on Sapir's copy ruling
# (rule 22): the prohibition alone leaves a delivery-only owner stuck, since
# she flags her only pickup point and is told no with no way forward. It names
# the legitimate state MEH-213 already recognises instead. Mirrored for the UI
# as settings.locations.errors.primary_must_be_branch in he.json + en.json.
PRIMARY_MUST_BE_BRANCH = (
    "המיקום הראשי חייב להיות סניף. "
    "אם אין לעסק כתובת פיזית, אפשר להשאיר את המיקום הראשי ריק."
)

# MEH-1943 chunk 1: `{code, message, params}` (the MEH-1164 / MEH-1940 shape).
# `message` is the approved sentence above, word for word, so a consumer that
# still renders `detail.message` shows exactly what it showed before; the
# frontend maps the `code` to settings.locations.errors.<code> (he + en).
ONE_PRIMARY_REQUIRED_DETAIL = {
    "code": "one_primary_required",
    "message": ONE_PRIMARY_REQUIRED,
    "params": {},
}
PRIMARY_MUST_BE_BRANCH_DETAIL = {
    "code": "primary_must_be_branch",
    "message": PRIMARY_MUST_BE_BRANCH,
    "params": {},
}


@router.put("", response_model=ProducerOwnerOut)
@limiter.limit("30/hour")
def update_my_producer(
    request: Request,
    data: ProducerUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> ProducerOwnerOut | Producer:
    # MEH-3841: the whole save lives in services/producer_owner_update.py.
    return update_owner_producer(db, user, data, background_tasks)


# MEH-2758 (MEH-2757 chunk 1): the two legacy availability write paths
# (POST /availability, POST /availability-status — MEH-291, LEGACY MEH-1854)
# are deleted. No frontend called either, and both could still write
# `available_today` / `full_this_week`, which MEH-2782 later removed.
# POST /availability-state below is the only availability write endpoint.


@router.post("/availability-state", response_model=None)
@limiter.limit("20/hour")
def set_availability_state(
    request: Request,
    data: AvailabilityStateUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # Value membership stays a 400 before the DB hit (preserves existing
    # contract); the transition + return-date guards run against the
    # producer's current state below (AUD-039/040).
    # MEH-2758: pause-only — the read-side enum is wider than what may be written.
    if data.state not in WRITABLE_AVAILABILITY_STATES:
        raise HTTPException(
            status_code=400,
            # MEH-1943 chunk 2: the allowed set moves to params, never the message.
            detail={
                "code": "invalid_availability_state",
                "message": "מצב לא תקין",
                "params": {"allowed": list(WRITABLE_AVAILABILITY_STATES)},
            },
        )

    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    try:
        validate_transition(producer.availability_state, data.state)  # type: ignore[arg-type]
        vacation_until = resolve_vacation_until(data.state, data.vacation_until)
    except AvailabilityValidationError as e:
        # value violation → 400; missing/past return date → 422.
        raise HTTPException(
            status_code=400 if e.kind == "value" else 422, detail=e.detail()
        ) from e

    # MEH-2271: one column. The dual-write to is_available_today +
    # availability_status is gone — ProducerListOut derives both from this
    # value, so writing them here would be a second authority over one fact.
    producer.availability_state = data.state  # type: ignore[assignment]
    producer.vacation_until = vacation_until  # type: ignore[assignment]
    producer.last_active_at = utc_now()  # type: ignore[assignment]
    # MEH-2697: stating the availability is confirming it.
    producer.availability_confirmed_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    db.commit()
    return {
        "availability_state": producer.availability_state,
        "vacation_until": producer.vacation_until.isoformat()
        if producer.vacation_until
        else None,
    }


@router.post("/availability-confirm", response_model=None)
@limiter.limit("20/hour")
def confirm_availability(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """MEH-2697 «עדיין נכון»: the owner says her availability is still true.

    Changes nothing but the stamp — the state and the vacation date stay.
    REUSES: set_availability_state above — same owner gate and rate limit.
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    now = datetime.now(timezone.utc)
    producer.availability_confirmed_at = now  # type: ignore[assignment]
    producer.last_active_at = utc_now()  # type: ignore[assignment]
    db.commit()
    return {"availability_confirmed_at": now.isoformat()}


@router.get("/dashboard", response_model=None)
def dashboard(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Minimal producer dashboard summary — kept stable for backward compat
    with the existing `/producer/dashboard` UI that already fetches this
    route. The richer analytics live at /producers/me/analytics."""
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    favorites_count = (
        db.query(func.count(Favorite.producer_id))
        .filter(Favorite.producer_id == producer.id)
        .scalar()
        or 0
    )

    # feature/producer-analytics: real counts from producer_whatsapp_clicks.
    week_ago = utc_now() - timedelta(days=7)
    whatsapp_clicks_week = (
        db.query(func.count(ProducerWhatsAppClick.id))
        .filter(
            ProducerWhatsAppClick.producer_id == producer.id,
            ProducerWhatsAppClick.clicked_at >= week_ago,
        )
        .scalar()
        or 0
    )

    return {
        "producer": {
            "id": str(producer.id),
            "name": producer.name,
            # MEH-291 — durable 4-value enum, the only one written.
            # Defensive default in case ORM ever returns NULL despite NOT NULL.
            "availability_state": producer.availability_state or "accepting_orders",
            "vacation_until": producer.vacation_until.isoformat()
            if producer.vacation_until
            else None,
            "status": producer.status,
            "plan": producer.plan,
        },
        "favorites_count": int(favorites_count),
        "whatsapp_clicks_week": int(whatsapp_clicks_week),
        "attention": owner_attention(db, producer.id, user.id),  # type: ignore[arg-type]  # MEH-3108
    }


# ---------------------------------------------------------------------------
# MEH-51: Phone verification (WhatsApp OTP)
# ---------------------------------------------------------------------------


OTP_NOT_SENT = "לא הצלחנו לשלוח את הקוד בוואטסאפ כרגע. נסו שוב בעוד כמה דקות."


# ---------------------------------------------------------------------------
# MEH-56: AI bio generator
# ---------------------------------------------------------------------------


# MEH-3497: a per-business daily cap on top of the per-IP hourly one.
BIO_DAILY_CAP = "20/day"


def _mark_bio(request: Request, user: User = Depends(require_producer)) -> User:
    request.state.ai_key = f"bio:{user.producer_id or user.id}"
    return user


@router.post("/bio/generate", response_model=None)
@limiter.limit("5/hour")
@limiter.limit(BIO_DAILY_CAP, key_func=_ai_business_key)
def generate_bio_endpoint(
    request: Request,
    body: BioGenerateIn,
    user: User = Depends(_mark_bio),
) -> dict[str, Any]:
    """Generate a Hebrew ≤150-char business description via Claude Haiku.

    MEH-1173: accepts structured input (sells + optional area/special/
    instagram) — the Instagram scrape is gone. Fail-open: returns
    {"bio": ""} when AI is unavailable.
    """
    from app.services.bio_generator import generate_bio

    bio = generate_bio(body.sells, body.area, body.special, body.instagram)
    return {"bio": bio}


# MEH-88: Product CRUD
# ---------------------------------------------------------------------------


@router.get("/products", response_model=list[ProductOut])
def list_my_products(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> list[ProductOut] | list[Product]:
    # MEH-2312: drafts belong to the admin import until approved.
    return (
        db.query(Product)
        .filter(Product.producer_id == user.producer_id, Product.is_draft.is_(False))
        .all()
    )


@router.post("/products", response_model=ProductOut, status_code=201)
@limiter.limit("60/hour")
def create_my_product(
    request: Request,
    data: ProductCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> ProductOut | Product:
    # MEH-3022: per-business cap (app/limits.py).
    enforce_cap(
        db.query(Product).filter(Product.producer_id == user.producer_id).count(),
        "products",
    )
    assert_own_new_images(user, data.image_url)  # MEH-3247
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    approved_edit.check_product(  # MEH-3261
        background_tasks,
        producer,
        None,
        data.model_dump(),
        bool(producer and _test_cause(producer, user)),
    )
    product = Product(producer_id=user.producer_id, **data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)

    # PR #404 (3b7e3ea5, "audit Gap A"): notify favoriting users who opted in
    # for new-product alerts. Wires the previously-orphaned "new_product"
    # alert_type (see _ALERT_COL in routers/alerts.py). No Linear ticket was
    # ever assigned — the original marker was a literal, unresolvable MEH-XXX.
    producer_name = producer.name if producer else "בית העסק"
    from app.routers.alerts import AlertContent, fire_alerts

    background_tasks.add_task(
        fire_alerts,
        db,
        user.producer_id,  # type: ignore[arg-type]
        "new_product",
        AlertContent(
            title=f"מוצר חדש מ{producer_name}",
            body=product.name,
            url=f"/producer/{user.producer_id}",
        ),
    )

    return product


@router.put("/products/{product_id}", response_model=ProductOut)
@limiter.limit("60/hour")
def update_my_product(  # noqa: PLR0913 — all args are FastAPI-injected; MEH-3261 added BackgroundTasks for the flag ping
    request: Request,
    product_id: UUID,
    data: ProductUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> ProductOut | Product:
    product = own_product_or_404(db, user.producer_id, product_id)  # type: ignore[arg-type]  # MEH-3569
    payload = data.model_dump(exclude_unset=True)
    assert_own_new_images(user, payload.get("image_url"), product.image_url)  # MEH-3247
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    approved_edit.check_product(  # MEH-3261
        background_tasks,
        producer,
        product,
        payload,
        bool(producer and _test_cause(producer, user)),
    )
    apply_product_update(product, payload)  # MEH-3569
    db.commit()
    db.refresh(product)
    return product


@router.delete("/products/{product_id}", status_code=204)
@limiter.limit("60/hour")  # MEH-3022
def delete_my_product(
    request: Request,  # required by slowapi (MEH-3022)
    product_id: UUID,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> None:
    product = own_product_or_404(db, user.producer_id, product_id)  # type: ignore[arg-type]  # MEH-3569

    # MEH-375 (YF-2): capture image_url BEFORE db.delete; destroy after
    # commit per the external-cleanup rule. Truthy guard skips the
    # logger spam for products that never had an image.
    old_image_url = product.image_url

    db.delete(product)
    db.commit()

    if old_image_url:
        from app.cloudinary_utils import destroy_image

        destroy_image(
            old_image_url,  # type: ignore[arg-type]
            context="producer_me.delete_my_product image",
            db=db,  # MEH-3247
        )
