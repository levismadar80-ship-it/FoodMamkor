"""
Module:   ops_alert
Purpose:  Send a technical alert (a job that stopped running, pages nobody
          confirmed) to Sentry as one tagged warning, where the daily Claude
          check reads it, instead of to the admin's inbox (MEH-3705).
Touches:  Sentry (one capture_message per call). No DB, no email.
Does NOT: decide whether to alert or dedupe — the caller does (job_staleness
          keeps its once-per-Israel-day flag). Does NOT carry business
          decisions (approvals, reports, billing): those still email the admin.
          Does NOT send anything when Sentry is not initialised; it returns
          False, and the caller falls back to its old email so the alert
          never goes dark.
Related:  app/services/moderation_fail_open.py:report_fail_open (same tag +
          explicit fingerprint shape) · app/sentry.py:_event_fingerprint (the
          explicit fingerprint gives each key its own burst-cap bucket).
History:  MEH-3705 (creation).
"""

from __future__ import annotations

import logging
from typing import Any

import sentry_sdk

logger = logging.getLogger(__name__)

#: Sentry tag on every ops alert; the daily Claude check searches for it.
OPS_ALERT_TAG = "ops_alert"


def report_ops_alert(
    kind: str, key: str, message: str, extra: dict[str, Any] | None = None
) -> bool:
    """Send one Sentry warning tagged ``ops_alert=<kind>``.

    Returns True when the event was handed to an active Sentry client, False
    when Sentry is off or anything failed. Never raises.
    """
    try:
        if not sentry_sdk.get_client().is_active():
            return False
        with sentry_sdk.new_scope() as scope:
            scope.set_tag(OPS_ALERT_TAG, kind)
            # MEH-3705: explicit fingerprint — one Sentry issue and one
            # before_send budget bucket per (kind, key), never a shared one.
            scope.fingerprint = ["ops-alert", kind, key]
            for name, value in (extra or {}).items():
                scope.set_extra(name, value)
            sentry_sdk.capture_message(message, level="warning")
        return True
    except Exception:  # reporting must never fail the caller
        logger.warning("[OPS-ALERT] could not send %s/%s", kind, key, exc_info=True)
        return False
