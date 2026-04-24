import logging
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import EmailStr
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.auth import create_access_token, get_current_user, get_current_user_optional, hash_password, verify_password
from app.config import settings
from app.services.email import send_email
from app.database import get_db
from app.models import Category, DeliveryArea, Producer, ProducerCategory, User
from app.models.models import Favorite, HomeProduct, HomeProductRating, HomeProductWhatsAppClick, Report
from app.rate_limit import limiter


def _gen_referral_code() -> str:
    return uuid.uuid4().hex[:8]


_MAX_AVATAR_BYTES = 1 * 1024 * 1024  # 1 MB — Google avatars are tiny


def _upload_google_avatar_or_none(picture_url: str | None) -> str | None:
    """Download a Google profile picture and re-host it on Cloudinary.

    Fail-open: any network or API error returns None so OAuth login is
    never blocked. Returns the Cloudinary secure_url on success, or
    picture_url unchanged when Cloudinary is not configured (dev only).
    """
    if not picture_url:
        return None
    if not settings.cloudinary_cloud_name:
        return picture_url  # dev fallback — Cloudinary not wired up
    try:
        import httpx
        import cloudinary
        import cloudinary.uploader

        resp = httpx.get(picture_url, timeout=5, follow_redirects=True)
        resp.raise_for_status()
        contents = resp.content
        if len(contents) > _MAX_AVATAR_BYTES:
            logger.warning(
                "Google avatar too large (%d bytes), skipping Cloudinary re-host",
                len(contents),
            )
            return None
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        result = cloudinary.uploader.upload(
            contents,
            folder="mehamakor/avatars",
            public_id=uuid.uuid4().hex,
            resource_type="image",
            transformation=[{"width": 400, "height": 400, "crop": "fill", "gravity": "face"}],
        )
        return result["secure_url"]
    except Exception:
        logger.exception(
            "Failed to re-host Google avatar from %s — login continues without avatar",
            picture_url,
        )
        return None


from app.schemas.schemas import (
    AppleAuthRequest,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    ProducerOAuthSignupRequest,
    ProducerRegister,
    ResetPasswordRequest,
    Token,
    UserOut,
    UserRegister,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token)
