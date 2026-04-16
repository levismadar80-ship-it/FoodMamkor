import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import HomeProduct, HomeProductRating, HomeProductWhatsAppClick, User
from app.rate_limit import limiter
from app.schemas.schemas import (
    HomeProductCreate,
    HomeProductModerationRequest,
    HomeProductModerationResult,
    HomeProductOut,
    HomeProductRatingOut,
    HomeProductUpdate,
    RatingSubmit,
)
from app.services.home_product_moderation import validate_home_product

router = APIRouter(prefix="/home-products", tags=["home-products"])


def _enrich_home_product(hp: HomeProduct, db: Session) -> dict:
    """Build HomeProductOut data with rating info."""
    avg = db.query(func.avg(HomeProductRating.stars)).filter(
        HomeProductRating.home_product_id == hp.id
    ).scalar()
    count = db.query(func.count(HomeProductRating.id)).filter(
        HomeProductRating.home_product_id == hp.id
    ).scalar()
    recent = (
        db.query(HomeProductRating)
        .filter(HomeProductRating.home_product_id == hp.id)
        .order_by(HomeProductRating.created_at.desc())
        .limit(3)
        .all()
    )
    return {
        "id": hp.id,
        "user_id": hp.user_id,
        "title": hp.title,
        "description": hp.description,
        "photo": hp.photo,
        "quantity": hp.quantity,
        "price": hp.price,
        "neighborhood": hp.neighborhood,
        "city": hp.city,
        "phone": hp.phone,
        "is_active": hp.is_active,
        "category": hp.category,
        "prep_date": hp.prep_date,
        "expiry_date": hp.expiry_date,
        "storage_type": hp.storage_type,
        "allergens": hp.allergens,
        "kosher": hp.kosher,
        "is_organic": bool(hp.is_organic),
        "unit": hp.unit,
        "delivery_method": hp.delivery_method,
        "location_notes": hp.location_notes,
        "images": list(hp.images or []),
        "moderation_status": hp.moderation_status or "APPROVED",
        "moderation_reason": hp.moderation_reason,
        "moderation_suggestion": hp.moderation_suggestion,
        "avg_rating": round(float(avg), 1) if avg else None,
        "rating_count": count or 0,
        "recent_comments": [
            HomeProductRatingOut.model_validate(r) for r in recent
        ],
        "seller_name": hp.user.name if hp.user else None,
        "created_at": hp.created_at,
    }


# --- Rating by token routes MUST come before /{product_id} to avoid shadowing ---


@router.get("/rate/{token}")
def get_rating_page(token: str, db: Session = Depends(get_db)):
    """Get info for the rating page (accessed via WhatsApp link)."""
    click = db.query(HomeProductWhatsAppClick).filter(
        HomeProductWhatsAppClick.rating_token == token
    ).first()
    if not click:
        raise HTTPException(status_code=404, detail="קישור דירוג לא תקין")
    if click.rated:
        return {"detail": "Already rated", "already_rated": True}
    hp = db.query(HomeProduct).filter(HomeProduct.id == click.home_product_id).first()
    return {
        "already_rated": False,
        "product_title": hp.title if hp else None,
        "seller_name": hp.user.name if hp and hp.user else None,
    }


@router.post("/validate", response_model=HomeProductModerationResult)
@limiter.limit("30/hour")  # SECURITY FIX #2: cap Anthropic calls per IP
def validate_home_product_endpoint(
    request: Request,
    data: HomeProductModerationRequest,
):
    """Run the moderation check WITHOUT persisting anything. Used by the
    frontend form to surface warnings/blocks while the user is still typing.

    Returns APPROVED/FLAGGED/REJECTED + optional reason + suggestion.
    """
    result = validate_home_product(data.model_dump())
    return HomeProductModerationResult(**result)


@router.post("/rate/{token}")
def submit_rating(token: str, data: RatingSubmit, db: Session = Depends(get_db)):
    """Submit a rating via token (no login required)."""
    click = db.query(HomeProductWhatsAppClick).filter(
        HomeProductWhatsAppClick.rating_token == token
    ).first()
    if not click:
        raise HTTPException(status_code=404, detail="קישור דירוג לא תקין")
    if click.rated:
        raise HTTPException(status_code=400, detail="Already rated")

    rating = HomeProductRating(
        click_id=click.id,
        user_id=click.user_id,
        home_product_id=click.home_product_id,
        stars=data.stars,
        comment=data.comment,
    )
    db.add(rating)
    click.rated = True
    db.commit()

    # Check if listing should be auto-hidden (3 negative ratings ≤2 stars)
    negative_count = db.query(func.count(HomeProductRating.id)).filter(
        HomeProductRating.home_product_id == click.home_product_id,
        HomeProductRating.stars <= 2,
    ).scalar()
    if negative_count >= 3:
        hp = db.query(HomeProduct).filter(HomeProduct.id == click.home_product_id).first()
        if hp:
            hp.is_hidden = True
            db.commit()

    return {"detail": "Rating submitted. Thank you!"}


