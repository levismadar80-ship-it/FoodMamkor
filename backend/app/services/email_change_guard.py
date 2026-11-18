"""
Module:   email_change_guard
Purpose:  The password gate on an account-email change (PATCH /users/me):
          a per-ACCOUNT cap on wrong passwords, and the messages for an
          account that has no password at all (MEH-3425).
Touches:  the slowapi storage (in-memory / Redis) through limiter._limiter.
Does NOT: change the email, send mail or sign devices out
          (routers/users_me.py `_change_email` / `update_profile` do);
          replace the route's per-IP @limiter.limit, which stays.
Related:  services/resend_verify_cap.py (same limiter._limiter shape,
          MEH-2906); routers/users_me.py `_change_email`.
History:  MEH-3425 (creation, 18/11/2026; follow-up to MEH-3104).
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from limits import parse as parse_limit

from app.auth import verify_password
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

# MEH-3425: 5 wrong passwords an hour per account, whatever the IP. The
# route's 10/hour per IP stays; this closes the rotating-IP gap. Only WRONG
# passwords spend it, so an owner who types it right is never counted.
WRONG_PASSWORD_LIMIT = "5/hour"
NAMESPACE = "email_change_wrong_password"

WRONG_PASSWORD_DETAIL = "הסיסמה הנוכחית שגויה"
TOO_MANY_DETAIL = "היו יותר מדי ניסיונות עם סיסמה שגויה. אפשר לנסות שוב בעוד שעה."
NO_PASSWORD_DETAIL = (
    "לחשבון הזה אין עדיין סיסמה. כדי לשנות את האימייל, קודם הגדירו סיסמה "
    "דרך «שכחתי סיסמה» בדף ההתחברות."
)


def _is_locked(user_id: UUID) -> bool:
    """True when this account has used up its wrong-password allowance.

    Fail-OPEN when the counter cannot be read: the per-IP route limit still
    holds, and a broken counter must not stop a real owner.
    """
    try:
        return not bool(
            limiter._limiter.test(
                parse_limit(WRONG_PASSWORD_LIMIT), NAMESPACE, str(user_id)
            )
        )
    except Exception as e:  # noqa: BLE001 — cap is best-effort, logged
        logger.warning("email-change wrong-password cap unavailable: %s", e)
        return False


def _spend(user_id: UUID) -> None:
    try:
        limiter._limiter.hit(parse_limit(WRONG_PASSWORD_LIMIT), NAMESPACE, str(user_id))
    except Exception as e:  # noqa: BLE001 — cap is best-effort, logged
        logger.warning("email-change wrong-password cap unavailable: %s", e)


def check_current_password(
    user_id: UUID, password_hash: str | None, current_password: str | None
) -> None:
    """Raise unless `current_password` is this account's password.

    Order: no password on the account (its own 403, nothing to guess) →
    locked (429, even for the right password) → wrong (403, spends one).
    The caller holds a row lock on the user (users_me `_change_email`), so
    parallel guesses for one account are checked one at a time and cannot
    all pass `_is_locked` before any of them is spent.
    """
    if not password_hash:
        raise HTTPException(status_code=403, detail=NO_PASSWORD_DETAIL)
    if _is_locked(user_id):
        raise HTTPException(status_code=429, detail=TOO_MANY_DETAIL)
    # An absent password is not a guess: it spends nothing, so a stolen
    # session cannot lock the owner out with empty requests.
    if not current_password:
        raise HTTPException(status_code=403, detail=WRONG_PASSWORD_DETAIL)
    if not verify_password(current_password, password_hash):
        _spend(user_id)
        raise HTTPException(status_code=403, detail=WRONG_PASSWORD_DETAIL)
