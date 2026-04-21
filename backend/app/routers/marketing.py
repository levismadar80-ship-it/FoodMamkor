"""Marketing-facing endpoints: homepage stats, newsletter signup, contact form.

These are used by the public site (hero social-proof bar, footer newsletter,
about page contact form). All endpoints are anonymous — no auth required.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.services.email import send_email
from app.database import get_db
from app.models import Category, ContactMessage, DeliveryArea, NewsletterSubscriber, Producer
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["marketing"])


# ============================================================
# STATS — GET /stats
# ============================================================


class StatsOut(BaseModel):
    producers_count: int
    categories_count: int


@router.get("/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    producers_count = (
        db.query(func.count(Producer.id))
        .filter(Producer.status == "approved")
        .scalar()
        or 0
    )
    categories_count = db.query(func.count(Category.id)).scalar() or 0
    return StatsOut(
        producers_count=int(producers_count),
        categories_count=int(categories_count),
    )


# ============================================================
# NEWSLETTER — POST /newsletter
# ============================================================


class NewsletterIn(BaseModel):
    email: EmailStr


@router.post("/newsletter", status_code=201)
@limiter.limit("5/hour")  # SECURITY FIX #2: prevent mailbombing
def subscribe_newsletter(request: Request, data: NewsletterIn, db: Session = Depends(get_db)):
    email = data.email.lower().strip()
    existing = (
        db.query(NewsletterSubscriber)
        .filter(NewsletterSubscriber.email == email)
        .first()
    )
    if existing:
        # Return 201 either way — don't reveal whether email was already subscribed
        return {"detail": "נרשמת! 🌱"}

    sub = NewsletterSubscriber(email=email)
    db.add(sub)
    db.commit()
    return {"detail": "נרשמת! 🌱"}


# ============================================================
# CONTACT — POST /contact
# ============================================================


class ContactIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    message: str = Field(..., min_length=1, max_length=5000)


# ============================================================
# CITIES — GET /cities
# ============================================================


@router.get("/cities", response_model=list[str])
def list_cities(db: Session = Depends(get_db)):
    """Return a de-duplicated list of all cities in use — pulls from both
    approved producer cities and delivery-area cities. Sorted alphabetically.
    """
    producer_rows = (
        db.query(Producer.city)
        .filter(Producer.status == "approved", Producer.city.isnot(None))
        .distinct()
        .all()
    )
    delivery_rows = (
        db.query(DeliveryArea.city)
        .filter(DeliveryArea.city.isnot(None))
        .distinct()
        .all()
    )
    seen = set()
    out = []
    for (city,) in list(producer_rows) + list(delivery_rows):
        if not city:
            continue
        city = city.strip()
        if city and city not in seen:
            seen.add(city)
            out.append(city)
    out.sort()
    return out


@router.post("/contact", status_code=200)
@limiter.limit("5/hour")  # SECURITY FIX #2: cap contact form abuse
def submit_contact(request: Request, data: ContactIn, db: Session = Depends(get_db)):
    msg = ContactMessage(
        name=data.name.strip(),
        email=data.email.lower().strip(),
        message=data.message.strip(),
    )
    db.add(msg)
    db.commit()

    # Always log so the message is visible in Railway logs even if SMTP
    # is unconfigured or fails.
    logger.info(
        "New contact message: name=%s email=%s", msg.name, msg.email
    )

    # Send an email to CONTACT_EMAIL (or fall back to ADMIN_EMAIL when
    # unset). Fail-open per CLAUDE.md: the DB row is the source of truth,
    # so SMTP problems must never break the public form.
    _send_contact_email(msg)

    return {"detail": "תודה! נחזור אליך בקרוב 🌿"}


def _send_contact_email(msg: ContactMessage) -> None:
    """Deliver a contact-form submission to the admin inbox.

    The DB row is the source of truth — email failure must never break the
    public form (fail-open contract from send_email).
    """
    recipient = settings.contact_email or settings.admin_email
    if not recipient:
        logger.info("[CONTACT EMAIL] No recipient configured — skipping send")
        return
    body = f"שם: {msg.name}\nאימייל: {msg.email}\n\n{msg.message}"
    send_email(recipient, f"מהמקור — פנייה חדשה מ-{msg.name}", body)
