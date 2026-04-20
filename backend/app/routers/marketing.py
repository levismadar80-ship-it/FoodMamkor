"""Public marketing endpoints: contact form, newsletter, stats."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import ContactMessage

router = APIRouter(tags=["marketing"])


class ContactIn(BaseModel):
    name: str
    email: EmailStr
    message: str


@router.post("/contact", status_code=201)
def submit_contact(data: ContactIn, db: Session = Depends(get_db)):
    if not data.name.strip() or not data.message.strip():
        raise HTTPException(status_code=422, detail="שם והודעה הם שדות חובה")

    msg = ContactMessage(
        name=data.name.strip(),
        email=data.email.strip(),
        message=data.message.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    _notify_admin(msg)

    return {"detail": "תודה! נחזור אליך בקרוב 🌿"}


def _notify_admin(msg: ContactMessage):
    """Best-effort notification — never fails the request."""
    preview = msg.message[:80] + ("..." if len(msg.message) > 80 else "")

    # Email
    if settings.smtp_user and settings.admin_email:
        try:
            import smtplib
            from email.mime.text import MIMEText

            body = (
                f"פנייה חדשה מ-{msg.name} ({msg.email}):\n\n"
                f"{msg.message}\n\n"
                f"---\nלצפייה: {settings.frontend_url}/admin/contact"
            )
            email = MIMEText(body, "plain", "utf-8")
            email["Subject"] = f"📬 פנייה חדשה מ-{msg.name}"
            email["From"] = settings.smtp_user
            email["To"] = settings.admin_email

            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(email)
        except Exception as e:
            print(f"[CONTACT EMAIL] Failed: {e}")

    # WhatsApp
    if (
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_whatsapp_from
        and settings.admin_whatsapp_to
    ):
        try:
            from twilio.rest import Client

            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            client.messages.create(
                body=f"📬 פנייה חדשה מ-{msg.name}: {preview}",
                from_=f"whatsapp:{settings.twilio_whatsapp_from}",
                to=f"whatsapp:{settings.admin_whatsapp_to}",
            )
        except Exception as e:
            print(f"[CONTACT WHATSAPP] Failed: {e}")
