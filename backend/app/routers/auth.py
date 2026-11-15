from typing import Any
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
    hash_fingerprint,
    hash_password,
    verify_password,
)
from app.config import settings
from app.services.auth_emails import (
    # Aliases preserve the legacy underscore-prefixed module attribute
    # surface so tests that monkeypatch `app.routers.auth._send_*` keep
    # working. New code should use the public names directly.
    send_deletion_email as _send_deletion_email,
    send_duplicate_attempt_email as _send_duplicate_attempt_email,
    send_reset_email as _send_reset_email,
    send_verify_email as _send_verify_email,
    send_welcome_email as _send_welcome_email,
)
from app.services.account_guards import (  # MEH-3248
    AccountDeleteRequest,
    assert_deletable,
    is_super_admin,
    verify_deletion_credentials,
)
from app.services.user_deletion import delete_user_and_data  # MEH-2585
from app.services import resend_verify_cap  # MEH-2906
from app.services.verify_session import (  # MEH-3087
    set_signup_marker,
    verify_email_session,
)
from app.services.oauth_verifiers import (
    # Aliases preserve the legacy underscore-prefixed module attribute
    # surface so tests that monkeypatch / import
    # `app.routers.auth._verify_apple_token` / `_upload_google_avatar_or_none`
    # keep working. New code should use the public names directly.
    upload_google_avatar_or_none as _upload_google_avatar_or_none,
    verify_apple_token as _verify_apple_token,
    verify_google_token as _verify_google_token,
)
from app.constants import TERMS_VERSION
from app.services.password_policy import validate_password
from app.database import get_db
from app.models import Producer, User
from app.rate_limit import email_from_body, limiter
from app.schemas.schemas import (
    AppleAuthRequest,
    AppleAuthResponse,
    CheckPasswordRequest,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    GoogleAuthResponse,
    LoginRequest,
    RegisterAck,
    ResetPasswordRequest,
    Token,
    UserOut,
    UserRegister,
)
from app.utils.clock import utc_now

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
        value=create_refresh_token(user.id, user.token_version),  # type: ignore[arg-type]
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
) -> Token:
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
            user.id,  # type: ignore[arg-type]
            user.token_version,  # type: ignore[arg-type]
            fingerprint_hash=hash_fingerprint(fp),
        )
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def logout(request: Request, response: Response) -> None:
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
    "אם האימייל פנוי, שלחנו אליו הודעת אימות. כדאי לבדוק את תיבת הדואר."
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
    response: Response,
    data: UserRegister,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> RegisterAck:
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

    # MEH-306: hash_password (bcrypt) blocks ~50-200ms per call.
    # The handler is async (validate_password awaits HIBP), so the bcrypt
    # call must run off the event loop or it serializes concurrent signups.
    # MEH-328: pwd_hash is computed unconditionally to equalise timing —
    # discarded on the collision branch.
    pwd_hash = await asyncio.to_thread(hash_password, data.password)

    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user is None:
        verify_token = secrets.token_urlsafe(32)
        verify_expires = utc_now() + timedelta(hours=24)
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
            # MEH-1995: record the terms acceptance instead of discarding it.
            # Stamped only when the flag is genuinely True — an omitted or
            # False flag leaves both columns NULL, which reads as "no record",
            # not as "refused". This column is timezone=True: aware
            # now(timezone.utc), never the naive utc_now() helper.
            terms_accepted_at=(
                datetime.now(timezone.utc) if data.terms_accepted else None
            ),
            terms_version=TERMS_VERSION if data.terms_accepted else None,
            email_verified=False,
            email_verify_token=verify_token,
            email_verify_expires=verify_expires,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # MEH-2952: a test account's own auth mail is dropped and logged.
        background_tasks.add_task(
            _send_verify_email,
            user.email,  # type: ignore[arg-type]
            user.name,  # type: ignore[arg-type]
            verify_token,
            test_cause=bool(user.is_test),
        )
        background_tasks.add_task(
            _send_welcome_email,
            user.email,  # type: ignore[arg-type]
            user.name,  # type: ignore[arg-type]
            "consumer",
            test_cause=bool(user.is_test),
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
                existing_user.email,  # type: ignore[arg-type]
                existing_user.name,  # type: ignore[arg-type]
                provider,
                test_cause=bool(existing_user.is_test),  # MEH-2952
            )

    # MEH-3087: same cookie on both branches (see set_signup_marker).
    set_signup_marker(response, None if existing_user else verify_token)
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
) -> GoogleAuthResponse:
    """Authenticate with Google ID token."""
    # MEH-253 — distinguish "Google OAuth isn't configured on this server"
    # (503) from "the token you sent is invalid" (401). Before this check,
    # both cases returned 401 "אסימון Google לא תקין" — misleading to the
    # user and to anyone debugging the deploy.
    if not settings.google_client_id:
        raise HTTPException(
            status_code=503,
            detail="התחברות עם Google לא פעילה כרגע. אפשר להתחבר עם אימייל וסיסמה.",
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
            # MEH-3104: compare the provider id itself. `if not user.google_id`
            # let an account linked to a DIFFERENT Google identity through,
            # marked verified and signed in.
            if user.google_id != google_id:
                raise HTTPException(
                    status_code=409,
                    detail="אימייל זה כבר רשום עם סיסמה. התחברו עם סיסמה במקום.",
                )
            user.email_verified = True  # type: ignore[assignment]
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
                avatar_url=picture,
                email_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new = True

    _record_oauth_terms(db, user, data.terms_accepted)

    # MEH-138 + MEH-375: backfill avatar_url for existing users that
    # don't have one yet — and only those. is_new path already set
    # avatar_url above; skip to avoid a second upload (which would
    # orphan the new-user upload above).
    if not is_new and not user.avatar_url:
        picture = _upload_google_avatar_or_none(user_info.get("picture"))
        if picture:
            user.avatar_url = picture  # type: ignore[assignment]
            db.commit()

    if is_new:
        background_tasks.add_task(
            _send_welcome_email,
            user.email,  # type: ignore[arg-type]
            user.name,  # type: ignore[arg-type]
            "consumer",
            test_cause=bool(user.is_test),  # MEH-2952
        )
    email_expected = bool(is_new and settings.resend_api_key)
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return GoogleAuthResponse(
        access_token=create_access_token(
            user.id,  # type: ignore[arg-type]
            user.token_version,  # type: ignore[arg-type]
            fingerprint_hash=hash_fingerprint(fp),
        ),
        email_sent=email_expected,
    )


def _record_oauth_terms(db: Session, user: User, accepted: bool) -> None:
    """MEH-2080 chunk 2: stamp the terms consent a consumer gave on /register
    before choosing Google or Apple — the same columns the email path writes
    (MEH-1995). Guarded on the flag and never nulled: /login sends no flag, and
    an absent/False one must leave an earlier consent intact. A True flag
    overwrites, as register_producer does, so terms_version names the wording
    most recently agreed to."""
    if not accepted:
        return
    user.terms_accepted_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    user.terms_version = TERMS_VERSION  # type: ignore[assignment]
    db.commit()


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")  # SECURITY FIX #2: brute-force protection
def login(
    request: Request,
    response: Response,
    data: LoginRequest,
    db: Session = Depends(get_db),
) -> Token:
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
    if not verify_password(data.password, user.password_hash):  # type: ignore[arg-type]
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
            user.id,  # type: ignore[arg-type]
            user.token_version,  # type: ignore[arg-type]
            fingerprint_hash=hash_fingerprint(fp),
        )
    )


