"""Mirror newsletter subscribers into Resend Contacts (MEH-2611).

`newsletter_subscribers` stays the site's own record; Resend is where the
list is managed and sent from (Broadcasts editor + per-contact unsubscribe
footer). Before this module the table had no reader at all — addresses were
collected and never reachable.

Contacts are created GLOBAL (no audience_id — Resend's Audiences API is
deprecated in favour of Segments) and added to the segment named
`NEWSLETTER_SEGMENT_NAME`, which is looked up by name and created on first
use. No new env var: each Resend account (staging / production) grows its
own segment the first time someone subscribes there.

Fail-open, same contract as services/email.py: never raises, reports to
Sentry. The API key needs Resend's *Full access* permission — a
*Sending access* key is refused on the contacts endpoints, which surfaces
here as a Sentry event, not as a broken signup.
"""

from __future__ import annotations

import logging
import threading

from app.config import settings
from app.sentry import capture_background_exception
from app.services.email import _is_reserved_domain, _mask

logger = logging.getLogger(__name__)

NEWSLETTER_SEGMENT_NAME = "newsletter"
_SENTRY_TASK = "newsletter_sync"

# Per-process cache of the segment id; segment ids never change once created.
_segment_id: str | None = None
# Background tasks run in a thread pool: without the lock two first-ever
# signups could both miss the lookup and create two "newsletter" segments.
_segment_lock = threading.Lock()


def _resend():
    """Return the configured SDK module, or None when there is no key."""
    if not settings.resend_api_key:
        return None
    import resend  # lazy import — mirrors services/email.py

    resend.api_key = settings.resend_api_key
    return resend


def _get_segment_id(resend) -> str:
    global _segment_id
    if _segment_id:
        return _segment_id
    with _segment_lock:
        if _segment_id:
            return _segment_id
        listed = resend.Segments.list() or {}
        for seg in listed.get("data") or []:
            if seg.get("name") == NEWSLETTER_SEGMENT_NAME:
                _segment_id = seg["id"]
                return _segment_id
        created = resend.Segments.create({"name": NEWSLETTER_SEGMENT_NAME})
        _segment_id = created["id"]
        return _segment_id


def _is_not_found(exc: BaseException) -> bool:
    return str(getattr(exc, "code", "")) == "404"


def _contact_exists(resend, email: str) -> bool:
    """True if Resend has a contact for `email`; any non-404 error propagates."""
    try:
        resend.Contacts.get(email=email)
    except Exception as exc:  # noqa: BLE001
        if _is_not_found(exc):
            return False
        raise
    return True


def _skip(email: str) -> bool:
    return not email or _is_reserved_domain(email)


def sync_subscribe(email: str) -> None:
    """Add `email` to Resend and to the newsletter segment.

    An EXISTING contact keeps its subscription status: POST /newsletter is
    anonymous single opt-in, so a third party could otherwise submit someone
    else's address and undo their opt-out (anti-spam §30A). Re-opting in after
    an unsubscribe is done in the Resend dashboard.
    """
    if _skip(email):
        return
    try:
        resend = _resend()
        if resend is None:
            return
        segment_id = _get_segment_id(resend)
        # Look up FIRST, never create-then-recover: if `create` upserted an
        # existing address, `"unsubscribed": False` would silently undo an
        # opt-out. An existing contact only joins the segment; its status is
        # never touched. A 404 is the only answer that leads to `create`.
        if _contact_exists(resend, email):
            resend.Contacts.Segments.add({"email": email, "segment_id": segment_id})
        else:
            resend.Contacts.create(
                {
                    "email": email,
                    "unsubscribed": False,
                    "segments": [{"id": segment_id}],
                }
            )
        logger.info("[NEWSLETTER] Synced %s to Resend", _mask(email))
    except Exception as exc:  # noqa: BLE001 — fail-open by design
        capture_background_exception(exc, task=_SENTRY_TASK)
        logger.error(
            "[NEWSLETTER] Resend sync failed (subscribe) for %s — %s: %s",
            _mask(email),
            type(exc).__name__,
            exc,
        )


def sync_unsubscribe(email: str) -> None:
    """Delete `email`'s Resend contact, mirroring the row delete in our table.

    Deleted rather than flagged `unsubscribed`: the site forgets the address
    entirely, and a later genuine signup on the site then starts clean. An
    opt-out made from a Broadcast footer is different: it stays as a flag in
    Resend and `sync_subscribe` never clears it, so a contact already flagged
    is left in place rather than deleted (deleting would erase that opt-out
    and let an anonymous signup re-create the address as subscribed).
    """
    if _skip(email):
        return
    try:
        resend = _resend()
        if resend is None:
            return
        contact = resend.Contacts.get(email=email) or {}
        if contact.get("unsubscribed"):
            logger.info("[NEWSLETTER] %s already opted out in Resend", _mask(email))
            return
        resend.Contacts.remove(email=email)
        logger.info("[NEWSLETTER] Removed %s from Resend", _mask(email))
    except Exception as exc:  # noqa: BLE001 — fail-open by design
        # A second click on the same link, or an address that never reached
        # Resend: the end-state (not subscribed there) already holds.
        if _is_not_found(exc):
            logger.info(
                "[NEWSLETTER] %s not in Resend — nothing to unsubscribe", _mask(email)
            )
            return
        capture_background_exception(exc, task=_SENTRY_TASK)
        logger.error(
            "[NEWSLETTER] Resend sync failed (unsubscribe) for %s — %s: %s",
            _mask(email),
            type(exc).__name__,
            exc,
        )
