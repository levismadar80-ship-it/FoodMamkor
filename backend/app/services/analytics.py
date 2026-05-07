"""
Analytics tracking + metrics helpers for feature/producer-analytics.

This module owns three pieces of infrastructure:

1. **View tracking** — `track_producer_view()` inserts a row into
   `producer_page_views` after a successful `GET /producers/{id}` hit.
   Hashes the client IP (SHA-256 with a rotating salt from settings) so we
   dedupe uniques without storing raw PII. Resolves the viewer's city from
   the authenticated user when available, nullable otherwise. Filters out
   common bot user-agents so analytics stay meaningful.

2. **Sliding-window metrics** — `record_request(duration_ms)` appends to a
   module-level bounded deque keyed by `(timestamp, duration_ms)`. The
   `server_health()` reader computes `response_time_avg_ms` and
   `requests_per_minute` for the last hour on demand. Per-process
   in-memory — not durable across restarts, not shared across workers.
   Good enough for a single-operator admin dashboard; flagged in
   docs/SECURITY.md as v1 limitation.

3. **`last_active_at` updater** — `bump_user_last_active()` is called from
   a tiny middleware in main.py on every authenticated request so the
   admin's DAU chart has something to chart.

The design deliberately avoids external dependencies (no MaxMind, no
Prometheus) — everything is pure Python + SQLAlchemy, keeping the image
small and the deploy fast.
"""

import hashlib
import logging
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta
from threading import Lock
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.models import ProducerPageView, User

logger = logging.getLogger(__name__)

# ============================================================
# View tracking
# ============================================================

# Common bot user-agent substrings (lowercase match). We deliberately do
# NOT try to be clever here — this is a cheap allowlist, not a bot defense.
_BOT_UA_NEEDLES = (
    "bot",
    "crawl",
    "spider",
    "slackbot",
    "facebookexternalhit",
    "vercelbot",
    "yandex",
    "baiduspider",
)


def is_bot_user_agent(ua: Optional[str]) -> bool:
    """Return True if the user-agent looks like a crawler."""
    if not ua:
        return False
    ua_lower = ua.lower()
    return any(needle in ua_lower for needle in _BOT_UA_NEEDLES)


def hash_ip(ip: Optional[str]) -> Optional[str]:
    """SHA-256 hex of (ip + rotating salt). None in → None out.

    The salt is `settings.secret_key` so it rotates whenever the deploy
    rotates its JWT secret, limiting how far back a rainbow-table attack
    could go. We only use the first 32 bytes of the secret to stay inside
    hashlib's fast path.
    """
    if not ip:
        return None
    salt = (settings.secret_key or "")[:32]
    return hashlib.sha256(f"{ip}|{salt}".encode("utf-8")).hexdigest()


@dataclass
class ViewContext:
    """MEH-447: bundle the per-request viewer context so track_producer_view
    stays under PLR0913's 5-arg cap. Plain dataclass (not Pydantic) since
    the User field is a SQLAlchemy ORM instance and this is internal-only."""

    viewer_ip: Optional[str]
    user_agent: Optional[str]
    viewer_user: Optional[User]
    referrer: Optional[str]


def track_producer_view(
    db: Session,
    *,
    producer_id: UUID,
    ctx: ViewContext,
) -> None:
    """Insert a ProducerPageView row for this request, best-effort.

    Swallows all exceptions — a tracking failure must never propagate
    into the GET /producers/{id} response. Bot UAs are silently skipped.
    Called from `producers.get_producer()` after the response body is
    computed so a 404 doesn't leave a view behind.
    """
    try:
        if is_bot_user_agent(ctx.user_agent):
            return

        city: Optional[str] = None
        if ctx.viewer_user is not None and ctx.viewer_user.city:
            city = ctx.viewer_user.city

        # Only accept known referrer values — protects against callers
        # stuffing arbitrary strings into the column.
        normalized_referrer: Optional[str] = None
        if ctx.referrer in {"search", "map", "category", "home", "favorites", "follow"}:
            normalized_referrer = ctx.referrer

        row = ProducerPageView(
            producer_id=producer_id,
            viewer_ip_hash=hash_ip(ctx.viewer_ip),
            city=city,
            referrer=normalized_referrer,
        )
        db.add(row)
        db.commit()
    except Exception as exc:  # noqa: BLE001 — fail-open by design
        logger.warning(
            "[ANALYTICS] track_producer_view failed for producer=%s: %s",
            producer_id,
            exc,
        )
        try:
            db.rollback()
        except Exception:
            pass


# ============================================================
# Sliding-window request metrics (for /admin/dashboard server_health)
# ============================================================

# Bounded deque of (timestamp_monotonic, duration_ms) tuples. 7200 slots
# = ~2 hours at 1 req/sec, far more than the 1-hour window we report.
# Lock is held for sub-microsecond O(1) appends only.
_METRICS_WINDOW_SECONDS = 3600  # report last hour
_MAX_SAMPLES = 7200

_samples: deque[tuple[float, float]] = deque(maxlen=_MAX_SAMPLES)
_samples_lock = Lock()


def record_request(duration_ms: float) -> None:
    """Called from a FastAPI middleware on every request."""
    if duration_ms < 0 or duration_ms > 60_000:  # sanity: drop >60s outliers
        return
    with _samples_lock:
        _samples.append((time.monotonic(), duration_ms))


def server_health() -> dict:
    """Compute (avg_response_time_ms, requests_per_minute) over last hour."""
    cutoff = time.monotonic() - _METRICS_WINDOW_SECONDS
    with _samples_lock:
        # Drop stale entries as a side effect — keeps the deque from
        # carrying hours-old junk across idle periods.
        while _samples and _samples[0][0] < cutoff:
            _samples.popleft()
        samples_in_window = list(_samples)

    if not samples_in_window:
        return {
            "response_time_avg_ms": 0,
            "requests_per_minute": 0,
            "window": "last_hour",
            "sample_count": 0,
        }

    total_ms = sum(d for _, d in samples_in_window)
    avg = total_ms / len(samples_in_window)
    # requests_per_minute = samples_in_window / 60 (since window is 60 min)
    rpm = len(samples_in_window) / 60.0
    return {
        "response_time_avg_ms": round(avg, 1),
        "requests_per_minute": round(rpm, 1),
        "window": "last_hour",
        "sample_count": len(samples_in_window),
    }


# ============================================================
# last_active_at updater
# ============================================================


def bump_user_last_active(db: Session, user_id: UUID) -> None:
    """Update `users.last_active_at = NOW()` for the given user.

    Called from a middleware in main.py on every authenticated request.
    Kept super-cheap: one UPDATE, no SELECT, swallows exceptions so the
    request never fails because of bookkeeping.
    """
    try:
        now = datetime.utcnow()
        db.query(User).filter(User.id == user_id).update(
            {"last_active_at": now}, synchronize_session=False
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("[ANALYTICS] bump_user_last_active failed: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass


__all__ = [
    "track_producer_view",
    "record_request",
    "server_health",
    "bump_user_last_active",
    "hash_ip",
    "is_bot_user_agent",
]
