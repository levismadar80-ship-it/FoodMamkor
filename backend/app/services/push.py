"""MEH-54: Web Push notification sender (VAPID-based).

Fail-open: if VAPID keys are not configured, send() is a no-op.
This follows the same pattern as the AI fail-open rule in CLAUDE.md.
"""
from __future__ import annotations

import json
import logging

log = logging.getLogger(__name__)


def send_push_notification(subscription: dict, *, title: str, body: str, url: str = "/") -> None:
    """Send a single Web Push notification to one subscription endpoint.

    Args:
        subscription: Web Push subscription JSON from the browser
                      ({endpoint, keys: {p256dh, auth}}).
        title: Notification title (Hebrew OK).
        body: Notification body text.
        url: URL to open when the notification is clicked.
    """
    from app.config import settings

    if not settings.vapid_private_key or not settings.vapid_public_key:
        return

    try:
        from pywebpush import webpush, WebPushException  # noqa: F401

        webpush(
            subscription_info=subscription,
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
    except Exception as exc:
        log.warning("push notification failed (non-fatal): %s", exc)
