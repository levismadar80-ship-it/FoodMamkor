"""
Analytics tracking + metrics helpers for feature/producer-analytics.

This module owns two pieces of infrastructure:

1. **Event recording** — `record_analytics_event()` inserts a row into
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

Does NOT own `users.last_active_at` — that column's sole updater is
`_maybe_bump_last_active()` in `app/auth.py` (5-minute throttle on
authenticated requests). A dead `bump_user_last_active()` twin lived
here until MEH-1317 removed it (two-parallel-mechanisms smell).

The design deliberately avoids external dependencies (no MaxMind, no
Prometheus) — everything is pure Python + SQLAlchemy, keeping the image
small and the deploy fast.
"""

import hashlib
import logging
import time
from collections import deque
from dataclasses import dataclass
from threading import Lock
from typing import Literal, Optional
from uuid import UUID

from sqlalchemy import and_, case, distinct, func, tuple_
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    ContactClick,
    ProducerPageView,
    ProducerWhatsAppClick,
    User,
)

logger = logging.getLogger(__name__)


# ============================================================
# Read grain — MEH-160
# ============================================================


def israel_day_of(time_col):
    """The Israel calendar day a naive-UTC timestamp column falls in.

    `created_at` is stored naive-UTC, so this needs the double `timezone()`:
    label it UTC first, then convert. Israel is UTC+2/+3, so a plain
    `func.date()` would bucket the 21:00–24:00 Israel window into the
    previous day for a third of the year.
    """
    return func.date(func.timezone("Asia/Jerusalem", func.timezone("UTC", time_col)))


def unique_views_count(
    day_col,
    *,
    hash_col=ProducerPageView.viewer_ip_hash,
    row_id_col=ProducerPageView.id,
    scope_col=None,
):
    """MEH-160: one page view per visitor per Israel calendar day.

    THE dedupe expression for `producer_page_views`, and the reason it is a
    function in the module that writes the rows rather than a snippet in the
    module that reads them: the first shape of this fix deduped three of the
    table's readers and left three raw, and all six render on one dashboard
    screen — so `profile_views` counted visitors while `top_cities` counted
    refreshes, and the two disagreed by construction.

    # DO NOT count `producer_page_views` rows with a bare `func.count(id)` —
    # that is the inflated number MEH-160 exists to remove. Use this helper.

    `day_col` is POSITIONAL AND REQUIRED, deliberately. It briefly had a
    `None` shorthand meaning "the caller already GROUPs BY the day, so
    DISTINCT(hash) is the same count" — true for the one caller that used
    it, and a silent trap for the next: omit the shorthand's matching
    `GROUP BY` and you get total uniques across the whole result set instead
    of the sum of daily uniques, with no error and a plausible smaller
    number. The tuple form is provably identical inside a day-grouped query
    (the day is constant in the group), so the shorthand bought nothing but
    a way to be wrong. Adversarial review, MEH-160 round 2.

    `scope_col` joins the dedupe key. Pass it when the query spans MORE than
    one producer and you want per-producer uniques SUMMED rather than
    distinct people. That is not a style choice: the admin `top_cities`
    aggregates every producer at once, so without it one visitor who opened
    five businesses in Haifa on one day collapses to a single Haifa view,
    and the admin figure stops being the sum of the per-producer figures.

    NULL-hash rows (no usable client IP) are counted one-by-one: they cannot
    be deduped against anything, and `COUNT(DISTINCT)` drops them silently,
    which would trade over-counting for under-counting.

    `row_id_col` gates that NULL arm on the row existing at all. Under the
    LEFT JOIN in `rank_in_city`, a producer with zero views still produces
    one all-NULL row — without the gate, `hash IS NULL` matches it and every
    view-less producer scores 1 instead of 0.

    The salt behind `hash_ip` is `settings.secret_key` — stable per deploy,
    NOT time-rotating — so the day grain comes from `created_at`, not from
    the hash. A secret rotation resets uniques; rare, acceptable, recorded.
    """
    null_arm = func.count(case((and_(row_id_col.isnot(None), hash_col.is_(None)), 1)))
    key = (
        tuple_(day_col, hash_col)
        if scope_col is None
        else tuple_(day_col, scope_col, hash_col)
    )
    # A (day, NULL) tuple is NOT NULL *as a whole*, so DISTINCT would count
    # it and the NULL arm would count it again. Measured, not theorized: the
    # NULL tests came back +1 per NULL row before this FILTER.
    return func.count(distinct(key)).filter(hash_col.isnot(None)) + null_arm


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


