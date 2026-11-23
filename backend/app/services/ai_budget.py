# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3498 PR)
"""
Module:   ai_budget
Purpose:  One site-wide daily ceiling on paid AI calls, per model tier
          (MEH-3498). Above it every generation tool answers as if the key
          were missing: the chat gives its offline reply, the suggestion
          routes 503 with their Hebrew detail. At 80% of a tier, and at the
          last allowed call, one ERROR log goes to Sentry for the admin.
Touches:  the slowapi storage (in-memory / Redis) through limiter._limiter.
Does NOT: count moderation. A save's moderation keeps running as before,
          fail-open (the card: «ה-moderation ממשיכה לפעול באופן הרגיל»);
          tests/test_ai_daily_caps.py lists those modules as exempt. Per-IP
          and per-business limits stay on the routes (rate_limit.py,
          routers/product_describe.py `_business_key`).
Related:  routers/chat.py `_global_chat_allowed` (same limiter._limiter.hit
          shape, chat-only cap, MEH-3010) · services/resend_verify_cap.py.
History:  MEH-3498 (creation)
"""

from __future__ import annotations

import logging
import math
from typing import Literal

from limits import parse as parse_limit

from app.rate_limit import limiter
from app.utils.clock import israel_today

logger = logging.getLogger(__name__)

Tier = Literal["fast", "menu"]

# MEH-3498: calls per Israel day, per tier. Module constants, not Settings
# fields: a Settings field becomes an env var, and the card adds none.
# "fast" = AI_FAST_MODEL (Haiku): the visitor chat (its own 2,000 cap stays,
# chat.py GLOBAL_DAILY_LIMIT) plus every owner suggestion route. "menu" =
# AI_MENU_MODEL (Opus): the menu-photo reader and the product-group
# suggester, many times the price per call.
DAILY_LIMITS: dict[str, int] = {"fast": 3000, "menu": 200}
ALERT_SHARE = 0.8
NAMESPACE = "ai_budget"

# (tier, day, threshold) already alerted in this process. hit() and
# get_window_stats() are two steps, so two threads can both read past a
# threshold; alerting on `used >= threshold` once per key closes that gap.
_alerted: set[tuple[str, str, int]] = set()


def _alert_at(limit: int) -> int:
    return math.ceil(limit * ALERT_SHARE)


def _maybe_alert(tier: str, day: str, used: int, limit: int) -> None:
    """One ERROR at 80% and one at the limit, per tier per day per process."""
    for threshold in (_alert_at(limit), limit):
        mark = (tier, day, threshold)
        if used >= threshold and mark not in _alerted:
            _alerted.add(mark)
            # error, not warning: sentry-sdk's default LoggingIntegration
            # makes an event from ERROR only, and the admin's alerts live in
            # Sentry (MEH-3705).
            logger.error(
                "[ai-budget] %s tier at %d of %d calls today", tier, threshold, limit
            )


def allow(tier: Tier) -> bool:
    """Spend one call of `tier` today, or False when today's ceiling is spent.

    The key carries the Israel date, so the count starts again at midnight
    in Israel, not 24 hours after the first call. Fail-OPEN when the counter
    cannot be read: the per-IP and per-business limits still hold, and a
    broken counter must not switch every AI tool off (the trade-off chat's
    cap makes, chat.py `_global_chat_allowed`).

    The count lives in the limiter's storage: in memory today (rate_limit.py
    sets no storage_uri, one uvicorn process), so a deploy or restart starts
    the day's count again, and a second replica would double the ceiling.
    It bounds a runaway day; it is not an exact bill.
    """
    limit = DAILY_LIMITS[tier]
    item = parse_limit(f"{limit}/day")
    day = israel_today().isoformat()
    key = f"{tier}:{day}"
    try:
        allowed = bool(limiter._limiter.hit(item, NAMESPACE, key))
        if allowed:
            _, remaining = limiter._limiter.get_window_stats(item, NAMESPACE, key)
            _maybe_alert(tier, day, limit - int(remaining), limit)
    except Exception as e:  # noqa: BLE001 — the ceiling is best-effort, logged
        logger.warning("[ai-budget] counter unavailable: %s", e)
        return True
    if not allowed:
        # Info: the ERROR already went out at the last allowed call.
        logger.info("[ai-budget] %s tier refused, ceiling %d", tier, limit)
    return allowed
