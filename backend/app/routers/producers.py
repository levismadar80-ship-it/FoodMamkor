from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user_optional, require_verified_email
from app.database import get_db
from app.models import Category, ContactClick, Producer, ProducerWhatsAppClick, Report, User
from app.rate_limit import limiter
from app.routers.producer_follows import router as producer_follows_router
from app.schemas.schemas import (
    CategoryOut,
    ProducerCreate,
    ProducerDetailOut,
    ProducerListOut,
)
from app.services.analytics import ViewContext, hash_ip, track_producer_view
from app.services.producer_listing import build_producers_query
from app.services.producer_queries import (
    attach_badge_fields,
    attach_favorites_count,
    create_producer_with_relations,
    get_producer_or_404,
)

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["producers"])

# Compose the follow / unfollow / follow-status / my-following sub-router.
# FastAPI mounts these endpoints transitively when router_registry.py
# registers `producers.router` — no separate registration needed.
router.include_router(producer_follows_router)


@router.get("/producers", response_model=list[ProducerListOut])
@limiter.limit("120/minute")
def list_producers(
    request: Request,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float | None = None,
    category: int | None = None,
    delivery_city: str | None = None,
    has_delivery: bool | None = None,
    verified: bool | None = None,
    organic: bool | None = None,
    kosher: bool | None = None,
    # Producer city filter (producer's own city, not delivery area).
    city: str | None = None,
    is_available_today: bool | None = None,
    grass_fed: bool | None = None,
    gluten_free: bool | None = None,
    vegan: bool | None = None,
    lactose_free: bool | None = None,
    # Sort for non-geo results. "newest" (default) or "rating".
    sort: str | None = None,
    # MEH-13 — free-text search over name + description, used by /search
    # results page. Aliased as `q` in the URL to match CLAUDE.md's
    # documented API shape, but named `search_q` internally so it doesn't
    # shadow the `q` SQLAlchemy-query-builder local below.
    search_q: str | None = Query(None, alias="q", max_length=200),
    # MEH-23 — offset-based pagination. Backwards-compatible: existing
    # callers that don't pass these get the first 100 rows (prior
    # behavior was "everything" which is fine at current scale but
    # unbounded). Total row count is exposed via X-Total-Count header
    # so the frontend can render "X מתוך Y" and numbered pagination.
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    # MEH-102 — exclude a single producer by UUID (used by similar-producers widget).
    exclude: UUID | None = None,
    response: Response = None,
    db: Session = Depends(get_db),
):
    results, total_count = build_producers_query(
        db,
        lat=lat, lng=lng, radius_km=radius_km,
        category=category, delivery_city=delivery_city, has_delivery=has_delivery,
        verified=verified, organic=organic, kosher=kosher, city=city,
        is_available_today=is_available_today,
        grass_fed=grass_fed, gluten_free=gluten_free, vegan=vegan, lactose_free=lactose_free,
        sort=sort, search_q=search_q,
        limit=limit, offset=offset, exclude=exclude,
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(total_count)
    return results


@router.get("/producers/count")
@limiter.limit("60/minute")
def producers_count(request: Request, db: Session = Depends(get_db)):
    """MEH-159 — lightweight total count for keeping pagination fresh client-side."""
    count = db.query(func.count(Producer.id)).filter(Producer.status == "approved").scalar() or 0
    return {"count": count}


@router.get("/producers/by-slug/{slug}", response_model=ProducerDetailOut)
@limiter.limit("120/minute")
def get_producer_by_slug(slug: str, request: Request, db: Session = Depends(get_db)):
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.slug == slug, Producer.status == "approved")
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    attach_badge_fields(producer)
    attach_favorites_count(producer, db)
    report_count = db.query(func.count(Report.id)).filter(Report.producer_id == producer.id).scalar() or 0
    result = ProducerDetailOut.model_validate(producer)
    result.report_count = report_count
    return result


