"""MEH-500: backend Sentry SDK init.

Activates the MEH-483 + MEH-493 ``SentryRequestScopeMiddleware`` shim
by making ``sentry_sdk`` importable AND initialized. The shim's
``try: import sentry_sdk`` block (``backend/app/middleware.py:21-24``)
flips from ``None`` → live SDK once this module's ``init_sentry()``
runs at boot.

Called once from ``main.py`` BEFORE ``FastAPI()`` instantiation so any
exception during app construction is captured. Reads env via
``os.getenv`` directly (NOT ``app.config.settings``) to stay decoupled
from pydantic-settings init order.

Verify-on-staging contract: dashboard receipt is verified manually
(see PR #552 body / MEH-500 DoD). Local CC sandbox cannot reach
Sentry's ingest host (MEH-2090).
"""

import hashlib
import logging
import os
import threading
import time

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MEH-2114: SDK-side event budget.
#
# The Sentry Developer (free) plan has NO Spike Protection, NO pay-as-you-go
# and NO server-side rate limits — the SDK is the only budget control that
# exists, and it had none configured (init was traces_sample_rate only).
#
# Measured (Sentry API, org df7d71a2ad7a, 30d window, read 2026-08-16):
#   RecursionError /producers/by-slug/{slug}  4519+235+67+52+22 = 4,895  (5 groups)
#   ValidationError /auth/register (exception)                     670
#   [EMAIL] NOT SENT ... (the LOG TWIN of the line above)          670
#   IntegrityError seed_data in seed                               204
#                                                              -------
#                                                                6,439
# Against a 5,000 errors/month quota, with a ~250/day steady-state baseline
# (= 7,500/month) measured 05–16/08 while 100% was dropped Over-Quota.
#
# The budget is enforced by a per-fingerprint burst cap (see _burst_allow).
# Arithmetic, per fingerprint:
#     BURST_LIMIT / BURST_WINDOW_SECONDS
#   = 3 per 6h = 12/day = 360/month
# so the quota funds 13 permanently-saturating fingerprints (13*360 = 4,680)
# before anything is lost to Over-Quota. Six fingerprints are active today
# (5 RecursionError + 1 register email) => 2,160/month, 43% of quota.
#
# DO NOT swap this for Redis or a metrics pipeline (MEH-2114 over-engineering
# guard) — an in-memory dict with TTL eviction is the whole design.
# ---------------------------------------------------------------------------

#: Events per fingerprint allowed through per window. The FIRST event of any
#: fingerprint is always one of them — see _burst_allow's new-bucket branch.
BURST_LIMIT = 3

#: Rolling window, seconds. 6h => 4 windows/day => 12 events/day/fingerprint.
BURST_WINDOW_SECONDS = 6 * 60 * 60

#: Sample rate applied by error_sampler() to a fingerprint that has already
#: blown the burst cap. New and rare fingerprints always sample at 1.0.
NOISY_SAMPLE_RATE = 0.05

#: Hard bound on the counter dict (trap 3 — an unbounded counter is a leak).
#: 512 fingerprints * (40-char key + small tuple) stays well under 100 KB.
MAX_TRACKED_FINGERPRINTS = 512

#: logger name -> required message prefix, for stdlib-`logging` records that
#: duplicate an explicit capture_exception made at the same swallow point.
#:
#: Keyed on BOTH the logger and the message prefix, deliberately. Matching on
#: the logger name alone would suppress every future non-exception ERROR added
#: to that module — including one with no paired capture_exception, which would
#: then be lost from Sentry entirely with nothing to indicate it. Binding the
#: rule to the message it was written for keeps the blast radius equal to the
#: documented case. Behaviour today is unchanged: both `logger.error` calls in
#: email.py (`:104` and `:146`) carry this prefix.
_DUPLICATE_LOG_PREFIXES = {"app.services.email": "[EMAIL] NOT SENT"}

