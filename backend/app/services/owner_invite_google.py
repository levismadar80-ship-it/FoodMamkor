"""
Module:   owner_invite_google
Purpose:  Let a FRESH Google sign-in stand in for the email code when a
          signed-in account accepts an owner invite (MEH-3675, Sapir's choice
          22/11: «כן, רק בכניסה טרייה»).
Touches:  producers (takes the row lock the code check would have taken).
          Google's public keys, through `verify_google_token`.
Does NOT: sign anyone in (that is `/auth/google`), link a Google identity to
          an account, or relax anything for an old session — without a fresh
          token of THIS account's Google identity the code step is unchanged.
Related:  backend/app/routers/producer_owner_invite_existing.py (the caller) ·
          backend/app/routers/producer_owner_invite.py `_verify_email_code`
          (what this replaces, and why it proves readability, not identity) ·
          backend/app/services/oauth_verifiers.py `verify_google_token`.
History:  MEH-3675 (creation).

WHAT THE CODE PROVED, and why a fresh Google token proves the same thing.
The email code shows that whoever is at the screen can read the account's
verified mailbox NOW. It never protected a leaked invite link: a stranger
holding the link gets a code in their own mailbox (`producer_owner_invite.py`
module docstring). A Google ID token minted in the last few minutes, for the
Google identity this account is linked to, shows that whoever is at the screen
just passed Google's own sign-in for that mailbox. An OLD session shows
neither, which is why the window is short and why there is no fallback to
"the account is signed in, so skip it".

The window is measured from the token's `iat`. Google signs a new ID token on
every sign-in click, so `iat` is the moment of that click; `exp` (an hour) is
far too long to mean "fresh" (OpenID Connect's `max_age` / `auth_time` is the
same idea; GitHub's sudo mode is the product precedent).
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import Producer, User
from app.services.oauth_verifiers import verify_google_token

# MEH-3675: how old a Google sign-in may be and still replace the code. Long
# enough to read the page and tick the box after signing in, short enough that
# a token lifted from a log or a shared screen is stale.
GOOGLE_FRESH_SIGNIN_MAX_AGE = timedelta(minutes=5)
# Google's own verifier allows this much skew on `iat`; a token "from the
# future" beyond it is refused there, so this only absorbs ordinary drift.
_CLOCK_SKEW = timedelta(seconds=30)


def _is_fresh(info: dict[str, Any], now: datetime) -> bool:
    iat = info.get("iat")
    if not isinstance(iat, (int, float)):
        return False
    issued = datetime.fromtimestamp(iat, tz=timezone.utc)
    return now - GOOGLE_FRESH_SIGNIN_MAX_AGE <= issued <= now + _CLOCK_SKEW


def fresh_google_signin_matches(id_token: str, user: User, now: datetime) -> bool:
    """True only for a verified, fresh Google ID token of THIS account.

    Every check is required, and a missing claim fails closed:
      * the signature, audience and expiry (`verify_google_token`; None when
        Google sign-in is not configured, so an unconfigured server never
        takes this path);
      * `email_verified` is exactly True;
      * `sub` equals the account's linked `google_id` — not the email, so an
        account that signed up with a password and was never linked keeps the
        code (the same rule `/auth/google` uses, MEH-3104);
      * `iat` within `GOOGLE_FRESH_SIGNIN_MAX_AGE`.
    """
    linked = user.google_id
    if not linked:
        return False
    info = verify_google_token(id_token)
    if not info:
        return False
    if info.get("email_verified") is not True:
        return False
    if str(info.get("sub") or "") != str(linked):
        return False
    return _is_fresh(info, now)


def lock_invite_row(db: Session, producer: Producer) -> None:
    """Take the PRODUCER row lock the code check would have taken, so the
    lock order in `/accept-existing` stays producer, then user."""
    db.query(Producer).filter(Producer.id == producer.id).with_for_update().one()
