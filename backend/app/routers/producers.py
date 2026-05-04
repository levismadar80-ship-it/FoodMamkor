from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import get_current_user, get_current_user_optional, require_verified_email
from app.database import get_db
from app.models import Category, ContactClick, DeliveryArea, Producer, ProducerCategory, ProducerFollower, ProducerWhatsAppClick, Product, Report, SearchQuery, User
from app.rate_limit import limiter
from app.schemas.schemas import (
    CategoryOut,
    ProducerCreate,
    ProducerDetailOut,
    ProducerListOut,
)
from app.services.analytics import ViewContext, hash_ip, track_producer_view
from app.services.producer_queries import (
    attach_badge_fields,
    attach_favorites_count,
    attach_favorites_counts,
    create_producer_with_relations,
    get_producer_or_404,
    haversine_km,
)

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["producers"])


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
    geo_search = lat is not None and lng is not None and radius_km is not None

    # Build two parallel queries:
    #   q       — the full SELECT (Producer + eager-loaded relationships,
    #             plus distance_expr in geo mode; carries joinedload options
    #             and ORDER BY distance_km).
    #   count_q — a bare `SELECT COUNT(DISTINCT producer.id)`; NO joinedload,
    #             NO order_by, NO extra SELECT entities.
    # Earlier this function did `q.with_entities(func.count(...))`, which
    # dragged joinedload + order_by artifacts into the count SQL and made
    # Postgres reject the query with a 500 on every geo search. Keep the
    # two queries separate and apply each filter/join to BOTH so the total
    # count stays consistent with the page slice.
    if geo_search:
        distance_expr = haversine_km(lat, lng).label("distance_km")
        q = (
            db.query(Producer, distance_expr)
            .options(
                joinedload(Producer.categories),
                # MEH-18 — batch-load the two collections the badge system counts.
                selectinload(Producer.products),
                selectinload(Producer.delivery_areas),
            )
            .filter(Producer.status == "approved")
            # MEH-213: map pins only for producers with a physical location.
            # Delivery-only producers have no address to pin on the map.
            .filter(Producer.has_physical_location.is_(True))
            # Haversine is undefined for NULL coords — exclude them before
            # applying the distance filter.
            .filter(Producer.lat.isnot(None), Producer.lng.isnot(None))
            .filter(distance_expr <= radius_km)
            .order_by(distance_expr.asc())
        )
        count_q = (
            db.query(func.count(Producer.id.distinct()))
            .select_from(Producer)
            .filter(Producer.status == "approved")
            .filter(Producer.has_physical_location.is_(True))
            .filter(Producer.lat.isnot(None), Producer.lng.isnot(None))
            .filter(haversine_km(lat, lng) <= radius_km)
        )
    else:
        order = (
            Producer.avg_rating.desc(), Producer.reviews_count.desc()
        ) if sort == "rating" else (Producer.created_at.desc(),)
        q = (
            db.query(Producer)
            .options(
                joinedload(Producer.categories),
                selectinload(Producer.products),
                selectinload(Producer.delivery_areas),
            )
            .filter(Producer.status == "approved")
            .order_by(*order)
        )
        count_q = (
            db.query(func.count(Producer.id.distinct()))
            .select_from(Producer)
            .filter(Producer.status == "approved")
        )

    if verified is not None:
        q = q.filter(Producer.is_verified == verified)
        count_q = count_q.filter(Producer.is_verified == verified)

    if organic is not None:
        q = q.filter(Producer.organic_certified == organic)
        count_q = count_q.filter(Producer.organic_certified == organic)

    if kosher is not None:
        if kosher:
            q = q.filter(Producer.kosher.isnot(None), Producer.kosher != "")
            count_q = count_q.filter(Producer.kosher.isnot(None), Producer.kosher != "")
        else:
            q = q.filter((Producer.kosher.is_(None)) | (Producer.kosher == ""))
            count_q = count_q.filter((Producer.kosher.is_(None)) | (Producer.kosher == ""))

    if category is not None:
        q = q.join(ProducerCategory).filter(ProducerCategory.category_id == category)
        count_q = count_q.join(ProducerCategory).filter(ProducerCategory.category_id == category)

    if delivery_city:
        q = q.join(DeliveryArea).filter(func.lower(DeliveryArea.city) == delivery_city.lower())
        count_q = count_q.join(DeliveryArea).filter(func.lower(DeliveryArea.city) == delivery_city.lower())
    elif has_delivery:
        q = q.filter(Producer.delivery_areas.any())
        count_q = count_q.filter(Producer.delivery_areas.any())

    if city:
        q = q.filter(func.lower(Producer.city) == city.lower())
        count_q = count_q.filter(func.lower(Producer.city) == city.lower())

    if is_available_today is not None:
        q = q.filter(Producer.is_available_today == is_available_today)
        count_q = count_q.filter(Producer.is_available_today == is_available_today)

    if grass_fed is not None:
        q = q.filter(Producer.grass_fed == grass_fed)
        count_q = count_q.filter(Producer.grass_fed == grass_fed)

    if gluten_free is not None:
        q = q.filter(Producer.gluten_free == gluten_free)
        count_q = count_q.filter(Producer.gluten_free == gluten_free)

    if vegan is not None:
        q = q.filter(Producer.vegan == vegan)
        count_q = count_q.filter(Producer.vegan == vegan)

    if lactose_free is not None:
        q = q.filter(Producer.lactose_free == lactose_free)
        count_q = count_q.filter(Producer.lactose_free == lactose_free)

    # MEH-99 — cross-field search: name · description · city · category names · product names.
    if search_q and search_q.strip():
        clean = search_q.strip()
        like = f"%{clean}%"

        has_category = (
            db.query(ProducerCategory)
            .join(Category, Category.id == ProducerCategory.category_id)
            .filter(
                ProducerCategory.producer_id == Producer.id,
                Category.name.ilike(like),
            )
            .exists()
        )
        has_product = (
            db.query(Product)
            .filter(
                Product.producer_id == Producer.id,
                Product.name.ilike(like),
            )
            .exists()
        )
        search_filter = (
            Producer.name.ilike(like)
            | Producer.description.ilike(like)
            | Producer.city.ilike(like)
            | has_category
            | has_product
        )
        q = q.filter(search_filter)
        count_q = count_q.filter(search_filter)

        # Relevance ordering in non-geo mode: exact name first, then prefix, then rating.
        if not geo_search:
            q = q.order_by(False).order_by(
                (func.lower(Producer.name) == clean.lower()).desc(),
                Producer.name.ilike(f"{clean}%").desc(),
                Producer.avg_rating.desc(),
                Producer.created_at.desc(),
            )

    # MEH-102 — exclude a specific producer (used by similar-producers widget).
    if exclude is not None:
        q = q.filter(Producer.id != exclude)
        count_q = count_q.filter(Producer.id != exclude)

    # MEH-23 — total BEFORE applying limit/offset so the frontend can render
    # "X מתוך Y" and numbered pagination.
    total_count = count_q.scalar() or 0
    if response is not None:
        response.headers["X-Total-Count"] = str(total_count)

    # MEH-99 — log every search (zero AND non-zero) so trending has signal.
    # Zero-result rows are used for discovery; non-zero rows drive /search/trending.
    # MEH-267: ORM insert (not raw SQL) so id + searched_at come from Python-side
    # model defaults — alembic baseline has no server_default on these columns.
    if search_q and search_q.strip():
        try:
            db.add(SearchQuery(
                query=search_q.strip()[:200],
                results_count=total_count,
            ))
            db.commit()
        except Exception:
            db.rollback()
            logger.warning("[producers] search_queries INSERT failed", exc_info=True)

    if geo_search:
        # A multi-entity query combined with joinedload on a collection
        # relationship (categories) can emit duplicate rows — the legacy
        # Query identity-map dedupe only applies to single-entity queries.
        # De-dupe by producer id while preserving the distance-ASC order.
        seen: set = set()
        results = []
        # Slice at the SQL layer: offset first, then limit.
        for producer, distance_km in q.offset(offset).limit(limit).all():
            if producer.id in seen:
                continue
            seen.add(producer.id)
            # Attach computed distance so Pydantic's from_attributes picks
            # it up in ProducerListOut.
            producer.distance_km = round(float(distance_km), 2)
            attach_badge_fields(producer)
            results.append(producer)
        attach_favorites_counts(results, db)
        return results

    rows = q.offset(offset).limit(limit).all()
    for p in rows:
        attach_badge_fields(p)
    attach_favorites_counts(rows, db)
    return rows


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


