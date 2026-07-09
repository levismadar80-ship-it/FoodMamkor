import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    generate_fingerprint,
    get_current_user,
    get_current_user_optional,
    hash_fingerprint,
    hash_password,
    verify_password,
)
from app.config import settings
from app.services.auth_emails import (
    gen_referral_code,
    # Aliases preserve the legacy underscore-prefixed module attribute
    # surface so tests that monkeypatch `app.routers.auth._send_*` keep
    # working. New code should use the public names directly.
    send_deletion_email as _send_deletion_email,
    send_duplicate_attempt_email as _send_duplicate_attempt_email,
    send_reset_email as _send_reset_email,
    send_verify_email as _send_verify_email,
    send_welcome_email as _send_welcome_email,
)
from app.services.auth_notifications import (
    notify_admin_new_producer,
    notify_producer_registered,
)
from app.services.producer_risk import score_producer
from app.services.oauth_verifiers import (
    # Aliases preserve the legacy underscore-prefixed module attribute
    # surface so tests that monkeypatch / import
    # `app.routers.auth._verify_apple_token` / `_upload_google_avatar_or_none`
    # keep working. New code should use the public names directly.
    upload_google_avatar_or_none as _upload_google_avatar_or_none,
    verify_apple_token as _verify_apple_token,
    verify_google_token as _verify_google_token,
)
from app.constants import DECLARATION_VERSION
from app.services.license_validation import ensure_license_for_categories
from app.services.password_policy import validate_password
from app.database import get_db
from app.models import Category, DeliveryArea, Producer, ProducerCategory, Product, User
from app.models.models import (
    Favorite,
    HomeProduct,
    HomeProductRating,
    HomeProductWhatsAppClick,
    Report,
)
from app.rate_limit import email_from_body, limiter
from app.schemas.schemas import (
    AppleAuthRequest,
    AppleAuthResponse,
    CheckPasswordRequest,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    GoogleAuthResponse,
    LoginRequest,
    ProducerOAuthSignupRequest,
    ProducerOAuthSignupResponse,
    ProducerRegister,
    ProducerRegistrationResponse,
    RegisterAck,
    ResetPasswordRequest,
    Token,
    UserOut,
    UserRegister,
)

logger = logging.getLogger(__name__)


# SENTINEL_HASH: precomputed bcrypt hash for /login timing
# equalization (MEH-626). Used in wrong-email and OAuth-only
# branches to match wrong-password branch's bcrypt cost.
# Computed once at import time.
SENTINEL_HASH = hash_password("sentinel-password-do-not-use")


def _set_refresh_cookie(response: Response, user: User) -> None:
    """MEH-326: attach a fresh refresh-token cookie to the outgoing response.

    Single source of truth for cookie attributes used by every endpoint
    that issues an access token (login/register/OAuth/refresh/logout-all).
    SameSite=Lax + HttpOnly + Secure + same-origin Next.js proxy means no
    separate CSRF token is needed as long as /auth/refresh is POST-only.
    Path is scoped to /api/auth so the cookie isn't sent on unrelated
    /api/* requests. No `domain` attribute — host-only is more secure.
    """
    response.set_cookie(
        key="refresh_token",
        value=create_refresh_token(user.id, user.token_version),
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/api/auth",
    )