@router.get("/producers/{producer_id}", response_model=ProducerDetailOut)
@limiter.limit("120/minute")
def get_producer(
    producer_id: UUID,
    request: Request,
    from_: str | None = Query(None, alias="from"),
    viewer: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.id == producer_id)
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-254 — pending/rejected producers are not consented-to-public. Only
    # the owner and admins may fetch them by UUID; everyone else sees 404 so
    # the UUID can't be used to enumerate queue state.
    if producer.status != "approved":
        is_admin = getattr(viewer, "role", None) == "admin"
        is_owner = viewer is not None and viewer.producer_id == producer.id
        if not (is_admin or is_owner):
            raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-18 — compute badge fields from the already-loaded relationships.
    attach_badge_fields(producer)
    # MEH-106: social proof count.
    attach_favorites_count(producer, db)

    # Compute report_count from DB
    report_count = db.query(func.count(Report.id)).filter(Report.producer_id == producer_id).scalar() or 0
    result = ProducerDetailOut.model_validate(producer)
    result.report_count = report_count

    # feature/producer-analytics: track the view. Best-effort; swallows
    # all exceptions so tracking glitches can never break the response.
    # Bot UAs are filtered inside track_producer_view.
    client_ip = request.client.host if request.client else None
    track_producer_view(
        db,
        producer_id=producer_id,
        ctx=ViewContext(
            viewer_ip=client_ip,
            user_agent=request.headers.get("user-agent"),
            viewer_user=viewer,
            referrer=from_,
        ),
    )

    return result


@router.post("/producers/{producer_id}/whatsapp-click")
@limiter.limit("10/minute")  # SECURITY FIX #2 — cap anonymous write abuse
def record_whatsapp_click(
    request: Request,
    producer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Log a WhatsApp CTA click for the producer dashboard.

    Auth optional — JWT is accepted when present so the click can be
    attributed to a registered user. Frontend fires this via
    `navigator.sendBeacon` immediately before opening `wa.me` —
    fire-and-forget, doesn't block the window. Rate-limited 10/minute
    per IP to bound abuse. Unknown producer IDs return 404.
    """
    # existence check — full row acceptable at 10/min rate limit
    get_producer_or_404(db, producer_id)
    db.add(ProducerWhatsAppClick(
        producer_id=producer_id,
        user_id=current_user.id if current_user else None,
    ))
    db.commit()
    return {"detail": "logged"}


_VALID_CONTACT_METHODS = frozenset({"phone", "instagram", "website", "email"})


class ContactClickIn(BaseModel):
    method: str


@router.post("/producers/{producer_id}/contact-click", status_code=204)
@limiter.limit("10/minute")
def record_contact_click(
    request: Request,
    producer_id: UUID,
    data: ContactClickIn,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Log a contact-method click for the producer dashboard.

    Accepts method ∈ {phone, instagram, website, email}. Auth optional —
    JWT when present attributes the click to a registered user. IP is
    SHA-256 hashed (reuses hash_ip from services/analytics). Rate-limited
    10/minute per IP consistent with whatsapp-click.
    """
    if data.method not in _VALID_CONTACT_METHODS:
        raise HTTPException(status_code=422, detail="method לא חוקי")
    # existence check — full row acceptable at 10/min rate limit
    get_producer_or_404(db, producer_id)
    client_ip = request.client.host if request.client else None
    db.add(ContactClick(
        producer_id=producer_id,
        user_id=current_user.id if current_user else None,
        method=data.method,
        ip_hash=hash_ip(client_ip),
    ))
    db.commit()


@router.post("/producers", response_model=ProducerDetailOut, status_code=201)
def create_producer(
    data: ProducerCreate,
    user: User = Depends(require_verified_email),
    db: Session = Depends(get_db),
):
    """Create a pending producer row.

    SECURITY: this endpoint was historically public, which meant anyone
    could create pending producers with no audit trail. It's now
    authenticated — any logged-in user can create, but anonymous callers
    get 401. The public "become a producer" signup flow lives at
    POST /auth/register/producer (see routers/auth.py) and is unaffected.
    """
    return create_producer_with_relations(db, data)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.id).all()


