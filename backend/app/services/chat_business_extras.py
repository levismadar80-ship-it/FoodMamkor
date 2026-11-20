# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3510 PR)
"""
Module:   chat_business_extras
Purpose:  The business-page facts added after the chat first learned a
          business (MEH-3510): delivery zones with several days per city
          (MEH-3484), the next delivery date (MEH-3485, computed here and not
          by the model), product groups (MEH-3477), the price unit in Hebrew
          («למארז», #4918), and the business's public events, workshops and
          open group buys.
Touches:  DB read only — events, experiences, group_buys (through the same
          «is public» queries the site's lists use).
Does NOT: decide which business (chat_business_context.find), call the model
          or phrase answers (routers/chat.py).
Related:  frontend/lib/nextDelivery.js (the rule ported in `next_delivery`);
          frontend/lib/orderWindow.js getSingleOrderCutoff;
          routers/experiences.py _public_listing_query;
          routers/group_buys.py _status_tab_query.
History:  MEH-3510 (creation; reviews the page shows, no names)
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import object_session
from sqlalchemy.orm.exc import UnmappedInstanceError

from app.utils.clock import ISRAEL_TZ, israel_now, israel_today

# frontend/lib/delivery-days.js DELIVERY_DAYS (Sunday = 0).
DAYS_HE = ("ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת")
# frontend/lib/orderWindow.js ORDER_DAY_KEYS.
ORDER_DAY_KEYS = (
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
)
# messages/he.json price_unit — the words the page shows next to a price.
PRICE_UNIT_HE = {
    "unit": "ליחידה",
    "kg": "לק״ג",
    "100g": "ל-100 גרם",
    "bottle": "לבקבוק",
    "box": "לארגז",
    "pack": "למארז",
}
MAX_ACTIVITIES = 10  # per kind; a page's worth
MAX_REVIEWS = 20  # newest with text; the page's first two pages
_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_WEEK = 7


def _minutes(hhmm: Any) -> int | None:
    m = _HHMM.match(hhmm) if isinstance(hhmm, str) else None
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def _ranges(entry: Any) -> list[dict[str, str]]:
    """orderWindow.js normalizeDayEntries: list or legacy single dict, valid
    ranges only, sorted by open."""
    if not entry:
        return []
    items = entry if isinstance(entry, list) else [entry]
    valid = []
    for r in items:
        if not isinstance(r, dict):
            continue
        o, c = _minutes(r.get("open")), _minutes(r.get("close"))
        if o is not None and c is not None and c > o:
            valid.append(r)
    return sorted(valid, key=lambda r: str(r["open"]))


def single_order_cutoff(order_window: Any) -> tuple[int, str] | None:
    """orderWindow.js getSingleOrderCutoff: (dayIndex, close) when exactly one
    order day is open; None when none or several (ambiguous)."""
    if not isinstance(order_window, dict) or not order_window:
        return None
    found: tuple[int, str] | None = None
    for i, key in enumerate(ORDER_DAY_KEYS):
        entries = _ranges(order_window.get(key))
        if not entries:
            continue
        if found:
            return None
        found = (i, str(entries[-1]["close"]))
    return found


def _day_index(now: datetime) -> int:
    return (now.weekday() + 1) % _WEEK  # Python Monday=0 → Sunday=0


def next_delivery(
    days: list[str], order_window: Any, on_vacation: bool, now: datetime | None = None
) -> dict[str, str] | None:
    """nextDelivery.js nextDeliveryDate. One clear order cutoff → the first
    delivery day on or after it (can be today); otherwise the first delivery
    day from tomorrow. None on vacation or with no delivery day."""
    if on_vacation:
        return None
    wanted = {DAYS_HE.index(d) for d in days if d in DAYS_HE}
    if not wanted:
        return None
    now = now or israel_now()
    today_idx, now_min = _day_index(now), now.hour * 60 + now.minute
    cutoff = single_order_cutoff(order_window)
    close = _minutes(cutoff[1]) if cutoff else None
    if cutoff is None or close is None:
        start = 1
    else:
        ahead = (cutoff[0] - today_idx + _WEEK) % _WEEK
        start = _WEEK if ahead == 0 and now_min >= close else ahead
    for k in range(start, start + _WEEK):
        idx = (today_idx + k) % _WEEK
        if idx in wanted:
            date = now.date() + timedelta(days=k)
            return {"date": date.isoformat(), "day": DAYS_HE[idx]}
    return None


def row_days(area: Any) -> list[str]:
    """nextDelivery.js daysOfRow: delivery_days when set (MEH-3484), else the
    single delivery_day."""
    many = [d for d in (getattr(area, "delivery_days", None) or []) if d]
    if many:
        return many
    one = getattr(area, "delivery_day", None)
    return [one] if one else []


def group_names(producer: Any) -> dict[str, str]:
    raw = getattr(producer, "product_groups", None) or []
    return {
        str(g["id"]): str(g["name"])
        for g in raw
        if isinstance(g, dict) and g.get("id") and g.get("name")
    }


def _money(value: Any) -> str | None:
    return None if value is None or value == 0 else f"{value} ₪"


def _israel_date(at: Any) -> str | None:
    """A stored deadline (naive UTC) as the Israel date the page shows."""
    if at is None:
        return None
    aware = at if at.tzinfo else at.replace(tzinfo=UTC)
    return aware.astimezone(ISRAEL_TZ).date().isoformat()


def activities(producer: Any) -> dict[str, list[dict[str, Any]]] | None:
    """The business's public events, workshops/experiences and open group
    buys — the same «public» predicates the site's lists use."""
    try:
        db = object_session(producer)
    except UnmappedInstanceError:  # a plain object in a unit test
        return None
    if db is None:
        return None
    # Imported here: routers import this module's caller, not the reverse.
    from app.models import Event, Experience, Producer
    from app.models.events import GroupBuy
    from app.routers.experiences import _public_listing_query
    from app.routers.group_buys import _status_tab_query

    today = israel_today()
    events = (
        db.query(Event)
        .filter(
            Event.producer_id == producer.id,
            Event.is_active.is_(True),
            Event.event_date >= today,
        )
        .order_by(Event.event_date.asc())
        .limit(MAX_ACTIVITIES)
        .all()
    )
    experiences = (
        _public_listing_query(db)
        .filter(Producer.id == producer.id)
        .order_by(Experience.event_date.asc())
        .limit(MAX_ACTIVITIES)
        .all()
    )
    buys = (
        # The «פתוחות» tab's own query: public, open and not past its deadline.
        _status_tab_query(db, "open", None)
        .filter(GroupBuy.producer_id == producer.id)
        .order_by(GroupBuy.deadline.asc())
        .limit(MAX_ACTIVITIES)
        .all()
    )
    out = {
        "events": [
            {
                "title": e.title,
                "date": e.event_date.isoformat(),
                "time": e.event_time.strftime("%H:%M") if e.event_time else None,
                "city": e.city,
                "price": _money(e.price) or "חינם",
            }
            for e in events
        ],
        "workshops_and_experiences": [
            {
                "title": x.title,
                "date": None if x.is_recurring else x.event_date.isoformat(),
                "recurring": x.recurring_schedule if x.is_recurring else None,
                "city": x.city,
                "price_per_person": _money(x.price_per_person) or "חינם",
            }
            for x in experiences
        ],
        "open_group_buys": [
            {
                "title": g.title,
                "product": g.product_name,
                "group_price": _money(g.price_per_unit_group),
                "regular_price": _money(g.price_per_unit_regular),
                "unit": g.unit,
                "until": _israel_date(g.deadline),
            }
            for g in buys
        ],
    }
    return out if any(out.values()) else None


def reviews(producer: Any) -> list[dict[str, Any]] | None:
    """The reviews the page shows (routers/reviews.py list_reviews_nested's
    filter), newest first, text only — never the reviewer's name or id."""
    try:
        db = object_session(producer)
    except UnmappedInstanceError:
        return None
    if db is None:
        return None
    from app.models import Producer
    from app.models.engagement import ProducerReview
    from app.services.review_conflicts import conflict_free

    # REUSES: backend/app/routers/reviews.py list_reviews_nested — the page's
    # visibility predicate (hidden, organizer, conflict of interest).
    rows = (
        db.query(ProducerReview)
        .join(Producer, Producer.id == ProducerReview.producer_id)
        .filter(
            ProducerReview.producer_id == producer.id,
            ProducerReview.is_hidden.is_(False),
            Producer.kind == "producer",
            conflict_free(),
            ProducerReview.body.isnot(None),
            ProducerReview.body != "",
        )
        .order_by(ProducerReview.created_at.desc())
        .limit(MAX_REVIEWS)
        .all()
    )
    out = [
        {
            "stars": r.stars,
            "text": (r.body or "")[:300],
            "business_reply": (r.reply or "")[:200] or None,
        }
        for r in rows
    ]
    return out or None
