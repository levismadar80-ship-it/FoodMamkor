from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.config import settings
from app.database import get_db
from app.models import HomeProduct, Producer, Recipe, User
from app.schemas.schemas import ProducerDetailOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/producers", response_model=list[ProducerDetailOut])
def list_producers(
    status: str = Query("pending", regex="^(pending|approved|rejected)$"),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.status == status)
        .order_by(Producer.created_at.desc())
        .all()
    )


@router.get("/producers/pending", response_model=list[ProducerDetailOut])
def pending_producers(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.status == "pending")
        .order_by(Producer.created_at.desc())
        .all()
    )


@router.post("/producers/{producer_id}/approve")
def approve_producer(producer_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
    producer.status = "approved"
    db.commit()

    producer_user = db.query(User).filter(User.producer_id == producer.id).first()
    if producer_user:
        _send_notification_email(
            producer_user.email,
            f'מהמקור - העסק "{producer.name}" אושר!',
            f'שלום,\n\nהעסק שלך "{producer.name}" אושר במהמקור!\n'
            f"הפרופיל שלך כעת גלוי לכל המשתמשים באתר.\n\n"
            f"בברכה,\nצוות מהמקור",
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
        raise HTTPException(status_code=404, detail="Producer not found")
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

    return {"detail": "Producer rejected"}


# --- Hidden Home Listings ---
@router.get("/home-products/hidden")
def get_hidden_listings(user: User = Depends(require_admin), db: Session = Depends(get_db)):
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
def restore_listing(product_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Listing not found")
    hp.is_hidden = False
    db.commit()
    return {"detail": "Listing restored"}


@router.delete("/home-products/{product_id}")
def delete_listing(product_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp:
        raise HTTPException(status_code=404, detail="Listing not found")
    db.delete(hp)
    db.commit()
    return {"detail": "Listing deleted"}


# --- Recipes ---
@router.get("/recipes/pending")
def pending_recipes(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(Recipe).filter(Recipe.status == "pending").all()


@router.post("/recipes/{recipe_id}/approve")
def approve_recipe(recipe_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    recipe.status = "approved"
    db.commit()
    return {"detail": "Recipe approved"}


@router.post("/recipes/{recipe_id}/reject")
def reject_recipe(recipe_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    recipe.status = "rejected"
    db.commit()
    return {"detail": "Recipe rejected"}


# --- Stats ---
@router.get("/stats")
def get_stats(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {
        "total_producers": db.query(Producer).count(),
        "pending_producers": db.query(Producer).filter(Producer.status == "pending").count(),
        "approved_producers": db.query(Producer).filter(Producer.status == "approved").count(),
        "total_users": db.query(User).count(),
        "total_home_products": db.query(HomeProduct).filter(HomeProduct.is_active.is_(True)).count(),
        "hidden_home_products": db.query(HomeProduct).filter(HomeProduct.is_hidden.is_(True)).count(),
    }


def _send_notification_email(to_email: str, subject: str, body: str):
    """Send email notification."""
    if not settings.smtp_user:
        print(f"[EMAIL] Would send to {to_email}: {subject}")
        return

    try:
        import smtplib
        from email.mime.text import MIMEText

        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_user
        msg["To"] = to_email

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        print(f"[EMAIL] Sent to {to_email}")
    except Exception as e:
        print(f"[EMAIL] Failed to send to {to_email}: {e}")
