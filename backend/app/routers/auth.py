from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.models import Category, DeliveryArea, Producer, ProducerCategory, User
from app.models.models import Favorite, HomeProduct, HomeProductRating, HomeProductWhatsAppClick, Report
from app.rate_limit import limiter
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
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        city=data.city,
        phone=data.phone,
        role="consumer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token(user.id))


@router.post("/register/producer", response_model=Token)
@limiter.limit("3/hour")  # SECURITY FIX #2
def register_producer(request: Request, data: ProducerRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    producer = Producer(
        name=data.producer_name,
        description=data.description,
        city=data.city,
        lat=data.lat,
        lng=data.lng,
        phone=data.phone,
        instagram=data.instagram,
        website=data.website,
        status="pending",
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
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _notify_admin_new_producer(producer)

    return Token(access_token=create_access_token(user.id))


@router.post("/google", response_model=Token)
@limiter.limit("10/minute")  # SECURITY FIX #2: OAuth needs a higher ceiling
def google_auth(request: Request, data: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Authenticate with Google ID token."""
    user_info = _verify_google_token(data.id_token)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid Google token")

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if getattr(user, "is_blocked", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="המשתמש חסום")
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("/apple", response_model=Token)
@limiter.limit("10/minute")  # SECURITY FIX #2
def apple_auth(request: Request, data: AppleAuthRequest, db: Session = Depends(get_db)):
    """Authenticate with Apple ID token."""
    user_info = _verify_apple_token(data.id_token)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid Apple token")

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
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    return Token(access_token=create_access_token(user.id))


@router.delete("/me")
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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


def _send_deletion_email(email: str, name: str):
    """Send account deletion confirmation email."""
    if not settings.smtp_user:
        print(f"[EMAIL] Would send deletion confirmation to {email}")
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
        print(f"[EMAIL] Deletion confirmation sent to {email}")
    except Exception as e:
        print(f"[EMAIL] Failed to send deletion confirmation: {e}")


def _verify_apple_token(id_token: str) -> dict | None:
    """Verify Apple ID token and return user info."""
    if not settings.apple_client_id:
        print("[APPLE AUTH] No client ID configured, skipping verification")
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
        print(f"[APPLE AUTH] Verification failed: {e}")
        return None


def _verify_google_token(id_token: str) -> dict | None:
    """Verify Google ID token and return user info."""
    if not settings.google_client_id:
        # Fallback for development: decode without verification
        print("[GOOGLE AUTH] No client ID configured, skipping verification")
        return None
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests

        info = google_id_token.verify_oauth2_token(
            id_token, requests.Request(), settings.google_client_id
        )
        return info
    except Exception as e:
        print(f"[GOOGLE AUTH] Verification failed: {e}")
        return None


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
            print(f"[WHATSAPP] Notification sent to admin")
        except Exception as e:
            print(f"[WHATSAPP] Failed: {e}")
    else:
        print(f"[WHATSAPP] Would send: {message}")

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
            print(f"[EMAIL] Notification sent to admin")
        except Exception as e:
            print(f"[EMAIL] Failed: {e}")
    else:
        print(f"[EMAIL] Would send notification about {producer.name}")
