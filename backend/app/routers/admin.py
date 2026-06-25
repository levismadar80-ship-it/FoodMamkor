import logging
import re
from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.config import settings
from app.services.auth_notifications import notify_producer_approved
from app.services.email import send_email
from app.services.whatsapp import send_text
from app.database import get_db
from app.models import (
    DeliveryArea,
    HomeProduct,
    PhoneOtpToken,
    Producer,
    ProducerCategory,
    Product,
    User,
)
from app.schemas.schemas import (
    GrantVerifiedIn,
    ProducerAdminCreate,
    ProducerAdminOut,
    ProducerUpdate,
    RemoveListingBody,
    StoryCardUploadRequest,
)
from app.services.license_validation import ensure_license_for_categories
from app.slug_utils import RESERVED_SLUGS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _slugify(text: str) -> str:
    """Generate URL-safe slug from text. Hebrew → transliterate-ish fallback."""
    if not text:
        return ""
    # Keep ASCII letters/numbers/hyphens; replace whitespace with hyphens
    s = text.strip().lower()
    s = re.sub(r"\s+", "-", s)
    # Strip characters that are not safe URL chars (keep hebrew letters)
    s = re.sub(r"[^\w\u0590-\u05FF\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:100]


def _yes_no(value) -> bool:
    """Parse Hebrew/English yes/no values from Excel."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    return s in ("כן", "yes", "y", "true", "1", "v", "✓")


def _ensure_unique_slug(
    db: Session, base_slug: str, exclude_id: UUID | None = None
) -> str:
    """Append -2, -3, ... until slug is unique and not reserved."""
    if not base_slug:
        return base_slug
    candidate = base_slug
    counter = 2
    while True:
        if candidate not in RESERVED_SLUGS:
            q = db.query(Producer).filter(Producer.slug == candidate)
            if exclude_id:
                q = q.filter(Producer.id != exclude_id)
            if not q.first():
                return candidate
        candidate = f"{base_slug}-{counter}"
        counter += 1


def _apply_categories(db: Session, producer: Producer, category_ids: list[int]):
    db.query(ProducerCategory).filter(
        ProducerCategory.producer_id == producer.id
    ).delete()
    for cid in category_ids:
        db.add(ProducerCategory(producer_id=producer.id, category_id=cid))


def _apply_delivery_cities(db: Session, producer: Producer, cities: list[str]):
    db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).delete()
    for city in cities:
        city = (city or "").strip()
        if not city:
            continue
        db.add(DeliveryArea(producer_id=producer.id, city=city))


@router.get("/producers", response_model=list[ProducerAdminOut])
def list_producers(
    status: str | None = Query(
        None, pattern="^(pending|pending_whatsapp|approved|rejected|inactive|all)$"
    ),
    search: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Producer).options(
        joinedload(Producer.categories),
        joinedload(Producer.products),
        joinedload(Producer.delivery_areas),
    )
    if status and status != "all":
        if status == "pending":
            q = q.filter(Producer.status.in_(["pending", "pending_whatsapp"]))
        else:
            q = q.filter(Producer.status == status)
    if search:
        like = f"%{search}%"
        q = q.filter((Producer.name.ilike(like)) | (Producer.city.ilike(like)))
    return q.order_by(Producer.created_at.desc()).all()


@router.post("/producers", response_model=ProducerAdminOut, status_code=201)
def admin_create_producer(
    data: ProducerAdminCreate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin-created producers are auto-approved."""
    slug = data.slug or _slugify(data.name)
    # Reject explicit reserved slugs; auto-generated slugs get suffixed by _ensure_unique_slug.
    if data.slug and _slugify(data.slug) in RESERVED_SLUGS:
        raise HTTPException(
            status_code=400, detail="שם זה שמור לשימוש האתר. בחרי שם אחר."
        )
    slug = _ensure_unique_slug(db, slug)

    # MEH-530: same conditional-required guard as the public endpoints —
    # admin form can still persist non-regex license values verbatim
    # (manual-approval flow), but missing-license-for-required-category
    # is still a 422.
    ensure_license_for_categories(db, data.category_ids, data.producer_license_number)

    producer = Producer(
        name=data.name,
        contact_name=data.contact_name,
        description=data.description,
        short_description=data.short_description,
        city=data.city,
        lat=data.lat,
        lng=data.lng,
        phone=data.phone,
        instagram=data.instagram,
        website=data.website,
        whatsapp_group=data.whatsapp_group,
        # MEH-17
        primary_contact_method=data.primary_contact_method or "whatsapp",
        contact_email=data.contact_email,
        # MEH-296 3d: admin-create parity for the new channels.
        facebook=data.facebook,
        external_order_form=data.external_order_form,
        slug=slug,
        top_product_name=data.top_product_name,
        price_range=data.price_range,
        starting_price_label=data.price_range,  # keep both in sync
        grass_fed=data.grass_fed,
        organic_certified=data.organic_certified,
        has_delivery=data.has_delivery,
        pickup_points=data.pickup_points,
        kosher=data.kosher,
        producer_license_number=data.producer_license_number,
        admin_notes=data.admin_notes,
        is_verified=data.is_verified,
        images=data.images or [],
        # MEH-213 — location mode
        has_physical_location=data.has_physical_location,
        offers_delivery=data.offers_delivery,
        delivery_nationwide=data.delivery_nationwide,
        delivery_cities=data.delivery_cities,
        status="approved",  # admin = pre-approved
    )
    db.add(producer)
    db.flush()

    _apply_categories(db, producer, data.category_ids)
    _apply_delivery_cities(db, producer, data.delivery_area_cities)

    db.commit()
    db.refresh(producer)
    return producer


@router.put("/producers/{producer_id}", response_model=ProducerAdminOut)
def admin_update_producer(
    producer_id: UUID,
    data: ProducerUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    payload = data.model_dump(exclude_unset=True)
    category_ids = payload.pop("category_ids", None)
    delivery_cities = payload.pop("delivery_area_cities", None)

    # MEH-530: PATCH semantics — guard against the EFFECTIVE state after
    # the update. If category_ids is being changed → use the new list,
    # otherwise read existing producer-category join rows. Same for license:
    # if the field is in the payload (even explicitly None to clear) → use
    # that, otherwise keep the current column. Helper short-circuits to OK
    # when no required-category is touched, so this is cheap on non-license
    # admin edits.
    effective_category_ids = (
        category_ids
        if category_ids is not None
        else [c.id for c in producer.categories]
    )
    effective_license = (
        payload.get("producer_license_number")
        if "producer_license_number" in payload
        else producer.producer_license_number
    )
    ensure_license_for_categories(db, effective_category_ids, effective_license)

    # Keep slug unique if changed; reject reserved slugs.
    if "slug" in payload and payload["slug"]:
        candidate = _slugify(payload["slug"])
        if candidate in RESERVED_SLUGS:
            raise HTTPException(
                status_code=400, detail="שם זה שמור לשימוש האתר. בחרי שם אחר."
            )
        payload["slug"] = _ensure_unique_slug(db, candidate, exclude_id=producer.id)

    # Mirror price_range → starting_price_label for backward-compat display
    if "price_range" in payload:
        producer.starting_price_label = payload["price_range"]

    # MEH-375: snapshot gallery BEFORE bulk setattr so we can diff and
    # destroy URLs the admin dropped AFTER db.commit succeeds. Order
    # matters — destroying before commit would orphan-leak in reverse
    # (assets gone, DB still references them) on a commit raise.
    old_images = list(producer.images or [])

    for field, value in payload.items():
        setattr(producer, field, value)

    if category_ids is not None:
        _apply_categories(db, producer, category_ids)
    if delivery_cities is not None:
        _apply_delivery_cities(db, producer, delivery_cities)

    db.commit()
    db.refresh(producer)

    # MEH-375: post-commit cleanup. Helper handles set diff + dedup +
    # fail-open per-URL destroy.
    if "images" in payload:
        from app.cloudinary_utils import destroy_removed_images

        destroy_removed_images(
            old_images,
            producer.images or [],
            context="admin.admin_update_producer images",
        )

    return producer


# MEH-769 (HOT-002): the toggle is purely the visibility switch for an
# already-decided business — approved ⇄ inactive only. Any other source
# status (pending / pending_whatsapp / rejected) must go through the real
# approve_producer flow, which fires the MEH-509 side-effects (approval
# email, producer_approved_v1 WhatsApp, admin WhatsApp). Before this guard
# the bare `else` branch silently force-approved a REJECTED producer onto
# the public map, skipping every validation and notification.
_TOGGLEABLE_STATUSES = {"approved", "inactive"}


@router.post("/producers/{producer_id}/toggle-status")
def toggle_producer_status(
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Toggle approved <-> inactive (hides from public listings).

    Refuses any other source status with 409 — use the approve/reject flow.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-769: block the rejected/pending → approved force-flip. Final user-
    # facing Hebrew lives in the frontend message key
    # (admin.producers.toggle.invalid_transition); this detail is the API
    # contract / fallback.
    if producer.status not in _TOGGLEABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="לא ניתן לשנות סטטוס במצב הנוכחי — יש לאשר או לדחות את העסק דרך מסלול האישור.",
        )
    producer.status = "inactive" if producer.status == "approved" else "approved"
    db.commit()
    return {"detail": "Status toggled", "status": producer.status}


@router.delete("/producers/{producer_id}")
def admin_delete_producer(
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-375 + MEH-510: capture every Cloudinary URL owned by this
    # producer BEFORE db.delete — the cascade detaches the relationship
    # and producer.images / Product.image_url / story_card_url become
    # unreachable after commit. Destroy runs AFTER commit so a
    # constraint / deadlock failure doesn't leave Cloudinary and DB
    # out of sync.
    #
    # MEH-510: story_card_url IS captured here. The reserved namespace
    # (mehamakor/producers/*) is protected by destroy_image's reject
    # list to keep the cleanup script from sweeping live story-cards,
    # but the producer-delete path is the one legitimate caller that
    # should free the slot — pass `bypass_reserved=True` to opt out.
    old_image_urls = list(producer.images or [])
    products = db.query(Product).filter(Product.producer_id == producer.id).all()
    old_product_urls = [p.image_url for p in products if p.image_url]
    old_story_card_url = producer.story_card_url

    # MEH-747: unlink any user pointing at this producer BEFORE db.delete.
    # User.producer_id has no ondelete (models.py), so deleting the producer
    # while a self-registered owner still references it violates
    # users_producer_id_fkey → 500. Mirrors the auth.py::delete_account fix.
    # is_producer is also cleared: the producer is permanently gone, so the
    # "durable flag" no longer reflects reality, and leaving it True would
    # lock the owner out of re-registering (409 at auth.py — MEH-669 family).
    # role is reset to "consumer" for the same consistency reason:
    # require_producer (auth.py:268-273) gates on role ALONE, so a leftover
    # role="producer" with producer_id=NULL is an orphan that passes the dep
    # then 404s on every /producers/me* handler (producer_me.py:75-76).
    # Resetting role keeps the (role, producer_id) pair consistent — mirrors
    # the atomic set in the register flow (auth.py:511-514).
    # Admin-created producers have no linked user → update is a no-op.
    db.query(User).filter(User.producer_id == producer.id).update(
        {"producer_id": None, "is_producer": False, "role": "consumer"},
        synchronize_session=False,
    )
    db.flush()

    # MEH-755: delete OTP tokens explicitly before db.delete(producer).
    # phone_otp_tokens.producer_id is NOT NULL, but the ORM relationship
    # (models.py PhoneOtpToken.producer backref) has no delete cascade, so the
    # unit-of-work tries to nullify producer_id on delete → NotNullViolation
    # 500. Mirrors the auth.py::delete_account fix; bulk-delete pre-empts it.
    db.query(PhoneOtpToken).filter(PhoneOtpToken.producer_id == producer.id).delete()

    db.delete(producer)
    db.commit()

    # Post-commit orphan cleanup, fail-open per destroy_image contract.
    from app.cloudinary_utils import destroy_image

    for url in old_image_urls:
        destroy_image(url, context="admin.admin_delete_producer images")
    for url in old_product_urls:
        destroy_image(url, context="admin.admin_delete_producer product_image")
    # MEH-510: bypass_reserved=True — the producer is gone, the slot is now an orphan.
    destroy_image(
        old_story_card_url,
        bypass_reserved=True,
        context="admin.admin_delete_producer story_card",
    )

    return {"detail": "Producer deleted"}


@router.post("/producers/import")
async def import_producers_excel(
    file: UploadFile = File(...),
    dry_run: bool = Query(
        True, description="Preview only — set false to actually save"
    ),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Upload Excel/CSV file and import producers. dry_run=true returns preview only."""
    from io import BytesIO

    try:
        from openpyxl import load_workbook
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")

    contents = await file.read()
    if len(contents) > 10_000_000:
        raise HTTPException(status_code=413, detail="קובץ גדול מדי — מקסימום 10MB")
    try:
        wb = load_workbook(BytesIO(contents), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"לא ניתן לקרוא את הקובץ: {e}")

    ws = wb.active
    # Skip header row
    rows = [list(r) for r in ws.iter_rows(min_row=2, values_only=True)]

    from app.services.producer_import import import_rows

    return import_rows(db, rows, dry_run=dry_run)


@router.get("/producers/pending", response_model=list[ProducerAdminOut])
def pending_producers(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
):
    return (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.status.in_(["pending", "pending_whatsapp"]))
        .order_by(Producer.created_at.desc())
        .all()
    )


@router.post("/producers/{producer_id}/approve")
def approve_producer(
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-799: approval gate — a business never goes public without at least
    # one photo. Validation only (no schema change); registration/publish
    # flows untouched — the gate lives at the moment of approval.
    if not producer.images:
        raise HTTPException(
            status_code=422,
            detail="לא ניתן לאשר בית עסק ללא תמונה. בקשי מבעלת העסק להעלות תמונה אחת לפחות.",
        )
    producer.status = "approved"
    db.commit()

    # MEH-509 PR1: capture primitives before any post-commit work — ORM
    # attributes are safe here (no expire_on_commit configured on this
    # session), but capturing decouples the notify calls from the model.
    p_name = producer.name
    p_phone = producer.phone
    p_slug = producer.slug
    p_id = producer.id

    producer_user = db.query(User).filter(User.producer_id == producer.id).first()
    if producer_user:
        _send_notification_email(
            producer_user.email,
            f'מהמקור - העסק "{p_name}" אושר!',
            f'שלום,\n\nהעסק שלך "{p_name}" אושר במהמקור!\n'
            f"הפרופיל שלך כעת גלוי לכל המשתמשים באתר.\n\n"
            f"בברכה,\nצוות מהמקור",
        )

    # MEH-509 PR1: fire producer_approved_v1 WhatsApp template to the
    # producer. Fail-open at the service layer — any failure here must
    # NOT block the 200 response (approval already committed above).
    notify_producer_approved(p_name, p_phone, p_slug, p_id)

    # Notify admin via WhatsApp
    if settings.admin_whatsapp_to:
        _send_whatsapp(
            settings.admin_whatsapp_to,
            f'✅ העסק "{p_name}" אושר במהמקור.',
        )

    return {"detail": "Producer approved"}


@router.post("/producers/{producer_id}/reject")
def reject_producer(
    producer_id: UUID,
    reason: str = Body("", embed=True),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.status = "rejected"
    db.commit()

    reason_text = f"\nסיבת הדחייה: {reason}" if reason else ""
    producer_user = db.query(User).filter(User.producer_id == producer.id).first()
    if producer_user:
        _send_notification_email(
            producer_user.email,
            f'מהמקור - עדכון לגבי העסק "{producer.name}"',
            f'שלום,\n\nלצערנו הבקשה לרישום העסק "{producer.name}" במהמקור לא אושרה.{reason_text}\n\n'
            f"ניתן ליצור קשר איתנו לפרטים נוספים.\n\n"
            f"בברכה,\nצוות מהמקור",
        )

    # Notify admin via WhatsApp
    if settings.admin_whatsapp_to:
        _send_whatsapp(
            settings.admin_whatsapp_to,
            f'❌ העסק "{producer.name}" נדחה.{reason_text}',
        )

    return {"detail": "Producer rejected"}


# MEH-762 (ADR-022 public tier contract, Chunk 2): admin stamping for the
# tier-1 "מאומת" badge. The document review itself stays manual off-platform
# (VERIFICATION.md §2/§4) — these endpoints only record the OUTCOME in the DB.
# No auto-stamp on admin-create/import; legacy is_verified is untouched
# (decoupling = Chunk 4). The public verification_tier resolver + exposure
# land in Chunk 3.
@router.post("/producers/{producer_id}/grant-verified")
def grant_verified(
    producer_id: UUID,
    body: GrantVerifiedIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Stamp the tier-1 verification result after the admin checks the
    qualifying document (license / exemption / cosmetics — VERIFICATION.md
    §2). Re-grant overwrites verified_at + verification_doc_type (the legit
    correction path alongside revoke-verified).
    # REUSES: admin_kashrut.py:75 — admin stamps a verification timestamp.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # tz-aware (MEH-762 D1, mirrors MEH-759) — NOT naive utcnow; the column
    # is TIMESTAMPTZ. Public exposure is date-granularity only (Chunk 3).
    producer.verified_at = datetime.now(timezone.utc)
    producer.verification_doc_type = body.doc_type
    db.commit()
    return {
        "detail": "תג מאומת הוענק",
        "verified_at": producer.verified_at.isoformat(),
        "verification_doc_type": producer.verification_doc_type,
    }


@router.post("/producers/{producer_id}/revoke-verified")
def revoke_verified(
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clear the tier-1 "מאומת" stamp (mistake correction). Idempotent —
    clearing an already-unverified producer is a no-op success. Leaves the
    legacy is_verified axis untouched (Chunk 4).
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.verified_at = None
    producer.verification_doc_type = None
    db.commit()
    return {"detail": "תג מאומת הוסר"}


# --- Hidden Home Listings ---
@router.get("/home-products/hidden")
def get_hidden_listings(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
):
    """Get home products auto-hidden by negative ratings."""
    listings = db.query(HomeProduct).filter(HomeProduct.is_hidden.is_(True)).all()
    return [
        {
            "id": str(hp.id),
            "title": hp.title,
            "city": hp.city,
            "seller_name": hp.user.name if hp.user else None,
            "created_at": hp.created_at.isoformat(),
        }
        for hp in listings
    ]


@router.post("/home-products/{product_id}/restore")
def restore_listing(
    product_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)
):
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Listing not found")
    hp.is_hidden = False
    db.commit()
    return {"detail": "Listing restored"}


@router.delete("/home-products/{product_id}")
def delete_listing(
    product_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)
):
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Listing not found")

    # MEH-375: capture HomeProduct's two image surfaces (cover photo +
    # images list) BEFORE db.delete; destroy AFTER commit per the
    # external-cleanup rule (DB and Cloudinary must agree on rollback).
    # Distinct from the soft-delete at /home-products/{id} (sets
    # is_active=False), which preserves assets for reactivation.
    old_photo = hp.photo
    old_images = list(hp.images or [])

    db.delete(hp)
    db.commit()

    from app.cloudinary_utils import destroy_image

    if old_photo:
        destroy_image(old_photo, context="admin.delete_listing photo")
    for url in old_images:
        destroy_image(url, context="admin.delete_listing images")

    return {"detail": "Listing deleted"}


# --- Moderation queue (FLAGGED by AI) ---
@router.get("/home-products/flagged")
def get_flagged_listings(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
):
    """Return home products that AI moderation marked as FLAGGED —
    published but in the admin review queue.
    """
    listings = (
        db.query(HomeProduct)
        .filter(
            HomeProduct.moderation_status == "FLAGGED",
            HomeProduct.is_active.is_(True),
        )
        .order_by(HomeProduct.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(hp.id),
            "title": hp.title,
            "description": hp.description,
            "city": hp.city,
            "price": float(hp.price) if hp.price is not None else None,
            "seller_name": hp.user.name if hp.user else None,
            "seller_phone": hp.phone,
            "moderation_reason": hp.moderation_reason,
            "moderation_suggestion": hp.moderation_suggestion,
            "created_at": hp.created_at.isoformat() if hp.created_at else None,
        }
        for hp in listings
    ]


@router.post("/home-products/{product_id}/approve")
def approve_flagged_listing(
    product_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin clears a FLAGGED listing — it stays published, badge goes away."""
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Listing not found")
    hp.moderation_status = "APPROVED"
    hp.moderation_reason = None
    hp.moderation_suggestion = None
    db.commit()
    return {"detail": "Listing approved", "moderation_status": hp.moderation_status}


@router.post("/home-products/{product_id}/remove")
def remove_flagged_listing(
    product_id: UUID,
    data: RemoveListingBody = Body(default=RemoveListingBody()),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin removes a flagged listing — is_active=false, records the removal
    reason so we can surface it to the seller later.
    """
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Listing not found")
    hp.is_active = False
    if data.reason:
        hp.moderation_reason = data.reason
    db.commit()
    return {"detail": "Listing removed"}


# MEH-587: admin Recipe endpoints removed (chunk 0/4) — see
# backend/alembic/versions/20260515_1430_d7e3c9a82f5b_meh_587_remove_zombie_recipes.py.


# --- MEH-53: Instagram story card ---


@router.post("/producers/{producer_id}/story-card")
def upload_story_card(
    producer_id: UUID,
    body: StoryCardUploadRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Accept base64 JPEG canvas export, upload to Cloudinary, persist URL."""
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # Strip the data-URI prefix to get raw base64
    data_uri = body.image_data
    if "," in data_uri:
        data_uri = data_uri.split(",", 1)[1]

    import base64

    try:
        raw = base64.b64decode(data_uri)
    except Exception:
        raise HTTPException(status_code=400, detail="נתוני תמונה לא תקינים")

    if not settings.cloudinary_cloud_name:
        # Dev fallback
        return {"url": f"/placeholder-image.png?id={producer_id}", "saved": False}

    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        result = cloudinary.uploader.upload(
            raw,
            folder=f"mehamakor/producers/{producer_id}",
            public_id="story-card",
            resource_type="image",
            overwrite=True,
            format="jpg",
        )
        url = result["secure_url"]
        producer.story_card_url = url
        db.commit()
        return {"url": url, "saved": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# --- Stats ---
@router.get("/stats")
def get_stats(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {
        "total_producers": db.query(Producer).count(),
        "pending_producers": db.query(Producer)
        .filter(Producer.status.in_(["pending", "pending_whatsapp"]))
        .count(),
        "approved_producers": db.query(Producer)
        .filter(Producer.status == "approved")
        .count(),
        "total_users": db.query(User).count(),
        "total_home_products": db.query(HomeProduct)
        .filter(HomeProduct.is_active.is_(True))
        .count(),
        "hidden_home_products": db.query(HomeProduct)
        .filter(HomeProduct.is_hidden.is_(True))
        .count(),
    }


_DATA_GOV_URL = (
    "https://data.gov.il/api/3/action/datastore_search"
    "?resource_id=d4901968-dad3-4845-a9b0-a57d027f11ab&limit=1500"
)


@router.post("/seed-cities", status_code=200)
def seed_cities(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Idempotent: fetch Israeli localities from data.gov.il and upsert into cities table."""
    try:
        resp = httpx.get(_DATA_GOV_URL, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"data.gov.il fetch failed: {exc}")

    records = resp.json().get("result", {}).get("records", [])
    inserted = 0
    for rec in records:
        name = (rec.get("שם_יישוב") or rec.get("SHEM_YISHUV") or "").strip()
        if not name:
            continue
        try:
            lat = float(rec.get("lat") or rec.get("Y") or 0) or None
            lng = float(rec.get("lon") or rec.get("X") or 0) or None
        except (TypeError, ValueError):
            lat = lng = None
        result = db.execute(
            text(
                "INSERT INTO cities (name_he, lat, lng) VALUES (:name_he, :lat, :lng)"
                " ON CONFLICT (name_he) DO NOTHING"
            ),
            {"name_he": name, "lat": lat, "lng": lng},
        )
        inserted += result.rowcount
    db.commit()
    return {"seeded": inserted}


def _send_notification_email(to_email: str, subject: str, body: str):
    send_email(to_email, subject, body)


def _send_whatsapp(to: str, body: str):
    """Send WhatsApp admin notification via Meta Cloud API.

    MEH-508: send_text is fail-open (False on missing config or HTTP error,
    no exception raised), so the previous try/except + configured-check
    collapse to a single call. Service-level logger emits the warning.
    """
    send_text(to, body)
