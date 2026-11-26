"""
Module:   producer_identity_check
Purpose:  Tell the sign-up form, before the business is created, that this
          business already has a page on Mehamakor, and (masked) which account
          holds it, so a staff member or a second owner logs in to it instead
          of opening a second business (MEH-3884, Farmerim 26/11).
Touches:  producers + users (read only, services/business_identity.py).
Does NOT: block registration (the form decides; the server still creates
          the business if she goes on, and the admin hears about the pair),
          compare names (producer_name_check.py does, for live pages), or
          take an email from the body.
          DO NOT read an email from the body — MEH-328: an anonymous
          «is this email a business account?» oracle is exactly what the
          register route's anti-enumeration answer exists to prevent. A
          signed-in user's OWN email and phone are used only once VERIFIED:
          anyone can sign up unverified, so an unverified address is as
          good as a body field (security review, 26/11).
          DO NOT match owners' account phones here, signed in or not — they
          are never published, and any visitor can get a token. The admin
          email (queue_identity_alerts) still compares them, server side.
Related:  routers/producer_name_check.py (same shape: anonymous, rate-limited,
          read-only) · components/RegisterIdentityCheck.jsx (the caller).
History:  MEH-3884 (creation; verified-only own email/phone and no account
          phones after the /security-review, 26/11).
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional
from app.database import get_db
from app.models import User
from app.rate_limit import limiter
from app.schemas.identity_check import (
    IdentityCheckIn,
    IdentityCheckMatch,
    IdentityCheckOut,
)
from app.services.business_identity import identity_matches, identity_of, mask_email

router = APIRouter(tags=["producers"])


@router.post("/producer-identity-check", response_model=IdentityCheckOut)
# One call per «המשך» on the details step; 10/minute leaves room for typo
# corrections and keeps phone-by-phone probing slow.
@limiter.limit("10/minute")
@limiter.limit("60/hour")
def producer_identity_check(
    request: Request,
    body: IdentityCheckIn,
    current_user: "User | None" = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> IdentityCheckOut:
    phones = [body.phone]
    emails: list[str | None] = []
    if current_user is not None:
        if current_user.phone_verified:
            phones.append(current_user.phone)  # type: ignore[arg-type]
        if current_user.email_verified:
            emails.append(current_user.email)  # type: ignore[arg-type]
    candidate = identity_of(phones=phones, emails=emails)
    if not candidate.phones and not candidate.emails:
        return IdentityCheckOut(match=None)
    # The businesses' own phones only. An owner's account phone is never
    # published, and must not become a phone → account lookup (MEH-328).
    matches = identity_matches(
        db,
        candidate,
        exclude_id=getattr(current_user, "producer_id", None),
        test_world=bool(getattr(current_user, "is_test", False)),
        account_phones=False,
    )
    if not matches:
        return IdentityCheckOut(match=None)
    # A page with an account first: «log in to o***@…» is the useful answer.
    best = next((m for m in matches if m.owner_email), matches[0])
    return IdentityCheckOut(
        match=IdentityCheckMatch(owner_email=mask_email(best.owner_email))
    )