# ============================================================
# docs/archive/FEEDBACK_FIXES.md — follow / unfollow producer
# ============================================================


@router.post("/producers/{producer_id}/follow")
def follow_producer(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Follow a producer. Idempotent — returns the existing follow if
    the user already follows this producer."""
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    existing = (
        db.query(ProducerFollower)
        .filter(
            ProducerFollower.user_id == user.id,
            ProducerFollower.producer_id == producer_id,
        )
        .first()
    )
    if existing:
        return {"detail": "Already following", "following": True}

    follow = ProducerFollower(user_id=user.id, producer_id=producer_id)
    db.add(follow)
    db.commit()
    return {"detail": "Now following", "following": True}


@router.delete("/producers/{producer_id}/follow")
def unfollow_producer(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unfollow a producer. No-op if the user doesn't currently follow."""
    follow = (
        db.query(ProducerFollower)
        .filter(
            ProducerFollower.user_id == user.id,
            ProducerFollower.producer_id == producer_id,
        )
        .first()
    )
    if follow:
        db.delete(follow)
        db.commit()
    return {"detail": "Unfollowed", "following": False}


@router.get("/producers/{producer_id}/follow-status")
def follow_status(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Is the current user following this producer? Used by the follow
    button on the producer page to initialize its state."""
    exists = (
        db.query(ProducerFollower)
        .filter(
            ProducerFollower.user_id == user.id,
            ProducerFollower.producer_id == producer_id,
        )
        .first()
        is not None
    )
    return {"following": exists}


@router.get("/users/me/following")
def list_my_following(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the producers the current user is following, with basic
    producer info joined in."""
    follows = (
        db.query(ProducerFollower)
        .options(joinedload(ProducerFollower.producer))
        .filter(ProducerFollower.user_id == user.id)
        .order_by(ProducerFollower.created_at.desc())
        .all()
    )
    return [
        {
            "producer_id": str(f.producer_id),
            "producer_name": f.producer.name if f.producer else None,
            "producer_city": f.producer.city if f.producer else None,
            "producer_slug": f.producer.slug if f.producer else None,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in follows
    ]
