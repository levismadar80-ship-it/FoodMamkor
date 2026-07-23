"""Marketing-facing endpoints: homepage stats, newsletter signup, contact form.

These are used by the public site (hero social-proof bar, footer newsletter,
about page contact form). All endpoints are anonymous — no auth required.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from joserfc import jwt as jose_jwt
from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.services.email import send_email
from app.database import get_db
from app.models import (
    Category,
    ContactMessage,
    NewsletterSubscriber,
    Producer,
)
from app.rate_limit import limiter

# MEH-460 Pkg 5 (FINAL): schemas relocated to app.schemas.schemas per ADR-006 R1.
from app.schemas.schemas import (
    CONTACT_TOPIC_LABELS,
    ContactIn,
    NewsletterIn,
    NewsletterUnsubscribeIn,
    StatsOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["marketing"])


# ============================================================
# NEWSLETTER UNSUBSCRIBE TOKEN (MEH-1330)
# ============================================================
# Stateless signed token so the unsubscribe link needs no DB column and never
# puts a raw (forgeable) email in a GET URL. Reuses the existing joserfc/JWT
# util + SECRET_KEY (same key derivation as app/auth.py:_jwt_key) — no new
# dependency. Scope-namespaced so an access/refresh token can't unsubscribe,
# and vice-versa. No `exp`: unsubscribe links must keep working months later
# (compliance) — the token only ever authorizes removing its own address.
_UNSUBSCRIBE_SCOPE = "newsletter_unsubscribe"


def _unsubscribe_key() -> OctKey:
    return OctKey.import_key(settings.secret_key.encode())


def create_unsubscribe_token(email: str) -> str:
    payload = {"sub": email, "scope": _UNSUBSCRIBE_SCOPE}
    return jose_jwt.encode({"alg": settings.algorithm}, payload, _unsubscribe_key())


def decode_unsubscribe_token(token: str) -> str | None:
    """Return the subscriber email for a valid unsubscribe token, else None.

    Never raises — mirrors app/auth.py:decode_refresh_token. Any failure
    (bad signature, wrong/absent scope, malformed) resolves to None so the
    endpoint returns a calm error state instead of a 500.
    """
    try:
        token_obj = jose_jwt.decode(
            token, _unsubscribe_key(), algorithms=[settings.algorithm]
        )
    except (JoseError, ValueError):
        return None
    if token_obj.claims.get("scope") != _UNSUBSCRIBE_SCOPE:
        return None
    sub = token_obj.claims.get("sub")
    return sub if isinstance(sub, str) and sub else None


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
    # MEH-1322: derive the host from the single backend URL constant
    # (settings.frontend_url, canonical mehamakor.co.il) instead of hardcoding.
    # MEH-1330: /newsletter/unsubscribe is now a real route carrying a signed
    # token so one click removes the address (RFC-8058-style one-click).
    token = create_unsubscribe_token(email)
    unsubscribe_url = f"{settings.frontend_url}/newsletter/unsubscribe?token={token}"
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


@router.post("/newsletter/unsubscribe", status_code=200)
@limiter.limit("20/hour")
def unsubscribe_newsletter(
    request: Request, data: NewsletterUnsubscribeIn, db: Session = Depends(get_db)
):
    """One-click newsletter unsubscribe via the signed token in the email link.

    Idempotent: a valid token whose address is already gone still returns 200
    (the desired end-state — not subscribed — is reached either way). An
    invalid/expired/wrong-scope token returns 400 with a gentle Hebrew message
    and no stack trace. Never reveals whether the address existed.
    """
    email = decode_unsubscribe_token(data.token)
    if not email:
        raise HTTPException(status_code=400, detail="הקישור אינו תקין או שפג תוקפו.")
    (
        db.query(NewsletterSubscriber)
        .filter(NewsletterSubscriber.email == email.lower().strip())
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"detail": "הוסרת מרשימת התפוצה. 🌿"}


# MEH-1349: the duplicate GET /cities that lived here (producer ∪ delivery-area
# union) was DEAD CODE — routers/cities.py registers first in router_registry.py,
# so this route never matched. Removed per the single-authority rule
# (.claude/rules/db.md § two parallel mechanisms). The live endpoint is
# backend/app/routers/cities.py.


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
