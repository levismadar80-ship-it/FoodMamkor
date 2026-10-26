"""MEH-2352: make a moderation fail-open visible.

The AI moderators fail open by LOCK: no key, an API error, or an
unreadable reply all resolve to APPROVED. That rule stays. What was missing
is any signal that it happened. On reviews, which publish with no admin
gate, a dead key meant every review went live unchecked with nothing in
any log or dashboard saying so. The MEH-2335 eval found 10 silent
fail-opens in 35 checks before its fixes.

``report_fail_open`` writes one structured warning and one Sentry event
per occurrence, fingerprinted by (surface, reason), so the existing
per-fingerprint burst cap (``app/sentry.py`` MEH-2114) bounds the quota
cost, and a Sentry alert on the ``moderation_fail_open`` tag can count them.

Never raises, and is a no-op when ``sentry_sdk`` is absent or
uninitialised (sandbox, tests, local dev), mirroring
``capture_background_exception``.

Not wired into ``home_product_moderation``: its router is unmounted
(``router_registry.py``, MEH-1406) and the subsystem is being removed
(MEH-796), so it can never fail open in production.
"""

from __future__ import annotations

import json

import structlog

# structlog, not stdlib logging: structlog writes to stdout (Railway logs)
# directly — app/logging_config.py.
logger = structlog.get_logger(__name__)

#: Sentry tag that marks every moderation fail-open event. Alert on it.
FAIL_OPEN_TAG = "moderation_fail_open"


def classify_failure(exc: BaseException, *, truncated: bool = False) -> str:
    """Name the fail-open cause for the tag: a stable, low-cardinality value."""
    if truncated:
        return "truncated"
    if isinstance(exc, json.JSONDecodeError):
        return "unparseable"
    try:
        import anthropic

        if isinstance(exc, anthropic.APIError):
            # MEH-2390: an HTTP answer carries its class — a dead key (401) or
            # rate limit (429) is not an overload (529). Classes, not codes,
            # to keep the tag low-cardinality. No answer at all → api_error.
            status = getattr(exc, "status_code", None)
            if isinstance(status, int):
                return f"api_error_{status // 100}xx"
            return "api_error"
    except Exception:  # pragma: no cover — SDK broken / absent
        logger.debug("[moderation] anthropic import failed while classifying")
    return "error"


def report_fail_open(surface: str, reason: str) -> None:
    """Record that ``surface`` acted without a model verdict.

    The content moderators approved the item. ``producer_risk`` approves
    nothing; it left the admin-only score empty. Filter on
    ``moderation_surface`` to tell them apart."""
    logger.warning(
        "[moderation] fail-open — no model verdict", surface=surface, reason=reason
    )
    try:
        import sentry_sdk
    except Exception:  # pragma: no cover — SDK absent (sandbox / minimal install)
        return
    try:
        scope_factory = getattr(sentry_sdk, "new_scope", None) or getattr(
            sentry_sdk, "push_scope", None
        )
        if scope_factory is None:  # pragma: no cover — neither API present
            return
        with scope_factory() as scope:
            scope.set_tag(FAIL_OPEN_TAG, "true")
            scope.set_tag("moderation_surface", surface)
            scope.set_tag("fail_open_reason", reason)
            scope.fingerprint = ["moderation-fail-open", surface, reason]
            sentry_sdk.capture_message(
                f"moderation fail-open: {surface} ({reason})", level="warning"
            )
    except Exception:  # pragma: no cover — reporting must never raise
        logger.debug("[moderation] fail-open report to Sentry failed")
