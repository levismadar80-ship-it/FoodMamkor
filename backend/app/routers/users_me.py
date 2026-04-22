"""User self-service endpoints (MEH-16).

Sits at prefix /users/me and handles profile update + password change.
Account deletion is already served by DELETE /auth/me — not duplicated
here to avoid two code paths on the same destructive action.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.rate_limit import limiter
from app.schemas.schemas import UserOut

router = APIRouter(prefix="/users/me", tags=["users"])


class ProfileUpdate(BaseModel):
    """PATCH body — any subset of fields may be omitted."""
    name: str | None = Field(None, min_length=1, max_length=200)
    email: EmailStr | None = None
    avatar_url: str | None = None
    city: str | None = Field(None, max_length=100)  # MEH-206: preferred city


class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=200)


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
def change_password(
    request: Request,
    data: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password.

    Rejects OAuth-only accounts (no existing password_hash) with a
    400 so the frontend can render a "you signed in with Google/Apple"
    explainer instead of a generic error.
    """
    if not user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="SET_PASSWORD_UNSUPPORTED",
        )
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(
            status_code=403,
            detail="הסיסמה הנוכחית שגויה",
        )
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return None