def is_internal_viewer(viewer: Optional[User], producer_id: UUID) -> bool:
    """MEH-2156: True when the viewer is the producer's own owner, or an admin.

    Analytics must measure the AUDIENCE, not the business owner checking her
    own profile. Before this predicate every writer counted the owner: a
    `pending` producer — which `producers.py:404-408` serves to nobody BUT
    the owner and admins — still showed "1 profile view", and after approval
    every self-check inflated the numbers. The first number an owner sees is
    her first trust signal in the platform; a number she knows is false burns
    it immediately.

    Admins are skipped alongside owners by Sapir's 21/08 ruling — same logic,
    less noise.

    This is the extraction of the owner/admin shape already living inline at
    `producers.py:405-406` (the MEH-254 gate). DO NOT invent a second form —
    the two must agree, since the gate is what makes "any view of a
    non-approved profile is necessarily the owner or an admin" true.

    `viewer` is Optional because the two auth sources differ:
    `get_current_user_optional` (GET) and `get_current_user_lenient` (POST)
    both hand back None for an anonymous or expired-token caller. None is
    never internal.
    """
    if viewer is None:
        return False
    if getattr(viewer, "role", None) == "admin":
        return True
    # bool() because `User.producer_id` is a declarative Column: on an ORM
    # *instance* the comparison is a plain UUID == UUID, but mypy types the
    # attribute as Column[...] and reads the result as ColumnElement[bool].
    # The declared `-> bool` is the contract; make it true at the type level
    # too rather than leaving a new error in the (warn-only) mypy output.
    return bool(viewer.producer_id == producer_id)


# ============================================================
# The analytics choke point (MEH-2160)
# ============================================================

AnalyticsEvent = Literal["page_view", "whatsapp_click", "contact_click"]

_ALLOWED_REFERRERS = frozenset(
    {
        "search",
        "map",
        "category",
        "home",
        "favorites",
        "follow",
        "producers-index",
        "similar",
        "nearby",
    }
)


@dataclass
class EventContext:
    """Per-request context for record_analytics_event.

    Bundled rather than passed as loose arguments so the choke point stays
    under ruff's PLR0913 5-argument cap. This replaced the older ViewContext,
    which MEH-2160 deleted: it carried a pre-resolved IP, which meant the
    write path had two ways in — one that resolved the caller itself and one
    that trusted a value handed to it. Two doors into one write is the exact
    shape this ticket exists to remove, so there is now one.

    `referrer` is only meaningful for page_view and `method` only for
    contact_click; each is ignored by the events that have no column for it.
    """

    request: object
    viewer: Optional[User]
    referrer: Optional[str] = None
    method: Optional[str] = None


