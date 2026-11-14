"""
Module:   owner_attention
Purpose:  The «מה מחכה לך» card on the business dashboard home (MEH-3108):
          what is waiting for the owner right now — reviews with no reply,
          new sign-ups to her events / workshops, group buys that reached
          their goal and still need her.
Touches:  Reads producer_reviews, registrations (+ events, experiences),
          group_buys. No writes.
Does NOT: send anything (the per-event emails live in content_notifications
          / registrations / group_buy_notifications), or decide wording —
          the frontend renders the counts.
Related:  backend/app/routers/producer_me.py `dashboard` (the only caller) ·
          frontend/components/producer/OwnerAttentionCard.jsx.
History:  MEH-3108 (creation).
"""

from datetime import timedelta
from typing import Any, TypedDict
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Event, Experience, ProducerReview, Registration
from app.models.models import GroupBuy
from app.utils.clock import utc_now

# A sign-up is "new" for a week — the same window as the home's numbers.
NEW_SIGNUP_DAYS = 7


class SignupItem(TypedDict):
    kind: str  # "event" | "experience"
    title: str
    count: int


class OwnerAttention(TypedDict):
    unreplied_reviews: int
    new_signups: list[SignupItem]
    funded_group_buys: int


def _unreplied_reviews(db: Session, producer_id: UUID) -> int:
    # Same visibility as the public list (reviews.py `list_reviews`): a hidden
    # review is not on the page, so it is not waiting for an answer.
    n: Any = (
        db.query(func.count(ProducerReview.id))
        .filter(
            ProducerReview.producer_id == producer_id,
            ProducerReview.is_hidden.is_(False),
            ProducerReview.reply.is_(None),
        )
        .scalar()
    )
    return int(n or 0)


def _new_signups(db: Session, producer_id: UUID, host_user_id: Any) -> list[SignupItem]:
    since = utc_now() - timedelta(days=NEW_SIGNUP_DAYS)
    live = (Registration.status == "registered", Registration.created_at >= since)
    events: list[Any] = (
        db.query(Event.title, func.count(Registration.id))
        .join(Registration, Registration.event_id == Event.id)
        .filter(Event.producer_id == producer_id, *live)
        .group_by(Event.id, Event.title)
        .all()
    )
    items: list[SignupItem] = [
        {"kind": "event", "title": str(t), "count": int(c)} for t, c in events
    ]
    if host_user_id is not None:
        workshops: list[Any] = (
            db.query(Experience.title, func.count(Registration.id))
            .join(Registration, Registration.experience_id == Experience.id)
            .filter(Experience.host_user_id == host_user_id, *live)
            .group_by(Experience.id, Experience.title)
            .all()
        )
        items += [
            {"kind": "experience", "title": str(t), "count": int(c)} for t, c in workshops
        ]
    # Most sign-ups first; the card shows the top one.
    return sorted(items, key=lambda i: -i["count"])


def _funded_group_buys(db: Session, producer_id: UUID) -> int:
    # «funded» = reached its goal; it stays there until the owner closes or
    # delivers it (group_buys.py:465), so it is still waiting for her.
    n: Any = (
        db.query(func.count(GroupBuy.id))
        .filter(GroupBuy.producer_id == producer_id, GroupBuy.status == "funded")
        .scalar()
    )
    return int(n or 0)


def owner_attention(db: Session, producer_id: UUID, host_user_id: Any) -> OwnerAttention:
    """Counts for the card. `host_user_id` is the owner's user id — a
    workshop is keyed on its host user, not on the business (models.py
    Experience)."""
    return {
        "unreplied_reviews": _unreplied_reviews(db, producer_id),
        "new_signups": _new_signups(db, producer_id, host_user_id),
        "funded_group_buys": _funded_group_buys(db, producer_id),
    }
