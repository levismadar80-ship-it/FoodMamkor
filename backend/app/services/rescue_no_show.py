"""
Module:   rescue_no_show
Purpose:  MEH-3226 (D4 of the 14/11 grill retro) — the buyer hears about
          every no-show the business marks, so a block never arrives as a
          surprise: the first mail says what two no-shows do, the second
          says the block is on now. Both carry «כתבו לנו» to /contact.
          Copy approved word for word by Sapir 14/11.
Touches:  rescue_orders + rescue_offers + users (read, while the request's
          Session is open); Resend via send_email (background task).
          MEH-3225: the count also reads the hashed no-shows a deleted
          account left behind (rescue_no_show_tombstones), so deleting the
          account and signing up again with the same email does not lift the
          block; ``record_tombstones`` writes them at deletion.
Does NOT: mark the no-show — routers/rescue.py (mark_no_show) does. Does not
          release a block; the admin route clear_no_show_block does. Does not
          purge old tombstones; services/retention_purge.py does.
Related:  routers/rescue.py::mark_no_show · services/rescue_emails.py (the
          other buyer emails)
History:  MEH-3226 (creation) · MEH-3225 (tombstones survive deletion)
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta
from html import escape as html_escape
from typing import Any
from uuid import UUID

from fastapi import BackgroundTasks
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models import RescueNoShowTombstone, RescueOffer, RescueOrder, User
from app.services.email import send_email
from app.utils.clock import utc_now

# The pilot's no-show rule: the SECOND no-show inside this window blocks new
# reservations. Moved here from routers/rescue.py (which re-exports both) so
# the buyer gate and /admin/users count the same thing (MEH-3226).
NO_SHOW_BLOCK_AT = 2
NO_SHOW_WINDOW_DAYS = 30


def email_hash(email: str) -> str:
    """Keyed hash of a normalised email (MEH-3225). Keyed with the app secret,
    so the table cannot be reversed by hashing a list of known addresses."""
    normal = (email or "").strip().lower()
    return hmac.new(
        settings.secret_key.encode(),
        b"rescue-no-show:" + normal.encode(),
        hashlib.sha256,
    ).hexdigest()


def _counting_filter(cutoff: datetime) -> Any:
    """A no-show counts while its pickup ended inside the window and after the
    buyer's last admin release."""
    return (
        RescueOffer.pickup_end >= cutoff,
        or_(
            User.rescue_block_cleared_at.is_(None),
            RescueOffer.pickup_end > User.rescue_block_cleared_at,
        ),
    )


def active_no_show_counts(db: Session, user_ids: list[UUID]) -> dict[Any, int]:
    """No-shows still counting against each buyer — the one authority the
    reserve gate (routers/rescue.py::_active_no_shows) and the admin list
    share. Windowed on the orders, not ``users.rescue_no_show_count`` (no
    window); a no-show whose pickup ended before ``rescue_block_cleared_at``
    no longer counts, which is how an admin releases a buyer. MEH-3225: plus
    the tombstones a deleted account with the same email left, under the same
    window and release. Users with none are absent from the result."""
    if not user_ids:
        return {}
    cutoff = utc_now() - timedelta(days=NO_SHOW_WINDOW_DAYS)
    rows = (
        db.query(RescueOrder.user_id, func.count(RescueOrder.id))
        .join(RescueOffer, RescueOrder.offer_id == RescueOffer.id)
        .join(User, RescueOrder.user_id == User.id)
        .filter(
            RescueOrder.user_id.in_(user_ids),
            RescueOrder.status == "no_show",
            *_counting_filter(cutoff),
        )
        .group_by(RescueOrder.user_id)
        .all()
    )
    counts: dict[Any, int] = {uid: int(n) for uid, n in rows}
    for uid, n in _tombstone_counts(db, user_ids, cutoff).items():
        counts[uid] = counts.get(uid, 0) + n
    return counts