_burst_lock = threading.Lock()
# fingerprint -> [window_start, count, noisy_until]
_burst_state: dict[str, list[float]] = {}


def _reset_budget_state() -> None:
    """Test seam — clear the burst counter. Not called in production."""
    with _burst_lock:
        _burst_state.clear()


def _exception_values(event: dict) -> list:
    """The event's exception chain, or [] for a log/message event."""
    return ((event.get("exception") or {}).get("values")) or []


def _drop_reason(event: dict) -> str | None:
    """Unconditional drops. Returns a reason string, or None to keep.

    Two classes, both measured in the header block above. Neither is a
    volume heuristic — each drops a report that is *redundant with, or not
    about,* a user flow, so no signal is lost:

    1. ``duplicate-log-twin`` — the /auth/register email failure is reported
       TWICE for one underlying failure. ``email.py:90`` calls
       ``capture_background_exception`` (=> the event WITH the stack trace,
       Sentry group MEHAMAKOR-BACKEND-N) and ``email.py:91-98`` then calls
       ``logger.error``, which sentry-sdk's default LoggingIntegration
       captures as a SECOND, stack-trace-less event (group
       MEHAMAKOR-BACKEND-M). Both read 670 events. We keep the exception and
       drop the log twin.

       Note this does NOT contradict sentry.py's own docstring at :84-89:
       that paragraph explains LoggingIntegration cannot see *structlog*
       calls, which bypass stdlib logging. ``app.services.email`` uses
       stdlib ``logging.getLogger`` (email.py:33), so it IS captured — which
       is precisely why the twin exists.

       The ERROR log line itself is untouched and still reaches Railway
       stdout; only its Sentry copy goes away.

       This also closes a PRE-EXISTING leak in the same module. email.py's
       ``_missing_key_reported`` latch (``email.py:44``) exists so a missing
       RESEND_API_KEY reports to Sentry ONCE per process instead of once per
       email — but the throttled branch still calls ``logger.error``
       (``email.py:146``), which LoggingIntegration captured, so the latch was
       emitting a Sentry event per send anyway. That branch's message carries
       the same prefix, so it is covered here and the latch now does what its
       own comment says it does.

    2. ``seed-data-integrity`` — the seed script's FK violation
       (``seed_data in seed``, 204 events) arrives via
       ``startup.py:171``'s ``capture_background_exception(task="db_init")``.
       Deliberately matched on IntegrityError **plus a seed_data frame**
       rather than on the ``db_init`` task tag: a failing Alembic migration
       reports under the same tag and is real signal that must survive.
    """
    values = _exception_values(event)

    prefix = _DUPLICATE_LOG_PREFIXES.get(event.get("logger"))
    if prefix is not None and not values:
        logentry = event.get("logentry") or {}
        message = str(logentry.get("message") or event.get("message") or "")
        if message.startswith(prefix):
            return "duplicate-log-twin"

    for value in values:
        if not str(value.get("type") or "").endswith("IntegrityError"):
            continue
        frames = ((value.get("stacktrace") or {}).get("frames")) or []
        for frame in frames:
            module = str(frame.get("module") or "")
            filename = str(frame.get("filename") or "")
            if module == "seed_data" or module.startswith("seed_data."):
                return "seed-data-integrity"
            if filename.endswith("seed_data.py"):
                return "seed-data-integrity"

    return None


