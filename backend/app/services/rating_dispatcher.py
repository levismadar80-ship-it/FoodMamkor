"""
Rating request dispatcher for "מהמטבח של השכן" listings.

24 hours after a buyer clicks the WhatsApp button on a home product, we send
them a WhatsApp message asking for a rating. The message contains a tokenised
link back to /rate/{token}, where the buyer can leave 1–5 stars and a comment.

This module owns the *batch dispatch* logic. It is intentionally pure with
respect to I/O: a `sender` callable is injected so the same code path is used
in production (Meta Cloud API; MEH-508) and in tests (a list-append spy). A
scheduled job (cron / Celery beat / FastAPI BackgroundTasks) calls
`dispatch_pending_rating_requests` periodically — typically every few minutes.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable, Optional

import structlog
from sqlalchemy.orm import Session

from app.models.models import HomeProductWhatsAppClick

logger = structlog.get_logger(__name__)

RATING_DELAY = timedelta(hours=24)

Sender = Callable[[HomeProductWhatsAppClick], None]


def dispatch_pending_rating_requests(
    db: Session,
    *,
    now: Optional[datetime] = None,
    sender: Optional[Sender] = None,
) -> int:
    """Send rating requests for clicks older than 24h that are still unrated.

    Args:
        db: SQLAlchemy session.
        now: Override the current time (useful for tests).
        sender: Callable invoked with each eligible click. Defaults to the
            Meta Cloud API sender (MEH-508). The dispatcher only flips
            `rating_sent=True` after the sender returns successfully, so a
            raising sender leaves the click eligible for the next run.

    Returns:
        The number of rating requests successfully dispatched.
    """
    now = now or datetime.utcnow()
    cutoff = now - RATING_DELAY
    send = sender or _default_sender

    eligible = (
        db.query(HomeProductWhatsAppClick)
        .filter(
            HomeProductWhatsAppClick.clicked_at <= cutoff,
            HomeProductWhatsAppClick.rating_sent.is_(False),
            HomeProductWhatsAppClick.rated.is_(False),
        )
        .order_by(HomeProductWhatsAppClick.clicked_at.asc())
        .all()
    )

    sent_count = 0
    for click in eligible:
        send(click)
        click.rating_sent = True
        sent_count += 1

    if sent_count:
        db.commit()
    return sent_count


def _default_sender(click: HomeProductWhatsAppClick) -> None:
    """Default sender — fires a WhatsApp message via Meta Cloud API (MEH-508).

    Silently no-ops when WhatsApp credentials are missing so local/dev
    environments don't crash. Production deployments must set
    `whatsapp_phone_number_id` and `whatsapp_access_token`.

    Behavioral preservation across the Twilio→Meta swap: the prior Twilio
    sender raised on API error so the dispatcher left `rating_sent=False`
    and the click stayed eligible for retry. send_text returns False
    (instead of raising) on HTTP error, so we re-raise here when the
    service is configured but the send returned False — matching the
    Twilio-era retry semantics 1:1.
    """
    from app.config import settings
    from app.services.whatsapp import send_text

    if not (settings.whatsapp_phone_number_id and settings.whatsapp_access_token):
        logger.debug(
            "[rating-dispatcher] SMS disabled", reason="WhatsApp credentials not set"
        )
        return

    buyer = click.user
    if not buyer or not buyer.phone:
        logger.debug(
            "[rating-dispatcher] SMS skipped",
            reason="buyer has no phone",
            click_id=str(click.id),
        )
        return

    listing = click.home_product
    seller_name = listing.user.name if listing and listing.user else "המוכר"
    product_title = listing.title if listing else "המוצר"
    rate_url = f"https://mehamakor.co.il/rate/{click.rating_token}"
    body = (
        f"היי! קנית מ{seller_name} ({product_title})? איך היה?\nדרגי כאן 👇\n{rate_url}"
    )
    # MEH-49: append referral link if the buyer has a referral code.
    if buyer.referral_code:
        ref_url = f"https://mehamakor.co.il/ref/{buyer.referral_code}"
        body += f"\n\nאהבת? שתפי חברה והיא תקבל 10% הנחה בהזמנה הראשונה:\n{ref_url}"

    if not send_text(buyer.phone, body):
        raise RuntimeError(
            "[rating-dispatcher] WhatsApp send failed; click will retry next cycle"
        )