def _set_fingerprint_cookie(response: Response, fingerprint: str) -> None:
    """MEH-327: attach the raw fingerprint as an HttpOnly cookie.

    The SHA-256 hash of this value is embedded in the access token as the
    `userFingerprint` claim. On every authenticated request get_current_user
    hashes the cookie value and compares it to the claim, so a stolen access
    token cannot be replayed without also stealing this HttpOnly cookie.

    Path=/ (required by the __Secure- prefix, RFC 6265bis) so the browser
    sends it on all /api/* requests, not only /api/auth.
    max_age matches the refresh cookie so the fingerprint outlives any access
    token, avoiding the timing edge-case where a valid 15-min access token
    arrives with an already-expired fingerprint cookie.
    SameSite=Lax matches _set_refresh_cookie — see its docstring for rationale.
    """
    response.set_cookie(
        key="__Secure-Fgp",
        value=fingerprint,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/refresh", response_model=Token)
@limiter.limit("30/minute")
def refresh_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """MEH-326: rotate access + refresh tokens via the HttpOnly cookie.

    No request body. Reads `refresh_token` from cookies. On success:
    issues a new access token (returned in JSON body) AND rotates the
    refresh cookie (new value, sliding 14d TTL). Failures: 401 (cookie
    absent / decode failure / user not found / token_version drift) or
    403 (user blocked).

    Refresh tokens are post-MEH-326 only — no in-the-wild tokens predate
    this code, so we strictly require the `tv` claim (unlike access
    tokens which fail-open on missing `tv` for backward compat).
    """
    cookie = request.cookies.get("refresh_token")
    if not cookie:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="לא מחובר")
    claims = decode_refresh_token(cookie)
    if claims is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין"
        )
    user_id = claims.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין"
        )
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="משתמש לא נמצא"
        )
    if getattr(user, "is_blocked", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="חשבון חסום")
    tv = claims.get("tv")
    if tv is None or tv != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין"
        )
    # MEH-305 launch-safe migration: iat is missing from refresh tokens
    # issued before this deploy. Fail-open for up to 14d
    # (refresh_token_expire_days) until pre-deploy tokens naturally
    # expire. Mirror of the access-token password_changed_at IS NULL
    # skip in get_current_user (backend/app/auth.py).
    iat_claim = claims.get("iat")
    if iat_claim is not None and user.password_changed_at is not None:
        # int() coercion mirrors the access-side fix in auth.py — see
        # docstring there for the float-microseconds race-rejection bug.
        if iat_claim < int(user.password_changed_at.timestamp()):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="session_invalidated_by_password_change",
            )

    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return Token(
        access_token=create_access_token(
            user.id, user.token_version, fingerprint_hash=hash_fingerprint(fp)
        )
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def logout(request: Request, response: Response):
    """MEH-326: clear the HttpOnly refresh-token cookie.

    No auth required — stale-cookie holders (expired access token but
    valid refresh cookie) must still be able to log out cleanly.
    Path must match _set_refresh_cookie exactly or the browser won't
    delete the cookie (Path is part of the cookie identity).
    """
    response.delete_cookie(
        "refresh_token",
        path="/api/auth",
        httponly=True,
        secure=True,
        samesite="lax",
    )
    # MEH-327: path must match _set_fingerprint_cookie exactly.
    response.delete_cookie(
        "__Secure-Fgp",
        path="/",
        httponly=True,
        secure=True,
        samesite="lax",
    )


# MEH-328: OWASP-strict anti-enumeration response. Identical body bytes
# across (new email / existing password user / existing OAuth user); the
# legitimate owner finds out via send_duplicate_attempt_email. No
# access_token — caller must verify via email then POST /auth/login.
_REGISTER_ACK_DETAIL = (
    "אם האימייל פנוי, נשלחה אלייך הודעת אימות. אנא בדקי את תיבת הדואר."
)


@router.post("/register", response_model=RegisterAck)
# SECURITY FIX #2: cap new signups per IP.
# MEH-417: raised from 3/hour — accommodates shared-IP scenarios
# (corporate NAT, CGNAT, CI runners) without meaningfully weakening
# brute-force protection. Backend rate-limit complements frontend
# PasswordPolicy which already enforces 12-char + HIBP (MEH-306).
# MEH-624: dual-key throttling. Per-IP cap above + per-email cap below
# stops a botnet rotating IPs from spamming the OWASP duplicate-attempt
# email at one victim. Mirrors /forgot-password (MEH-191).
# REUSES: backend/app/routers/auth.py:972-973 — same dual-key shape.
@limiter.limit("10/hour")
@limiter.limit("5/15 minutes", key_func=email_from_body)
async def register(
    request: Request,
    data: UserRegister,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # MEH-328: timing-equalised anti-enumeration. Both the "new email" and
    # the "email already registered" branches MUST execute the same
    # expensive ops before diverging — otherwise the existence check leaks
    # via response time (HIBP + bcrypt ≈ 100ms vs DB-only ≈ 1ms).
    #
    # Order:
    #   1. validate_password   (HIBP network call)  ← both branches
    #   2. hash_password       (bcrypt 50-200ms)    ← both branches
    #   3. existence lookup    (cheap DB read)
    #   4. branch-specific side effects (new row + verify email
    #      OR duplicate-attempt email)
    #   5. identical RegisterAck

    # MEH-306: full policy check on fresh signups. No current_hash — reuse
    # check is irrelevant when the user has no existing password. HIBP
    # fail-open is handled inside validate_password (no failure raised on
    # network errors); only confirmed deny-list / breach matches block.
    # 422 here is input validation, not enumeration — same response for any
    # caller that posts a too-weak password regardless of email existence.
    result = await validate_password(data.password)
    if not result.ok:
        raise HTTPException(status_code=422, detail={"failures": result.failures})

    # MEH-306: hash_password (passlib bcrypt) blocks ~50-200ms per call.
    # The handler is async (validate_password awaits HIBP), so the bcrypt
    # call must run off the event loop or it serializes concurrent signups.
    # MEH-328: pwd_hash is computed unconditionally to equalise timing —
    # discarded on the collision branch.
    pwd_hash = await asyncio.to_thread(hash_password, data.password)

    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user is None:
        verify_token = secrets.token_urlsafe(32)
        verify_expires = datetime.utcnow() + timedelta(hours=24)
        user = User(
            email=data.email,
            name=data.name,
            password_hash=pwd_hash,
            # MEH-306: stamp the column on first password set so future JWT iat
            # checks have a baseline to compare against (MEH-305 enforces:
            # tokens with iat < password_changed_at → 401).
            password_changed_at=datetime.now(timezone.utc),
            city=data.city,
            phone=data.phone,
            role="consumer",
            referral_code=gen_referral_code(),
            email_verified=False,
            email_verify_token=verify_token,
            email_verify_expires=verify_expires,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        background_tasks.add_task(
            _send_verify_email, user.email, user.name, verify_token
        )
        background_tasks.add_task(
            _send_welcome_email, user.email, user.name, "consumer"
        )
    else:
        # MEH-328: never reveal which auth method the existing account uses
        # via the HTTP response. The duplicate-attempt email is the only
        # signal to the legitimate owner, and its body copy reflects the
        # auth method so the user knows where to log in.
        if existing_user.password_hash:
            provider = "password"
        elif existing_user.google_id:
            provider = "google"
        elif existing_user.apple_id:
            provider = "apple"
        else:
            # Should not happen — every user row has at least one of
            # password_hash / google_id / apple_id. Log and swallow so the
            # response shape stays identical to the happy path.
            logger.warning(
                "[REGISTER-COLLISION] user_id=%s has no auth method",
                existing_user.id,
            )
            provider = None
        if provider is not None:
            background_tasks.add_task(
                _send_duplicate_attempt_email,
                existing_user.email,
                existing_user.name,
                provider,
            )

    return RegisterAck(detail=_REGISTER_ACK_DETAIL)


# MEH-328 Chunk B: response_model intentionally omitted. The non-upgrade
# path returns RegisterAck (OWASP anti-enumeration); the upgrade path
# returns ProducerRegistrationResponse (token + whatsapp_sent). FastAPI's
# decorator-level response_model is single-shape and would strip fields
# from one of the two — we let Pydantic serialise each return as-is.
@router.post("/register/producer")
# MEH-624: dual-key throttling. Per-IP cap (3/hour) + per-email cap
# stops a botnet rotating IPs from spamming the OWASP duplicate-attempt
# email at one victim.
#
# Upgrade path trade-off (acknowledged, not blocking): authenticated
# producer upgrades send email=None in the payload, so they all share
# the empty-string per-email bucket. A botnet cannot abuse this pool
# because the upgrade path requires a valid JWT — anonymous traffic
# falls into the new-registration branch where ProducerRegister schema
# validation REQUIRES email and the per-email key is meaningful.
# JWT-gate makes the empty bucket uninteresting to attackers.
# REUSES: backend/app/routers/auth.py:972-973 — same dual-key shape.
@limiter.limit("3/hour")  # SECURITY FIX #2
@limiter.limit("5/15 minutes", key_func=email_from_body)
async def register_producer(
    request: Request,
    response: Response,
    data: ProducerRegister,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: "User | None" = Depends(get_current_user_optional),
):
    # MEH-143: two paths — upgrade (logged-in) vs new registration (anonymous).
    # MEH-328 Chunk B: the non-upgrade path is now OWASP anti-enumeration —
    # identical RegisterAck across new-email / password-collision / oauth-
    # collision. Upgrade path is unchanged (authenticated, no enumeration risk).
    upgrade_path = current_user is not None

    # MEH-17: validate primary contact method has its required field filled.
    # These are 422 input-validation guards on body content alone — they
    # cannot leak email existence (an attacker probing the endpoint sees
    # the same 422 regardless of whether the email is registered).
    method = (data.primary_contact_method or "whatsapp").strip().lower()
    # MEH-296 3d: align with the 7-value ProducerRegister schema guard.
    if method not in {
        "whatsapp",
        "phone",
        "instagram",
        "email",
        "website",
        "facebook",
        "external_order",
    }:
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
    # MEH-296 3d: instagram has a ProducerRegister field → presence-check it.
    # facebook/external_order have NO ProducerRegister field (the producer
    # sets those later via the dashboard editor), so they pass without a
    # presence check rather than 422-ing a value the form can't collect.
    if method == "instagram" and not (data.instagram or "").strip():
        raise HTTPException(
            status_code=422,
            detail="חובה להזין אינסטגרם עבור אמצעי הקשר הנבחר",
        )
    if method == "email" and not (data.contact_email or "").strip():
        raise HTTPException(
            status_code=422,
            detail="חובה להזין אימייל ליצירת קשר עבור אמצעי הקשר הנבחר",
        )

    # MEH-759 (ADR-022 gate 2): the binding licensing declaration is
    # mandatory on both paths (new registration + MEH-143 upgrade). 422 is
    # body-shape validation — it runs before the enumeration branch and is
    # identical regardless of email existence, so it leaks nothing (same
    # class as the contact-method guards above). Producer rows below are
    # therefore only ever created with declared_at/declaration_version
    # stamped.
    if not data.declaration_accepted:
        raise HTTPException(
            status_code=422,
            detail="יש לאשר את הצהרת הרישוי כדי להמשיך",
        )

    # MEH-530: 422s with Hebrew copy if any selected category requires a
    # license and the body didn't supply one. Same input-validation
    # classification as the contact-method checks above.
    # MEH-971 chunk 2: license_pending opt-in skips this data-quality 422 so the
    # producer lands in the pending queue with NULL license. SINGLE shared gate
    # (above the upgrade/non-upgrade split) → covers both paths. NOT a security
    # relaxation — licensed-only is enforced downstream: chunk-4 approval guard
    # (admin.py) blocks approving a license-required producer with NULL license,
    # and publication requires status=="approved" (producer_listing.py). A
    # malicious license_pending=true only parks the actor in the unpublishable
    # pending queue.
    if not data.license_pending:
        ensure_license_for_categories(
            db, data.category_ids, data.producer_license_number
        )

    if upgrade_path:
        # ---- UPGRADE PATH (UNCHANGED in MEH-328) -----------------------
        # Authenticated user upgrading to producer. No enumeration vector —
        # the caller already proved control of the account. Still returns
        # a token + whatsapp_sent so the dashboard flow keeps working.
        user = current_user
        # MEH-669: admin accounts must never self-upgrade to producer.
        # Without this guard, line `user.role = "producer"` below silently
        # demotes the admin and locks them out of /admin (vertical privilege
        # loss — OWASP A01 Broken Access Control). Separation-of-duties:
        # admins use a dedicated account, never their daily-work account.
        if user.role == "admin":
            raise HTTPException(
                status_code=403,
                detail="מנהלת מערכת לא יכולה להירשם כבית עסק. אנא צרי חשבון נפרד עם כתובת אימייל אחרת.",
            )
        # Check both: producer_id (current link) and is_producer (durable flag).
        # is_producer stays True even if an admin manually clears producer_id,
        # preventing silent re-registration without an explicit admin reset.
        if user.producer_id or user.is_producer:
            raise HTTPException(status_code=409, detail="כבר יש לך עסק רשום בחשבון זה")

        producer = Producer(
            name=data.producer_name,
            description=data.description,
            short_description=data.short_description,
            city=data.city,
            address=data.address,
            lat=data.lat,
            lng=data.lng,
            phone=data.phone,
            instagram=data.instagram,
            website=data.website,
            primary_contact_method=method,
            contact_email=data.contact_email,
            producer_license_number=data.producer_license_number,
            # MEH-759 (ADR-022 gate 2): stamp the binding declaration. Guard
            # above guarantees declaration_accepted is True here.
            declared_at=datetime.now(timezone.utc),
            declaration_version=DECLARATION_VERSION,
            status="pending_whatsapp",
        )
        db.add(producer)
        db.flush()
        for cid in data.category_ids:
            cat = db.query(Category).filter(Category.id == cid).first()
            if cat:
                db.add(ProducerCategory(producer_id=producer.id, category_id=cid))
        for da in data.delivery_areas:
            db.add(
                DeliveryArea(
                    producer_id=producer.id,
                    city=da.city,
                    min_order=da.min_order,
                    delivery_day=da.delivery_day,
                )
            )
        # Link producer to existing user, upgrade role + flag.
        user.producer_id = producer.id
        user.role = "producer"
        user.is_producer = True
        db.commit()
        db.refresh(user)

        # Capture producer primitives NOW — expire_on_commit=True means ORM
        # attributes are expired after commit, and FastAPI closes the session
        # before background tasks run.
        p_name = producer.name
        p_city = producer.city
        p_phone = producer.phone
        p_id = producer.id
        background_tasks.add_task(notify_admin_new_producer, p_name, p_city)
        background_tasks.add_task(notify_producer_registered, p_name, p_phone)
        # MEH-509 PR3: Anthropic-Haiku-backed risk score. Fail-open;
        # signup is never blocked by Anthropic latency or errors.
        background_tasks.add_task(score_producer, p_id)
        # No verify/welcome email — the user already has a verified consumer
        # account; she's just adding producer capability.

        whatsapp_expected = bool(
            p_phone
            and settings.whatsapp_phone_number_id
            and settings.whatsapp_access_token
        )
        fp = generate_fingerprint()
        _set_refresh_cookie(response, user)
        _set_fingerprint_cookie(response, fp)
        return ProducerRegistrationResponse(
            access_token=create_access_token(
                user.id, user.token_version, fingerprint_hash=hash_fingerprint(fp)
            ),
            whatsapp_sent=whatsapp_expected,
        )

    # ---- NON-UPGRADE PATH (MEH-328 OWASP anti-enumeration) -------------
    # 422 cases below are body-shape validation, not enumeration:
    if not data.email or not data.name or not data.password:
        raise HTTPException(
            status_code=422,
            detail="אימייל, שם וסיסמה הם שדות חובה",
        )

    # MEH-328: timing-equalised. Both branches run validate_password
    # (HIBP) + hash_password (bcrypt) before the existence lookup so
    # response time doesn't fork on collision.
    result = await validate_password(data.password)
    if not result.ok:
        raise HTTPException(status_code=422, detail={"failures": result.failures})
    # MEH-457: bcrypt blocks ~50-200ms; off-loop required because the
    # handler is async (validate_password awaits HIBP). MEH-328: also
    # computed unconditionally — discarded on the collision branches.
    pwd_hash = await asyncio.to_thread(hash_password, data.password)

    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user is None:
        # New email — create producer + user. Producer-side rows (Producer,
        # ProducerCategory, DeliveryArea) and producer-specific notifications
        # ONLY fire here, so the collision branches stay side-effect-symmetric
        # (no orphan producer row, no spurious "new producer signed up" admin
        # notification).
        producer = Producer(
            name=data.producer_name,
            description=data.description,
            short_description=data.short_description,
            city=data.city,
            address=data.address,
            lat=data.lat,
            lng=data.lng,
            phone=data.phone,
            instagram=data.instagram,
            website=data.website,
            primary_contact_method=method,
            contact_email=data.contact_email,
            producer_license_number=data.producer_license_number,
            # MEH-759 (ADR-022 gate 2): stamp the binding declaration. Guard
            # above guarantees declaration_accepted is True here.
            declared_at=datetime.now(timezone.utc),
            declaration_version=DECLARATION_VERSION,
            status="pending_whatsapp",
        )
        db.add(producer)
        db.flush()
        for cid in data.category_ids:
            cat = db.query(Category).filter(Category.id == cid).first()
            if cat:
                db.add(ProducerCategory(producer_id=producer.id, category_id=cid))
        for da in data.delivery_areas:
            db.add(
                DeliveryArea(
                    producer_id=producer.id,
                    city=da.city,
                    min_order=da.min_order,
                    delivery_day=da.delivery_day,
                )
            )

        verify_token = secrets.token_urlsafe(32)
        verify_expires = datetime.utcnow() + timedelta(hours=24)
        user = User(
            email=data.email,
            name=data.name,
            password_hash=pwd_hash,
            # MEH-457 (closes MEH-305 sibling gap): stamp the iat anchor so
            # JWTs issued before a future password change can be invalidated.
            password_changed_at=datetime.now(timezone.utc),
            phone=data.phone,
            role="producer",
            producer_id=producer.id,
            is_producer=True,
            referral_code=gen_referral_code(),
            email_verified=False,
            email_verify_token=verify_token,
            email_verify_expires=verify_expires,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        p_name = producer.name
        p_city = producer.city
        p_phone = producer.phone
        p_id = producer.id
        background_tasks.add_task(notify_admin_new_producer, p_name, p_city)
        background_tasks.add_task(notify_producer_registered, p_name, p_phone)
        # MEH-509 PR3: Anthropic-Haiku-backed risk score. Fail-open;
        # signup is never blocked by Anthropic latency or errors.
        background_tasks.add_task(score_producer, p_id)
        background_tasks.add_task(
            _send_verify_email, user.email, user.name, verify_token
        )
        background_tasks.add_task(
            _send_welcome_email, user.email, user.name, "producer"
        )
    else:
        # MEH-328: collision branch — never reveal which auth method the
        # existing account uses. Email out-of-band so the legitimate owner
        # knows where to log in. No DB writes, no cookies, no token.
        if existing_user.password_hash:
            provider = "password"
        elif existing_user.google_id:
            provider = "google"
        elif existing_user.apple_id:
            provider = "apple"
        else:
            logger.warning(
                "[REGISTER-PRODUCER-COLLISION] user_id=%s has no auth method",
                existing_user.id,
            )
            provider = None
        if provider is not None:
            background_tasks.add_task(
                _send_duplicate_attempt_email,
                existing_user.email,
                existing_user.name,
                provider,
            )

    return RegisterAck(detail=_REGISTER_ACK_DETAIL)


# MEH-328 Chunk C: GET /auth/email-exists deleted. It was a 30/min per-IP
# enumeration oracle that returned {exists: bool} for any email — defeated
# the anti-enum refactor in Chunks A+B. Regression guard:
# tests/test_api.py::test_email_exists_endpoint_removed pins the deletion.
# Frontend onBlur caller in register/producer/page.js is removed in Chunk D.


@router.post(
    "/google",
    response_model=GoogleAuthResponse,
    # MEH-780: document the deliberate non-2xx statuses so the OpenAPI spec
    # matches reality (kills schemathesis UndefinedStatusCode noise). No
    # behavior change — 401 = invalid id_token, 503 = provider not configured.
    responses={
        401: {"description": "Invalid OAuth id_token"},
        503: {"description": "OAuth provider not configured (MEH-253)"},
    },
)
@limiter.limit("10/minute")  # SECURITY FIX #2: OAuth needs a higher ceiling
def google_auth(
    request: Request,
    response: Response,
    data: GoogleAuthRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
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

    # Check if user exists by google_id or email
    is_new = False
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
                    detail="אימייל זה כבר רשום עם סיסמה. התחברו עם סיסמה במקום.",
                )
            user.email_verified = True
            db.commit()
        else:
            # MEH-375 (YF-4): re-host the Google avatar only on the
            # paths that will keep it. Existing-user-with-avatar logins
            # skip the upload entirely, eliminating the per-login
            # orphan storm.
            picture = _upload_google_avatar_or_none(user_info.get("picture"))
            # Create new user — Google already verified the email
            user = User(
                email=email,
                name=name,
                google_id=google_id,
                role="consumer",
                referral_code=gen_referral_code(),
                avatar_url=picture,
                email_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new = True

    # MEH-138 + MEH-375: backfill avatar_url for existing users that
    # don't have one yet — and only those. is_new path already set
    # avatar_url above; skip to avoid a second upload (which would
    # orphan the new-user upload above).
    if not is_new and not user.avatar_url:
        picture = _upload_google_avatar_or_none(user_info.get("picture"))
        if picture:
            user.avatar_url = picture
            db.commit()

    if is_new:
        background_tasks.add_task(
            _send_welcome_email, user.email, user.name, "consumer"
        )
    email_expected = bool(is_new and settings.resend_api_key)
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return GoogleAuthResponse(
        access_token=create_access_token(
            user.id, user.token_version, fingerprint_hash=hash_fingerprint(fp)
        ),
        email_sent=email_expected,
    )


@router.post(
    "/register/producer/oauth",
    response_model=ProducerOAuthSignupResponse,
    # MEH-780: document the deliberate non-2xx statuses (see /auth/google).
    responses={
        401: {"description": "Invalid OAuth id_token"},
        503: {"description": "OAuth provider not configured (MEH-253)"},
    },
)
@limiter.limit("10/minute")
def register_producer_oauth(
    request: Request,
    response: Response,
    data: ProducerOAuthSignupRequest,
    background_tasks: BackgroundTasks,
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
    full_name = (
        data.name or user_info.get("name") or (email.split("@")[0] if email else "חדשה")
    )

    # 1. Look up by provider sub first (stable identifier).
    is_new = False
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
                    detail="אימייל זה כבר רשום עם סיסמה. התחברו עם סיסמה במקום.",
                )
        else:
            # MEH-375 (YF-4): re-host the Google avatar only on the
            # new-user creation path. Apple has no picture and the
            # helper short-circuits to None for non-google.
            kwargs = {
                "email": email,
                "name": full_name,
                "role": "consumer",
                "referral_code": gen_referral_code(),
                sub_field: oauth_sub,
            }
            if provider == "google":
                kwargs["avatar_url"] = _upload_google_avatar_or_none(
                    user_info.get("picture")
                )
            user = User(**kwargs)
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new = True

    # MEH-669: admin accounts must never enter the producer signup flow,
    # even via the OAuth Step 0. Although this endpoint does not itself
    # write role="producer" (Step 2 at POST /auth/register/producer does
    # that — also guarded), reject upfront so the frontend cannot advance
    # to Step 2 and the JWT issued here cannot be used as an upgrade
    # token. Defense-in-depth — see sibling guard at auth.py upgrade_path.
    if user.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="מנהלת מערכת לא יכולה להירשם כבית עסק. אנא צרי חשבון נפרד עם כתובת אימייל אחרת.",
        )

    # 3. If this account is already a producer, bail out — the producer
    # signup flow is for NEW producers. Existing ones should log in and
    # use the producer dashboard.
    if user.producer_id or getattr(user, "is_producer", False):
        raise HTTPException(
            status_code=409,
            detail="יש לך כבר עסק רשום בחשבון זה. התחברו כדי לנהל אותו.",
        )

    # MEH-138 + MEH-375: backfill the Google avatar only when the
    # existing user has no avatar yet. is_new path already set it
    # above (or None if Google had no picture); skip to avoid a
    # duplicate upload that would orphan the new-user asset.
    if provider == "google" and not is_new and not user.avatar_url:
        picture_for_google = _upload_google_avatar_or_none(user_info.get("picture"))
        if picture_for_google:
            user.avatar_url = picture_for_google
            db.commit()

    if is_new:
        background_tasks.add_task(
            _send_welcome_email, user.email, user.name, "consumer"
        )
    email_expected = bool(is_new and settings.resend_api_key)
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return ProducerOAuthSignupResponse(
        access_token=create_access_token(
            user.id, user.token_version, fingerprint_hash=hash_fingerprint(fp)
        ),
        email_sent=email_expected,
    )


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")  # SECURITY FIX #2: brute-force protection
def login(
    request: Request,
    response: Response,
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == data.email).first()
    # MEH-626: three failure branches must take indistinguishable time
    # before the 401. Each runs exactly one bcrypt-cost operation so an
    # attacker cannot enumerate users via timing diff between wrong-email,
    # OAuth-only, and wrong-password branches.
    if user is None:
        # Timing parity: run bcrypt against sentinel so this branch
        # matches wrong-password timing (MEH-626).
        verify_password(data.password, SENTINEL_HASH)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="אימייל או סיסמה שגויים"
        )
    if user.password_hash is None:
        # Timing parity: OAuth-only user — same sentinel bcrypt to
        # match wrong-password timing (MEH-626).
        verify_password(data.password, SENTINEL_HASH)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="אימייל או סיסמה שגויים"
        )
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="אימייל או סיסמה שגויים"
        )
    if getattr(user, "is_blocked", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="המשתמש חסום")
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return Token(
        access_token=create_access_token(
            user.id, user.token_version, fingerprint_hash=hash_fingerprint(fp)
        )
    )


@router.get("/me", response_model=UserOut)
@limiter.limit("120/minute")
def get_me(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invalidate all existing sessions by incrementing token_version.

    Returns a new token for the current session so the caller stays
    authenticated. All other devices receive 401 on their next request.
    """
    user.token_version = (user.token_version or 1) + 1
    db.commit()
    db.refresh(user)
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return Token(
        access_token=create_access_token(
            user.id, user.token_version, fingerprint_hash=hash_fingerprint(fp)
        )
    )


@router.post(
    "/apple",
    response_model=AppleAuthResponse,
    # MEH-780: document the deliberate non-2xx statuses (see /auth/google).
    responses={
        401: {"description": "Invalid OAuth id_token"},
        503: {"description": "OAuth provider not configured (MEH-253)"},
    },
)
@limiter.limit("10/minute")  # SECURITY FIX #2
def apple_auth(
    request: Request,
    response: Response,
    data: AppleAuthRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
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
    is_new = False
    user = db.query(User).filter(User.apple_id == apple_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # SECURITY: same takeover guard as Google — refuse silent link if the
            # account was registered via a different method (password or another OAuth).
            if not user.apple_id:
                raise HTTPException(
                    status_code=409,
                    detail="אימייל זה כבר רשום עם סיסמה. התחברו עם סיסמה במקום.",
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
                referral_code=gen_referral_code(),
                email_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new = True

    if is_new:
        background_tasks.add_task(
            _send_welcome_email, user.email, user.name, "consumer"
        )
    email_expected = bool(is_new and settings.resend_api_key)
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return AppleAuthResponse(
        access_token=create_access_token(
            user.id, user.token_version, fingerprint_hash=hash_fingerprint(fp)
        ),
        email_sent=email_expected,
    )


@router.post("/check-password")
@limiter.limit("30/minute")
async def check_password(request: Request, data: CheckPasswordRequest):
    """MEH-306: stateless policy preview for live PasswordInput validation.

    Drives the frontend checklist (length / breach / common) as the user
    types — no auth, no DB write, no persistence. The 30/min/IP cap is
    deliberately loose because a 12-char-floor + debounced UI typically
    fires 3–6 calls per signup; tightening below that breaks the UX.

    Reuse check is intentionally skipped: this endpoint cannot know the
    caller's identity (no auth dep) and would require an authenticated
    variant. Reuse is enforced server-side at PATCH /users/me/password
    and POST /auth/reset-password regardless of frontend state.
    """
    result = await validate_password(data.candidate)
    return {"ok": result.ok, "failures": result.failures}


@router.post("/forgot-password")
# MEH-306: dual-key throttling. Per-IP cap protects against single-attacker
# enumeration sweeps; per-email cap caps abuse against a single victim even
# if the attacker rotates IPs. Both must allow — slowapi ANDs decorators.
# `key_func` defaults to get_real_client_ip on the limiter instance, so the
# IP-keyed @limiter.limit needs no explicit key_func.
@limiter.limit("10/15 minutes")
@limiter.limit("5/15 minutes", key_func=email_from_body)
def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Send a password-reset email. Always returns 200 to prevent email enumeration."""
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        logger.info(
            "[FORGOT-PW] token_stored user_id=%s expires=%s",
            user.id,
            user.reset_token_expires_at,
        )
        reset_link = f"{settings.frontend_url}/reset-password?token={token}"
        background_tasks.add_task(_send_reset_email, user.email, user.name, reset_link)
    return {"detail": "אם האימייל קיים במערכת, ישלח קישור לאיפוס"}


@router.post("/reset-password")
# MEH-306: per-IP cap (default key_func=get_real_client_ip on the limiter
# instance). Per-email key would require the email column, but the request
# body has only `token` + `new_password` — not the email. The token already
# provides per-user pinning (single-use, 1-hour TTL); the IP cap blocks
# brute-force token guessing.
@limiter.limit("10/15 minutes")
async def reset_password(
    request: Request, data: ResetPasswordRequest, db: Session = Depends(get_db)
):
    """Consume a reset token and update the password. Token is single-use, expires 1 hour."""
    user = db.query(User).filter(User.reset_token == data.token).first()
    if not user:
        logger.warning("[RESET] token_not_found token_prefix=%s", data.token[:8])
        raise HTTPException(status_code=404, detail="הקישור לא תקין")
    if (
        not user.reset_token_expires_at
        or user.reset_token_expires_at < datetime.utcnow()
    ):
        logger.warning(
            "[RESET] token_expired user_id=%s expires=%s now=%s",
            user.id,
            user.reset_token_expires_at,
            datetime.utcnow(),
        )
        raise HTTPException(
            status_code=410, detail="קישור האיפוס פג תוקף — בקשי קישור חדש"
        )
    # MEH-306: full policy + reuse check. current_hash passed so user can't
    # re-set the same password (frequent attacker target on credential-stuffing
    # incidents). HIBP fail-open is internal to validate_password.
    result = await validate_password(data.new_password, current_hash=user.password_hash)
    if not result.ok:
        raise HTTPException(status_code=422, detail={"failures": result.failures})
    # MEH-306: bcrypt blocks; offload (see register handler comment).
    user.password_hash = await asyncio.to_thread(hash_password, data.new_password)
    # MEH-306: stamp the column. MEH-305 invalidates every access + refresh
    # token whose iat predates this timestamp — so all OTHER devices the user
    # was logged into get 401 on their next request. The user re-authenticates
    # via /auth/login (her current device has no token; /reset-password is
    # an unauthenticated flow).
    user.password_changed_at = datetime.now(timezone.utc)
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()
    logger.info("[RESET] password_updated user_id=%s", user.id)
    return {"detail": "הסיסמה עודכנה בהצלחה"}


@router.get("/verify-email")
@limiter.limit("10/minute")
def verify_email(request: Request, token: str, db: Session = Depends(get_db)):
    """Consume email verification token. Clears token on success.

    MEH-320: 404 (not_found) / 410 (expired) split + structured logging,
    same pattern MEH-304 applied to /auth/reset-password. Diagnostics
    only — does not change happy-path behavior. The actual root cause
    of the staging 400 will be identified from the [VERIFY-EMAIL]
    log entries this surfaces.
    """
    user = db.query(User).filter(User.email_verify_token == token).first()
    if not user:
        logger.warning("[VERIFY-EMAIL] token_not_found token_prefix=%s", token[:8])
        raise HTTPException(status_code=404, detail="קישור האימות לא תקין")
    if (
        user.email_verify_expires is None
        or user.email_verify_expires < datetime.utcnow()
    ):
        logger.warning(
            "[VERIFY-EMAIL] token_expired user_id=%s expires=%s now=%s",
            user.id,
            user.email_verify_expires,
            datetime.utcnow(),
        )
        raise HTTPException(status_code=410, detail="קישור האימות פג תוקף")
    user.email_verified = True
    user.email_verify_token = None
    user.email_verify_expires = None
    db.commit()
    logger.info("[VERIFY-EMAIL] verified user_id=%s", user.id)
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
def delete_account(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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

    # MEH-375: capture every Cloudinary URL owned by this user BEFORE
    # any db.delete, since the cascade detaches relationships and the
    # URLs become unreachable post-commit. 5 surfaces:
    #   A) user.avatar_url
    #   B) producer.images           (if user.producer_id)
    #   C) every Product.image_url   (for that producer)
    #   D) every HomeProduct.photo   (user-owned, not producer-owned)
    #   E) every HomeProduct.images  (same rows as D)
    # producer.story_card_url IS captured separately (MEH-513) and destroyed
    # post-commit with bypass_reserved=True — required because
    # mehamakor/producers/* is in RESERVED_PUBLIC_ID_PREFIXES and a plain
    # destroy_image call would be silently rejected by the cleanup guard.
    # The sibling fix on the admin path is admin_delete_producer (MEH-510).
    # Destroy runs AFTER the final db.commit so a constraint failure
    # leaves DB and Cloudinary in sync.
    captured_urls: list[str] = []
    old_story_card_url: str | None = None
    if user.avatar_url:
        captured_urls.append(user.avatar_url)
    if producer_id is not None:
        producer_for_capture = (
            db.query(Producer).filter(Producer.id == producer_id).first()
        )
        if producer_for_capture is not None:
            old_story_card_url = producer_for_capture.story_card_url
            for url in producer_for_capture.images or []:
                if url:
                    captured_urls.append(url)
            for prod in (
                db.query(Product)
                .filter(Product.producer_id == producer_for_capture.id)
                .all()
            ):
                if prod.image_url:
                    captured_urls.append(prod.image_url)
    for hp in db.query(HomeProduct).filter(HomeProduct.user_id == user.id).all():
        if hp.photo:
            captured_urls.append(hp.photo)
        for url in hp.images or []:
            if url:
                captured_urls.append(url)

    # 1. Clean up user-linked (not producer-linked) rows that don't cascade
    #    from the user delete. HomeProduct.user_id is CASCADE, but we keep
    #    the explicit deletes for defense-in-depth against pre-cascade data.
    db.query(HomeProductRating).filter(HomeProductRating.user_id == user.id).delete()
    db.query(HomeProductWhatsAppClick).filter(
        HomeProductWhatsAppClick.user_id == user.id
    ).delete()
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
            # MEH-816: phone_otp_tokens cascade via the DB FK (ondelete=CASCADE)
            # plus passive_deletes=True on the Producer.otp_tokens backref
            # (MEH-773 Chunk B), so no explicit pre-delete is needed. DO NOT
            # re-add one — passive_deletes already pre-empts the NotNullViolation
            # the old MEH-755 bulk-delete guarded.
            db.delete(producer)

    # 3. Finally, delete the user itself.
    db.delete(user)
    db.commit()

    # MEH-375: post-commit Cloudinary cleanup. fail-open per
    # destroy_image contract — failures log via app.upload, the cleanup
    # script catches misses on its next run, and the DB cascade is
    # never rolled back on a Cloudinary outage. Duplicate URLs across
    # surfaces (rare, e.g. avatar reused as producer image) are
    # idempotent — Cloudinary returns "not found" on the second call.
    from app.cloudinary_utils import destroy_image

    for url in captured_urls:
        destroy_image(url, context="auth.delete_account")
    # MEH-513: story_card needs bypass_reserved=True — the producer is gone,
    # the slot is now an orphan (the cleanup script reject list is for live
    # story-cards; this is explicitly not one).
    destroy_image(
        old_story_card_url,
        bypass_reserved=True,
        context="auth.delete_account story_card",
    )

    # Send confirmation email
    _send_deletion_email(user_email, user_name)

    return {"detail": "Account deleted successfully"}
