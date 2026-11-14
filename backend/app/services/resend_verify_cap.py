"""
Module:   resend_verify_cap
Purpose:  A per-ACCOUNT cap on POST /auth/resend-verify, on top of the route's
          per-IP limit, so rotating IPs cannot flood one inbox (MEH-2906).
Touches:  the slowapi storage (in-memory / Redis) through limiter._limiter.
Does NOT: send mail or rotate the token (routers/auth.py resend_verify does);
          replace the per-IP @limiter.limit on the route, which stays.
Related:  routers/chat.py `_global_chat_allowed` (same limiter._limiter.hit
          shape); rate_limit.py `limiter`.
History:  MEH-2906 (creation, 14/11/2026).
"""

from __future__ import annotations

import logging

from fastapi import HTTPException
from limits import parse as parse_limit

from app.rate_limit import limiter

logger = logging.getLogger(__name__)

# MEH-2906: 3 an hour matches the per-IP limit; 10 a day bounds a patient
# sender who waits out the hour. A real person who lost the mail needs one or
# two resends.
PER_ACCOUNT_LIMITS: tuple[str, ...] = ("3/hour", "10/day")
NAMESPACE = "resend_verify_user"
TOO_MANY_DETAIL = (
    "שלחנו כבר כמה מיילי אימות לאחרונה. כדאי לבדוק את תיבת הדואר, "
    "גם בתיקיית הספאם, ולנסות שוב מאוחר יותר."
)


def enforce_per_account_cap(user_id: str) -> None:
    """Spend one unit of every per-account window, or raise 429.

    Fail-OPEN when the counter cannot be read: the per-IP route limit still
    holds, and a broken counter must not stop a real person from getting
    their verify mail (the same trade-off as chat's site-wide cap).
    """
    key = user_id
    for raw in PER_ACCOUNT_LIMITS:
        try:
            allowed = bool(limiter._limiter.hit(parse_limit(raw), NAMESPACE, key))
        except Exception as e:  # noqa: BLE001 — cap is best-effort, logged
            logger.warning("resend-verify per-account cap unavailable: %s", e)
            return
        if not allowed:
            raise HTTPException(status_code=429, detail=TOO_MANY_DETAIL)