def _event_fingerprint(event: dict) -> str:
    """Stable grouping key for an event dict. Pure — no DB, no network.

    Built from the same signals Sentry itself groups on, so one Sentry issue
    maps to one budget bucket. For a log event the FORMAT STRING is used
    (``logentry.message``), never the interpolated result — otherwise every
    recipient address would mint a new fingerprint and the cap would never
    bind, which is the failure mode this whole module exists to prevent.
    """
    parts: list[str] = []

    explicit = event.get("fingerprint")
    if isinstance(explicit, (list, tuple)):
        parts.extend(str(p) for p in explicit if p != "{{ default }}")

    values = _exception_values(event)
    if values:
        innermost = values[-1]
        parts.append(str(innermost.get("type") or ""))
        frames = ((innermost.get("stacktrace") or {}).get("frames")) or []
        if frames:
            top = frames[-1]
            parts.append(str(top.get("module") or top.get("filename") or ""))
            parts.append(str(top.get("function") or ""))
            parts.append(str(top.get("lineno") or ""))
    else:
        logentry = event.get("logentry") or {}
        parts.append(str(logentry.get("message") or event.get("message") or ""))
        parts.append(str(event.get("logger") or ""))

    parts.append(str(event.get("transaction") or ""))
    return hashlib.sha1("|".join(parts).encode("utf-8", "replace")).hexdigest()


def _evict_locked(now: float, reserve: int = 0) -> None:
    """Bound ``_burst_state``. Caller MUST hold ``_burst_lock``.

    Trap 3: an in-memory counter with no eviction is a memory leak — a new
    fingerprint per unique error text would grow it without limit. Expired
    buckets go first; if the dict is still at the bound, the oldest windows
    are dropped. Dropping a bucket is SAFE by construction: the fingerprint
    is simply treated as new again, which errs toward reporting.

    ``reserve`` is headroom for a row the caller is about to insert. Without
    it the dict settles one entry ABOVE the bound forever — eviction trims to
    exactly MAX, the caller then inserts, and the next call trims back to MAX
    again. Caught by test_counter_dict_stays_bounded_under_unique_fingerprint_flood,
    which failed at MAX+1 before this parameter existed.
    """
    stale = [
        fp
        for fp, (window_start, _count, noisy_until) in _burst_state.items()
        if now - window_start >= BURST_WINDOW_SECONDS and now >= noisy_until
    ]
    for fp in stale:
        del _burst_state[fp]

    overflow = len(_burst_state) - (MAX_TRACKED_FINGERPRINTS - reserve)
    if overflow > 0:
        oldest = sorted(_burst_state, key=lambda fp: _burst_state[fp][0])[:overflow]
        for fp in oldest:
            del _burst_state[fp]


def _burst_allow(fingerprint: str, now: float | None = None) -> bool:
    """Consume one unit of budget for ``fingerprint``. True => report it.

    Trap 2: pure dict arithmetic under a short lock — no DB, no network, and
    the lock is never held across I/O, because there is none to hold it
    across. This runs inside the request/response cycle.
    """
    now = time.monotonic() if now is None else now
    with _burst_lock:
        # reserve=1: this call may insert a new bucket immediately below.
        _evict_locked(now, reserve=1)
        bucket = _burst_state.get(fingerprint)

        # New fingerprint, or its window has rolled over: this is a FIRST
        # occurrence and is never suppressed (MEH-2114 acceptance criterion).
        if bucket is None or now - bucket[0] >= BURST_WINDOW_SECONDS:
            _burst_state[fingerprint] = [now, 1, 0.0]
            return True

        bucket[1] += 1
        if bucket[1] <= BURST_LIMIT:
            return True

        # Over budget: mark noisy so error_sampler can shed load cheaply on
        # the next events, and drop this one.
        bucket[2] = now + BURST_WINDOW_SECONDS
        return False


def _is_noisy(fingerprint: str, now: float | None = None) -> bool:
    """READ-ONLY: has this fingerprint recently blown its burst cap?

    Deliberately does not increment. sentry-sdk applies the sampler and
    ``before_send`` in an order this module does not verify (the SDK is not
    importable in the CC sandbox — pyproject pins it but nothing installs it
    here), so ALL counting lives in ``_burst_allow`` and the sampler only
    reads. That makes the pair order-independent: whichever runs first, the
    per-fingerprint ceiling is still BURST_LIMIT per window, and the sampler
    can only ever reduce volume further — never raise it.
    """
    # Lock-free read, DELIBERATELY — not an oversight. Under CPython the GIL
    # makes `dict.get` and a list index read atomic, the bucket list is only
    # ever mutated in place (never resized), and a bucket evicted concurrently
    # stays alive through this local reference. The worst outcome is reading a
    # value one event stale, which shifts a SAMPLE RATE and can never affect
    # the hard budget — all of that lives in _burst_allow, under the lock.
    now = time.monotonic() if now is None else now
    bucket = _burst_state.get(fingerprint)
    return bucket is not None and now < bucket[2]