def _tombstone_counts(
    db: Session, user_ids: list[UUID], cutoff: datetime
) -> dict[Any, int]:
    users = (
        db.query(User.id, User.email, User.rescue_block_cleared_at)
        .filter(User.id.in_(user_ids), User.email.isnot(None))
        .all()
    )
    by_hash: dict[str, list[tuple[Any, Any]]] = {}
    for uid, email, cleared in users:
        by_hash.setdefault(email_hash(str(email)), []).append((uid, cleared))
    if not by_hash:
        return {}
    stones = (
        db.query(RescueNoShowTombstone.email_hash, RescueNoShowTombstone.pickup_end)
        .filter(
            RescueNoShowTombstone.email_hash.in_(list(by_hash)),
            RescueNoShowTombstone.pickup_end >= cutoff,
        )
        .all()
    )
    out: dict[Any, int] = {}
    for h, pickup_end in stones:
        for uid, cleared in by_hash[h]:
            if cleared is None or pickup_end > cleared:
                out[uid] = out.get(uid, 0) + 1
    return out


def record_tombstones(db: Session, user: User) -> int:
    """MEH-3225: before ``user`` is deleted, keep each no-show still counting
    against her as (email hash, pickup_end). Nothing else is kept. The caller
    commits (with the deletion). Returns how many rows were added."""
    if not user.email:
        return 0
    cutoff = utc_now() - timedelta(days=NO_SHOW_WINDOW_DAYS)
    ends = (
        db.query(RescueOffer.pickup_end)
        .join(RescueOrder, RescueOrder.offer_id == RescueOffer.id)
        .join(User, RescueOrder.user_id == User.id)
        .filter(
            RescueOrder.user_id == user.id,
            RescueOrder.status == "no_show",
            *_counting_filter(cutoff),
        )
        .all()
    )
    # Tombstones she inherited from an earlier deleted account stay as they
    # are: same hash, so they still count for the next account.
    digest = email_hash(str(user.email))
    for (pickup_end,) in ends:
        db.add(RescueNoShowTombstone(email_hash=digest, pickup_end=pickup_end))
    return len(ends)


def send_no_show_email(
    to: str,
    producer_name: str,
    date_text: str,
    *,
    active: int,
    test_cause: bool = False,
) -> None:
    """One mail per no-show; ``active`` = no-shows counting after this one.
    Below the block: the warning. Exactly at it: the block is on. Past it (a
    buyer who held several bags before the block): the rule sentence only —
    «השנייה» would be wrong, and no new copy (stronger-model ruling 14/11)."""
    name = " ".join((producer_name or "").split())
    contact = f"{settings.frontend_url}/contact"
    lines = [f"בית העסק {name} סימן שהסל ששריינתם ל-{date_text} לא נאסף בזמן האיסוף."]
    if active == NO_SHOW_BLOCK_AT:
        lines.append(
            "זו אי-ההגעה השנייה ב-30 הימים האחרונים, ולכן כרגע אי אפשר לשריין סלים חדשים."
        )
    elif active > NO_SHOW_BLOCK_AT:
        lines.append("שתי אי-הגעות בתוך 30 יום חוסמות שריון של סלים חדשים.")
    else:
        lines.append(
            "שתי אי-הגעות בתוך 30 יום חוסמות שריון של סלים חדשים. אם אי אפשר להגיע, "
            "אפשר לבטל בחינם עד השעה שכתובה במייל השריון."
        )
    lines.append(f"אם זו טעות, כתבו לנו ונבדוק: {contact}")
    html = (
        '<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">'
        + "".join(f"<p>{html_escape(line)}</p>" for line in lines[:-1])
        + f'<p>אם זו טעות, <a href="{html_escape(contact)}">כתבו לנו</a> ונבדוק.</p>'
        + "</div>"
    )
    send_email(
        to,
        f"הסל ב{name} לא נאסף",
        "\n\n".join(lines),
        html=html,
        test_cause=test_cause,
    )


def queue_no_show_email(
    background_tasks: BackgroundTasks,
    order: RescueOrder,
    *,
    active: int,
) -> None:
    """Read the plain values now, send after the response. Fail-open."""
    buyer = order.user
    offer = order.offer
    business = offer.location.producer if offer and offer.location else None
    if not (buyer and buyer.email and offer):
        return
    background_tasks.add_task(
        send_no_show_email,
        str(buyer.email),
        str(business.name or "") if business else "",
        offer.date.strftime("%d.%m.%Y") if offer.date else "",
        active=active,
        test_cause=bool((business and business.is_test) or buyer.is_test),
    )
