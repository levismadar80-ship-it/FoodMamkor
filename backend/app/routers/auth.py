import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.models import Category, DeliveryArea, Producer, ProducerCategory, User
from app.models.models import Favorite, HomeProduct, HomeProductRating, HomeProductWhatsAppClick, Report
from app.rate_limit import limiter


def _gen_referral_code() -> str:
    return uuid.uuid4().hex[:8]
from app.schemas.schemas import (
    AppleAuthRequest,
    GoogleAuthRequest,
    LoginRequest,
    ProducerRegister,
    Token,
    UserOut,
    UserRegister,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token)
@limiter.limit("3/hour")  # SECURITY FIX #2: cap new signups per IP
def register(request: Request, data: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="האימייל כבר קיים במערכת")

    user = User(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        city=data.city,
        phone=data.phone,
        role="consumer",
        referral_code=_gen_referral_code(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # LAUNCH_CHECKLIST week 3 — welcome email (fire-and-forget, no block)
    _send_welcome_email(user.email, user.name, role="consumer")
    return Token(access_token=create_access_token(user.id))


@router.post("/register/producer", response_model=Token)
@limiter.limit("3/hour")  # SECURITY FIX #2
def register_producer(request: Request, data: ProducerRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="האימייל כבר קיים במערכת")

    # MEH-17: validate primary contact method has its required field filled.
    method = (data.primary_contact_method or "whatsapp").strip().lower()
    if method not in {"whatsapp", "phone", "website", "email"}:
        raise HTTPException(status_code=422, detail="אמצעי קשר לא נתמך")
    if method in {"whatsapp", "phone"} and not (data.phone or "").strip():
        raise HTTPException(
            status_code=422,
            detail="חובה להזין טלפון עבור אמצעי הקשר הנבחר",
        )
    if method == "website" and not (data.website or "").strip():
        raise HTTPException(
            status_code=422,
            detail="חובה להזין כתובת אתר עבור אמצעי הקשר הנבחר",
        )
    if method == "email" and not (data.contact_email or "").strip():
        raise HTTPException(
            status_code=422,
            detail="חובה להזין אימייל ליצירת קשר עבור אמצעי הקשר הנבחר",
        )

    producer = Producer(
        name=data.producer_name,
        description=data.description,
        city=data.city,
        lat=data.lat,
        lng=data.lng,
        phone=data.phone,
        instagram=data.instagram,
        website=data.website,
        primary_contact_method=method,
        contact_email=data.contact_email,
        status="pending_whatsapp",
    )
    db.add(producer)
    db.flush()

    for cid in data.category_ids:
        cat = db.query(Category).filter(Category.id == cid).first()
        if cat:
            db.add(ProducerCategory(producer_id=producer.id, category_id=cid))

    for da in data.delivery_areas:
        db.add(DeliveryArea(
            producer_id=producer.id,
            city=da.city,
            min_order=da.min_order,
            delivery_day=da.delivery_day,
        ))

    user = User(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        phone=data.phone,
        role="producer",
        producer_id=producer.id,
        referral_code=_gen_referral_code(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _notify_admin_new_producer(producer)
    _notify_producer_registered(producer)
    # LAUNCH_CHECKLIST week 3 — welcome email (business variant)
    _send_welcome_email(user.email, user.name, role="producer")

    return Token(access_token=create_access_token(user.id))


@router.post("/google", response_model=Token)
@limiter.limit("10/minute")  # SECURITY FIX #2: OAuth needs a higher ceiling
def google_auth(request: Request, data: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Authenticate with Google ID token."""
    user_info = _verify_google_token(data.id_token)
    if not user_info:
        raise HTTPException(status_code=401, detail="אסימון Google לא תקין")

    google_id = user_info["sub"]
    email = user_info.get("email", "")
    name = user_info.get("name", "")

    # Check if user exists by google_id or email
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Link existing account to Google
            user.google_id = google_id
            db.commit()
        else:
            # Create new user
            user = User(
                email=email,
                name=name,
                google_id=google_id,
                role="consumer",
                referral_code=_gen_referral_code(),
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    return Token(access_token=create_access_token(user.id))


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")  # SECURITY FIX #2: brute-force protection
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אימייל או סיסמה שגויים")
    if getattr(user, "is_blocked", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="המשתמש חסום")
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
@limiter.limit("60/minute")
def get_me(request: Request, user: User = Depends(get_current_user)):
    return user


@router.post("/apple", response_model=Token)
@limiter.limit("10/minute")  # SECURITY FIX #2
def apple_auth(request: Request, data: AppleAuthRequest, db: Session = Depends(get_db)):
    """Authenticate with Apple ID token."""
    user_info = _verify_apple_token(data.id_token)
    if not user_info:
        raise HTTPException(status_code=401, detail="אסימון Apple לא תקין")

    apple_id = user_info["sub"]
    email = user_info.get("email", "")
    name = data.name or email.split("@")[0]

    # Check if user exists by apple_id or email
    user = db.query(User).filter(User.apple_id == apple_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.apple_id = apple_id
            db.commit()
        else:
            user = User(
                email=email,
                name=name,
                apple_id=apple_id,
                role="consumer",
                referral_code=_gen_referral_code(),
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    return Token(access_token=create_access_token(user.id))


@router.delete("/me")
@limiter.limit("3/hour")
def delete_account(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete user account and all associated data. Required by Apple App Store Guidelines."""
    user_email = user.email
    user_name = user.name

    # Delete all user data (cascade)
    db.query(HomeProductRating).filter(HomeProductRating.user_id == user.id).delete()
    db.query(HomeProductWhatsAppClick).filter(HomeProductWhatsAppClick.user_id == user.id).delete()
    db.query(HomeProduct).filter(HomeProduct.user_id == user.id).delete()
    db.query(Favorite).filter(Favorite.user_id == user.id).delete()
    db.query(Report).filter(Report.reporter_id == user.id).delete()

    db.delete(user)
    db.commit()

    # Send confirmation email
    _send_deletion_email(user_email, user_name)

    return {"detail": "Account deleted successfully"}


def _send_welcome_email(email: str, name: str, role: str = "consumer"):
    """LAUNCH_CHECKLIST week 3 — send welcome email after registration.
    Fire-and-forget: SMTP failures never block the registration response.
    """
    if not settings.smtp_user:
        logger.debug(f"[EMAIL] Would send welcome email to {email} (role={role})")
        return

    consumer_body = (
        f"שלום {name},\n\n"
        f"ברוכה הבאה למהמקור! 🌿\n\n"
        f"עכשיו את יכולה לגלות בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית —\n"
        f"כל האוכל האמיתי, במקום אחד.\n\n"
        f"מה הלאה?\n"
        f"  • גלי בתי עסק לפי עיר או קטגוריה: {settings.frontend_url}\n"
        f"  • פתחי את המפה: {settings.frontend_url}/map\n"
        f"  • שמרי עסקים מועדפים\n\n"
        f"אם יש שאלות — פשוט תגיבי למייל הזה.\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )

    producer_body = (
        f"שלום {name},\n\n"
        f"ברוכה הבאה למהמקור! 🌿\n\n"
        f"העסק שלך ממתין כרגע לאישור אדמין — אנחנו בודקים כל עסק חדש כדי לוודא\n"
        f"שהוא מתאים לקריטריונים שלנו (ייצור מקומי, חומרי גלם מזוהים, ללא מעובד).\n\n"
        f"אחרי האישור תקבלי מייל עם הקישור לעסק שלך,\n"
        f"ותוכלי לפרסם אירועים, לעדכן מוצרים ולעקוב אחרי מועדפים.\n\n"
        f"לדשבורד: {settings.frontend_url}/producer/dashboard\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )

    body = producer_body if role == "producer" else consumer_body
    subject = "ברוכה הבאה למהמקור 🌿"

    try:
        import smtplib
        from email.mime.text import MIMEText

        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_user
        msg["To"] = email

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        # Log only the email prefix per security policy (never full address in logs)
        logger.info(f"[EMAIL] Welcome email sent to {email.split('@')[0]}***")
    except Exception as e:
        # Never block registration on email failure
        logger.warning(f"[EMAIL] Welcome email failed: {e}")


def _send_deletion_email(email: str, name: str):
    """Send account deletion confirmation email."""
    if not settings.smtp_user:
        logger.debug(f"[EMAIL] Would send deletion confirmation to {email}")
        return
    try:
        import smtplib
        from email.mime.text import MIMEText

        body = (
            f"שלום {name},\n\n"
            f"החשבון שלך במהמקור נמחק בהצלחה.\n"
            f"כל הנתונים שלך, כולל מועדפים, מוצרים ודירוגים, נמחקו לצמיתות.\n\n"
            f"אם לא ביקשת למחוק את החשבון, צור איתנו קשר מיידית.\n\n"
            f"בברכה,\nצוות מהמקור"
        )
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = "מהמקור - החשבון שלך נמחק"
        msg["From"] = settings.smtp_user
        msg["To"] = email

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info(f"[EMAIL] Deletion confirmation sent to {email}")
    except Exception as e:
        logger.warning(f"[EMAIL] Failed to send deletion confirmation: {e}")


def _verify_apple_token(id_token: str) -> dict | None:
    """Verify Apple ID token and return user info."""
    if not settings.apple_client_id:
        logger.debug("[APPLE AUTH] No client ID configured, skipping verification")
        return None
    try:
        import jwt as pyjwt
        import requests

        # Fetch Apple's public keys
        apple_keys_url = "https://appleid.apple.com/auth/keys"
        keys_response = requests.get(apple_keys_url)
        apple_keys = keys_response.json()["keys"]

        # Decode header to find the right key
        header = pyjwt.get_unverified_header(id_token)
        key = next((k for k in apple_keys if k["kid"] == header["kid"]), None)
        if not key:
            return None

        public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(key)
        payload = pyjwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=settings.apple_client_id,
            issuer="https://appleid.apple.com",
        )
        return payload
    except Exception as e:
        logger.warning(f"[APPLE AUTH] Verification failed: {e}")
        return None


def _verify_google_token(id_token: str) -> dict | None:
    """Verify Google ID token and return user info."""
    if not settings.google_client_id:
        # Fallback for development: decode without verification
        logger.debug("[GOOGLE AUTH] No client ID configured, skipping verification")
        return None
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests

        info = google_id_token.verify_oauth2_token(
            id_token, requests.Request(), settings.google_client_id
        )
        return info
    except Exception as e:
        logger.warning(f"[GOOGLE AUTH] Verification failed: {e}")
        return None


def _notify_producer_registered(producer: Producer):
    """Send WhatsApp welcome + profile-completion link to the new producer."""
    if not (producer.phone and settings.twilio_account_sid and settings.twilio_whatsapp_from):
        return
    phone = producer.phone.replace("-", "").strip()
    if not phone.startswith("+"):
        phone = "+972" + phone.lstrip("0")
    message = (
        f"ברוכה הבאה למהמקור! 🌿\n"
        f"העסק '{producer.name}' נרשם בהצלחה.\n"
        f"השלימי את הפרופיל כדי שלקוחות יוכלו למצוא אותך:\n"
        f"{settings.frontend_url}/producer/dashboard"
    )
    try:
        from twilio.rest import Client
        Client(settings.twilio_account_sid, settings.twilio_auth_token).messages.create(
            body=message,
            from_=settings.twilio_whatsapp_from,
            to=f"whatsapp:{phone}",
        )
        logger.info("[WHATSAPP] Producer welcome sent")
    except Exception as e:
        logger.warning(f"[WHATSAPP] Producer welcome failed: {e}")


def _notify_admin_new_producer(producer: Producer):
    """Send WhatsApp + email notification to admin about new producer."""
    message = (
        f"יצרן חדש: {producer.name} - {producer.city or 'לא צוין'}\n"
        f"לאישור: {settings.frontend_url}/admin"
    )
    # WhatsApp via Twilio
    if settings.twilio_account_sid and settings.admin_whatsapp_to:
        try:
            from twilio.rest import Client
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            client.messages.create(
                body=message,
                from_=settings.twilio_whatsapp_from,
                to=settings.admin_whatsapp_to,
            )
            logger.info(f"[WHATSAPP] Notification sent to admin")
        except Exception as e:
            logger.warning(f"[WHATSAPP] Failed: {e}")
    else:
        logger.debug(f"[WHATSAPP] Would send: {message}")

    # Email
    if settings.smtp_user and settings.admin_email:
        try:
            import smtplib
            from email.mime.text import MIMEText

            msg = MIMEText(message, "plain", "utf-8")
            msg["Subject"] = f"מהמקור - יצרן חדש: {producer.name}"
            msg["From"] = settings.smtp_user
            msg["To"] = settings.admin_email

            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
            logger.info(f"[EMAIL] Notification sent to admin")
        except Exception as e:
            logger.warning(f"[EMAIL] Failed: {e}")
    else:
        logger.debug(f"[EMAIL] Would send notification about {producer.name}")