def before_send(event: dict, hint: dict | None = None) -> dict | None:
    """Sentry ``before_send`` hook. Returns the event, or None to drop it.

    TRAP 1 — FAIL OPEN. Without ``debug=True`` an exception raised inside
    this hook is SILENTLY discarded by the SDK and all reporting dies with
    no signal whatsoever. The entire body is therefore wrapped, and any
    internal failure returns the event UNCHANGED. A broken suppressor must
    degrade to "Sentry as it was before MEH-2114", never to "no Sentry".
    """
    try:
        if _drop_reason(event) is not None:
            return None
        if _burst_allow(_event_fingerprint(event)):
            return event
        return None
    except Exception:  # noqa: BLE001 — see TRAP 1 above
        logger.exception("Sentry before_send failed; passing event through")
        return event


def error_sampler(event: dict, hint: dict | None = None) -> float:
    """Sentry ``error_sampler`` hook. Returns a sample rate in [0.0, 1.0].

    Preferred over a static ``sample_rate`` because a static rate cannot
    tell a first-ever error from the 3,267rd copy of a known loop: at the
    ~0.35 a 5,000/month budget would require, a brand-new production bug
    would have a ~65% chance of never being reported at all.

    Rates:
      * new / rare fingerprint -> 1.0  (acceptance criterion: a FIRST
        occurrence of a NEW fingerprint is never sampled out)
      * fingerprint that has blown its burst cap -> NOISY_SAMPLE_RATE
      * unconditional-drop classes -> 0.0

    Fails open at 1.0 for the same reason ``before_send`` does.
    """
    try:
        if _drop_reason(event) is not None:
            return 0.0
        if _is_noisy(_event_fingerprint(event)):
            return NOISY_SAMPLE_RATE
        return 1.0
    except Exception:  # noqa: BLE001 — fail open: report rather than lose
        logger.exception("Sentry error_sampler failed; sampling at 1.0")
        return 1.0


def init_sentry() -> None:
    """Idempotent fail-open Sentry init. Call once at boot.

    No-op when ``BACKEND_SENTRY_DSN`` is unset/empty — the existing
    middleware shim continues to no-op cleanly. Never raises.
    """
    dsn = os.getenv("BACKEND_SENTRY_DSN", "").strip()
    if not dsn:
        logger.info("Sentry disabled (no BACKEND_SENTRY_DSN set)")
        return

    # Release priority (locked in MEH-500 plan): APP_VERSION (explicit
    # operator override) > RAILWAY_GIT_COMMIT_SHA (Railway-injected) >
    # "unknown" (no signal). Mirrors the precedent set by ENV defaults
    # in app/logging_config.py.
    release = (
        os.getenv("APP_VERSION", "").strip()
        or os.getenv("RAILWAY_GIT_COMMIT_SHA", "").strip()
        or "unknown"
    )
    environment = os.getenv("ENV", "development").strip() or "development"

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        init_kwargs = {
            "dsn": dsn,
            "environment": environment,
            "release": release,
            "traces_sample_rate": 0.1,
            "integrations": [FastApiIntegration()],
            # MEH-2114 event budget — see the header block for the arithmetic.
            "before_send": before_send,
            "error_sampler": error_sampler,
        }
        try:
            sentry_sdk.init(**init_kwargs)
        except TypeError:
            # MEH-2114: `error_sampler` needs sentry-sdk >= 1.33. pyproject.toml:30
            # pins `sentry-sdk[fastapi]==2.60.0`, which is far past that — but the
            # SDK is NOT installed in the CC sandbox, so this was never verified by
            # import. Without this fallback an unexpected TypeError would fall into
            # the outer handler and disable Sentry ENTIRELY, which is the exact
            # "broken suppressor means no Sentry" failure MEH-2114 forbids.
            # before_send (available since 0.x) still enforces the hard budget.
            logger.warning(
                "Sentry error_sampler rejected by the installed SDK — "
                "retrying without it (burst cap in before_send still applies)"
            )
            init_kwargs.pop("error_sampler")
            sentry_sdk.init(**init_kwargs)
        logger.info(
            "Sentry initialized (environment=%s, release=%s, "
            "burst_cap=%d/%ds, noisy_rate=%s)",
            environment,
            release,
            BURST_LIMIT,
            BURST_WINDOW_SECONDS,
            NOISY_SAMPLE_RATE,
        )
    except Exception:
        logger.exception("Sentry init failed (continuing without Sentry)")


