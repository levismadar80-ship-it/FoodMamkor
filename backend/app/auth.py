from datetime import datetime, timedelta
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: UUID) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


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
        try:
            db.rollback()
        except Exception:
            pass


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אסימון לא תקין")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="משתמש לא נמצא")
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="חשבון חסום")
    # Feed the admin DAU chart — throttled to at most 1 write per 5 min.
    _maybe_bump_last_active(db, user)
    return user


def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if token is None:
        return None
    try:
        return get_current_user(token=token, db=db)
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
