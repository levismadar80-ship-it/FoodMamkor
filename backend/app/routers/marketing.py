"""Marketing-facing endpoints: homepage stats, newsletter signup, contact form.

These are used by the public site (hero social-proof bar, footer newsletter,
about page contact form). All endpoints are anonymous — no auth required.
"""

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.services.email import send_email
from app.database import get_db
from app.models import (
    Category,
    ContactMessage,
    DeliveryArea,
    NewsletterSubscriber,
    Producer,
)
from app.rate_limit import limiter

# MEH-460 Pkg 5 (FINAL): schemas relocated to app.schemas.schemas per ADR-006 R1.
from app.schemas.schemas import CONTACT_TOPIC_LABELS, ContactIn, NewsletterIn, StatsOut

logger = logging.getLogger(__name__)

router = APIRouter(tags=["marketing"])


# ============================================================
# STATS — GET /stats
# ============================================================


@router.get("/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    producers_count = (
        db.query(func.count(Producer.id)).filter(Producer.status == "approved").scalar()
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


@router.post("/newsletter", status_code=201)
@limiter.limit("5/hour")  # SECURITY FIX #2: prevent mailbombing
def subscribe_newsletter(
    request: Request, data: NewsletterIn, db: Session = Depends(get_db)
):
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
    _send_newsletter_welcome(email)
    return {"detail": "נרשמת! 🌱"}


def _send_newsletter_welcome(email: str) -> None:
    """Send a welcome email to new newsletter subscribers. Fail-open."""
    unsubscribe_url = "https://mehamakor.co.il/newsletter/unsubscribe"
    html_body = f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="40" cellspacing="0"
               style="background:#ffffff;border-radius:12px;text-align:right;direction:rtl;max-width:560px;">
          <tr>
            <td style="text-align:right;direction:rtl;">
              <p style="font-size:13px;color:#2e6853;margin:0 0 8px;font-weight:bold;">מהמקור 🌿</p>
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 16px;">ברוכה הבאה למהמקור</h1>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.8;margin:0 0 20px;">תודה שהצטרפת.</p>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.8;margin:0 0 8px;font-weight:bold;">מה תקבלי?</p>
              <ul style="color:#3a3a3a;font-size:15px;line-height:2;margin:0 0 24px;padding-right:20px;">
                <li>פעם בשבוע — סיפור על בית עסק חדש</li>
                <li>מתי ואיפה אפשר לפגוש (פעם בחודש)</li>
                <li>בלי הצעות, בלי spam, בלי ניסיון למכור לך משהו</li>
              </ul>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.8;margin:0 0 24px;">
                הסיפור הראשון יגיע ביום שני. עד אז —<br>
                <span style="font-weight:bold;">ספיר ✨</span>
              </p>
              <hr style="border:none;border-top:1px solid #e5e0d8;margin:0 0 20px;">
              <p style="color:#888;font-size:12px;line-height:1.6;margin:0;">
                מהמקור — בתי עסק מקומיים, כולם במקום אחד.<br>
                <a href="{unsubscribe_url}" style="color:#888;text-decoration:underline;">לבטל הרשמה</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    plain = (
        "ברוכה הבאה למהמקור!\n\n"
        "תודה שהצטרפת.\n\n"
        "מה תקבלי?\n"
        "• פעם בשבוע — סיפור על בית עסק חדש\n"
        "• מתי ואיפה אפשר לפגוש (פעם בחודש)\n"
        "• בלי הצעות, בלי spam, בלי ניסיון למכור לך משהו\n\n"
        "הסיפור הראשון יגיע ביום שני. עד אז —\n"
        "ספיר ✨\n\n"
        f"לבטל הרשמה: {unsubscribe_url}\n"
        "מהמקור — בתי עסק מקומיים, כולם במקום אחד."
    )
    send_email(email, "ברוכה הבאה למהמקור 🌿", plain, html=html_body)


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
    # MEH-1113: unify inbound routing — every submission carries a topic
    # (None → "general"). No DB column: the Hebrew label is prepended to the
    # stored message and used in the email subject so admins can eyeball the
    # topic without a schema migration.
    label = CONTACT_TOPIC_LABELS[data.topic or "general"]
    stored_message = f"נושא: {label}\n\n{data.message.strip()}"
    msg = ContactMessage(
        name=data.name.strip(),
        email=data.email.lower().strip(),
        message=stored_message,
    )
    db.add(msg)
    db.commit()

    # Always log so the message is visible in Railway logs even if Resend
    # is unconfigured or fails.
    logger.info(
        "New contact message: name=%s email=%s topic=%s", msg.name, msg.email, label
    )

    # Send an email to CONTACT_EMAIL (or fall back to ADMIN_EMAIL when
    # unset). Fail-open per CLAUDE.md: the DB row is the source of truth,
    # so Resend errors must never break the public form.
    _send_contact_email(msg, label)

    return {"detail": "תודה! נחזור אליכם בקרוב 🌿"}


def _send_contact_email(msg: ContactMessage, label: str) -> None:
    """Deliver a contact-form submission to the admin inbox.

    The DB row is the source of truth — email failure must never break the
    public form (fail-open contract from send_email). `label` is the Hebrew
    topic label (MEH-1113) surfaced in the subject line.
    """
    recipient = settings.contact_email or settings.admin_email
    if not recipient:
        logger.info("[CONTACT EMAIL] No recipient configured — skipping send")
        return
    body = f"שם: {msg.name}\nאימייל: {msg.email}\n\n{msg.message}"
    send_email(recipient, f"מהמקור — פנייה חדשה ({label}) מ-{msg.name}", body)
