"""User self-service endpoints (MEH-16).

Sits at prefix /users/me and handles profile update + password change.
Account deletion is already served by DELETE /auth/me — not duplicated
here to avoid two code paths on the same destructive action.

MEH-460 Pkg 2: Pydantic schemas live in app.schemas.schemas per ADR-006 R1.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth import (
    generate_fingerprint,
    get_current_user,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.rate_limit import limiter

# MEH-306: cookie-issuance helpers live in routers/auth.py because login /
# register / OAuth all share them. change_password needs the same helpers
# to refresh cookies on the 204 (so /auth/refresh works after the password
# change). Importing the underscore-prefixed helpers crosses a module
# boundary, but the alternative is duplicating refresh + fingerprint
# cookie attributes — the single-source-of-truth wins. Future refactor:
# move both helpers to app/auth_cookies.py.
from app.routers.auth import _set_fingerprint_cookie, _set_refresh_cookie
from app.schemas.schemas import PasswordChange, ProfileUpdate, UserOut
from app.services.password_policy import validate_password

router = APIRouter(prefix="/users/me", tags=["users"])


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
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password.

    Rejects OAuth-only accounts (no existing password_hash) with a
    400 so the frontend can render a "you signed in with Google/Apple"
    explainer instead of a generic error.

    MEH-306: 204 body contract preserved. Set-Cookie headers re-issue
    the refresh + fingerprint cookies so the same device can recover
    via POST /auth/refresh — without these, the rotated
    password_changed_at would invalidate the caller's existing refresh
    cookie (cookie.iat < password_changed_at → /auth/refresh 401),
    and the user would be forced to re-login. Other devices are still
    kicked because their refresh cookies are unchanged and pre-date
    password_changed_at (MEH-305 iat gate).
    """
    if not user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="SET_PASSWORD_UNSUPPORTED",
        )
    # MEH-306: passlib bcrypt verify blocks ~50-200ms; offload to a thread
    # so the async handler doesn't block the event loop.
    if not await asyncio.to_thread(
        verify_password, data.current_password, user.password_hash
    ):
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
    # token. Set-Cookie below re-arms only the caller's device.
    user.password_changed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    # MEH-306: Set-Cookie on the 204 response. Body stays empty (frontend
    # auth-context.js:145 contract preserved); fresh cookies arrive in the
    # response headers so /auth/refresh succeeds on this device. Other
    # devices keep their stale refresh cookies and get 401 on next refresh.
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return None