# MEH-1533: tag key applied to every background-task capture, so these events
# are filterable in Sentry (`background_task:db_init`) and separable from the
# request-cycle errors FastApiIntegration reports.
BACKGROUND_TASK_TAG = "background_task"


def capture_background_exception(exc: BaseException, *, task: str) -> None:
    """MEH-1533: report an otherwise-swallowed background exception to Sentry.

    Background work — ``startup._init_db_background`` (via ``asyncio.to_thread``)
    and the APScheduler jobs ``startup._run_followup_job`` /
    ``startup._run_watchdog_job`` — runs OUTSIDE the ASGI request cycle, so
    ``FastApiIntegration`` (the only integration configured in
    ``init_sentry`` above) never observes it. Each of those handlers logs via
    structlog and returns, so the failure reaches Railway stdout and nowhere
    else: a ``seed()`` crash that fired on every staging boot produced ZERO
    Sentry events in 90 days (MEH-1530 diagnosis).

    ``LoggingIntegration`` deliberately NOT used to close this: structlog is
    configured with ``logger_factory=structlog.PrintLoggerFactory(sys.stdout)``
    (``app/logging_config.py:84``), which writes straight to stdout and never
    routes through stdlib ``logging`` — so that integration would not see these
    ``log.error`` calls at all.

    Call this BEFORE the structlog ``log.error(..., exc_info=True)`` in the same
    ``except`` block: getsentry/sentry-python#1468 documents a capture that
    FOLLOWS a logging call being dropped by event deduplication.

    Fail-open by construction, mirroring ``init_sentry``: no-ops when
    ``sentry_sdk`` is absent (not installed in the CC sandbox) or uninitialised
    (``BACKEND_SENTRY_DSN`` unset), and never raises — error reporting must not
    escalate a swallowed background error into a boot failure.
    """
    try:
        import sentry_sdk
    except Exception:  # pragma: no cover — SDK absent (sandbox / minimal install)
        return

    try:
        # SDK 2.x exposes new_scope(); 1.x only push_scope(). Prefer whichever
        # the installed version provides rather than pinning to either.
        scope_factory = getattr(sentry_sdk, "new_scope", None) or getattr(
            sentry_sdk, "push_scope", None
        )
        if scope_factory is None:  # pragma: no cover — neither API present
            # Tag on the global scope so the event stays filterable even on the
            # degraded path (else it would be invisible to the Sentry filter
            # this helper's whole purpose is to make possible).
            sentry_sdk.set_tag(BACKGROUND_TASK_TAG, task)
            sentry_sdk.capture_exception(exc)
            return
        with scope_factory() as scope:
            scope.set_tag(BACKGROUND_TASK_TAG, task)
            sentry_sdk.capture_exception(exc)
    except Exception:  # pragma: no cover — reporting must never raise
        logger.exception("Sentry capture_background_exception failed for task=%s", task)
