"""
Rating request dispatcher for "מהמטבח של השכן" listings.

24 hours after a buyer clicks the WhatsApp button on a home product, we send
them a WhatsApp message asking for a rating. The message contains a tokenised
link back to /rate/{token}, where the buyer can leave 1–5 stars and a comment.

This module owns the *batch dispatch* logic. It is intentionally pure with
respect to I/O: a `sender` callable is injected so the same code path is used
in production (Twilio) and in tests (a list-append spy). A scheduled job
(cron / Celery beat / FastAPI BackgroundTasks) calls
`dispatch_pending_rating_requests` periodically — typically every few minutes.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.models.models import HomeProductWhatsAppClick

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
            Twilio sender. The dispatcher only flips `rating_sent=True` after
            the sender returns successfully, so a raising sender leaves the
            click eligible for the next run.

    Returns:
        The number of rating requests successfully dispatched.
    """
    now = now or datetime.utcnow()
    cutoff = now - RATING_DELAY
    send = sender or _twilio_sender

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


def _twilio_sender(click: HomeProductWhatsAppClick) -> None:
    """Default sender — fires a Twilio WhatsApp message if configured.

    Silently no-ops when Twilio credentials are missing so local/dev
    environments don't crash. Production deployments must set
    `twilio_account_sid`, `twilio_auth_token`, and `twilio_whatsapp_from`.
    """
    from app.config import settings

    if not (
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_whatsapp_from
    ):
        return

    buyer = click.user
    if not buyer or not buyer.phone:
        return

    listing = click.home_product
    seller_name = listing.user.name if listing and listing.user else "המוכר"
    product_title = listing.title if listing else "המוצר"
    rate_url = f"https://mehamekor.co.il/rate/{click.rating_token}"
    body = (
        f"היי! קנית מ{seller_name} ({product_title})? איך היה?\n"
        f"דרגי כאן 👇\n{rate_url}"
    )

    from twilio.rest import Client

    twilio = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    twilio.messages.create(
        from_=f"whatsapp:{settings.twilio_whatsapp_from}",
        to=f"whatsapp:{buyer.phone}",
        body=body,
    )
