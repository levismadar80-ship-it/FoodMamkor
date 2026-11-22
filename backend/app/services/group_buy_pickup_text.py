"""
Module:   group_buy_pickup_text
Purpose:  The pickup / delivery lines a group-buy email carries
          («מועד איסוף: יום שישי 4.12, 09:00–13:00»), in Israel time.
Does NOT: send anything (group_buy_notifications.py) or read the DB.
Related:  frontend/lib/group-buy-pickup.js (the same window on the page)
History:  MEH-3597 (creation)
"""

from datetime import datetime, timezone

from app.utils.clock import ISRAEL_TZ

# Python's weekday(): Monday = 0.
_DAYS = ("שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון")


def _israel(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(ISRAEL_TZ)


def _day(value: datetime) -> str:
    return f"יום {_DAYS[value.weekday()]} {value.day}.{value.month}"


def pickup_window_he(starts: datetime | None, ends: datetime | None) -> str:
    """«יום שישי 4.12, 09:00–13:00», or both days when it spans days; "" without a window."""
    if starts is None or ends is None:
        return ""
    s, e = _israel(starts), _israel(ends)
    if s.date() == e.date():
        return f"{_day(s)}, {s:%H:%M}–{e:%H:%M}"
    return f"{_day(s)}, {s:%H:%M} – {_day(e)}, {e:%H:%M}"


def is_delivery_only(
    pickup_note: str | None,
    delivery_note: str | None,
    fulfillment_note: str | None = None,
) -> bool:
    """The page's rule: only a delivery answer means nobody comes to pick up,
    so a saved window is not shown (frontend GroupBuyDetailClient)."""
    return bool(delivery_note) and not pickup_note and not fulfillment_note


def note_lines(pickup_note: str | None, delivery_note: str | None) -> str:
    lines = []
    if pickup_note:
        lines.append(f"איסוף: {pickup_note}")
    if delivery_note:
        lines.append(f"משלוח: {delivery_note}")
    return "".join(f"{line}\n" for line in lines)


def pickup_lines(
    starts: datetime | None,
    ends: datetime | None,
    pickup_note: str | None,
    delivery_note: str | None,
) -> str:
    """The lines for an email body, each ending in a newline; "" when nothing
    is set. A delivery-only group carries no pickup time."""
    window = (
        ""
        if is_delivery_only(pickup_note, delivery_note)
        else pickup_window_he(starts, ends)
    )
    head = f"מועד איסוף: {window}\n" if window else ""
    return head + note_lines(pickup_note, delivery_note)