def record_analytics_event(
    db: Session,
    *,
    event: AnalyticsEvent,
    producer_id: UUID,
    ctx: EventContext,
) -> None:
    """The ONE place an analytics row is written. MEH-2160.

    Every exclusion rule this system has was, before this function, enforced
    at exactly the site where its bug was found and nowhere else:

      | rule                | enforced on          | missing from            |
      | bot user-agent      | page views           | both click writers      |
      | real client IP      | the rate limiter     | both analytics writers  |
      | owner/admin skip    | 3 writers, that day  | the 4th, written later  |
      | referrer allowlist  | page views           | (n/a)                   |

    Three tickets in a row were the same defect wearing different clothes: a
    correct rule that never propagated. Nothing in the system stopped the
    next writer from calling `db.add(...)` directly and inheriting none of
    them. `test_analytics_chokepoint.py` is now what stops it.

    ORDER IS PART OF THE CONTRACT — do not reorder:

      1. bot user-agent      -> skip. Cheapest, and needs no DB read.
      2. internal viewer     -> skip. The owner is not her own audience.
      3. real client IP      -> hashed via the trusted-proxy resolver.
      4. referrer allowlist  -> page_view only; anything else becomes NULL.
      5. INSERT + commit, fail-open with rollback on any exception.

    Fail-open is deliberate and load-bearing: analytics is telemetry, and a
    tracking failure must never turn into an error the visitor can see. Every
    caller is fire-and-forget.
    """
    try:
        if is_bot_user_agent(_user_agent_of(ctx.request)):
            return

        if is_internal_viewer(ctx.viewer, producer_id):
            return

        user_id = ctx.viewer.id if ctx.viewer is not None else None

        if event == "page_view":
            city: Optional[str] = None
            if ctx.viewer is not None and ctx.viewer.city:
                city = ctx.viewer.city
            # Only accept known referrer values — the caller-supplied string
            # reaches here unvalidated, so this set is the ONLY thing keeping
            # the column bounded. DO NOT widen it to accept arbitrary input;
            # add a literal per frontend writer.
            row: object = ProducerPageView(
                producer_id=producer_id,
                viewer_ip_hash=hash_ip(_client_ip_of(ctx.request)),
                city=city,
                referrer=(ctx.referrer if ctx.referrer in _ALLOWED_REFERRERS else None),
            )
        elif event == "whatsapp_click":
            row = ProducerWhatsAppClick(
                producer_id=producer_id,
                user_id=user_id,
            )
        elif event == "contact_click":
            row = ContactClick(
                producer_id=producer_id,
                user_id=user_id,
                method=ctx.method,
                ip_hash=hash_ip(_client_ip_of(ctx.request)),
            )
        else:  # pragma: no cover — Literal makes this unreachable via types
            raise ValueError(f"unknown analytics event: {event!r}")

        db.add(row)
        db.commit()
    except Exception as exc:  # noqa: BLE001 — fail-open by design
        logger.warning(
            "[ANALYTICS] %s failed for producer=%s: %s", event, producer_id, exc
        )
        try:
            db.rollback()
        except Exception:
            pass


def _user_agent_of(request: object) -> Optional[str]:
    """Read the UA off a Starlette Request without importing FastAPI here.

    This module is a service, and the two callers already hold the Request.
    Duck-typed so a test can pass any object with `.headers` — and so the
    service layer keeps no framework import.
    """
    headers = getattr(request, "headers", None)
    if headers is None:
        return None
    return headers.get("user-agent")


def _client_ip_of(request: object) -> Optional[str]:
    """Resolve the caller through the trusted-proxy resolver.

    Imported lazily: app.rate_limit pulls in slowapi and the settings object,
    and a module-level import here would put that on the cold-import path of
    every consumer of this service.
    """
    # DO NOT reintroduce a pre-resolved-IP shortcut here. An earlier shape of
    # this refactor kept one (`getattr(request, "_ip", None)`) as a leftover
    # from the ViewContext adapter, and it was dead the moment that adapter
    # was deleted — nothing sets the attribute. It was worse than dead: a
    # private back door that let any future caller hand this function an IP
    # and bypass the trusted-proxy resolver entirely. That is the second
    # door this whole ticket exists to remove. Caught in review on the PR.
    from app.rate_limit import get_real_client_ip

    return get_real_client_ip(request)


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


__all__ = [
    "record_request",
    "server_health",
    "hash_ip",
    "is_bot_user_agent",
    "is_internal_viewer",
    "record_analytics_event",
    "EventContext",
]
