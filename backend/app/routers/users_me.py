"""User self-service endpoints (MEH-16).

Sits at prefix /users/me and handles profile update + password change.
Account deletion is already served by DELETE /auth/me — not duplicated
here to avoid two code paths on the same destructive action.

MEH-460 Pkg 2: Pydantic schemas live in app.schemas.schemas per ADR-006 R1.
"""

import asyncio
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
from sqlalchemy.exc import IntegrityError
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
from app.routers.admin_extra import is_super_admin  # MEH-3104
from app.routers.auth import _set_fingerprint_cookie, _set_refresh_cookie
from app.schemas.schemas import PasswordChange, ProfileUpdate, UserOut
from app.services.auth_emails import send_verify_email
from app.services.password_policy import validate_password
from app.utils.clock import utc_now

router = APIRouter(prefix="/users/me", tags=["users"])


def _change_email(
    db: Session, user: User, new_email: str, current_password: str | None
) -> bool:
    """Move the account to `new_email`. True when the address really changed.

    MEH-3095: `email_verified` vouches for the address, not for the account.
    Keeping it across a change let a verified account move to an address nobody
    proved and keep every verified-only action. A new token also kills any link
    still pending for the old address.
    """
    if new_email == user.email:
        return False
    # An account that signs in with Google or Apple keeps the provider's
    # address (the settings page already says so). The OAuth sign-in falls back
    # to matching by email, so an OAuth account parked on someone else's
    # address would catch that person's first sign-in.
    if user.google_id or user.apple_id:
        raise HTTPException(status_code=400, detail="EMAIL_CHANGE_UNSUPPORTED")
    # MEH-3104: the protected owner account is matched by exact email
    # (admin_extra.is_super_admin); moving it would drop the protection.
    if is_super_admin(user):
        raise HTTPException(status_code=400, detail="EMAIL_CHANGE_UNSUPPORTED")
    # MEH-3104: a session alone is not enough to move the account. Without
    # this, a stolen session could change the address, ask for a password
    # reset there and take the account. Same check and copy as change_password.
    if not current_password or not user.password_hash or not verify_password(
        current_password, user.password_hash
    ):
        raise HTTPException(status_code=403, detail="הסיסמה הנוכחית שגויה")
    existing = db.query(User).filter(User.email == new_email).first()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=409, detail="האימייל כבר בשימוש")
    user.email = new_email
    user.email_verified = False
    user.email_verify_token = secrets.token_urlsafe(32)
    user.email_verify_expires = utc_now() + timedelta(hours=24)
    # MEH-3104: a reset link mailed to the old address must not outlive it.
    user.reset_token = None
    user.reset_token_expires_at = None
    return True


@router.patch("", response_model=UserOut)
@limiter.limit("10/hour")
def update_profile(
    request: Request,
    data: ProfileUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's name and/or email.

    - Name is trimmed and must be non-empty.
    - Email uniqueness is re-checked; collisions are rejected with 409.
    - MEH-3095: a changed email is an unproved one. The account goes back to
      unverified and a fresh link is mailed to the NEW address.
    """
    # MEH-375: snapshot avatar BEFORE mutation so we can destroy the
    # prior Cloudinary asset AFTER db.commit succeeds. The destroy site
    # uses a value-changed guard (old != new), which covers both the
    # current swap path and any future null-clear handler refactor
    # without depending on the handler's "skip when None" idiom.
    old_avatar = user.avatar_url

    # MEH-1626 chunk 2: name/phone are domain-typed on ProfileUpdate now, and
    # their validators normalize empty input to None (the MEH-1537 convention).
    # That breaks the `is not None` idiom used below for the untyped fields:
    # it cannot tell "field omitted — leave alone" from "field sent as empty —
    # clear it", so a PATCH clearing a phone became a silent no-op. `model_
    # fields_set` carries exactly that distinction (it holds the keys the
    # client actually sent), so the caller's intent survives the normalization.
    #
    # name needs no empty-check here any more: _sanitized_person_name raises on
    # a value that sanitizes away, so `name: "   "` is a 422 from the schema —
    # louder than the old handler-side check, and it can no longer be swallowed.
    sent = data.model_fields_set
    email_changed = False

    if "name" in sent and data.name is not None:
        user.name = data.name

    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url

    if data.city is not None:
        user.city = data.city.strip() or None

    if "phone" in sent:
        user.phone = data.phone

    if data.email is not None:
        email_changed = _change_email(
            db, user, data.email.lower(), data.current_password
        )

    try:
        db.commit()
    except IntegrityError:
        # Two changes to one address at once: the unique index decides, and
        # the loser gets the same 409 as the check above, not a 500.
        db.rollback()
        if not email_changed:
            raise
        raise HTTPException(status_code=409, detail="האימייל כבר בשימוש")
    db.refresh(user)

    if email_changed and user.email_verify_token:
        # After the commit, to the new address only, off the request path.
        background_tasks.add_task(
            send_verify_email,
            user.email,
            user.name,
            user.email_verify_token,
            test_cause=bool(user.is_test),
        )

    # MEH-375: post-commit destroy of the prior avatar when its value
    # changed, regardless of how the change happened (PATCH swap or
    # future null-clear handler refactor). External-cleanup rule —
    # destroy only after commit so a constraint failure leaves DB and
    # Cloudinary in sync.
    if old_avatar and old_avatar != user.avatar_url:
        from app.cloudinary_utils import destroy_image

        destroy_image(old_avatar, context="users_me.update_profile avatar")

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
    # MEH-306: bcrypt verify blocks ~50-200ms; offload to a thread
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