@limiter.limit("3/hour")  # SECURITY FIX #2: cap new signups per IP
def register(request: Request, data: UserRegister, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="האימייל כבר קיים במערכת")

    verify_token = secrets.token_urlsafe(32)
    verify_expires = datetime.utcnow() + timedelta(hours=24)
    user = User(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        city=data.city,
        phone=data.phone,
        role="consumer",
        referral_code=_gen_referral_code(),
        email_verified=False,
        email_verify_token=verify_token,
        email_verify_expires=verify_expires,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    background_tasks.add_task(_send_verify_email, user.email, user.name, verify_token)
    background_tasks.add_task(_send_welcome_email, user.email, user.name, "consumer")
    return Token(access_token=create_access_token(user.id, user.token_version))


@router.post("/register/producer", response_model=Token)
@limiter.limit("3/hour")  # SECURITY FIX #2
def register_producer(
    request: Request,
    data: ProducerRegister,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: "User | None" = Depends(get_current_user_optional),
):
    # MEH-143: two paths — upgrade (logged-in) vs new registration (anonymous).
    upgrade_path = current_user is not None

    if upgrade_path:
        # Upgrading an existing account — ignore any email/name/password in body.
        user = current_user
        # Check both: producer_id (current link) and is_producer (durable flag).
        # is_producer stays True even if an admin manually clears producer_id,
        # preventing silent re-registration without an explicit admin reset.
        if user.producer_id or user.is_producer:
            raise HTTPException(status_code=409, detail="כבר יש לך עסק רשום בחשבון זה")
    else:
        # New registration — email, name, password are required.
        if not data.email or not data.name or not data.password:
            raise HTTPException(
                status_code=422,
                detail="אימייל, שם וסיסמה הם שדות חובה",
            )
        if db.query(User).filter(User.email == data.email).first():
            raise HTTPException(
                status_code=409,
                detail="האימייל כבר קיים במערכת. אם כבר נרשמת כצרכנית, התחברי לחשבון שלך.",
            )

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
        gluten_free=data.gluten_free,
        vegan=data.vegan,
        lactose_free=data.lactose_free,
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

    verify_token = secrets.token_urlsafe(32)
    verify_expires = datetime.utcnow() + timedelta(hours=24)

    if upgrade_path:
        # Link producer to existing user, upgrade role + flag.
        user.producer_id = producer.id
        user.role = "producer"
        user.is_producer = True
        db.commit()
        db.refresh(user)
    else:
        user = User(
            email=data.email,
            name=data.name,
            password_hash=hash_password(data.password),
            phone=data.phone,
            role="producer",
            producer_id=producer.id,
            is_producer=True,
            referral_code=_gen_referral_code(),
            email_verified=False,
            email_verify_token=verify_token,
            email_verify_expires=verify_expires,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Capture producer primitives NOW — expire_on_commit=True means ORM
    # attributes are expired after commit, and FastAPI closes the session
    # before background tasks run.
    p_name = producer.name
    p_city = producer.city
    p_phone = producer.phone

    background_tasks.add_task(_notify_admin_new_producer, p_name, p_city)
    background_tasks.add_task(_notify_producer_registered, p_name, p_phone)
    if not upgrade_path:
        background_tasks.add_task(_send_verify_email, user.email, user.name, verify_token)
        background_tasks.add_task(_send_welcome_email, user.email, user.name, "producer")

    return Token(access_token=create_access_token(user.id, user.token_version))


@router.get("/email-exists")
@limiter.limit("30/minute")
def email_exists(request: Request, email: EmailStr, db: Session = Depends(get_db)):
    """MEH-143: non-auth check so the producer register form can warn
    before submit that the email belongs to an existing consumer account."""
    exists = db.query(User).filter(User.email == email).first() is not None
    return {"exists": exists}


@router.post("/google", response_model=Token)
@limiter.limit("10/minute")  # SECURITY FIX #2: OAuth needs a higher ceiling
def google_auth(request: Request, data: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Authenticate with Google ID token."""
    # MEH-253 — distinguish "Google OAuth isn't configured on this server"
    # (503) from "the token you sent is invalid" (401). Before this check,
    # both cases returned 401 "אסימון Google לא תקין" — misleading to the
    # user and to anyone debugging the deploy.
    if not settings.google_client_id:
        raise HTTPException(
            status_code=503,
            detail="התחברות עם Google לא פעילה כרגע. נסי התחברות עם אימייל וסיסמה.",
        )
    user_info = _verify_google_token(data.id_token)
    if not user_info:
        raise HTTPException(status_code=401, detail="אסימון Google לא תקין")

    google_id = user_info["sub"]
    email = user_info.get("email", "")
    name = user_info.get("name", "")
    picture = _upload_google_avatar_or_none(user_info.get("picture"))

    # Check if user exists by google_id or email
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # SECURITY: prevent silent account takeover — if the email is already
            # registered via password (or a different OAuth provider), refuse to
            # link without explicit user action.
            if not user.google_id:
                raise HTTPException(
                    status_code=409,
                    detail="אימייל זה כבר רשום עם סיסמה. התחברי עם סיסמה במקום.",
                )
            user.email_verified = True
            db.commit()
        else:
            # Create new user — Google already verified the email
            user = User(
                email=email,
                name=name,
                google_id=google_id,
                role="consumer",
                referral_code=_gen_referral_code(),
                avatar_url=picture,
                email_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    # MEH-138: fill avatar_url from Google picture if not already set
    # (don't overwrite a manually-uploaded photo).
    if picture and not user.avatar_url:
        user.avatar_url = picture
        db.commit()

    return Token(access_token=create_access_token(user.id, user.token_version))


@router.post("/register/producer/oauth", response_model=Token)
@limiter.limit("10/minute")
def register_producer_oauth(
    request: Request,
    data: ProducerOAuthSignupRequest,
    db: Session = Depends(get_db),
):
    """MEH-170 — OAuth as Step 0 of producer signup.

    Creates or logs in a user via Google or Apple, then returns a JWT.
    The frontend advances to Step 2 of /register/producer; the final
    POST /auth/register/producer takes the MEH-143 upgrade path because
    the user is already authenticated.

    Differs from /auth/google and /auth/apple in ONE place: if the
    authenticated user already has a producer linked, return 409 so the
    UI can redirect to /login instead of silently continuing. Everything
    else — token verification, MEH-166 email-collision guard, MEH-138
    avatar backfill — is re-used from the existing OAuth handlers.
    """
    provider = data.provider
    if provider == "google":
        if not settings.google_client_id:
            raise HTTPException(
                status_code=503,
                detail="התחברות עם Google לא פעילה כרגע. נסי התחברות עם אימייל וסיסמה.",
            )
        user_info = _verify_google_token(data.id_token)
        sub_field = "google_id"
    else:  # apple — pattern validator on schema guarantees one of the two
        if not settings.apple_client_id:
            raise HTTPException(
                status_code=503,
                detail="התחברות עם Apple לא פעילה כרגע. נסי התחברות עם אימייל וסיסמה.",
            )
        user_info = _verify_apple_token(data.id_token)
        sub_field = "apple_id"

    if not user_info:
        label = "Google" if provider == "google" else "Apple"
        raise HTTPException(status_code=401, detail=f"אסימון {label} לא תקין")

    oauth_sub = user_info["sub"]
    email = user_info.get("email", "")
    # Apple only sends the name on the very first auth; callers may pass
    # it explicitly via `name`. Fall back to the Google "name" claim or
    # the email local-part so the User.name NOT NULL constraint holds.
    full_name = data.name or user_info.get("name") or (email.split("@")[0] if email else "חדשה")
    # Re-host the Google avatar once here so both new-user creation and the
    # MEH-138 backfill use the same Cloudinary URL without a double upload.
    picture_for_google = _upload_google_avatar_or_none(
        user_info.get("picture") if provider == "google" else None
    )

    # 1. Look up by provider sub first (stable identifier).
    user = db.query(User).filter(getattr(User, sub_field) == oauth_sub).first()

    # 2. Fall back to email lookup — MEH-166 takeover guard.
    if not user:
        user = db.query(User).filter(User.email == email).first() if email else None
        if user:
            # Email registered via password or the *other* OAuth provider.
            # Refuse silent link — same rule as /auth/google and /auth/apple.
            if not getattr(user, sub_field):
                raise HTTPException(
                    status_code=409,
                    detail="אימייל זה כבר רשום עם סיסמה. התחברי עם סיסמה במקום.",
                )
        else:
            kwargs = {
                "email": email,
                "name": full_name,
                "role": "consumer",
                "referral_code": _gen_referral_code(),
                sub_field: oauth_sub,
            }
            if provider == "google":
                kwargs["avatar_url"] = picture_for_google
            user = User(**kwargs)
            db.add(user)
            db.commit()
            db.refresh(user)

    # 3. If this account is already a producer, bail out — the producer
    # signup flow is for NEW producers. Existing ones should log in and
    # use the producer dashboard.
    if user.producer_id or getattr(user, "is_producer", False):
        raise HTTPException(
            status_code=409,
            detail="יש לך כבר עסק רשום בחשבון זה. התחברי כדי לנהל אותו.",
        )

    # MEH-138 — backfill the Google avatar once, without overwriting a
    # manually-uploaded photo.
    if provider == "google":
        if picture_for_google and not user.avatar_url:
            user.avatar_url = picture_for_google
            db.commit()

    return Token(access_token=create_access_token(user.id, user.token_version))


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")  # SECURITY FIX #2: brute-force protection
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אימייל או סיסמה שגויים")
    if getattr(user, "is_blocked", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="המשתמש חסום")
    return Token(access_token=create_access_token(user.id, user.token_version))


@router.get("/me", response_model=UserOut)
@limiter.limit("120/minute")
def get_me(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return current user, enriched with producer status/rejection_reason."""
    out = UserOut.model_validate(user)
    if user.producer_id:
        producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
        if producer:
            out.producer_status = producer.status
            out.producer_rejection_reason = producer.rejection_reason
    return out


@router.post("/logout-all-devices", response_model=Token)
@limiter.limit("5/hour")
def logout_all_devices(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invalidate all existing sessions by incrementing token_version.

    Returns a new token for the current session so the caller stays
    authenticated. All other devices receive 401 on their next request.
    """
    user.token_version = (user.token_version or 1) + 1
    db.commit()
    return Token(access_token=create_access_token(user.id, user.token_version))


@router.post("/apple", response_model=Token)
@limiter.limit("10/minute")  # SECURITY FIX #2
def apple_auth(request: Request, data: AppleAuthRequest, db: Session = Depends(get_db)):
    """Authenticate with Apple ID token."""
    # MEH-253 — 503 when the provider isn't configured (see google_auth).
    if not settings.apple_client_id:
        raise HTTPException(
            status_code=503,
            detail="התחברות עם Apple לא פעילה כרגע. נסי התחברות עם אימייל וסיסמה.",
        )
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
            # SECURITY: same takeover guard as Google — refuse silent link if the
            # account was registered via a different method (password or another OAuth).
            if not user.apple_id:
                raise HTTPException(
                    status_code=409,
                    detail="אימייל זה כבר רשום עם סיסמה. התחברי עם סיסמה במקום.",
                )
            user.email_verified = True
            db.commit()
        else:
            # Create new user — Apple already verified the email
            user = User(
                email=email,
                name=name,
                apple_id=apple_id,
                role="consumer",
                referral_code=_gen_referral_code(),
                email_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    return Token(access_token=create_access_token(user.id, user.token_version))


@router.post("/forgot-password")
@limiter.limit("3/hour")
def forgot_password(request: Request, data: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Send a password-reset email. Always returns 200 to prevent email enumeration."""
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        reset_link = f"{settings.frontend_url}/reset-password?token={token}"
        background_tasks.add_task(_send_reset_email, user.email, user.name, reset_link)
    return {"detail": "אם האימייל קיים במערכת, ישלח קישור לאיפוס"}


@router.post("/reset-password")
@limiter.limit("5/hour")
def reset_password(request: Request, data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Consume a reset token and update the password. Token is single-use, expires 1 hour."""
    user = db.query(User).filter(User.reset_token == data.token).first()
    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="הקישור לא תקין או שפג תוקפו")
    user.password_hash = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()
    return {"detail": "הסיסמה עודכנה בהצלחה"}


@router.get("/verify-email")
@limiter.limit("10/minute")
def verify_email(request: Request, token: str, db: Session = Depends(get_db)):
    """Consume email verification token. Clears token on success."""
    user = db.query(User).filter(User.email_verify_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="קישור האימות לא תקין")
    if user.email_verify_expires is None or user.email_verify_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="קישור האימות פג תוקף")
    user.email_verified = True
    user.email_verify_token = None
    user.email_verify_expires = None
    db.commit()
    return {"detail": "האימייל אומת בהצלחה"}


@router.post("/resend-verify")
@limiter.limit("3/hour")
def resend_verify(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-send verification email. Rate-limited to 3/hour per IP."""
    if user.email_verified:
        return {"detail": "האימייל כבר מאומת"}
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=24)
    user.email_verify_token = token
    user.email_verify_expires = expires
    db.commit()
    _send_verify_email(user.email, user.name, token)
    return {"detail": "אימייל אימות נשלח"}


@router.delete("/me")
@limiter.limit("3/hour")
def delete_account(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete user account and all associated data.

    Required by Apple App Store Guidelines; also closes the GDPR /
    חוק הגנת הפרטיות gap in MEH-249 — before this fix, a producer who
    deleted her account left the Producer row behind in the public
    directory (the /producers list, /map, and search), with reviews,
    followers, and page-view analytics still referencing her.

    Now, if the user owns a Producer, that Producer is hard-deleted
    before the user row. Producer-linked tables cascade via the FKs
    defined in models.py (all have ondelete=CASCADE):
      - ProducerCategory, DeliveryArea, Product
      - ProducerReview, ProducerFollower, Favorite
      - ProducerPageView, ProducerWhatsAppClick
      - Report (on producer), Event, Experience
    """
    user_email = user.email
    user_name = user.name
    producer_id = user.producer_id

    # 1. Clean up user-linked (not producer-linked) rows that don't cascade
    #    from the user delete. HomeProduct.user_id is CASCADE, but we keep
    #    the explicit deletes for defense-in-depth against pre-cascade data.
    db.query(HomeProductRating).filter(HomeProductRating.user_id == user.id).delete()
    db.query(HomeProductWhatsAppClick).filter(HomeProductWhatsAppClick.user_id == user.id).delete()
    db.query(HomeProduct).filter(HomeProduct.user_id == user.id).delete()
    db.query(Favorite).filter(Favorite.user_id == user.id).delete()
    db.query(Report).filter(Report.reporter_id == user.id).delete()

    # 2. If this user owns a Producer, remove the FK reference from the user
    #    row first (User.producer_id has no ondelete, so deleting the
    #    producer while the user still points at it would violate the
    #    constraint), then delete the producer — children cascade.
    if producer_id is not None:
        user.producer_id = None
        db.flush()
        producer = db.query(Producer).filter(Producer.id == producer_id).first()
        if producer is not None:
            db.delete(producer)

    # 3. Finally, delete the user itself.
    db.delete(user)
    db.commit()

    # Send confirmation email
    _send_deletion_email(user_email, user_name)

    return {"detail": "Account deleted successfully"}


def _send_reset_email(email: str, name: str, reset_link: str):
    body = (
        f"שלום {name},\n\n"
        f"קיבלנו בקשה לאיפוס הסיסמה שלך במהמקור.\n\n"
        f"לחצי על הקישור הבא לאיפוס הסיסמה (תוקף: שעה אחת):\n"
        f"{reset_link}\n\n"
        f"אם לא ביקשת לאפס את הסיסמה, אפשר להתעלם ממייל זה — החשבון שלך בטוח.\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )
    send_email(email, "מהמקור - איפוס סיסמה", body)


def _send_verify_email(email: str, name: str, token: str):
    """Send email-verification link via Resend. Fire-and-forget."""
    verify_url = f"{settings.frontend_url}/verify-email?token={token}"
    body = (
        f"שלום {name},\n\n"
        f"לאימות כתובת האימייל שלך לחצי על הקישור הבא:\n\n"
        f"{verify_url}\n\n"
        f"הקישור תקף ל-24 שעות.\n\n"
        f"אם לא נרשמת למהמקור, אפשר להתעלם מהמייל הזה.\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )
    send_email(email, "מהמקור - אמתי את האימייל שלך", body)


def _send_welcome_email(email: str, name: str, role: str = "consumer"):
    consumer_body = (
        f"שלום {name},\n\n"
        f"ברוכה הבאה למהמקור! 🌿\n\n"
        f"עכשיו את יכולה לגלות בתי עסק מקומיים, כולם במקום אחד —\n"
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
    send_email(email, "ברוכה הבאה למהמקור 🌿", body)


def _send_deletion_email(email: str, name: str):
    body = (
        f"שלום {name},\n\n"
        f"החשבון שלך במהמקור נמחק בהצלחה.\n"
        f"כל הנתונים שלך, כולל מועדפים, מוצרים ודירוגים, נמחקו לצמיתות.\n\n"
        f"אם לא ביקשת למחוק את החשבון, צור איתנו קשר מיידית.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(email, "מהמקור - החשבון שלך נמחק", body)


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


def _notify_producer_registered(name: str, phone: str | None):
    """Send WhatsApp welcome + profile-completion link to the new producer."""
    if not (phone and settings.twilio_account_sid and settings.twilio_whatsapp_from):
        return
    phone = phone.replace("-", "").strip()
    if not phone.startswith("+"):
        phone = "+972" + phone.lstrip("0")
    message = (
        f"ברוכה הבאה למהמקור! 🌿\n"
        f"העסק '{name}' נרשם בהצלחה.\n"
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


def _notify_admin_new_producer(name: str, city: str | None):
    """Send WhatsApp + email notification to admin about new producer."""
    message = (
        f"בית עסק חדש: {name} - {city or 'לא צוין'}\n"
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
    if settings.admin_email:
        send_email(settings.admin_email, f"מהמקור - בית עסק חדש: {name}", message)
