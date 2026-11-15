"""MEH-3302 (D14 part ב): verify a USER's phone before WhatsApp alerts go to it.

Purpose:  the send / confirm logic behind POST /users/me/verify-phone and
          /verify-phone/confirm, plus the two state changes the decision
          names: a phone change clears verification and expires pending
          codes; «הסר» clears WhatsApp consent.
Hardening (decision (e), 14/11):
  * a code is bound to the CANONICAL phone it was sent to — a later phone
    change cannot be verified with it;
  * 5 wrong guesses kill a token;
  * 3 sends per user per day and 3 per phone per day (across accounts, so
    nobody can spam a number by typing it into several accounts);
  * no code to a number whose latest WhatsApp message to us was «הסר».
«הסר» itself is handled in whatsapp_webhook._maybe_process_optout.
Does NOT: send alerts (routers/alerts.py fire_alerts reads `can_get_whatsapp`).
"""

from __future__ import annotations

import logging
import secrets
import string
from dataclasses import dataclass
from typing import cast
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import InboundMessage, User, UserPhoneOtpToken
from app.utils.clock import utc_now
from app.utils.phone import canonical_il_msisdn

log = logging.getLogger(__name__)

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
SENDS_PER_USER_PER_DAY = 3
SENDS_PER_PHONE_PER_DAY = 3
# Same words the webhook honours (whatsapp_webhook._OPTOUT_KEYWORDS).
OPTOUT_KEYWORDS = frozenset({"הסר", "הסרה", "עצור", "stop", "unsubscribe"})


@dataclass(frozen=True)
class SendDecision:
    """What `prepare_send` decided. `code` is set only when a code must go out."""

    outcome: str  # "send" | "already_verified" | "no_phone" | "capped" | "opted_out"
    code: str | None = None
    phone: str | None = None


def is_verified(user: User) -> bool:
    """True when the user's CURRENT phone carries a verification stamp."""
    return bool(user.phone and user.phone_verified_at is not None)


def can_get_whatsapp(user: User) -> bool:
    """The fire_alerts gate: a verified phone AND standing consent."""
    return is_verified(user) and user.whatsapp_consent_at is not None


def _opted_out(db: Session, canonical: str) -> bool:
    latest = (
        db.query(InboundMessage)
        .filter(InboundMessage.from_phone == canonical)
        .order_by(InboundMessage.received_at.desc())
        .first()
    )
    if latest is None:
        return False
    return str(latest.body or "").strip().lower() in OPTOUT_KEYWORDS


def prepare_send(
    db: Session, user: User, *, fixed_code: str | None = None
) -> SendDecision:
    """Decide whether to send a code and, if so, store the token.

    The caller sends the WhatsApp message (and commits nothing else). Tokens
    count toward the daily caps the moment they are stored, sent or not, so a
    failing provider cannot be used to retry past the cap.
    """
    canonical = canonical_il_msisdn(cast(str, user.phone)) if user.phone else None
    if canonical is None:
        return SendDecision("no_phone")
    if is_verified(user):
        return SendDecision("already_verified")
    if _opted_out(db, canonical):
        return SendDecision("opted_out")

    since = utc_now() - timedelta(days=1)
    by_user = (
        db.query(UserPhoneOtpToken)
        .filter(
            UserPhoneOtpToken.user_id == user.id,
            UserPhoneOtpToken.created_at > since,
        )
        .count()
    )
    by_phone = (
        db.query(UserPhoneOtpToken)
        .filter(
            UserPhoneOtpToken.phone == canonical,
            UserPhoneOtpToken.created_at > since,
        )
        .count()
    )
    if by_user >= SENDS_PER_USER_PER_DAY or by_phone >= SENDS_PER_PHONE_PER_DAY:
        return SendDecision("capped")

    code = fixed_code or "".join(secrets.choice(string.digits) for _ in range(6))
    # One live code per user: earlier unused ones die.
    db.query(UserPhoneOtpToken).filter(
        UserPhoneOtpToken.user_id == user.id,
        UserPhoneOtpToken.used.is_(False),
    ).update({"used": True})
    db.add(
        UserPhoneOtpToken(
            user_id=user.id,
            phone=canonical,
            code=code,
            expires_at=utc_now() + CODE_TTL,
        )
    )
    db.commit()
    return SendDecision("send", code=code, phone=canonical)


def confirm(db: Session, user: User, code: str) -> bool:
    """Check a code. True = verified now (or already). Commits either way.

    The live token is the newest unused, unexpired one bound to the current
    canonical phone. A wrong guess increments `attempts`; the 5th kills it.
    The claim is a conditional UPDATE so two parallel confirms cannot both win
    (same reasoning as producer_me_review.confirm_phone_otp, MEH-1820).
    """
    if is_verified(user):
        return True
    canonical = canonical_il_msisdn(cast(str, user.phone)) if user.phone else None
    if canonical is None:
        return False
    now = utc_now()
    token = (
        db.query(UserPhoneOtpToken)
        .filter(
            UserPhoneOtpToken.user_id == user.id,
            UserPhoneOtpToken.phone == canonical,
            UserPhoneOtpToken.used.is_(False),
            UserPhoneOtpToken.expires_at > now,
        )
        .order_by(UserPhoneOtpToken.created_at.desc())
        .first()
    )
    if token is None:
        return False
    if not secrets.compare_digest(str(token.code), code):
        token.attempts = int(token.attempts or 0) + 1  # type: ignore[assignment]
        if token.attempts >= MAX_ATTEMPTS:
            token.used = True  # type: ignore[assignment]
        db.commit()
        return False
    claimed = (
        db.query(UserPhoneOtpToken)
        .filter(
            UserPhoneOtpToken.id == token.id,
            UserPhoneOtpToken.used.is_(False),
        )
        .update({"used": True})
    )
    if not claimed:
        db.rollback()
        return False
    stamp = datetime.now(timezone.utc)
    user.phone_verified_at = stamp  # type: ignore[assignment]
    # Verifying is the explicit «yes, send me WhatsApp» (string 13 says so).
    user.whatsapp_consent_at = stamp  # type: ignore[assignment]
    db.commit()
    return True


def on_phone_changed(db: Session, user: User) -> None:
    """A new phone is unverified, and codes sent to the old one die.

    Caller commits (it is mid-PATCH)."""
    user.phone_verified_at = None  # type: ignore[assignment]
    db.query(UserPhoneOtpToken).filter(
        UserPhoneOtpToken.user_id == user.id,
        UserPhoneOtpToken.used.is_(False),
    ).update({"used": True})


__all__ = [
    "CODE_TTL",
    "MAX_ATTEMPTS",
    "SendDecision",
    "can_get_whatsapp",
    "confirm",
    "is_verified",
    "on_phone_changed",
    "prepare_send",
]
