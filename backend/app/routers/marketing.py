"""Marketing-facing endpoints: homepage stats, newsletter signup, contact form.

These are used by the public site (hero social-proof bar, footer newsletter,
about page contact form). All endpoints are anonymous — no auth required.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, ContactMessage, NewsletterSubscriber, Producer

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
def subscribe_newsletter(data: NewsletterIn, db: Session = Depends(get_db)):
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


@router.post("/contact", status_code=200)
def submit_contact(data: ContactIn, db: Session = Depends(get_db)):
    msg = ContactMessage(
        name=data.name.strip(),
        email=data.email.lower().strip(),
        message=data.message.strip(),
    )
    db.add(msg)
    db.commit()

    # In production this would send an email to the admin.
    # For now we just log it so the admin can see it in server logs.
    logger.info(
        "New contact message: name=%s email=%s", msg.name, msg.email
    )

    return {"detail": "תודה! נחזור אליך בקרוב 🌿"}
