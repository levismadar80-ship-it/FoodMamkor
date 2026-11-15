"""
Module:   report_notifications
Purpose:  Tell the admin, by email, that a business was just reported
          (D12 of the 14/11 grill retro, MEH-3223). Before this a report only
          moved a counter in the admin menu, while ADMIN.md promises a reply
          within 24 hours.
Touches:  Resend (send_email). No DB.
Does NOT: decide whether to send — reports.report_producer queues this only
          after its commit succeeded, so a duplicate report (409) sends
          nothing. No WhatsApp: a free-text message reaches the admin only
          inside Meta's 24-hour window, so it would mostly be dropped
          (the MEH-3147 finding for the other admin notifiers).
Related:  backend/app/routers/reports.py::report_producer ·
          services/auth_notifications.py::notify_admin_new_category_request
          (same shape: admin_email, fail-open, flattened free text).
History:  MEH-3223 (creation)
"""

import logging

from app.config import settings
from app.services.email import send_email

logger = logging.getLogger(__name__)

# The reporter's own words go into the mail; cap them like the WhatsApp
# notifiers cap free text, and flatten line breaks so a crafted reason cannot
# fake extra lines (a second "לטיפול:" link) under it.
_REASON_CAP = 500


def _flat(text: str | None) -> str:
    return " ".join((text or "").split())[:_REASON_CAP]


def notify_admin_new_report(
    producer_name: str, reason: str, open_count: int, test_cause: bool = False
) -> None:
    """BackgroundTask entry point — never raises (nothing would catch it)."""
    if not settings.admin_email:
        return
    name = _flat(producer_name)
    subject = f"מהמקור - דיווח חדש על {name}"
    body = (
        f"דיווח חדש על בית העסק {name}.\n"
        f"סיבה: {_flat(reason)}\n"
        f"דיווחים פתוחים על בית העסק: {open_count}\n"
        f"לטיפול: {settings.frontend_url}/admin/reports"
    )
    try:
        send_email(settings.admin_email, subject, body, test_cause=test_cause)
    except Exception as e:  # noqa: BLE001 — fire-and-forget, log with context
        logger.error("[NOTIFY] Admin new-report email FAILED for '%s': %s", name, e)
