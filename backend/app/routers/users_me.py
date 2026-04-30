"""User self-service endpoints (MEH-16).

Sits at prefix /users/me and handles profile update + password change.
Account deletion is already served by DELETE /auth/me — not duplicated
here to avoid two code paths on the same destructive action.
"""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.rate_limit import limiter
from app.schemas.password import PasswordField
from app.schemas.schemas import UserOut
from app.services.password_policy import validate_password

router = APIRouter(prefix="/users/me", tags=["users"])


class ProfileUpdate(BaseModel):
    """PATCH body — any subset of fields may be omitted."""
    name: str | None = Field(None, min_length=1, max_length=200)
    email: EmailStr | None = None
    avatar_url: str | None = None
    city: str | None = Field(None, max_length=100)


class PasswordChange(BaseModel):
    # current_password stays a plain str (not PasswordField) — old passwords
    # may predate the policy and shorter values must still be acceptable as
    # current. The verify_password call is the only authority on its validity.
    current_password: str = Field(..., min_length=1)
    # MEH-306: 12-char floor at schema layer; deny-list / HIBP / reuse run in
    # the change_password handler via validate_password.
    new_password: PasswordField


@router.patch("", response_model=UserOut)
@limiter.limit("10/hour")
def update_profile(
    request: Request,
    data: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's name and/or email.

    - Name is trimmed and must be non-empty.
    - Email uniqueness is re-checked; collisions are rejected with 409.
    """
    if data.name is not None:
        trimmed = data.name.strip()
        if not trimmed:
            raise HTTPException(status_code=422, detail="שם לא יכול להיות ריק")
        user.name = trimmed

    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url

    if data.city is not None:
        user.city = data.city.strip() or None

    if data.email is not None:
        new_email = data.email.lower()
        if new_email != user.email:
            existing = db.query(User).filter(User.email == new_email).first()
            if existing and existing.id != user.id:
                raise HTTPException(
                    status_code=409,
                    detail="האימייל כבר בשימוש",
                )
            user.email = new_email

    db.commit()
    db.refresh(user)
    return user


@router.patch("/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/hour")
async def change_password(
    request: Request,
    data: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password.

    Rejects OAuth-only accounts (no existing password_hash) with a
    400 so the frontend can render a "you signed in with Google/Apple"
    explainer instead of a generic error.

    MEH-306: keeps the 204 contract. The MEH-305 iat-vs-changed_at gate
    invalidates the caller's CURRENT access token along with all other
    devices; the frontend recovers by calling POST /auth/refresh
    (HttpOnly refresh cookie was rotated on a previous request and is
    untouched by password change). Sub-session B owns that wiring.
    """
    if not user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="SET_PASSWORD_UNSUPPORTED",
        )
    # MEH-306: passlib bcrypt verify blocks ~50-200ms; offload to a thread
    # so the async handler doesn't block the event loop.
    if not await asyncio.to_thread(verify_password, data.current_password, user.password_hash):
        raise HTTPException(
            status_code=403,
            detail="הסיסמה הנוכחית שגויה",
        )
    # MEH-306: full policy + reuse check. current_hash blocks "rotate to
    # the same password" — common pattern when users are forced to "change"
    # but don't want to remember a new one. HIBP fail-open is internal.
    # Order matters: verify_password (above) runs first so a wrong-current
    # caller gets 403, not 422. Per workflow rule 6 (guard test invariant).
    result = await validate_password(data.new_password, current_hash=user.password_hash)
    if not result.ok:
        raise HTTPException(status_code=422, detail={"failures": result.failures})
    # MEH-306: bcrypt hash also blocks; offload.
    user.password_hash = await asyncio.to_thread(hash_password, data.new_password)
    # MEH-306: stamp the column → MEH-305 invalidates all sessions whose
    # iat predates this timestamp, including this device's current access
    # token. Frontend follows up with /auth/refresh.
    user.password_changed_at = datetime.now(timezone.utc)
    db.commit()
    return None