# --- Standard CRUD routes ---


@router.get("", response_model=list[HomeProductOut])
def list_home_products(
    city: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(HomeProduct).filter(
        HomeProduct.is_active.is_(True),
        HomeProduct.is_hidden.is_(False),
    )
    if city:
        q = q.filter(func.lower(HomeProduct.city) == city.lower())
    products = q.order_by(HomeProduct.created_at.desc()).all()
    return [_enrich_home_product(hp, db) for hp in products]


@router.get("/{product_id}", response_model=HomeProductOut)
def get_home_product(product_id: UUID, db: Session = Depends(get_db)):
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Home product not found")
    return _enrich_home_product(hp, db)


@router.post("", response_model=HomeProductOut, status_code=201)
@limiter.limit("10/hour")  # SECURITY FIX #2: cap listing spam
def create_home_product(
    request: Request,
    data: HomeProductCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Run AI moderation — blocks REJECTED, records status for APPROVED/FLAGGED.
    # The frontend also calls /validate before submit for fast feedback, but
    # we re-check server-side so a crafted client can't bypass.
    moderation = validate_home_product(
        {
            "title": data.title,
            "description": data.description,
            "price": data.price,
        }
    )
    if moderation["status"] == "REJECTED":
        raise HTTPException(
            status_code=400,
            detail={
                "error": "listing_rejected",
                "reason": moderation.get("reason") or "התוכן אינו עומד בקריטריונים שלנו",
                "suggestion": moderation.get("suggestion"),
            },
        )

    # Default the cover photo from the images array if not set explicitly
    cover_photo = data.photo or (data.images[0] if data.images else None)

    hp = HomeProduct(
        user_id=user.id,
        title=data.title,
        description=data.description,
        photo=cover_photo,
        quantity=data.quantity,
        price=data.price,
        neighborhood=data.neighborhood,
        city=data.city,
        street=data.street,  # FIXES_V2 fix 7c — private, not in HomeProductOut
        zip_code=data.zip_code,
        phone=data.phone or user.phone,
        category=data.category,
        prep_date=data.prep_date,
        expiry_date=data.expiry_date,
        storage_type=data.storage_type,
        allergens=data.allergens,
        kosher=data.kosher,
        is_organic=data.is_organic,
        unit=data.unit,
        delivery_method=data.delivery_method,
        location_notes=data.location_notes,
        images=list(data.images or []),
        moderation_status=moderation["status"],
        moderation_reason=moderation.get("reason"),
        moderation_suggestion=moderation.get("suggestion"),
    )
    db.add(hp)
    db.commit()
    db.refresh(hp)
    return _enrich_home_product(hp, db)


@router.put("/{product_id}", response_model=HomeProductOut)
def update_home_product(
    product_id: UUID,
    data: HomeProductUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Home product not found")
    # SECURITY FIX (IDOR): allow owner OR admin. Prior check only allowed
    # owner, which was inconsistent with CLAUDE.md rule #5.
    if hp.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(hp, field, value)
    db.commit()
    db.refresh(hp)
    return _enrich_home_product(hp, db)


@router.delete("/{product_id}")
def deactivate_home_product(
    product_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Home product not found")
    # SECURITY FIX (IDOR): owner OR admin may deactivate (CLAUDE.md rule #5).
    if hp.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")
    hp.is_active = False
    db.commit()
    return {"detail": "Listing deactivated"}


@router.post("/{product_id}/whatsapp-click")
def log_whatsapp_click(
    product_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Home product not found")
    click = HomeProductWhatsAppClick(
        user_id=user.id,
        home_product_id=product_id,
        rating_token=secrets.token_urlsafe(32),
    )
    db.add(click)
    db.commit()
    return {"detail": "Click logged", "whatsapp_url": f"https://wa.me/{hp.phone}"}


@router.get("/{product_id}/ratings", response_model=dict)
def get_ratings(product_id: UUID, db: Session = Depends(get_db)):
    avg = db.query(func.avg(HomeProductRating.stars)).filter(
        HomeProductRating.home_product_id == product_id
    ).scalar()
    count = db.query(func.count(HomeProductRating.id)).filter(
        HomeProductRating.home_product_id == product_id
    ).scalar()
    recent = (
        db.query(HomeProductRating)
        .filter(HomeProductRating.home_product_id == product_id)
        .order_by(HomeProductRating.created_at.desc())
        .limit(3)
        .all()
    )
    return {
        "avg_rating": round(float(avg), 1) if avg else None,
        "rating_count": count or 0,
        "recent_comments": [HomeProductRatingOut.model_validate(r) for r in recent],
    }
