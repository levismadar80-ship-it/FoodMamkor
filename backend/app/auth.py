import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from joserfc import jwt as jose_jwt
from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from joserfc.jwt import JWTClaimsRegistry
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

logger = structlog.get_logger(__name__)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _jwt_key() -> OctKey:
    return OctKey.import_key(settings.secret_key.encode())


def create_access_token(
    user_id: UUID, token_version: int = 1, fingerprint_hash: str | None = None
) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    # MEH-326: scope="access" disambiguates from refresh tokens. Old tokens
    # issued before this change have no scope claim — get_current_user treats
    # absence as access (backward compat) so existing sessions don't break.
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "tv": token_version,
        "scope": "access",
    }
    # MEH-327: bind token to fingerprint cookie via SHA-256 hash claim.
    # Callers that don't pass fingerprint_hash → claim absent → fail-open
    # in get_current_user (15-min TTL window for pre-MEH-327 tokens).
    if fingerprint_hash is not None:
        payload["userFingerprint"] = fingerprint_hash
    return jose_jwt.encode({"alg": settings.algorithm}, payload, _jwt_key())


def create_refresh_token(user_id: UUID, token_version: int) -> str:
    """MEH-326: issue a 14-day refresh token. Same HS256 + JWT_SECRET_KEY
    as access tokens (one secret to rotate). Carried in an HttpOnly cookie
    set by every login/register endpoint and by /auth/refresh on rotation.
    """
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "tv": token_version,
        "scope": "refresh",
    }
    return jose_jwt.encode({"alg": settings.algorithm}, payload, _jwt_key())


def decode_refresh_token(token: str) -> dict | None:
    """MEH-326: validate a refresh token. Returns claims on success, None
    on any failure (invalid signature, expired, wrong scope). Never raises
    — callers branch on None.
    """
    try:
        token_obj = jose_jwt.decode(token, _jwt_key(), algorithms=[settings.algorithm])
        JWTClaimsRegistry().validate(token_obj.claims)
    except JoseError:
        return None
    if token_obj.claims.get("scope") != "refresh":
        return None
    return token_obj.claims


def generate_fingerprint() -> str:
    """MEH-327: 50 random bytes (100 hex chars) per OWASP JWT Cheat
    Sheet "Token Sidejacking". Sent to the browser as an HttpOnly
    __Secure-Fgp cookie; the SHA-256 hash is embedded in the access
    token as the `userFingerprint` claim and validated on every
    authenticated request, so a stolen access token alone cannot be
    replayed without also stealing the cookie.
    """
    return secrets.token_hex(50)


def hash_fingerprint(fp: str) -> str:
    """MEH-327: SHA-256 hex digest of the raw fingerprint. The hash —
    not the raw value — goes into the JWT, so an attacker who reads
    the token (e.g. via XSS) cannot recover the cookie value needed
    to forge requests.
    """
    return hashlib.sha256(fp.encode()).hexdigest()


# feature/producer-analytics: throttle last_active_at writes to at most
# once per 5 minutes per user, so we don't hammer the DB on chatty clients
# (e.g. polling dashboards or auto-refreshing lists).
_LAST_ACTIVE_THROTTLE = timedelta(minutes=5)


def _maybe_bump_last_active(db: Session, user: User) -> None:
    """Update users.last_active_at if the throttle window has elapsed."""
    now = datetime.utcnow()
    last = user.last_active_at
    if last is not None and (now - last) < _LAST_ACTIVE_THROTTLE:
        return
    try:
        user.last_active_at = now
        db.commit()
    except Exception:
        logger.warning("[auth] last_active_at update failed", user_id=str(user.id), exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass


def _validate_access_scope(claims: dict) -> None:
    # MEH-326: only access-scope tokens are valid here. Refresh tokens go
    # to /auth/refresh; presenting one as a Bearer access token is rejected.
    # Fail-open on missing scope claim — pre-MEH-326 tokens (no scope) are
    # treated as access so existing 24h sessions don't get invalidated by
    # the deploy. This mirrors the MEH-206 fail-open pattern below.
    scope = claims.get("scope")
    if scope is not None and scope != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין")


def _check_password_change_invalidation(user: User, claims: dict) -> None:
    # MEH-305: invalidate sessions issued before the most-recent password
    # change. Fail-open when iat is absent (legacy tokens issued before
    # MEH-305 deployed) or when password_changed_at is NULL (user has
    # never rotated their password). Mirrors the MEH-206 / MEH-327
    # fail-open pattern below.
    iat_claim = claims.get("iat")
    if iat_claim is None or user.password_changed_at is None:
        return
    # int() coercion: iat is issued as int seconds; password_changed_at
    # is a real datetime with microseconds. Without int(), `iat (int)
    # < pwd.timestamp() (float-with-microseconds)` is True for ~1
    # second after a password change → false 401 on the first
    # post-change request from a token issued in the same second.
    if iat_claim < int(user.password_changed_at.timestamp()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session_invalidated_by_password_change",
        )


def _check_token_version(user: User, claims: dict) -> None:
    # MEH-206: token_version check — fail-open so tokens issued before
    # this column was added (no `tv` claim) are still accepted.
    tv = claims.get("tv")
    if tv is not None and tv != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין")


def _check_fingerprint(request: Request, claims: dict) -> None:
    # MEH-327: fingerprint check — fail-open for tokens without the claim
    # (pre-MEH-327, max 15-min window). Mirrors MEH-206/MEH-326 fail-open
    # patterns. Gate runs before _maybe_bump_last_active so invalid tokens
    # never write to the DB.
    fp_claim = claims.get("userFingerprint")
    if fp_claim is None:
        logger.info("[auth] fingerprint absent — fail-open (pre-MEH-327 token)")
        return
    cookie_fp = request.cookies.get("__Secure-Fgp")
    if cookie_fp is None or hash_fingerprint(cookie_fp) != fp_claim:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין")


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        token_obj = jose_jwt.decode(token, _jwt_key(), algorithms=[settings.algorithm])
        JWTClaimsRegistry().validate(token_obj.claims)
        user_id = token_obj.claims.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין")
    except JoseError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין")

    _validate_access_scope(token_obj.claims)

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="משתמש לא נמצא")
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="חשבון חסום")

    _check_password_change_invalidation(user, token_obj.claims)
    _check_token_version(user, token_obj.claims)
    _check_fingerprint(request, token_obj.claims)

    # Feed the admin DAU chart — throttled to at most 1 write per 5 min.
    _maybe_bump_last_active(db, user)
    return user


def get_current_user_optional(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if token is None:
        return None
    try:
        return get_current_user(request=request, token=token, db=db)
    except HTTPException as exc:
        # Blocked users must never be treated as anonymous — re-raise 403.
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise
        return None


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def require_producer(user: User = Depends(get_current_user)) -> User:
    if user.role != "producer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Producer access required")
    return user


def require_verified_email(user: User = Depends(get_current_user)) -> User:
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="יש לאמת את כתובת האימייל תחילה",
        )
    return user