@router.get("/me", response_model=UserOut)
@limiter.limit("120/minute")
def get_me(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """Return current user, enriched with producer status/rejection_reason."""
    out = UserOut.model_validate(user)
    # MEH-3248: /settings explains instead of offering a delete button.
    out.is_super_admin = is_super_admin(user)
    if user.producer_id:
        producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
        if producer:
            out.producer_status = producer.status  # type: ignore[assignment]
            out.producer_kind = producer.kind  # type: ignore[assignment]  # MEH-2460
            out.producer_rejection_reason = producer.rejection_reason  # type: ignore[assignment]
            # MEH-2210: the code + resubmission count ride with the reason.
            out.producer_rejection_reason_code = producer.rejection_reason_code  # type: ignore[assignment]
            out.producer_resubmission_count = producer.resubmission_count  # type: ignore[assignment]
    return out


@router.post("/logout-all-devices", response_model=Token)
@limiter.limit("5/hour")
def logout_all_devices(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Token:
    """Invalidate all existing sessions by incrementing token_version.

    Returns a new token for the current session so the caller stays
    authenticated. All other devices receive 401 on their next request.
    """
    user.token_version = (user.token_version or 1) + 1  # type: ignore[assignment]
    db.commit()
    db.refresh(user)
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return Token(
        access_token=create_access_token(
            user.id,  # type: ignore[arg-type]
            user.token_version,  # type: ignore[arg-type]
            fingerprint_hash=hash_fingerprint(fp),
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
) -> AppleAuthResponse:
    """Authenticate with Apple ID token."""
    # MEH-253 — 503 when the provider isn't configured (see google_auth).
    if not settings.apple_client_id:
        raise HTTPException(
            status_code=503,
            detail="התחברות עם Apple לא פעילה כרגע. אפשר להתחבר עם אימייל וסיסמה.",
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
            # MEH-3104: same as Google — the provider id must be THIS one.
            if user.apple_id != apple_id:
                raise HTTPException(
                    status_code=409,
                    detail="אימייל זה כבר רשום עם סיסמה. התחברו עם סיסמה במקום.",
                )
            user.email_verified = True  # type: ignore[assignment]
            db.commit()
        else:
            # Create new user — Apple already verified the email
            user = User(
                email=email,
                name=name,
                apple_id=apple_id,
                role="consumer",
                email_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new = True

    _record_oauth_terms(db, user, data.terms_accepted)

    if is_new:
        background_tasks.add_task(
            _send_welcome_email,
            user.email,  # type: ignore[arg-type]
            user.name,  # type: ignore[arg-type]
            "consumer",
            test_cause=bool(user.is_test),  # MEH-2952
        )
    email_expected = bool(is_new and settings.resend_api_key)
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return AppleAuthResponse(
        access_token=create_access_token(
            user.id,  # type: ignore[arg-type]
            user.token_version,  # type: ignore[arg-type]
            fingerprint_hash=hash_fingerprint(fp),
        ),
        email_sent=email_expected,
    )


@router.post("/check-password", response_model=None)
@limiter.limit("30/minute")
async def check_password(
    request: Request, data: CheckPasswordRequest
) -> dict[str, Any]:
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


@router.post("/forgot-password", response_model=None)
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
) -> dict[str, Any]:
    """Send a password-reset email. Always returns 200 to prevent email enumeration."""
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token  # type: ignore[assignment]
        user.reset_token_expires_at = utc_now() + timedelta(hours=1)  # type: ignore[assignment]
        db.commit()
        logger.info(
            "[FORGOT-PW] token_stored user_id=%s expires=%s",
            user.id,
            user.reset_token_expires_at,
        )
        reset_link = f"{settings.frontend_url}/reset-password?token={token}"
        background_tasks.add_task(
            _send_reset_email,
            user.email,  # type: ignore[arg-type]
            user.name,  # type: ignore[arg-type]
            reset_link,
            test_cause=bool(user.is_test),  # MEH-2952
        )
    return {"detail": "אם האימייל קיים במערכת, ישלח קישור לאיפוס"}


@router.post("/reset-password", response_model=None)
# MEH-306: per-IP cap (default key_func=get_real_client_ip on the limiter
# instance). Per-email key would require the email column, but the request
# body has only `token` + `new_password` — not the email. The token already
# provides per-user pinning (single-use, 1-hour TTL); the IP cap blocks
# brute-force token guessing.
@limiter.limit("10/15 minutes")
async def reset_password(
    request: Request, data: ResetPasswordRequest, db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Consume a reset token and update the password. Token is single-use, expires 1 hour."""
    user = db.query(User).filter(User.reset_token == data.token).first()
    if not user:
        logger.warning("[RESET] token_not_found token_prefix=%s", data.token[:8])
        raise HTTPException(status_code=404, detail="הקישור לא תקין")
    now = utc_now()
    if not user.reset_token_expires_at or user.reset_token_expires_at < now:
        logger.warning(
            "[RESET] token_expired user_id=%s expires=%s now=%s",
            user.id,
            user.reset_token_expires_at,
            now,
        )
        raise HTTPException(
            status_code=410, detail="קישור האיפוס פג תוקף — בקשי קישור חדש"
        )
    # MEH-306: full policy + reuse check. current_hash passed so user can't
    # re-set the same password (frequent attacker target on credential-stuffing
    # incidents). HIBP fail-open is internal to validate_password.
    result = await validate_password(data.new_password, current_hash=user.password_hash)  # type: ignore[arg-type]
    if not result.ok:
        raise HTTPException(status_code=422, detail={"failures": result.failures})
    # MEH-306: bcrypt blocks; offload (see register handler comment).
    user.password_hash = await asyncio.to_thread(hash_password, data.new_password)  # type: ignore[arg-type]
    # MEH-306: stamp the column. MEH-305 invalidates every access + refresh
    # token whose iat predates this timestamp — so all OTHER devices the user
    # was logged into get 401 on their next request. The user re-authenticates
    # via /auth/login (her current device has no token; /reset-password is
    # an unauthenticated flow).
    user.password_changed_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    user.reset_token = None  # type: ignore[assignment]
    user.reset_token_expires_at = None  # type: ignore[assignment]
    db.commit()
    logger.info("[RESET] password_updated user_id=%s", user.id)
    return {"detail": "הסיסמה עודכנה בהצלחה"}


@router.get("/verify-email", response_model=None)
@limiter.limit("10/minute")
def verify_email(
    request: Request, response: Response, token: str, db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Consume the one-time token (MEH-320: 404 unknown / 410 expired).
    MEH-3087: after the token is consumed, verify_email_session may sign in."""
    # Row lock: two requests with one link must not both pass (MEH-3087).
    user = (
        db.query(User)
        .filter(User.email_verify_token == token)
        .with_for_update()
        .first()
    )
    if not user:
        logger.warning("[VERIFY-EMAIL] token_not_found token_prefix=%s", token[:8])
        raise HTTPException(status_code=404, detail="קישור האימות לא תקין")
    now = utc_now()
    if user.email_verify_expires is None or user.email_verify_expires < now:
        logger.warning(
            "[VERIFY-EMAIL] token_expired user_id=%s expires=%s now=%s",
            user.id,
            user.email_verify_expires,
            now,
        )
        raise HTTPException(status_code=410, detail="קישור האימות פג תוקף")
    user.email_verified = True  # type: ignore[assignment]
    user.email_verify_token = None  # type: ignore[assignment]
    user.email_verify_expires = None  # type: ignore[assignment]
    db.commit()
    logger.info("[VERIFY-EMAIL] verified user_id=%s", user.id)
    return verify_email_session(
        request, response, user, token, (_set_refresh_cookie, _set_fingerprint_cookie)
    )


@router.post("/resend-verify", response_model=None)
@limiter.limit("3/hour")
def resend_verify(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Re-send verification email. 3/hour per IP, plus 3/hour and 10/day
    per account (MEH-2906, services/resend_verify_cap.py)."""
    if user.email_verified:
        return {"detail": "האימייל כבר מאומת"}
    resend_verify_cap.enforce_per_account_cap(str(user.id))  # MEH-2906
    token = secrets.token_urlsafe(32)
    expires = utc_now() + timedelta(hours=24)
    user.email_verify_token = token  # type: ignore[assignment]
    user.email_verify_expires = expires  # type: ignore[assignment]
    db.commit()
    _send_verify_email(
        user.email,  # type: ignore[arg-type]
        user.name,  # type: ignore[arg-type]
        token,
        test_cause=bool(user.is_test),
    )  # MEH-2952
    return {"detail": "אימייל אימות נשלח"}


# MEH-3248: POST with a body replaces the bodyless DELETE /auth/me, which let
# any live session delete the account (admins included) with no re-check.
# DO NOT add the DELETE back as an alias — it would reopen that door.
@router.post("/me/delete", response_model=None)
@limiter.limit("5/hour")
def delete_account(
    request: Request,
    body: AccountDeleteRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Delete user account and all associated data.

    MEH-3248: refused for admin accounts (account_guards.assert_deletable,
    checked first), then the caller proves she owns the account: password, or
    a fresh Google/Apple id_token for an account without one
    (account_guards.verify_deletion_credentials).

    Required by Apple App Store Guidelines; also closes the GDPR /
    חוק הגנת הפרטיות gap in MEH-249 — before this fix, a producer who
    deleted her account left the Producer row behind in the public
    directory (the /producers list, /map, and search), with reviews,
    followers, and page-view analytics still referencing her.

    Now, if the user owns a Producer, that Producer is hard-deleted
    before the user row. Producer-linked tables cascade via the FKs
    defined in models.py (all have ondelete=CASCADE):
      - ProducerCategory, DeliveryArea, Product
      - ProducerReview, Favorite
      - ProducerPageView, ProducerWhatsAppClick
      - Report (on producer), Event, Experience

    MEH-1150: the user's ProducerReview rows on THIRD-PARTY businesses also
    cascade on the user delete. Those businesses' denormalized avg_rating /
    reviews_count (maintained only in reviews.py) are recomputed after the
    deletion commits so they don't keep counting reviews that no longer exist.
    """
    assert_deletable(user, door="self")
    verify_deletion_credentials(user, body)
    user_email = user.email
    user_name = user.name
    # MEH-2952: captured BEFORE the row is deleted — a test account's
    # confirmation is dropped and logged like every other send it causes.
    user_is_test = bool(user.is_test)
    delete_user_and_data(db, user, background_tasks, context="auth.delete_account")

    # Send confirmation email
    _send_deletion_email(user_email, user_name, test_cause=user_is_test)  # type: ignore[arg-type]

    return {"detail": "Account deleted successfully"}
